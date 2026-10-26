import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type {
  NutritionGovernanceRecordStatus,
  NutritionGovernanceSourceType,
  Prisma,
} from '@prisma/client';
import { createEmptyNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import { findNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import { normalizeLegacyNutritionSourceType } from '../../domain/ingredient/nutrition-source-contract';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';
import {
  EDIBLE_YIELD_RATE_PROPERTY_KEY,
  INGREDIENT_CARD_FIELD_KEYS,
  INGREDIENT_PROPERTY_KEY_BY_FIELD,
} from '../../domain/ingredient-creation/ingredient-card-fields';
import type { PreparationState } from '../../domain/ingredient-creation/preparation-state';
import { PrismaService } from '../../infrastructure/prisma.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import type {
  ExceptionRecord,
  IngredientCardField,
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
  status: NutritionGovernanceRecordStatus;
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
  /**
   * 原料卡上人工改过的字段名（`payload.ingredient.manualFields`）。
   *
   * 营养字段靠证据行的 `status=MANUAL` 留痕；原料卡没有逐字段证据行，
   * 就用这份清单把「哪些格子是人改的」带进审计。
   */
  ingredientFields: IngredientCardField[];
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

/**
 * 「有值」的唯一口径：`null` / `undefined` / 空字符串 / 纯空白算没填。
 *
 * `0` 与 `false` 是有效值（0 元采购价、不做油性处理），必须照写，
 * 不能被 `if (value)` 这类真值判断吞掉。
 */
function hasValue<T>(value: T | null | undefined): value is T {
  if (value === null || value === undefined) {
    return false;
  }
  return typeof value === 'string' ? value.trim().length > 0 : true;
}

/**
 * 原料名的唯一口径：NFKC（全角→半角）→ 连续空白压成一个 → 去首尾空白。
 *
 * 查重、咨询锁、入库都用这一份：否则 `"鸡肝 "` 能绕过查重建出第二条。
 */
function normalizeIngredientName(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }

  return raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** `nutrition_food.external_id` 是 VarChar(100)，来源编号是 VarChar(200)。 */
const EXTERNAL_ID_MAX_LENGTH = 100;

const ALLOWED_BASE_UNITS = new Set(['G', 'ML', 'PCS']);

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
 * 原料卡人工字段白名单：直接取字段契约的 30 个公共键。
 *
 * 不能在这里手写一份更短的清单：人把「品牌」标记成人工核对后，提交审计里
 * 会静默丢掉这个标记，事后查不到是谁改的。
 */
const INGREDIENT_CARD_FIELD_SET: ReadonlySet<string> = new Set(
  INGREDIENT_CARD_FIELD_KEYS,
);

/** 读原料卡上的人工改动标记；脏值过滤掉，顺序按入库顺序保留。 */
function readIngredientManualFields(
  draft: IngredientCreationDraft,
): IngredientCardField[] {
  const ingredient = isRecord(draft.payload.ingredient)
    ? draft.payload.ingredient
    : null;
  const raw = ingredient?.manualFields;
  if (!Array.isArray(raw)) {
    return [];
  }

  return [
    ...new Set(
      raw.filter((field): field is IngredientCardField =>
        typeof field === 'string'
          ? INGREDIENT_CARD_FIELD_SET.has(field)
          : false,
      ),
    ),
  ];
}

/**
 * 逐 profile + fieldPath 比较「AI 提案」与「最终档案」，只记录有差异的字段。
 *
 * 判定口径（见设计文档第六节「AI 提案 vs 人改了什么」）：
 * - `CONFLICT_RESOLVED`：AI 当时给了多个候选、没有最终值，现在有值了 —— 人裁决过；
 *   或者提案基线这一行本身就标着 `status = MANUAL`（`applyManualResolution` 的产物）。
 * - `VALUE_CHANGED`：AI 给过值，最终值或单位不一样 —— 人改过。
 * - `REMOVED_FROM_FINAL`：AI 给过值，最终档案里没有 / 值为 null。
 * - `MANUALLY_ADDED`：AI 提案里没有这个值，且最终账本标明是人填的
 *   （`status = MANUAL`）。账本里的 DIRECT / FILLED / CONVERTED 都算来源给的值，
 *   哪怕匹配到的提案基线里没有这一行，也不臆测成人工新增。
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
        // 只有账本明确标了 MANUAL 才是人填的；DIRECT / FILLED / CONVERTED
        // 都表示值来自来源（AI 缝合），不能记成「人工新增」。
        if (final?.status === 'MANUAL') {
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
    ingredientFields: readIngredientManualFields(draft),
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
    const { primaryProfileIndex, ingredientName } = this.assertInput(input);
    const draft = await this.draftService.get(input.draftId);
    // 幂等：同一草稿已经提交过就不再建第二套数据。并发下由事务里的条件更新再兜一道。
    if (draft.step === 'COMMIT') {
      throw new ConflictException('这份草稿已经提交过了');
    }

    // 查重、加锁、入库都用同一份归一后的名字。
    const ingredient: IngredientDraft = {
      ...input.ingredient,
      name: ingredientName,
    };
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
      // Postgres 唯一索引把 NULL 当互不相等，而向导提交的 brand/productModel 都是 NULL：
      // `findFirst` 与唯一键都挡不住并发同名提交，用同名咨询锁把它们串行化。
      await this.acquireIngredientNameLock(tx, ingredientName);

      // 认领草稿：条件更新在行锁下原子生效，并发提交时只有一方能拿到 count = 1。
      const claimed = await tx.ingredientCreationDraft.updateMany({
        where: { id: input.draftId, step: { not: 'COMMIT' } },
        data: { step: 'COMMIT' },
      });
      if (claimed.count === 0) {
        throw new ConflictException('这份草稿已经提交过了');
      }

      const existing = await tx.ingredient.findFirst({
        where: { name: ingredientName, brand: null, productModel: null },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          `原料「${ingredientName}」已存在，请到原料列表处理`,
        );
      }

      const createdIngredient = await this.createIngredient(
        tx,
        ingredient,
        input.draftId,
        primaryNutritionData,
      );
      const nutritionFoodIds: string[] = [];
      for (const [index, prepared] of preparedProfiles.entries()) {
        let nutritionFood: { id: string };
        try {
          nutritionFood = await tx.nutritionFood.create({
            data: this.buildNutritionFoodData(
              ingredient,
              prepared,
              input.draftId,
              input.userId,
            ),
          });
        } catch (error) {
          if (isPrismaUniqueViolation(error)) {
            throw new ConflictException('同名营养档案已存在（同来源同版本）');
          }
          throw error;
        }
        nutritionFoodIds.push(nutritionFood.id);

        await tx.nutritionFoodMapping.create({
          data: {
            ingredientId: createdIngredient.id,
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
          ingredientId: createdIngredient.id,
          nutritionFoodIds,
          proposals: proposals as unknown as Prisma.InputJsonValue,
          changes: changes as unknown as Prisma.InputJsonValue,
          committedBy: input.userId,
        },
      });

      return {
        ingredientId: createdIngredient.id,
        nutritionFoodIds,
        auditId: audit.id,
      };
    });
  }

  /**
   * 纯校验（不碰库），并返回归一后的原料名与主档案下标。
   *
   * 调用方可能在档案上直接标 `isPrimary`（HTTP DTO 透传）；它和
   * `primaryProfileIndex` 是同一件事的两种表达，同时出现时必须一致，
   * 且最多一个为 true——否则就是「两个主档案」，直接拒绝。
   */
  private assertInput(input: CommitIngredientCreationInput): {
    primaryProfileIndex: number;
    ingredientName: string;
  } {
    const { profiles, primaryProfileIndex, ingredient } = input;

    if (!ingredient || typeof ingredient !== 'object') {
      throw new BadRequestException('缺少原料档案');
    }
    // 名字是查重与锁的 key：空名、只有空白的名字一律不收。
    const ingredientName = normalizeIngredientName(ingredient.name);
    if (!ingredientName) {
      throw new BadRequestException('原料名称不能为空');
    }
    if (ingredient.type !== 'FOOD') {
      throw new BadRequestException('原料类型只能是 FOOD');
    }
    if (!ALLOWED_BASE_UNITS.has(ingredient.baseUnit)) {
      throw new BadRequestException('原料基准单位只能是 G / ML / PCS');
    }
    const edibleYieldRate = ingredient.edibleYieldRate;
    if (edibleYieldRate !== null && edibleYieldRate !== undefined) {
      if (
        !Number.isFinite(edibleYieldRate) ||
        edibleYieldRate <= 0 ||
        edibleYieldRate > 1
      ) {
        throw new BadRequestException('可食部比例必须在 (0, 1] 之间');
      }
    }

    if (!Array.isArray(profiles) || profiles.length === 0) {
      throw new BadRequestException('提交至少需要一份营养档案');
    }

    const seenStates = new Set<PreparationState>();
    profiles.forEach((profile, index) => {
      if (!Array.isArray(profile.entries) || profile.entries.length === 0) {
        throw new BadRequestException(
          `第 ${index + 1} 份营养档案没有任何营养成分，不能提交`,
        );
      }
      // 状态是受控词表：库里历史上 RAW/raw 混写过，脏值不能从这里进正式表。
      const state = profile.preparationState;
      if (state !== 'RAW' && state !== 'COOKED') {
        throw new BadRequestException(
          `第 ${index + 1} 份营养档案的状态必须是 RAW 或 COOKED`,
        );
      }
      // 设计每次创建只有「生」「熟」各一份档案，重复状态说明调用方传错了。
      if (seenStates.has(state)) {
        throw new BadRequestException(`生熟状态 ${state} 只能有一份营养档案`);
      }
      seenStates.add(state);

      profile.entries.forEach((entry, entryIndex) => {
        const finalValue: unknown = entry?.finalValue;
        // 显式 null = 这个字段没有值（缺失），与 0 是两件事，放行；
        // 但字符串 / undefined 这类「有值却不能用」的必须拒绝，不能静默跳过丢数据。
        if (finalValue === null) {
          return;
        }
        if (typeof finalValue !== 'number' || !Number.isFinite(finalValue)) {
          throw new BadRequestException(
            `第 ${index + 1} 份营养档案的第 ${entryIndex + 1} 条证据（${entry?.fieldPath ?? '未知字段'}）必须是非空有限数字或 null`,
          );
        }
      });
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

    return { primaryProfileIndex, ingredientName };
  }

  /**
   * 同名提交串行化的 Postgres 事务级咨询锁（事务结束自动释放）。
   *
   * `hashtext` 把归一后的小写名字压成 int4；哈希碰撞只会让两个不同名字多串行化
   * 一次，不会漏锁。锁必须在事务客户端上取，才会随事务结束释放。
   */
  private async acquireIngredientNameLock(
    tx: Prisma.TransactionClient,
    ingredientName: string,
  ): Promise<void> {
    const lockKey = ingredientName.toLowerCase();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  }

  /** 读齐所有档案引用的来源记录；引用不存在或已停用就不提交（不猜来源、不落空 dataSource）。 */
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
        status: true,
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    for (const profile of profiles) {
      const sourceRecord = byId.get(profile.sourceRecordId);
      if (!sourceRecord) {
        throw new BadRequestException(
          `营养来源记录 ${profile.sourceRecordId} 不存在，不能提交`,
        );
      }
      if (sourceRecord.status !== 'ACTIVE') {
        throw new BadRequestException(
          `营养来源记录 ${profile.sourceRecordId} 已停用（${sourceRecord.status}），不能提交`,
        );
      }
    }

    return byId;
  }

  private async createIngredient(
    tx: Prisma.TransactionClient,
    ingredient: IngredientDraft,
    draftId: string,
    primaryNutritionData: NutritionProfileV2,
  ) {
    const properties: Record<string, unknown> = {
      ingredientCreationDraftId: draftId,
    };
    // 6 个进 JSON 的字段按同一张映射表写入；契约外的键根本不会出现在这里。
    for (const [field, propertyKey] of Object.entries(
      INGREDIENT_PROPERTY_KEY_BY_FIELD,
    )) {
      const value = ingredient[field as keyof IngredientDraft];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          properties[propertyKey] = trimmed;
        }
      } else if (hasValue(value)) {
        properties[propertyKey] = value;
      }
    }
    // 可食部已经是 0–1 的比例：原样落库，绝不再 ÷100（换算只在前端表单一次）。
    if (hasValue(ingredient.edibleYieldRate)) {
      properties[EDIBLE_YIELD_RATE_PROPERTY_KEY] = ingredient.edibleYieldRate;
    }

    // 字符串列统一 trim：纯空白等于没填，不能顶掉采购单位的回退。
    const unitDisplayLabel =
      readNonEmptyString(ingredient.unitDisplayLabel) ?? ingredient.baseUnit;
    const purchaseUnit =
      readNonEmptyString(ingredient.purchaseUnit) ?? unitDisplayLabel;

    const data: Prisma.IngredientUncheckedCreateInput = {
      name: ingredient.name,
      type: ingredient.type,
      baseUnit: ingredient.baseUnit,
      unitDisplayLabel,
      // 向导提交的原料还没确认采购口径：与手工新建一致，默认不参与采购/DIY 推荐。
      // 采购开关本阶段始终关闭（打开它需要单独的产品决策）。
      diyEnabled: false,
      procurementEnabled: false,
      brand: null,
      productModel: null,
      purchaseUnit,
      purchaseToBaseRatio: 1,
      currentPricePerPurchaseUnit: 0,
      properties: properties as Prisma.InputJsonValue,
      nutritionProfile:
        primaryNutritionData as unknown as Prisma.InputJsonValue,
    };

    // 只有真有值的列才覆盖默认值：undefined / null / '' / 纯空白一律保持上面的默认，
    // 0 与 false 是有效值，照常写入。字符串列写入前一律 trim。
    const notes = readNonEmptyString(ingredient.notes);
    if (notes !== null) {
      data.notes = notes;
    }
    const procurementStrategy = readNonEmptyString(
      ingredient.procurementStrategy,
    );
    if (procurementStrategy !== null) {
      data.procurementStrategy =
        procurementStrategy as Prisma.IngredientUncheckedCreateInput['procurementStrategy'];
    }
    if (hasValue(ingredient.weightG)) {
      data.weightG = ingredient.weightG;
    }
    if (hasValue(ingredient.maxCapacityG)) {
      data.maxCapacityG = ingredient.maxCapacityG;
    }
    const brand = readNonEmptyString(ingredient.brand);
    if (brand !== null) {
      data.brand = brand;
    }
    const productModel = readNonEmptyString(ingredient.productModel);
    if (productModel !== null) {
      data.productModel = productModel;
    }
    const purchaseChannel = readNonEmptyString(ingredient.purchaseChannel);
    if (purchaseChannel !== null) {
      data.purchaseChannel = purchaseChannel;
    }
    if (hasValue(ingredient.purchaseToBaseRatio)) {
      data.purchaseToBaseRatio = ingredient.purchaseToBaseRatio;
    }
    if (hasValue(ingredient.currentPricePerPurchaseUnit)) {
      data.currentPricePerPurchaseUnit = ingredient.currentPricePerPurchaseUnit;
    }
    if (hasValue(ingredient.diyEnabled)) {
      data.diyEnabled = ingredient.diyEnabled;
    }
    if (hasValue(ingredient.shelfLifeMonths)) {
      data.shelfLifeMonths = ingredient.shelfLifeMonths;
    }
    const storageCondition = readNonEmptyString(ingredient.storageCondition);
    if (storageCondition !== null) {
      data.storageCondition = storageCondition;
    }
    if (hasValue(ingredient.openedShelfLifeDays)) {
      data.openedShelfLifeDays = ingredient.openedShelfLifeDays;
    }
    if (hasValue(ingredient.isOilBased)) {
      data.isOilBased = ingredient.isOilBased;
    }
    // safetyStock / reorderPoint / targetStock / tags：本阶段不写（AFTER_CREATE）。

    try {
      return await tx.ingredient.create({ data });
    } catch (error) {
      // 查重与咨询锁之外仍有其它写入路径：唯一键被抢占时同样按「已存在」处理。
      if (isPrismaUniqueViolation(error)) {
        throw new ConflictException(
          `原料「${ingredient.name}」已存在，请到原料列表处理`,
        );
      }
      throw error;
    }
  }

  private buildNutritionFoodData(
    ingredient: IngredientDraft,
    prepared: PreparedProfile,
    draftId: string,
    createdBy: string,
  ): Prisma.NutritionFoodUncheckedCreateInput {
    const label = PREPARATION_STATE_LABELS[prepared.profile.preparationState];
    const sourceKey = prepared.sourceRecord.sourceKey;
    // external_id 只有 100 长度：超长必须截断（否则 P2000 500），截断事实留在 notes。
    const externalId = sourceKey.slice(0, EXTERNAL_ID_MAX_LENGTH);
    const truncationNote =
      externalId === sourceKey
        ? ''
        : `（来源编号超长已截断，原文：${sourceKey}）`;
    const notes = `${
      prepared.profile.notes ?? `由 AI 辅助新建原料向导提交（草稿 ${draftId}）`
    }${truncationNote}`;

    return {
      name: `${ingredient.name}（${label}）`,
      // 原料卡上人工核对过的英文名优先；没填才回退来源记录的英文名。
      nameEn: ingredient.nameEn?.trim() || prepared.sourceRecord.foodNameEn,
      category: 'OTHER',
      // 来源身份写进列上，档案能直接追回哪条来源记录。
      dataSource: prepared.sourceRecord.sourceType,
      externalId,
      // 一律待验证：变成 VERIFIED 必须由人点「确认可用」，不在这里写。
      status: 'PENDING',
      preparationState: prepared.profile.preparationState,
      preparationStateLabel: label,
      nutritionData: prepared.nutritionData as unknown as Prisma.InputJsonValue,
      notes,
      createdBy,
    };
  }
}
