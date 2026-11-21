/**
 * 补剂草稿 · 写入后功能核验 + 重核（spec §8.4 / §8.5 / §9.2）。
 *
 * 事务内已经核过「直接字段」（落的行和草稿是否一致）；这里核的是**功能能不能用**：
 * 上架清单查得到、配方设计器能推荐、DIY/采购入口可读、等价组能替换、包材能匹配、
 * 没有重复建档。这些查询依赖别的服务，只能等事务提交后再跑。
 *
 * 口径（spec §8.5）：
 * - `ERROR` 失败 → 报告 `ok=false`，页面显示「已写入，但功能未生效」；
 * - `WARN` 失败（等价组暂不参与替换、没有包材规则）→ 只展示，不把整体判失败；
 * - 数据已经写入，任何核验失败都**不抛错**，由调用方把报告存回草稿；
 *   外部配置修好后用 `reverify` 只重跑这一层。
 */

import { ConflictException, Injectable } from '@nestjs/common';
import type { IngredientPhysicalForm } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { SupplementCatalogService } from '../supplement-shop/supplement-catalog.service';
import { SupplementDosageService } from '../supplement-shop/supplement-dosage.service';
import type { SupplementCatalogResponse } from '../supplement-shop/supplement-catalog.service';
import {
  SupplementDraftService,
  type SupplementDraftView,
} from './supplement-draft.service';
import { normalizeSupplementDraftPayload } from './supplement-draft.types';
import type { SupplementDraftPayload } from './supplement-draft.types';
import type {
  SupplementWriteVerification,
  VerificationFeature,
  VerificationFeatureAction,
  VerificationFeatureCode,
  VerificationFeatureSeverity,
  VerificationField,
} from './supplement-verification';

/** 「暂不归组」的显式表态值（与草稿/最终写入模块一致）。 */
const GROUP_SKIPPED_ID = '__SKIP__';

/** 包材规则缺失时的修复入口（spec §7.2 / §9.2）。 */
const PACKAGING_ACTION: VerificationFeatureAction = {
  label: '去配置包材',
  path: '/supplement-shop/packaging',
};

/**
 * 缺少写入时直接字段报告时的补位项。
 *
 * 报告形状的 code 联合在 Task 10 只列了七个功能码；这一条不是「功能」，
 * 而是「没有直接字段证据」的硬失败，页面据 code 展示。
 */
const DIRECT_FIELDS_MISSING_CODE: VerificationFeatureCode =
  'DIRECT_FIELDS_MISSING';

/** 功能核验只需要这三个正式记录 id。 */
export interface SupplementFeatureVerificationIds {
  ingredientId: string;
  nutritionFoodId: string;
  evidenceId: string;
}

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

