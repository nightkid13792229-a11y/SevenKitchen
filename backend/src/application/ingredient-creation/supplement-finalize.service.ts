/**
 * 补剂草稿 · 最终写入（一次性落正式库）。
 *
 * 流程（spec §8）：
 * 1. 读草稿：不是本人的 / 已放弃 → 404/409；已写入 → 直接返回已有 id + 核验报告（幂等）。
 * 2. 重跑 `SupplementDraftReviewService.validate`：有阻断项不写；提醒项必须逐条确认
 *    （按 ackKey 匹配，AI 自己造的 warning 只展示、不参与门禁）。
 * 3. 一个 `$transaction`：原料 + 营养档案 + 主映射 + 证据 + 标签（建档服务负责）、
 *    等价组（`assignInTransaction`，不另开事务）、草稿状态、写入审计。
 * 4. 事务内回读直接字段：任何一项与草稿不一致 → 抛错整体回滚，草稿保留 DRAFT。
 * 5. 提交后写核验报告；功能核验（Task 11）只用它合并 features。
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import { PrismaService } from '../../infrastructure/prisma.service';
import { SupplementEquivalenceService } from '../supplement-shop/supplement-equivalence.service';
import { SupplementDraftReviewService } from './supplement-draft-review.service';
import {
  SupplementDraftService,
  type SupplementDraftView,
} from './supplement-draft.service';
import type { SupplementDraftPayload } from './supplement-draft.types';
import type { SupplementDraftIssue } from './supplement-draft-validation';
import {
  SupplementIngredientService,
  type CreateSupplementIngredientInput,
  type CreateSupplementIngredientResult,
} from './supplement-ingredient.service';
import {
  buildDirectVerification,
  buildFinalizeInput,
  type DirectVerificationSnapshot,
  type SupplementWriteVerification,
  type VerificationFeature,
} from './supplement-verification';
import { SupplementVerificationService } from './supplement-verification.service';

/** 「暂不归组」的显式表态值（与草稿/校验模块一致）。 */
const GROUP_SKIPPED_ID = '__SKIP__';

/** 档案里能落数的五个分组；与本模块快照的扁平化口径一致。 */
const NUTRIENT_TABS = [
  'macros',
  'minerals',
  'vitamins',
  'fattyAcids',
  'aminoAcids',
] as const;

/** 写入人：只需要 id 与显示名（审计/组审核记录用）。 */
export interface SupplementFinalizeUser {
  id: string;
  name?: string;
}

/** 最终写入入参：`expectedUpdatedAt` 是可选的乐观锁（spec §8.1）。 */
export interface SupplementFinalizeInput {
  expectedUpdatedAt?: string;
}

/** 最终写入结果。 */
export interface FinalizeResult {
  ingredientId: string;
  nutritionFoodId: string;
  evidenceId: string;
  verification: SupplementWriteVerification;
}

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/** 重复建档的统一提示（与建档服务同一口径；那边是私有方法，这里保留一份）。 */
function duplicateMessage(item: {
  name: string;
  brand: string | null;
  productModel: string | null;
}): string {
  const spec = [item.brand, item.productModel].filter(Boolean).join(' · ');
  return (
    `已经有同名同规格的补剂：${item.name}${spec ? `（${spec}）` : ''}。` +
    '如果是同一款，去「原料库」找到它继续配置；不是的话，改一下名称或产品规格再存'
  );
}

/** 按点路径读草稿里的值（`basic.name` / `nutrition.servingNutrients.fattyAcids.epa`）。 */
function getByPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current)
    ) {
      return undefined;
    }
    current = (current as UnknownRecord)[segment];
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

function collectManualFieldValues(
  payload: SupplementDraftPayload,
  manualFields: string[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const fieldPath of manualFields) {
    values[fieldPath] = getByPath(payload, fieldPath);
  }
  return values;
}

/** 落库的核验报告至少要有这几样，否则当成「没有报告」，不伪造成功。 */
function isVerificationReport(
  value: unknown,
): value is SupplementWriteVerification {
  return (
    isPlainObject(value) &&
    typeof value.ok === 'boolean' &&
    typeof value.checkedAt === 'string' &&
    Array.isArray(value.fields) &&
    Array.isArray(value.features)
  );
}

