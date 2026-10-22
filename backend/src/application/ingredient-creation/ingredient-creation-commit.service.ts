import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { NutritionGovernanceSourceType, Prisma } from '@prisma/client';
import { createEmptyNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import { findNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import { normalizeLegacyNutritionSourceType } from '../../domain/ingredient/nutrition-source-contract';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';
import type { PreparationState } from '../../domain/ingredient-creation/preparation-state';
import { PrismaService } from '../../infrastructure/prisma.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import type {
  ExceptionRecord,
  IngredientCreationDraft,
  IngredientDraft,
  NutritionEvidenceEntry,
  ProfileDraft,
} from './ingredient-creation.types';

/**
 * 向导提交的入参。字段与设计文档第六节的「一次性提交」对应：
 * 原料预填值、1..n 份营养档案、哪一份是主档案。
 */
export interface CommitIngredientCreationInput {
  draftId: string;
  userId: string;
  ingredient: IngredientDraft;
  profiles: ProfileDraft[];
  /** 主档案在 `profiles` 里的下标；必须指向存在的档案。 */
  primaryProfileIndex: number;
}

export interface CommitIngredientCreationResult {
  ingredientId: string;
  /** 与 `profiles` 顺序一一对应的营养档案 id。 */
  nutritionFoodIds: string[];
  auditId: string;
}

/** 提交时读到的来源记录快照（只取写档案需要的列）。 */
interface SourceRecordSnapshot {
  id: string;
  sourceType: NutritionGovernanceSourceType;
  sourceKey: string;
  sourceTitle: string;
  foodNameEn: string | null;
}

interface PreparedProfile {
  profile: ProfileDraft;
  sourceRecord: SourceRecordSnapshot;
  nutritionData: NutritionProfileV2;
}

type FieldChangeKind =
  | 'VALUE_CHANGED'
  | 'CONFLICT_RESOLVED'
  | 'MANUALLY_ADDED'
  | 'REMOVED_FROM_FINAL';

/**
 * AI 冲突里的一个候选：`value` / `unit` 是目录单位值，`sourceValue` / `sourceUnit`
 * 是来源原文（两者不能混用，审计里都留着，展示时分开）。
 */
interface AiConflictCandidate {
  sourceRecordId: string;
  value: number;
  unit: string;
  sourceValue: number | null;
  sourceUnit: string | null;
}

/**
 * 一条「AI 提案 vs 最终值」的差异。
 *
 * `profileIndex` + `fieldPath` 是这条记录的坐标；`aiCandidates` 只在
 * AI 当时给出多个候选（冲突）时非空，用来还原人是从哪几个值里选的。
 */
interface AuditFieldChange {
  profileIndex: number;
  preparationState: PreparationState;
  sourceRecordId: string;
  fieldPath: string;
  change: FieldChangeKind;
  aiValue: number | null;
  aiUnit: string | null;
  aiSourceRecordId: string | null;
  aiCandidates: AiConflictCandidate[] | null;
  finalValue: number | null;
  finalUnit: string | null;
  finalStatus: NutritionEvidenceEntry['status'] | null;
  finalSourceRecordId: string | null;
  finalConfirmedBy: string | null;
}

interface AuditChanges {
  fields: AuditFieldChange[];
  /**
   * 人登记过的例外（理由 + 操作人 + 时间）。例外不是字段级改动，
   * 但同属「人裁决过什么」，与字段差异一起进审计。
   */
  exceptions: ExceptionRecord[];
}

/** AI 提案（缝合方案）里，一个字段的原始值与状态。 */
interface AiProposalRow {
  value: number | null;
  unit: string | null;
  status: string | null;
  sourceRecordId: string | null;
}

interface AiProposalBaseline {
  primarySourceRecordId: string;
  rows: Map<string, AiProposalRow>;
  conflicts: Map<string, AiConflictCandidate[]>;
}

const PREPARATION_STATE_LABELS: Record<PreparationState, string> = {
  RAW: '生',
  COOKED: '熟',
};

/**
 * 浮点噪声不算改动：与缝合模块同一相对误差口径（1e-6）。
 *
 * 两边都是 0 时 `scale` 为 0，先靠 `left === right` 短路，不会误判。
 */
const CHANGE_RELATIVE_TOLERANCE = 1e-6;

function numbersEqual(left: number, right: number): boolean {
  if (left === right) {
    return true;
  }

  const scale = Math.max(Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= CHANGE_RELATIVE_TOLERANCE * scale;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === 'P2002';
}

/**
 * 从一份 AI 提案快照里读缝合方案。
 *
 * 快照有两种合理形态：本身就是 `MergePlan`（`rows` / `conflicts` / `primarySourceRecordId`），
 * 或者包了一层 `mergePlan` / `plan`。两种都认，读到的东西始终只取
 * `primarySourceRecordId`、`rows`、`conflicts` 三个键。
 */
function readMergeProposal(input: unknown): AiProposalBaseline | null {
  if (!isRecord(input)) {
    return null;
  }

  const plan = isRecord(input.mergePlan)
    ? input.mergePlan
    : isRecord(input.plan)
      ? input.plan
      : input;
  const primarySourceRecordId = readNonEmptyString(plan.primarySourceRecordId);
  if (!primarySourceRecordId) {
    return null;
  }

  const rows = new Map<string, AiProposalRow>();
  if (Array.isArray(plan.rows)) {
    for (const raw of plan.rows) {
      if (!isRecord(raw)) {
        continue;
      }
      const fieldPath = readNonEmptyString(raw.fieldPath);
      if (!fieldPath) {
        continue;
      }
      rows.set(fieldPath, {
        value: readFiniteNumber(raw.value),
        unit: readNonEmptyString(raw.unit),
        status: readNonEmptyString(raw.status),
        sourceRecordId: readNonEmptyString(raw.sourceRecordId),
      });
    }
  }

  const conflicts = new Map<string, AiConflictCandidate[]>();
  if (Array.isArray(plan.conflicts)) {
    for (const raw of plan.conflicts) {
      if (!isRecord(raw)) {
        continue;
      }
      const fieldPath = readNonEmptyString(raw.fieldPath);
      if (!fieldPath || !Array.isArray(raw.candidates)) {
        continue;
      }
      const candidates: AiConflictCandidate[] = [];
      for (const candidate of raw.candidates) {
        if (!isRecord(candidate)) {
          continue;
        }
        const sourceRecordId = readNonEmptyString(candidate.sourceRecordId);
        const value = readFiniteNumber(candidate.value);
        const unit = readNonEmptyString(candidate.unit);
        if (!sourceRecordId || value === null || !unit) {
          continue;
        }
        candidates.push({
          sourceRecordId,
          value,
          unit,
          sourceValue: readFiniteNumber(candidate.sourceValue),
          sourceUnit: readNonEmptyString(candidate.sourceUnit),
        });
      }
      if (candidates.length > 0) {
        conflicts.set(fieldPath, candidates);
      }
    }
  }

  return { primarySourceRecordId, rows, conflicts };
}

/**
 * 找到这份档案对应的 AI 提案基线：优先用 `proposalHistory` 里最近一份
 * 主来源相同的 MERGE 快照（它保留的是**原始**提案，不会被人工裁决覆盖），
 * 没有快照时退回 `payload.mergePlan`。
 */
function findAiProposalForProfile(
  draft: IngredientCreationDraft,
  profile: ProfileDraft,
): AiProposalBaseline | null {
  const history = Array.isArray(draft.payload.proposalHistory)
    ? draft.payload.proposalHistory
    : [];
  const matched = history
    .filter((snapshot) => isRecord(snapshot) && snapshot.kind === 'MERGE')
    .map((snapshot) => readMergeProposal(snapshot))
    .filter((proposal): proposal is AiProposalBaseline => proposal !== null)
    .filter(
      (proposal) => proposal.primarySourceRecordId === profile.sourceRecordId,
    );
  if (matched.length > 0) {
    return matched[matched.length - 1];
  }

  const plan = readMergeProposal(draft.payload.mergePlan);
  return plan && plan.primarySourceRecordId === profile.sourceRecordId
    ? plan
    : null;
}

/**
 * 逐 profile + fieldPath 比较「AI 提案」与「最终档案」，只记录有差异的字段。
 *
 * 判定口径（见设计文档第六节「AI 提案 vs 人改了什么」）：
 * - `CONFLICT_RESOLVED`：AI 当时给了多个候选、没有最终值，现在有值了 —— 人裁决过；
 *   或者提案基线这一行本身就标着 `status = MANUAL`（`applyManualResolution` 的产物）。
 * - `VALUE_CHANGED`：AI 给过值，最终值或单位不一样 —— 人改过。
 * - `REMOVED_FROM_FINAL`：AI 给过值，最终档案里没有 / 值为 null。
 * - `MANUALLY_ADDED`：AI 没给过值，最终有值（有提案基线时全算；没有基线时
 *   只算 `status = MANUAL` 的字段，因为整份档案本来就是人录的）。
 * 与提案完全一致且单位也一致的字段不写记录——那是「采纳」，不是「改动」。
 */
function buildAuditChanges(
  draft: IngredientCreationDraft,
  profiles: ProfileDraft[],
): AuditChanges {
  const fields: AuditFieldChange[] = [];

  profiles.forEach((profile, profileIndex) => {
    const baseline = findAiProposalForProfile(draft, profile);
    const finalByPath = new Map<string, NutritionEvidenceEntry>();
    for (const entry of profile.entries) {
      if (entry && typeof entry.fieldPath === 'string') {
        finalByPath.set(entry.fieldPath, entry);
      }
    }

    const fieldPaths = new Set<string>();
    baseline?.rows.forEach((_row, fieldPath) => fieldPaths.add(fieldPath));
    baseline?.conflicts.forEach((_candidates, fieldPath) =>
      fieldPaths.add(fieldPath),
    );
    for (const fieldPath of finalByPath.keys()) {
      fieldPaths.add(fieldPath);
    }

    for (const fieldPath of fieldPaths) {
      const ai = baseline?.rows.get(fieldPath) ?? null;
      const aiCandidates = baseline?.conflicts.get(fieldPath) ?? null;
      const final = finalByPath.get(fieldPath) ?? null;
      const aiValue = ai?.value ?? null;
      const finalValue = readFiniteNumber(final?.finalValue);
      const finalUnit = final ? readNonEmptyString(final.unit) : null;

      let change: FieldChangeKind | null = null;
      if (aiCandidates && finalValue !== null) {
        change = 'CONFLICT_RESOLVED';
      } else if (finalValue === null) {
        if (aiValue !== null) {
          change = 'REMOVED_FROM_FINAL';
        }
      } else if (ai?.status === 'MANUAL') {
        // 缝合方案里标 MANUAL 的行＝人工裁决后的结果（见 applyManualResolution）。
        change = 'CONFLICT_RESOLVED';
      } else if (aiValue === null) {
        if (baseline === null || final?.status === 'MANUAL') {
          change = 'MANUALLY_ADDED';
        }
      } else if (
        !numbersEqual(aiValue, finalValue) ||
        (ai?.unit !== null && finalUnit !== null && ai?.unit !== finalUnit)
      ) {
        change = 'VALUE_CHANGED';
      }

      if (!change) {
        continue;
      }

      fields.push({
        profileIndex,
        preparationState: profile.preparationState,
        sourceRecordId: profile.sourceRecordId,
        fieldPath,
        change,
        aiValue,
        aiUnit: ai?.unit ?? null,
        aiSourceRecordId: ai?.sourceRecordId ?? null,
        aiCandidates: aiCandidates ? [...aiCandidates] : null,
        finalValue,
        finalUnit,
        finalStatus: final?.status ?? null,
        finalSourceRecordId: final?.sourceRecordId ?? null,
        finalConfirmedBy: final?.confirmedBy ?? null,
      });
    }
  });

  const exceptions = draft.payload.verify?.exceptions;
  return {
    fields,
    exceptions: Array.isArray(exceptions) ? exceptions : [],
  };
}

/**
 * 用一份档案的证据账本组装 `NutritionFood.nutritionData`。
 *
 * 只写证据里**确实给出**的值：目录字段进对应 tab，`finalValue = null`
 * 或非有限数的字段一律跳过（保持空档案的 null），绝不补 0。
 * 目录之外的 `fieldPath` 落到 `customItems`，不静默丢弃。
 */
function buildNutritionData(
  profile: ProfileDraft,
  sourceRecord: SourceRecordSnapshot,
): NutritionProfileV2 {
  const nutritionData = createEmptyNutritionProfile();
  const sourceDefinition = normalizeLegacyNutritionSourceType(
    sourceRecord.sourceType,
  );

  nutritionData.meta = {
    ...nutritionData.meta,
    rawBasisType: 'PER_100_G',
    sampleState: profile.preparationState,
    sourceType: sourceRecord.sourceType,
    sourceKind: sourceDefinition?.sourceKind ?? null,
    sourceCode: sourceDefinition?.sourceCode ?? null,
    sourceRecordId: sourceRecord.id,
    externalId: sourceRecord.sourceKey,
    sourceTitle: sourceRecord.sourceTitle,
    sourceProvider: sourceDefinition?.sourceProvider ?? null,
    confidenceLevel: 'MEDIUM',
  };

  for (const entry of profile.entries) {
    if (
      typeof entry.finalValue !== 'number' ||
      !Number.isFinite(entry.finalValue)
    ) {
      continue;
    }

    const field = findNutritionField(entry.fieldPath);
    if (!field) {
      nutritionData.customItems.push({
        name: entry.fieldPath,
        value: entry.finalValue,
        unit: entry.unit,
        rawBasisType: 'PER_100_G',
        note: entry.formula ?? null,
      });
      continue;
    }

    const tab = nutritionData[field.tabKey] as Record<string, number | null>;
    tab[field.fieldKey] = entry.finalValue;
  }

  return nutritionData;
}

/**
 * 提交服务：这是整个向导里**唯一**写正式数据的地方。
 *
 * 三样东西由强约束（`@@unique([name, brand, productModel])`）查重兜底，
 * 原料、营养档案、映射、审计全部在一个 `$transaction` 里写：
 * 任何一步失败（含并发撞唯一键）整笔回滚，不会留下半条数据。
 *
 * 营养档案一律落 `PENDING`：变成 `VERIFIED` 只能由人在「确认可用」时点一下，
 * 本服务不写 `verifiedBy` / `verifiedAt`。
 */
@Injectable()
export class IngredientCreationCommitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly draftService: IngredientCreationDraftService,
  ) {}

  async commit(
    input: CommitIngredientCreationInput,
  ): Promise<CommitIngredientCreationResult> {
    const primaryProfileIndex = this.assertInput(input);
    const draft = await this.draftService.get(input.draftId);
    const sourceRecords = await this.loadSourceRecords(input.profiles);
    const preparedProfiles = input.profiles.map((profile): PreparedProfile => {
      const sourceRecord = sourceRecords.get(profile.sourceRecordId)!;
      return {
        profile,
        sourceRecord,
        nutritionData: buildNutritionData(profile, sourceRecord),
      };
    });
    const proposals = Array.isArray(draft.payload.proposalHistory)
      ? draft.payload.proposalHistory
      : [];
    const changes = buildAuditChanges(draft, input.profiles);
    const primaryNutritionData =
      preparedProfiles[primaryProfileIndex].nutritionData;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.ingredient.findFirst({
        where: {
          name: input.ingredient.name,
          brand: null,
          productModel: null,
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          `原料「${input.ingredient.name}」已存在，请到原料列表处理`,
        );
      }

      const ingredient = await this.createIngredient(
        tx,
        input,
        primaryNutritionData,
      );
      const nutritionFoodIds: string[] = [];
      for (const [index, prepared] of preparedProfiles.entries()) {
        const nutritionFood = await tx.nutritionFood.create({
          data: this.buildNutritionFoodData(input, prepared),
        });
        nutritionFoodIds.push(nutritionFood.id);

        await tx.nutritionFoodMapping.create({
          data: {
            ingredientId: ingredient.id,
            nutritionFoodId: nutritionFood.id,
            yieldRate: 1,
            isPrimary: index === primaryProfileIndex,
            notes: `由 AI 辅助新建原料向导提交（草稿 ${input.draftId}）`,
          },
        });
      }

      const audit = await tx.ingredientCreationAudit.create({
        data: {
          draftId: input.draftId,
          ingredientId: ingredient.id,
          nutritionFoodIds,
          proposals: proposals as unknown as Prisma.InputJsonValue,
          changes: changes as unknown as Prisma.InputJsonValue,
          committedBy: input.userId,
        },
      });

      return {
        ingredientId: ingredient.id,
        nutritionFoodIds,
        auditId: audit.id,
      };
    });
  }

  /**
   * 纯校验（不碰库）：档案非空、每份档案有内容、主档案下标唯一且有效。
   *
   * 调用方可能在档案上直接标 `isPrimary`（HTTP DTO 透传）；它和
   * `primaryProfileIndex` 是同一件事的两种表达，同时出现时必须一致，
   * 且最多一个为 true——否则就是「两个主档案」，直接拒绝。
   */
  private assertInput(input: CommitIngredientCreationInput): number {
    const { profiles, primaryProfileIndex } = input;
    if (!Array.isArray(profiles) || profiles.length === 0) {
      throw new BadRequestException('提交至少需要一份营养档案');
    }

    profiles.forEach((profile, index) => {
      if (!Array.isArray(profile.entries) || profile.entries.length === 0) {
        throw new BadRequestException(
          `第 ${index + 1} 份营养档案没有任何营养成分，不能提交`,
        );
      }
      // 状态是受控词表：库里历史上 RAW/raw 混写过，脏值不能从这里进正式表。
      if (
        profile.preparationState !== 'RAW' &&
        profile.preparationState !== 'COOKED'
      ) {
        throw new BadRequestException(
          `第 ${index + 1} 份营养档案的状态必须是 RAW 或 COOKED`,
        );
      }
    });

    if (
      !Number.isInteger(primaryProfileIndex) ||
      primaryProfileIndex < 0 ||
      primaryProfileIndex >= profiles.length
    ) {
      throw new BadRequestException(
        `主档案下标 ${primaryProfileIndex} 不指向任何一份营养档案`,
      );
    }

    const flaggedPrimaryIndexes = profiles
      .map((profile, index) =>
        (profile as ProfileDraft & { isPrimary?: unknown }).isPrimary === true
          ? index
          : -1,
      )
      .filter((index) => index >= 0);
    if (flaggedPrimaryIndexes.length > 1) {
      throw new BadRequestException('只能有一份主档案');
    }
    if (
      flaggedPrimaryIndexes.length === 1 &&
      flaggedPrimaryIndexes[0] !== primaryProfileIndex
    ) {
      throw new BadRequestException(
        '档案上标记的主档案与 primaryProfileIndex 不一致',
      );
    }

    return primaryProfileIndex;
  }

  /** 读齐所有档案引用的来源记录；引用不存在就不提交（不猜来源、不落空 dataSource）。 */
  private async loadSourceRecords(
    profiles: ProfileDraft[],
  ): Promise<Map<string, SourceRecordSnapshot>> {
    const ids = Array.from(
      new Set(
        profiles
          .map((profile) => profile.sourceRecordId)
          .filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
      ),
    );
    const rows = await this.prisma.nutritionSourceRecord.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sourceType: true,
        sourceKey: true,
        sourceTitle: true,
        foodNameEn: true,
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    for (const profile of profiles) {
      if (!byId.has(profile.sourceRecordId)) {
        throw new BadRequestException(
          `营养来源记录 ${profile.sourceRecordId} 不存在，不能提交`,
        );
      }
    }

    return byId;
  }

  private async createIngredient(
    tx: Prisma.TransactionClient,
    input: CommitIngredientCreationInput,
    primaryNutritionData: NutritionProfileV2,
  ) {
    const properties: Record<string, unknown> = {
      ingredientCreationDraftId: input.draftId,
    };
    const cfctClass = input.ingredient.cfctClass?.trim();
    if (cfctClass) {
      properties.cfct_class = cfctClass;
    }
    if (typeof input.ingredient.edibleYieldRate === 'number') {
      properties.edible_yield_rate = input.ingredient.edibleYieldRate;
    }

    const data: Prisma.IngredientUncheckedCreateInput = {
      name: input.ingredient.name,
      type: input.ingredient.type,
      baseUnit: input.ingredient.baseUnit,
      unitDisplayLabel: input.ingredient.unitDisplayLabel,
      // 向导提交的原料还没确认采购口径：与手工新建一致，默认不参与采购/DIY 推荐。
      diyEnabled: false,
      procurementEnabled: false,
      brand: null,
      productModel: null,
      purchaseUnit:
        input.ingredient.unitDisplayLabel?.trim() || input.ingredient.baseUnit,
      purchaseToBaseRatio: 1,
      currentPricePerPurchaseUnit: 0,
      properties: properties as Prisma.InputJsonValue,
      nutritionProfile:
        primaryNutritionData as unknown as Prisma.InputJsonValue,
    };

    try {
      return await tx.ingredient.create({ data });
    } catch (error) {
      // 查重与写入之间仍有竞态：唯一键被抢占时同样按「已存在」处理。
      if (isPrismaUniqueViolation(error)) {
        throw new ConflictException(
          `原料「${input.ingredient.name}」已存在，请到原料列表处理`,
        );
      }
      throw error;
    }
  }

  private buildNutritionFoodData(
    input: CommitIngredientCreationInput,
    prepared: PreparedProfile,
  ): Prisma.NutritionFoodUncheckedCreateInput {
    const label = PREPARATION_STATE_LABELS[prepared.profile.preparationState];

    return {
      name: `${input.ingredient.name}（${label}）`,
      nameEn: prepared.sourceRecord.foodNameEn,
      category: 'OTHER',
      // 来源身份写进列上，档案能直接追回哪条来源记录。
      dataSource: prepared.sourceRecord.sourceType,
      externalId: prepared.sourceRecord.sourceKey,
      // 一律待验证：变成 VERIFIED 必须由人点「确认可用」，不在这里写。
      status: 'PENDING',
      preparationState: prepared.profile.preparationState,
      preparationStateLabel: label,
      nutritionData: prepared.nutritionData as unknown as Prisma.InputJsonValue,
      notes:
        prepared.profile.notes ??
        `由 AI 辅助新建原料向导提交（草稿 ${input.draftId}）`,
      createdBy: input.userId,
    };
  }
}