/** Prisma Decimal / number 都归一成有限数字；其余一律 null。 */
function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** `properties.purchase_link` 可能是 JSON/字符串；只认 `.url` 里的非空链接。 */
function readPurchaseLinkUrl(properties: unknown): string | null {
  if (!isPlainObject(properties)) {
    return null;
  }
  const link = properties.purchase_link;
  if (!isPlainObject(link)) {
    return null;
  }
  return trimmedOrNull(link.url as string | null | undefined);
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

/** 功能核验读到的原料行（只取核验用得到的字段）。 */
interface VerificationIngredientRow {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  physicalForm: IngredientPhysicalForm | null;
  diyEnabled: boolean;
  procurementEnabled: boolean;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: unknown;
  equivalenceGroupId: string | null;
  equivalencePriority: number;
  properties: unknown;
  nutritionProfile: unknown;
}

function buildFeature(
  code: VerificationFeatureCode,
  label: string,
  ok: boolean,
  severity: VerificationFeatureSeverity,
  detail: string,
  action?: VerificationFeatureAction,
): VerificationFeature {
  const feature: VerificationFeature = {
    code,
    label,
    ok,
    severity,
    detail,
  };
  if (action) {
    feature.action = action;
  }
  return feature;
}

function passFeature(
  code: VerificationFeatureCode,
  label: string,
  detail: string,
): VerificationFeature {
  return buildFeature(code, label, true, 'INFO', detail);
}

function failFeature(
  code: VerificationFeatureCode,
  label: string,
  severity: VerificationFeatureSeverity,
  detail: string,
  action?: VerificationFeatureAction,
): VerificationFeature {
  return buildFeature(code, label, false, severity, detail, action);
}

@Injectable()
export class SupplementVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: SupplementCatalogService,
    private readonly dosage: SupplementDosageService,
    private readonly draftService: SupplementDraftService,
  ) {}

  /**
   * 逐项核功能可用性；永不因「核验不通过」抛错（spec §8.5）。
   *
   * 只有查询本身炸了才会抛；`finalize` 必须在提交后兜住，不能把已写入的数据
   * 报成写入失败（那里会 catch 并返回 `ok=false`）。
   */
  async verifyFeatures(
    draft: SupplementDraftView,
    ids: SupplementFeatureVerificationIds,
  ): Promise<VerificationFeature[]> {
    const payload = normalizeSupplementDraftPayload(draft.payload);

    const [ingredient, catalog] = await Promise.all([
      this.prisma.ingredient.findUnique({
        where: { id: ids.ingredientId },
        select: {
          id: true,
          name: true,
          brand: true,
          productModel: true,
          physicalForm: true,
          diyEnabled: true,
          procurementEnabled: true,
          purchaseUnit: true,
          purchaseToBaseRatio: true,
          currentPricePerPurchaseUnit: true,
          equivalenceGroupId: true,
          equivalencePriority: true,
          properties: true,
          nutritionProfile: true,
        },
      }),
      this.catalog.listCatalog(),
    ]);

    const [recipe, equivalence, packaging, duplicate] = await Promise.all([
      this.verifyRecipe(ids),
      this.verifyEquivalence(payload, ingredient),
      this.verifyPackaging(ingredient),
      this.verifyDuplicate(payload, ids),
    ]);

    return [
      this.verifyRetail(payload, ids, catalog),
      recipe,
      this.verifyDiy(payload, ingredient),
      this.verifyProcurement(payload, ingredient),
      equivalence,
      packaging,
      duplicate,
    ];
  }

  /**
   * 已写入草稿的报告；还没写入或报告缺失都返回 null，不伪造成功。
   *
   * 草稿不存在/不属于本人由 `draftService.get` 统一抛 404。
   */
  async getVerification(
    userId: string,
    draftId: string,
  ): Promise<SupplementWriteVerification | null> {
    const draft = await this.draftService.get(draftId, userId);
    if (draft.status !== 'FINALIZED') {
      return null;
    }
    return isVerificationReport(draft.verification) ? draft.verification : null;
  }

  /**
   * 只重跑功能核验，不再写正式数据（spec §8.4）。
   *
   * 直接字段沿用上一次写入时存下的报告 —— 数据已经落库，重核不改数据，
   * 不能重算出一份「看起来刚验过」的直接字段。
   */
  async reverify(
    userId: string,
    draftId: string,
  ): Promise<SupplementWriteVerification> {
    const draft = await this.draftService.get(draftId, userId);
    if (draft.status !== 'FINALIZED') {
      throw new ConflictException('草稿还没写入，不能重核功能可用性');
    }

    const ids = this.resolveFinalizedIds(draft);
    const stored = isVerificationReport(draft.verification)
      ? draft.verification
      : null;
    const fields: VerificationField[] = stored?.fields ?? [];
    // 上一次核验在缺报告时也会保存 fields=[]，不能把「存过一份空报告」当成
    // 有直接字段证据；否则第二次重核会把缺证据洗成 ok=true。
    const hasDirectFields = Boolean(
      stored && Array.isArray(stored.fields) && stored.fields.length > 0,
    );
    const features = await this.verifyFeatures(draft, ids);
    if (!hasDirectFields) {
      // 没有写入时的直接字段证据，功能全过也不能判「全部成功」。
      features.unshift({
        code: DIRECT_FIELDS_MISSING_CODE,
        label: '字段核验',
        ok: false,
        severity: 'ERROR',
        detail: '缺少写入时字段核验记录，不能判定全部成功',
      });
    }
    const verification = this.buildReport(fields, features);

    await this.draftService.saveVerification(draftId, userId, verification);
    return verification;
  }

  /** 报告口径：直接字段全对 + 没有「severity=ERROR 且不通过」的功能项。 */
  private buildReport(
    fields: VerificationField[],
    features: VerificationFeature[],
  ): SupplementWriteVerification {
    return {
      ok:
        fields.every((field) => field.ok) &&
        features.every(
          (feature) => !(feature.severity === 'ERROR' && !feature.ok),
        ),
      checkedAt: new Date().toISOString(),
      fields,
      features,
    };
  }

  private resolveFinalizedIds(
    draft: SupplementDraftView,
  ): SupplementFeatureVerificationIds {
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
    };
  }

  /* ------------------------------------------------------------------ */
  /* 商城上架                                                            */
  /* ------------------------------------------------------------------ */

  private verifyRetail(
    payload: SupplementDraftPayload,
    ids: SupplementFeatureVerificationIds,
    catalog: SupplementCatalogResponse,
  ): VerificationFeature {
    const code: VerificationFeatureCode = 'RETAIL';
    const label = '商城上架';
    const expectedEnabled = payload.retail.enabled;
    const item = catalog.items.find(
      (candidate) => candidate.id === ids.ingredientId,
    );

    if (!item) {
      return failFeature(
        code,
        label,
        'ERROR',
        '上架清单里查不到这条原料：刷新上架页仍没有的话，检查原料档案是否被删除或类型不对',
        { label: '去上架清单', path: '/supplement-shop' },
      );
    }
    if (item.supplementRetailEnabled !== expectedEnabled) {
      return failFeature(
        code,
        label,
        'ERROR',
        `上架开关与草稿不一致：草稿是${expectedEnabled ? '上架' : '不上架'}，档案是${item.supplementRetailEnabled ? '上架' : '不上架'}`,
      );
    }
    if (!expectedEnabled) {
      return passFeature(code, label, '未上架，开关与草稿一致');
    }

    const errors = item.issues.filter((issue) => issue.level === 'ERROR');
    if (errors.length > 0) {
      return failFeature(
        code,
        label,
        'ERROR',
        `上架体检还有 ${errors.length} 个阻断项：${errors
          .map((issue) => issue.message)
          .join('；')}`,
        { label: '去上架清单处理', path: '/supplement-shop' },
      );
    }
    if (!item.readyToSell) {
      return failFeature(
        code,
        label,
        'ERROR',
        '上架体检没有阻断项，但 readyToSell 仍为 false：商品在商城还不能卖，请到上架清单检查',
        { label: '去上架清单处理', path: '/supplement-shop' },
      );
    }

    return passFeature(
      code,
      label,
      '上架清单能查到，开关一致，无 ERROR 体检项',
    );
  }

  /* ------------------------------------------------------------------ */
  /* 配方可选                                                            */
  /* ------------------------------------------------------------------ */

  private async verifyRecipe(
    ids: SupplementFeatureVerificationIds,
  ): Promise<VerificationFeature> {
    const code: VerificationFeatureCode = 'RECIPE';
    const label = '配方可选';

    const mapping = await this.prisma.nutritionFoodMapping.findFirst({
      where: {
        nutritionFoodId: ids.nutritionFoodId,
        ingredientId: ids.ingredientId,
        isPrimary: true,
        nutritionFood: { status: 'VERIFIED' },
      },
      select: {
        isPrimary: true,
        nutritionFood: {
          select: { status: true, defaultSupplementTargets: true },
        },
      },
    });

    if (!mapping) {
      return failFeature(
        code,
        label,
        'ERROR',
        '配方设计器查不到这条补剂：缺少主映射，或营养档案没有审核通过（VERIFIED）',
        { label: '去营养档案检查', path: '/ingredients?tab=nutrition' },
      );
    }

    const targets = mapping.nutritionFood.defaultSupplementTargets;
    if (!Array.isArray(targets) || targets.length === 0) {
      return failFeature(
        code,
        label,
        'ERROR',
        '营养档案的默认目标营养素为空，配方设计器不会推荐这条补剂',
        { label: '去营养档案补默认目标', path: '/ingredients?tab=nutrition' },
      );
    }

    return passFeature(
      code,
      label,
      `主映射 + 营养档案 VERIFIED + ${targets.length} 个默认目标`,
    );
  }

  /* ------------------------------------------------------------------ */
  /* DIY 推荐                                                            */
  /* ------------------------------------------------------------------ */

  private verifyDiy(
    payload: SupplementDraftPayload,
    ingredient: VerificationIngredientRow | null,
  ): VerificationFeature {
    const code: VerificationFeatureCode = 'DIY';
    const label = 'DIY 推荐';
    const expectedEnabled = payload.diy.enabled;

    if (!ingredient) {
      return failFeature(
        code,
        label,
        'ERROR',
        '查不到刚写入的原料，无法核验 DIY 入口',
      );
    }
    if (ingredient.diyEnabled !== expectedEnabled) {
      return failFeature(
        code,
        label,
        'ERROR',
        `DIY 开关与草稿不一致：草稿是${expectedEnabled ? '开启' : '关闭'}，档案是${ingredient.diyEnabled ? '开启' : '关闭'}`,
      );
    }
    if (!expectedEnabled) {
      return passFeature(code, label, '未开启 DIY，开关与草稿一致');
    }

    const url = readPurchaseLinkUrl(ingredient.properties);
    if (ingredient.physicalForm === 'LIQUID') {
      // 制作单不支持液体分装：提醒，不影响「数据已写入」的结论。
      return failFeature(
        code,
        label,
        'WARN',
        '液体补剂暂不支持分装，DIY 制作单不会出现',
      );
    }

    // 购买链接是选填；没有链接不影响 DIY 开关本身可用。
    return passFeature(
      code,
      label,
      url ? 'DIY 已开启，购买链接可读' : 'DIY 已开启；购买链接未填（选填）',
    );
  }

  /* ------------------------------------------------------------------ */
  /* 生产采购                                                            */
  /* ------------------------------------------------------------------ */

  private verifyProcurement(
    payload: SupplementDraftPayload,
    ingredient: VerificationIngredientRow | null,
  ): VerificationFeature {
    const code: VerificationFeatureCode = 'PROCUREMENT';
    const label = '生产采购';
    const expectedEnabled = payload.procurement.enabled;

    if (!ingredient) {
      return failFeature(
        code,
        label,
        'ERROR',
        '查不到刚写入的原料，无法核验生产采购',
      );
    }
    if (ingredient.procurementEnabled !== expectedEnabled) {
      return failFeature(
        code,
        label,
        'ERROR',
        `生产采购开关与草稿不一致：草稿是${expectedEnabled ? '开启' : '关闭'}，档案是${ingredient.procurementEnabled ? '开启' : '关闭'}`,
      );
    }
    if (!expectedEnabled) {
      return passFeature(code, label, '未开启生产采购，开关与草稿一致');
    }

    const problems: string[] = [];
    if (!trimmedOrNull(ingredient.purchaseUnit)) {
      problems.push('采购单位为空');
    }
    const ratio = toFiniteNumber(ingredient.purchaseToBaseRatio);
    if (ratio === null || ratio <= 0) {
      problems.push('换算倍数不可用');
    }
    const price = toFiniteNumber(ingredient.currentPricePerPurchaseUnit);
    if (price === null || price <= 0) {
      problems.push('采购价不可用');
    }

    if (problems.length > 0) {
      return failFeature(
        code,
        label,
        'ERROR',
        `生产采购已开启，但${problems.join('、')}`,
        { label: '去原料档案补采购信息', path: '/ingredients' },
      );
    }

    return passFeature(
      code,
      label,
      `采购单位/换算倍数/采购价可用（${ingredient.purchaseUnit} × ${ratio}）`,
    );
  }

  /* ------------------------------------------------------------------ */
  /* 等价替换                                                            */
  /* ------------------------------------------------------------------ */

  private async verifyEquivalence(
    payload: SupplementDraftPayload,
    ingredient: VerificationIngredientRow | null,
  ): Promise<VerificationFeature> {
    const code: VerificationFeatureCode = 'EQUIVALENCE';
    const label = '等价替换';

    if (!ingredient) {
      return failFeature(
        code,
        label,
        'ERROR',
        '查不到刚写入的原料，无法核验等价组',
      );
    }

    const selectedGroupId = trimmedOrNull(payload.equivalence.groupId);
    const skipped = !selectedGroupId || selectedGroupId === GROUP_SKIPPED_ID;

    if (skipped) {
      if (ingredient.equivalenceGroupId) {
        return failFeature(
          code,
          label,
          'ERROR',
          `草稿明确选择「暂不归组」，但原料档案已归入等价组 ${ingredient.equivalenceGroupId}`,
        );
      }
      return passFeature(code, label, '草稿明确暂不归组，档案未归组');
    }

    if (ingredient.equivalenceGroupId !== selectedGroupId) {
      return failFeature(
        code,
        label,
        'ERROR',
        `等价组与草稿不一致：草稿是 ${selectedGroupId}，档案是 ${
          ingredient.equivalenceGroupId ?? '未归组'
        }`,
      );
    }
    if (
      payload.equivalence.priority !== null &&
      ingredient.equivalencePriority !== payload.equivalence.priority
    ) {
      return failFeature(
        code,
        label,
        'ERROR',
        `组内排序与草稿不一致：草稿是 ${payload.equivalence.priority}，档案是 ${ingredient.equivalencePriority}`,
      );
    }

    const group = await this.prisma.supplementEquivalenceGroup.findUnique({
      where: { id: selectedGroupId },
      select: {
        status: true,
        isActive: true,
        nutrientKey: true,
        nutrientLabel: true,
        nutrientUnit: true,
        _count: { select: { ingredients: true } },
      },
    });
    if (!group) {
      return failFeature(
        code,
        label,
        'ERROR',
        '等价组不存在或已被删除，替换不会生效',
        {
          label: '去等价组检查',
          path: '/supplement-shop/equivalence-groups',
        },
      );
    }

    const memberCount = group._count.ingredients;
    const softIssues: string[] = [];
    if (!group.isActive) {
      softIssues.push('等价组已停用');
    }
    if (group.status !== 'APPROVED') {
      softIssues.push('等价组未审核通过');
    }
    if (memberCount < 2) {
      softIssues.push(`组内成员只有 ${memberCount} 个，不足 2 个`);
    }

    const concentration = this.checkGroupConcentration(group, ingredient);
    softIssues.push(...concentration.issues);

    if (softIssues.length > 0) {
      // 数据已经归组，只是暂不参与替换：提醒，不拖垮整体核验（spec §7.2）。
      return failFeature(
        code,
        label,
        'WARN',
        `已归组，但暂不参与等价替换：${softIssues.join('；')}`,
      );
    }

    return passFeature(
      code,
      label,
      `组 APPROVED、${memberCount} 个成员、目标营养素浓度可解析`,
    );
  }

  /**
   * 目标营养素的浓度解析：以**等价组自己的 nutrientKey** 为准。
   *
   * 草稿的默认目标可能填的是别的营养素；替换时看的是组要换的那个，拿错字段会
   * 把「不可替换」误判成可替换。缺值/单位不一致都只算「暂不参与替换」的提醒。
   */
  private checkGroupConcentration(
    group: {
      nutrientKey: string;
      nutrientLabel: string;
      nutrientUnit: string;
    },
    ingredient: VerificationIngredientRow,
  ): { issues: string[] } {
    const resolution = this.dosage.resolveConcentration(ingredient, {
      fieldPath: group.nutrientKey,
      label: group.nutrientLabel,
      unit: group.nutrientUnit,
      targetValuePerKg: 1,
    });

    if (resolution.status === 'MISSING') {
      return {
        issues: [
          `目标营养素浓度缺失：${group.nutrientLabel}（${group.nutrientKey}）`,
        ],
      };
    }
    if (resolution.status === 'UNIT_MISMATCH') {
      return {
        issues: [
          `目标营养素浓度单位不一致：${group.nutrientLabel}（${group.nutrientKey}）`,
        ],
      };
    }
    return { issues: [] };
  }

  /* ------------------------------------------------------------------ */
  /* 分装包材                                                            */
  /* ------------------------------------------------------------------ */

  private async verifyPackaging(
    ingredient: VerificationIngredientRow | null,
  ): Promise<VerificationFeature> {
    const code: VerificationFeatureCode = 'PACKAGING';
    const label = '分装包材';

    if (!ingredient) {
      return failFeature(
        code,
        label,
        'WARN',
        '查不到刚写入的原料，无法核验包材规则',
        PACKAGING_ACTION,
      );
    }

    const physicalForm = ingredient.physicalForm;
    const rule = await this.prisma.supplementPackagingRule.findFirst({
      where: {
        role: 'POUCH',
        enabled: true,
        // 规则不填形态 = 任意形态都匹配；填了就必须和原料形态一致。
        OR: physicalForm
          ? [{ physicalForm: null }, { physicalForm }]
          : [{ physicalForm: null }],
      },
      select: { id: true },
    });

    if (!rule) {
      // 包材没配好只影响分装汇总，不改变「数据已写入」的结论（spec §8.4）。
      return failFeature(
        code,
        label,
        'WARN',
        '没有匹配的袋型规则：分装汇总会把这条原料标红',
        PACKAGING_ACTION,
      );
    }

    return passFeature(code, label, '已匹配到启用的 POUCH 袋型规则');
  }

  /* ------------------------------------------------------------------ */
  /* 无重复                                                              */
  /* ------------------------------------------------------------------ */

  private async verifyDuplicate(
    payload: SupplementDraftPayload,
    ids: SupplementFeatureVerificationIds,
  ): Promise<VerificationFeature> {
    const code: VerificationFeatureCode = 'DUPLICATE';
    const label = '无重复';

    const matches = await this.prisma.ingredient.findMany({
      where: {
        type: 'SUPPLEMENT',
        name: payload.basic.name.trim(),
        brand: trimmedOrNull(payload.basic.brand),
        productModel: trimmedOrNull(payload.basic.productModel),
      },
      select: { id: true },
    });

    if (matches.length > 1) {
      return failFeature(
        code,
        label,
        'ERROR',
        `同名同品牌同规格的补剂有 ${matches.length} 条，正常只应该有 1 条，请合并或删除重复记录`,
      );
    }
    if (matches.length === 1 && matches[0].id !== ids.ingredientId) {
      return failFeature(
        code,
        label,
        'ERROR',
        '同名同品牌同规格的记录不是刚写入的这一条，请检查是否重复建档',
      );
    }

    return passFeature(code, label, '同名同品牌同规格只有这一条');
  }
}