@Injectable()
export class SupplementFinalizeService {
  private readonly logger = new Logger(SupplementFinalizeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly draftService: SupplementDraftService,
    private readonly reviewService: SupplementDraftReviewService,
    private readonly ingredientService: SupplementIngredientService,
    private readonly equivalence: SupplementEquivalenceService,
    private readonly verificationService: SupplementVerificationService,
  ) {}

  async finalize(
    user: SupplementFinalizeUser,
    draftId: string,
    input: SupplementFinalizeInput = {},
  ): Promise<FinalizeResult> {
    const current = await this.draftService.get(draftId, user.id);

    // 幂等：已写入的草稿直接返回已有 id + 已存核验报告，不再写第二套。
    if (current.status === 'FINALIZED') {
      return this.buildIdempotentResult(current);
    }
    if (current.status !== 'DRAFT') {
      throw new ConflictException('草稿已放弃，不能再写入');
    }
    if (
      input.expectedUpdatedAt !== undefined &&
      input.expectedUpdatedAt !== current.updatedAt.toISOString()
    ) {
      throw new ConflictException('草稿已被更新，请刷新后再试');
    }

    const review = await this.reviewService.validate(user.id, draftId);
    const draft = review.draft;
    const payload = draft.payload;
    const createInput: CreateSupplementIngredientInput = {
      ...buildFinalizeInput(payload),
      createdBy: user.id,
    };

    // 重复建档预检（spec §8.2-3）：必须先于阻断门禁 —— 同名同品牌同规格已存在是
    // 「去用已有记录」的 409，不是普通的 400。validate 里的 DUPLICATE_INGREDIENT
    // 阻断项留给审核页展示，这里不把它当 400；真正拦写入以库里的实际记录为准。
    const duplicate = await this.prisma.ingredient.findFirst({
      where: {
        type: 'SUPPLEMENT',
        name: createInput.name,
        brand: createInput.brand ?? null,
        productModel: createInput.productModel ?? null,
      },
      select: { id: true, name: true, brand: true, productModel: true },
    });
    if (duplicate) {
      this.logger.warn(
        `[supplement-finalize] 重复建档 draft=${draftId} existing=${JSON.stringify(
          duplicate,
        )}`,
      );
      throw this.buildDuplicateConflictError(duplicate);
    }

    const blockers = review.blockers.filter(
      (blocker) => blocker.code !== 'DUPLICATE_INGREDIENT',
    );
    if (blockers.length > 0) {
      throw new BadRequestException({
        message: `有 ${blockers.length} 个阻断项，暂时不能写入：${blockers
          .map((blocker) => blocker.message)
          .join('；')}`,
        blockers: review.blockers,
        warnings: review.warnings,
      });
    }

    // AI 的 warnings 只做展示，永远不参与门禁；这里只认校验服务产出的固定 ackKey。
    const unacknowledged = this.findUnacknowledgedWarnings(
      payload,
      review.warnings,
    );
    if (unacknowledged.length > 0) {
      throw new BadRequestException({
        message: `还有 ${unacknowledged.length} 条提醒项没有确认，请逐条勾选「我知道了」再写入：${unacknowledged
          .map((warning) => warning.message)
          .join('；')}`,
        blockers: review.blockers,
        warnings: review.warnings,
      });
    }

    let outcome: {
      created: CreateSupplementIngredientResult;
      fields: SupplementWriteVerification['fields'];
    };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const created = await this.ingredientService.createInTransaction(
          tx,
          createInput,
        );

        const groupId = this.resolveGroupId(payload);
        const groupExpectation = groupId
          ? await this.prepareGroupAssignment(tx, payload, groupId)
          : { groupId: null, priority: 0, status: null };

        if (groupId) {
          // 必须用事务版：`assign` 会另开一个事务，写进去的数据就不在同一个原子操作里。
          await this.equivalence.assignInTransaction(
            tx,
            [created.ingredientId],
            groupId,
            { id: user.id, name: user.name },
            { reapprove: payload.equivalence.reapproveGroup !== false },
          );
          if (payload.equivalence.priority !== null) {
            await tx.ingredient.update({
              where: { id: created.ingredientId },
              data: { equivalencePriority: payload.equivalence.priority },
            });
          }
        }

        await this.draftService.markFinalized(tx, draftId, {
          ingredientId: created.ingredientId,
          nutritionFoodId: created.nutritionFoodId,
          evidenceId: created.evidenceId,
        });

        await tx.ingredientCreationAudit.create({
          data: {
            draftId,
            ingredientId: created.ingredientId,
            nutritionFoodIds: [created.nutritionFoodId],
            proposals: (draft.aiSnapshot ??
              Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
            changes: {
              manualFields: draft.manualFields,
              values: collectManualFieldValues(payload, draft.manualFields),
            } as Prisma.InputJsonValue,
            committedBy: user.id,
          },
        });

        const actual = await this.readBack(tx, draftId, created, groupId);
        const expected = this.buildExpectedSnapshot(
          payload,
          createInput,
          created,
          groupExpectation,
        );
        const direct = buildDirectVerification(expected, actual);
        if (!direct.ok) {
          this.logger.error(
            `[supplement-finalize] 回读不一致 draft=${draftId} ` +
              direct.mismatches.join('；'),
          );
          throw new InternalServerErrorException(
            `写入后回读与草稿不一致，已回滚，未写入任何正式数据：${direct.mismatches
              .slice(0, 5)
              .join('；')}`,
          );
        }

        return { created, fields: direct.fields };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw await this.buildDuplicateConflict(createInput);
      }
      throw error;
    }

    // 数据已经提交：功能核验（依赖其它服务的查询）只出报告，失败不回滚、不抛错。
    // 核验本身炸了也不能把成功的写入报成失败；给 ok=false，页面不会显示「全部成功」。
    let features: VerificationFeature[] = [];
    let featuresAvailable = true;
    try {
      features = await this.verificationService.verifyFeatures(draft, {
        ingredientId: outcome.created.ingredientId,
        nutritionFoodId: outcome.created.nutritionFoodId,
        evidenceId: outcome.created.evidenceId,
      });
    } catch (error) {
      featuresAvailable = false;
      this.logger.error(
        `[supplement-finalize] 功能核验失败 draft=${draftId}：` +
          (error instanceof Error ? error.message : String(error)),
      );
    }

    const verification: SupplementWriteVerification = {
      ok:
        featuresAvailable &&
        outcome.fields.every((field) => field.ok) &&
        features.every(
          (feature) => !(feature.severity === 'ERROR' && !feature.ok),
        ),
      checkedAt: new Date().toISOString(),
      fields: outcome.fields,
      features,
    };

    // 数据已经提交：报告没存上不能把「写入成功」报成失败（reverify 可重新生成报告）。
    try {
      await this.draftService.saveVerification(draftId, user.id, verification);
    } catch (error) {
      this.logger.warn(
        `[supplement-finalize] 核验报告写入失败 draft=${draftId}：` +
          (error instanceof Error ? error.message : String(error)),
      );
    }

    return {
      ingredientId: outcome.created.ingredientId,
      nutritionFoodId: outcome.created.nutritionFoodId,
      evidenceId: outcome.created.evidenceId,
      verification,
    };
  }

  /** 已写入草稿的幂等返回：不再写库，报告缺失时也不伪造成功。 */
  private buildIdempotentResult(draft: SupplementDraftView): FinalizeResult {
    const {
      finalizedIngredientId,
      finalizedNutritionFoodId,
      finalizedEvidenceId,
    } = draft;
    if (
      !finalizedIngredientId ||
      !finalizedNutritionFoodId ||
      !finalizedEvidenceId
    ) {
      throw new ConflictException(
        '草稿已标记写入，但缺少正式记录 id，请刷新页面后联系管理员',
      );
    }

    return {
      ingredientId: finalizedIngredientId,
      nutritionFoodId: finalizedNutritionFoodId,
      evidenceId: finalizedEvidenceId,
      verification: isVerificationReport(draft.verification)
        ? draft.verification
        : {
            ok: false,
            checkedAt: (draft.finalizedAt ?? new Date()).toISOString(),
            fields: [],
            features: [],
          },
    };
  }

  /** 只认提醒项自己的 ackKey；参数变了旧确认自动失效（spec §7.3）。 */
  private findUnacknowledgedWarnings(
    payload: SupplementDraftPayload,
    warnings: SupplementDraftIssue[],
  ): SupplementDraftIssue[] {
    const acknowledged = new Set(
      payload.review.acknowledgedWarnings.map((entry) =>
        entry.paramsHash ? `${entry.code}:${entry.paramsHash}` : entry.code,
      ),
    );

    return warnings.filter((warning) => {
      const ackKey = warning.ackKey ?? warning.code;
      return !acknowledged.has(ackKey);
    });
  }

  private resolveGroupId(payload: SupplementDraftPayload): string | null {
    const groupId = payload.equivalence.groupId?.trim();
    if (!groupId || groupId === GROUP_SKIPPED_ID) {
      return null;
    }
    return groupId;
  }

  /**
   * 归组前先算好「写完应该是什么样」，供事务内回读对比：
   * - priority：草稿指定就用它，否则排到队尾（组内现有最大值 + 1）；
   * - status：一并审核通过 → APPROVED；不通过时已审核组被打回 DRAFT，其余保持原状态。
   */
  private async prepareGroupAssignment(
    tx: Prisma.TransactionClient,
    payload: SupplementDraftPayload,
    groupId: string,
  ): Promise<{
    groupId: string | null;
    priority: number;
    status: string | null;
  }> {
    const group = await tx.supplementEquivalenceGroup.findUnique({
      where: { id: groupId },
      select: { status: true },
    });
    if (!group) {
      throw new BadRequestException('等价组不存在或已被删除，请重新选择');
    }

    let priority = payload.equivalence.priority;
    if (priority === null) {
      const members = await tx.ingredient.findMany({
        where: { equivalenceGroupId: groupId },
        select: { equivalencePriority: true },
      });
      const max = members.reduce(
        (acc, member) => Math.max(acc, member.equivalencePriority ?? 0),
        -1,
      );
      priority = max + 1;
    }

    const reapprove = payload.equivalence.reapproveGroup !== false;
    return {
      groupId,
      priority,
      status: reapprove
        ? 'APPROVED'
        : group.status === 'APPROVED'
          ? 'DRAFT'
          : group.status,
    };
  }

  /** 事务内回读：原料 / 营养档案 / 主映射 / 证据 / 标签 / 等价组 / 草稿。 */
  private async readBack(
    tx: Prisma.TransactionClient,
    draftId: string,
    created: CreateSupplementIngredientResult,
    groupId: string | null,
  ): Promise<DirectVerificationSnapshot> {
    const ingredient = await tx.ingredient.findUnique({
      where: { id: created.ingredientId },
      select: {
        name: true,
        brand: true,
        productModel: true,
        purchaseChannel: true,
        baseUnit: true,
        unitDisplayLabel: true,
        physicalForm: true,
        purchaseUnit: true,
        purchaseToBaseRatio: true,
        currentPricePerPurchaseUnit: true,
        diyEnabled: true,
        procurementEnabled: true,
        shelfLifeMonths: true,
        openedShelfLifeDays: true,
        storageCondition: true,
        isOilBased: true,
        supplementRetailEnabled: true,
        equivalenceGroupId: true,
        equivalencePriority: true,
        properties: true,
        nutritionProfile: true,
      },
    });
    const nutritionFood = await tx.nutritionFood.findUnique({
      where: { id: created.nutritionFoodId },
      select: {
        status: true,
        category: true,
        nutritionData: true,
        defaultSupplementTargets: true,
      },
    });
    const mapping = await tx.nutritionFoodMapping.findFirst({
      where: {
        nutritionFoodId: created.nutritionFoodId,
        ingredientId: created.ingredientId,
        isPrimary: true,
      },
      select: { isPrimary: true, yieldRate: true },
    });
    const evidence = await tx.supplementLabelEvidence.findUnique({
      where: { id: created.evidenceId },
      select: {
        productUrl: true,
        frontImageUrl: true,
        labelImageUrl: true,
        labelText: true,
        servingUnitsPerDose: true,
        conversionSnapshot: true,
      },
    });
    if (!ingredient || !nutritionFood || !mapping || !evidence) {
      throw new InternalServerErrorException(
        '写入后回读不到刚写入的原料或营养档案，已回滚，未写入任何正式数据',
      );
    }

    const tagAssignments = await tx.ingredientTagAssignment.findMany({
      where: { ingredientId: created.ingredientId },
      select: { tag: { select: { name: true } } },
    });
    const group = groupId
      ? await tx.supplementEquivalenceGroup.findUnique({
          where: { id: groupId },
          select: { status: true },
        })
      : null;
    if (groupId && !group) {
      throw new InternalServerErrorException(
        '写入后回读不到刚归入的等价组，已回滚，未写入任何正式数据',
      );
    }
    const draft = await tx.supplementCreationDraft.findUnique({
      where: { id: draftId },
      select: {
        status: true,
        finalizedIngredientId: true,
        finalizedNutritionFoodId: true,
        finalizedEvidenceId: true,
      },
    });
    if (!draft) {
      throw new InternalServerErrorException(
        '写入后回读不到草稿，已回滚，未写入任何正式数据',
      );
    }

    return {
      ingredient: {
        name: ingredient.name,
        brand: ingredient.brand,
        productModel: ingredient.productModel,
        purchaseChannel: ingredient.purchaseChannel,
        baseUnit: ingredient.baseUnit,
        unitDisplayLabel: ingredient.unitDisplayLabel,
        physicalForm: ingredient.physicalForm,
        purchaseUnit: ingredient.purchaseUnit,
        purchaseToBaseRatio: ingredient.purchaseToBaseRatio,
        currentPricePerPurchaseUnit: Number(
          ingredient.currentPricePerPurchaseUnit,
        ),
        diyEnabled: ingredient.diyEnabled,
        procurementEnabled: ingredient.procurementEnabled,
        shelfLifeMonths: ingredient.shelfLifeMonths,
        openedShelfLifeDays: ingredient.openedShelfLifeDays,
        storageCondition: ingredient.storageCondition,
        isOilBased: ingredient.isOilBased,
        supplementRetailEnabled: ingredient.supplementRetailEnabled,
        equivalenceGroupId: ingredient.equivalenceGroupId,
        equivalencePriority: ingredient.equivalencePriority,
        properties: isPlainObject(ingredient.properties)
          ? ingredient.properties
          : {},
      },
      // 两个营养落点各取各的：配方设计器读 nutrition_data，等价组/浓度解析读原料档案。
      ingredientProfile: {
        nutrients: this.flattenNutritionProfile(ingredient.nutritionProfile),
      },
      nutritionFood: {
        status: nutritionFood.status,
        category: nutritionFood.category,
        nutrients: this.flattenNutritionProfile(nutritionFood.nutritionData),
        defaultSupplementTargets: nutritionFood.defaultSupplementTargets,
        primaryMapping: mapping.isPrimary,
        yieldRate: mapping.yieldRate,
      },
      evidence: {
        productUrl: evidence.productUrl,
        frontImageUrl: evidence.frontImageUrl,
        labelImageUrl: evidence.labelImageUrl,
        labelText: evidence.labelText,
        servingUnitsPerDose: evidence.servingUnitsPerDose,
        conversionSnapshot: evidence.conversionSnapshot,
      },
      tags: tagAssignments.map((assignment) => assignment.tag.name),
      group: { status: group?.status ?? null },
      draft: {
        status: draft.status,
        ingredientId: draft.finalizedIngredientId,
        nutritionFoodId: draft.finalizedNutritionFoodId,
        evidenceId: draft.finalizedEvidenceId,
      },
    };
  }

  /** 从回读的档案里摊平所有营养素值（键是规范字段路径）。 */
  private flattenNutritionProfile(profile: unknown): Record<string, number> {
    const result: Record<string, number> = {};
    if (!isPlainObject(profile)) {
      return result;
    }
    for (const tab of NUTRIENT_TABS) {
      const values = profile[tab];
      if (!isPlainObject(values)) continue;
      for (const [key, value] of Object.entries(values)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          result[`${tab}.${key}`] = value;
        }
      }
    }
    return result;
  }

  /**
   * 草稿期望快照：完全按「建档入参 + 组归属决定」推出来，不读库。
   * `properties` 的键名/取值口径与建档服务写库时一致（空值不写键，对比时按 null 计）。
   */
  private buildExpectedSnapshot(
    payload: SupplementDraftPayload,
    input: CreateSupplementIngredientInput,
    created: CreateSupplementIngredientResult,
    group: { groupId: string | null; priority: number; status: string | null },
  ): DirectVerificationSnapshot {
    const perUnitNutrients = this.derivePerUnitNutrients(input);
    const defaultSupplementTargets = (input.defaultTargetFields ?? [])
      .filter((fieldPath) => (input.servingNutrients[fieldPath] ?? 0) > 0)
      .map((fieldPath) => {
        const field = findNutritionField(fieldPath);
        return {
          fieldPath,
          label: field?.label ?? null,
          unit: field?.unit ?? null,
        };
      });

    return {
      ingredient: {
        name: input.name,
        brand: input.brand ?? null,
        productModel: input.productModel ?? null,
        purchaseChannel: input.purchaseChannel ?? null,
        baseUnit: input.baseUnit ?? 'PCS',
        unitDisplayLabel: input.unitDisplayLabel,
        physicalForm: input.physicalForm,
        purchaseUnit: input.purchaseUnit,
        purchaseToBaseRatio: input.purchaseToBaseRatio,
        currentPricePerPurchaseUnit: input.currentPricePerPurchaseUnit,
        diyEnabled: input.diyEnabled,
        procurementEnabled: input.procurementEnabled,
        shelfLifeMonths: input.shelfLifeMonths ?? null,
        openedShelfLifeDays: input.openedShelfLifeDays ?? null,
        storageCondition: input.storageCondition ?? null,
        isOilBased: input.isOilBased ?? false,
        supplementRetailEnabled: input.supplementRetailEnabled ?? false,
        equivalenceGroupId: group.groupId,
        equivalencePriority: group.priority,
        properties: {
          display_unit: input.unitDisplayLabel,
          serving_units_per_dose: input.servingUnitsPerDose,
          add_timing: input.addTiming,
          production_loss_rate: input.productionLossRate,
          label_category: input.labelCategory,
          label_names: input.labelNames,
          label_name_source: input.labelNameSource,
          tags: input.tagNames,
          no_sale_reason: input.noSaleReason ?? null,
          purchase_link: input.purchaseLink ?? null,
          image_url: input.imageUrl ?? null,
        },
      },
      ingredientProfile: { nutrients: perUnitNutrients },
      nutritionFood: {
        status: 'VERIFIED',
        category: 'SUPPLEMENT',
        nutrients: perUnitNutrients,
        defaultSupplementTargets,
        primaryMapping: true,
        yieldRate: 1,
      },
      evidence: {
        productUrl: input.evidence.productUrl ?? null,
        frontImageUrl: input.evidence.frontImageUrl ?? null,
        labelImageUrl: input.evidence.labelImageUrl ?? null,
        labelText: input.evidence.labelText ?? null,
        servingUnitsPerDose: input.servingUnitsPerDose,
        conversionSnapshot: {
          servingUnitsPerDose: input.servingUnitsPerDose,
          servingNutrients: input.servingNutrients,
          perUnitNutrients,
          unitDisplayLabel: input.unitDisplayLabel,
        },
      },
      tags: [...input.tagNames],
      group: { status: group.status },
      draft: {
        status: 'FINALIZED',
        ingredientId: created.ingredientId,
        nutritionFoodId: created.nutritionFoodId,
        evidenceId: created.evidenceId,
      },
    };
  }

  /** 每单位值只有一处口径：每份 ÷ 份量（与建档服务一致）。 */
  private derivePerUnitNutrients(
    input: CreateSupplementIngredientInput,
  ): Record<string, number> {
    const derived: Record<string, number> = {};
    for (const [fieldPath, servingValue] of Object.entries(
      input.servingNutrients,
    )) {
      derived[fieldPath] = servingValue / input.servingUnitsPerDose;
    }
    return derived;
  }

  /**
   * 重复建档的 409：body 里带已有 id/名称，审核页可以直接给「去用这条记录」的入口。
   * 预检与 P2002 兜底共用同一个响应形状。
   */
  private buildDuplicateConflictError(
    existing: {
      id: string;
      name: string;
      brand: string | null;
      productModel: string | null;
    } | null,
  ): ConflictException {
    return new ConflictException({
      message: existing
        ? duplicateMessage(existing)
        : '同名的补剂或营养档案已存在；刷新页面后重试，若仍失败请联系管理员',
      ingredientId: existing?.id ?? null,
      name: existing?.name ?? null,
    });
  }

  /** P2002 → 409：把撞上的那条查出来写进提示，人才能判断是不是同一款。 */
  private async buildDuplicateConflict(
    input: CreateSupplementIngredientInput,
  ): Promise<ConflictException> {
    const existing = await this.prisma.ingredient.findFirst({
      where: {
        type: 'SUPPLEMENT',
        name: input.name,
        brand: input.brand ?? null,
        productModel: input.productModel ?? null,
      },
      select: { id: true, name: true, brand: true, productModel: true },
    });
    this.logger.warn(
      `[supplement-finalize] 唯一键冲突 incoming=${JSON.stringify({
        name: input.name,
        brand: input.brand ?? null,
        productModel: input.productModel ?? null,
      })} existing=${JSON.stringify(existing)}`,
    );

    return this.buildDuplicateConflictError(existing);
  }
}
