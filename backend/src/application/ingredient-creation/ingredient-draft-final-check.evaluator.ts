import { BadRequestException } from '@nestjs/common';
import {
  buildEvidenceLedger,
  type EvidenceLedgerSource,
} from '../../domain/ingredient-creation/evidence-ledger';
import {
  runFinalCheck,
  type FinalCheckBasis,
} from '../../domain/ingredient-creation/final-check';
import {
  normalizePreparationState,
  type PreparationState,
} from '../../domain/ingredient-creation/preparation-state';
import {
  resolveStateCoverage,
  type CoverageCategory,
} from '../../domain/ingredient-creation/state-coverage';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  FinalCheckResult,
  IngredientCreationDraft,
  MergePlan,
  NutritionEvidenceEntry,
  ProfileDraft,
} from './ingredient-creation.types';

/**
 * 草稿 → 营养终检结果的**唯一**计算入口（profile 路线 + mergePlan 回退路线）。
 *
 * 为什么要从 `IngredientCreationCheckService` 里拆出来单放：
 * - 草稿终检要被两条路复用——原有的 `POST drafts/:id/check` / 提交前置检查，
 *   以及按域核验（NUTRITION 域必须与提交前是**同一份**结果，不能各算各的）；
 * - 两个服务都要用它，如果放在任一服务里就会形成服务间循环依赖（check service
 *   → check-run service → check service），拆成一个无状态计算器，依赖方向只有
 *   单向：两个服务 → 本文件。
 *
 * 这里只做 IO 读取（读来源记录）与纯计算，不写库、不落报告。
 */

/**
 * 宏观质量项：水分 / 蛋白 / 脂肪 / 灰分 / 碳水。
 *
 * 膳食纤维不重复计入——USDA 的碳水是「by difference」，已经把纤维包含在内，
 * 再加一次会让宏量之和虚高、误报 `MACRO_SUM_OVER_100`。
 */
const MACRO_MASS_FIELD_PATHS = [
  'macros.moisture',
  'macros.crudeProtein',
  'macros.crudeFat',
  'macros.ash',
  'macros.carbohydrate',
] as const;

const ENERGY_KCAL_FIELD_PATH = 'macros.energyKcal';
const CRUDE_PROTEIN_FIELD_PATH = 'macros.crudeProtein';
const CRUDE_FAT_FIELD_PATH = 'macros.crudeFat';
const CARBOHYDRATE_FIELD_PATH = 'macros.carbohydrate';

const PREPARATION_STATES: readonly PreparationState[] = ['RAW', 'COOKED'];
const COVERAGE_CATEGORIES: readonly CoverageCategory[] = [
  'MEAT_ORGAN',
  'STARCHY_VEGETABLE',
  'OTHER',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isPreparationState(value: unknown): value is PreparationState {
  return (
    typeof value === 'string' &&
    (PREPARATION_STATES as readonly string[]).includes(value)
  );
}

function isCoverageCategory(value: unknown): value is CoverageCategory {
  return (
    typeof value === 'string' &&
    (COVERAGE_CATEGORIES as readonly string[]).includes(value)
  );
}

function isMergePlan(value: unknown): value is MergePlan {
  return (
    isRecord(value) &&
    typeof value.primarySourceRecordId === 'string' &&
    Array.isArray(value.rows) &&
    Array.isArray(value.conflicts) &&
    Array.isArray(value.missingFields)
  );
}

function readMergePlan(draft: IngredientCreationDraft): MergePlan | null {
  return isMergePlan(draft.payload.mergePlan) ? draft.payload.mergePlan : null;
}

function readMeta(profile: unknown): Record<string, unknown> | null {
  if (!isRecord(profile) || !isRecord(profile.meta)) {
    return null;
  }
  return profile.meta;
}

function readPreparationStateFromProfile(
  profile: unknown,
): PreparationState | null {
  const meta = readMeta(profile);
  const sampleState = meta?.sampleState;
  if (typeof sampleState !== 'string') {
    return null;
  }
  return normalizePreparationState(sampleState);
}

function readEntryValue(
  entries: readonly NutritionEvidenceEntry[],
  fieldPath: string,
): number | null {
  const entry = entries.find((candidate) => candidate.fieldPath === fieldPath);
  return entry ? readFiniteNumber(entry.finalValue) : null;
}

/** 宏量质量之和（g/100g）；缺失项不按 0 计，只累加确有的值。 */
export function sumMacroGrams(
  entries: readonly NutritionEvidenceEntry[],
): number {
  let sum = 0;
  for (const fieldPath of MACRO_MASS_FIELD_PATHS) {
    const value = readEntryValue(entries, fieldPath);
    if (value !== null) {
      sum += value;
    }
  }
  return sum;
}

/**
 * 4/9/4 反算能量。蛋白 / 脂肪 / 碳水任一缺失时返回 null：
 * 缺数据不能当成 0，否则会凭空造出一个「反算值」去和声明能量比较。
 */
export function energyFromMacrosKcal(
  entries: readonly NutritionEvidenceEntry[],
): number | null {
  const protein = readEntryValue(entries, CRUDE_PROTEIN_FIELD_PATH);
  const fat = readEntryValue(entries, CRUDE_FAT_FIELD_PATH);
  const carbohydrate = readEntryValue(entries, CARBOHYDRATE_FIELD_PATH);
  if (protein === null || fat === null || carbohydrate === null) {
    return null;
  }

  return 4 * protein + 9 * fat + 4 * carbohydrate;
}

/** 终检口径：档案一律每 100g；来源按每份时把份量克数交给终检判断能否换算。 */
function resolveFinalCheckBasis(primaryProfile: unknown): FinalCheckBasis {
  const meta = readMeta(primaryProfile);
  const rawBasisType =
    meta && typeof meta.rawBasisType === 'string' ? meta.rawBasisType : null;
  const servingGrams = readFiniteNumber(meta?.servingWeightG);

  return {
    profileBasis: 'PER_100_G',
    sourceBasis: rawBasisType === 'PER_SERVING' ? 'PER_SERVING' : 'PER_100_G',
    servingGrams:
      servingGrams !== null && servingGrams > 0 ? servingGrams : null,
  };
}

function collectRequiredStates(
  draft: IngredientCreationDraft,
): PreparationState[] {
  // 审核页允许人改原料卡的类别；卡片上的类别比草稿创建时的起手卡更新，
  // 优先按它决定「必需生熟」，否则人改了类别终检却仍按旧类别报缺失。
  const ingredient = isRecord(draft.payload.ingredient)
    ? draft.payload.ingredient
    : null;
  if (ingredient && isCoverageCategory(ingredient.category)) {
    return resolveStateCoverage(ingredient.category).required;
  }

  const intake = isRecord(draft.payload.intake) ? draft.payload.intake : null;
  if (intake && Array.isArray(intake.requiredStates)) {
    return intake.requiredStates.filter(isPreparationState);
  }

  // 草稿里没存显式清单时，按类别给默认值；非法类别在 PATCH 时已被挡住。
  if (intake && isCoverageCategory(intake.category)) {
    return resolveStateCoverage(intake.category).required;
  }

  return [];
}

/**
 * 已具备哪些生熟档案（无 `profiles` 时的回退路径）。
 *
 * 至少能从本次缝合的主来源 `meta.sampleState` 确定一份。都不确定时返回空数组，
 * 让终检如实报缺，不假装已经有了。
 */
function collectPresentStates(
  draft: IngredientCreationDraft,
  primaryProfile: unknown,
): PreparationState[] {
  const present = new Set<PreparationState>();

  for (const profile of draft.payload.profiles ?? []) {
    if (isRecord(profile) && isPreparationState(profile.preparationState)) {
      present.add(profile.preparationState);
    }
  }

  const primaryState = readPreparationStateFromProfile(primaryProfile);
  if (primaryState) {
    present.add(primaryState);
  }

  return [...present];
}

/** 过滤掉数据库里可能存在的脏行，只保留能参与终检的档案。 */
function usableProfiles(draft: IngredientCreationDraft): ProfileDraft[] {
  const stored = draft.payload.profiles;
  if (!Array.isArray(stored)) {
    return [];
  }

  return stored.filter(
    (profile): profile is ProfileDraft =>
      isRecord(profile) && typeof profile.sourceRecordId === 'string',
  );
}

/** 把各 profile 的 entries 合在一起：人的改动就写在这里。 */
function collectProfileEntries(
  profiles: readonly ProfileDraft[],
): NutritionEvidenceEntry[] {
  const entries: NutritionEvidenceEntry[] = [];
  for (const profile of profiles) {
    if (Array.isArray(profile.entries)) {
      entries.push(...profile.entries);
    }
  }
  return entries;
}

function collectProfileStates(
  profiles: readonly ProfileDraft[],
): PreparationState[] {
  const states = new Set<PreparationState>();
  for (const profile of profiles) {
    if (isPreparationState(profile.preparationState)) {
      states.add(profile.preparationState);
    }
  }
  return [...states];
}

/**
 * 终检用哪一份档案做「宏量 / 能量」的口径基准。
 *
 * 优先本次缝合方案的主来源；没有对应档案时取第一份。`entries` 本身仍取全部
 * profile 合并后的数组（单位闸门要检查每一份），但宏量不能把生、熟两份相加——
 * 那是两份独立档案，合起来必然虚高。
 */
function selectPrimaryProfile(
  profiles: readonly ProfileDraft[],
  preferredSourceRecordId: string | null | undefined,
): ProfileDraft | null {
  return (
    profiles.find(
      (profile) => profile.sourceRecordId === preferredSourceRecordId,
    ) ??
    profiles[0] ??
    null
  );
}

/**
 * 从 profile 侧取终检口径：profile 的来源记录里读 `rawBasisType` / `servingWeightG`。
 *
 * 有多个 profile 时：只要有一份来源是「按份」且没有份量克数，就用它（不能把
 * 无法换算的问题藏起来）；否则优先主来源对应的档案，最后取第一份。
 * 所有 profile 的来源记录都取不到时返回 null，由调用方回退到 mergePlan 的默认口径。
 */
function resolveProfileBasis(
  profiles: readonly ProfileDraft[],
  records: ReadonlyMap<string, EvidenceLedgerSource>,
  preferredSourceRecordId: string | null | undefined,
): FinalCheckBasis | null {
  const candidates = profiles
    .map((profile) => ({
      profile,
      record: records.get(profile.sourceRecordId),
    }))
    .filter(
      (item): item is { profile: ProfileDraft; record: EvidenceLedgerSource } =>
        item.record !== undefined,
    );

  if (candidates.length === 0) {
    return null;
  }

  for (const { record } of candidates) {
    const basis = resolveFinalCheckBasis(record.normalizedNutrition);
    if (basis.sourceBasis === 'PER_SERVING' && basis.servingGrams === null) {
      return basis;
    }
  }

  const chosen =
    candidates.find(
      ({ profile }) => profile.sourceRecordId === preferredSourceRecordId,
    ) ?? candidates[0];

  return resolveFinalCheckBasis(chosen.record.normalizedNutrition);
}

/** 缝合方案引用到的来源 id（主来源、行来源、冲突候选来源）。 */
function collectPlanSourceIds(plan: MergePlan): string[] {
  const ids = new Set<string>([plan.primarySourceRecordId]);
  for (const row of plan.rows) {
    if (row.sourceRecordId) {
      ids.add(row.sourceRecordId);
    }
  }
  for (const conflict of plan.conflicts) {
    for (const candidate of conflict.candidates) {
      ids.add(candidate.sourceRecordId);
    }
  }
  return [...ids];
}

/**
 * 草稿终检计算器。
 *
 * 输入优先级：
 * 1. 草稿里有 `payload.profiles` 时，用各 profile 的 `entries`（人改过的值就是
 *    写在这里，状态 `MANUAL`）——检查的必须是即将提交的那份数据；
 * 2. 没有 profiles 时才回退到 `payload.mergePlan` + 证据账本。
 *
 * 纯计算 + 只读来源记录，不写库；调用方（原有终检接口、提交前置检查、按域核验）
 * 拿到的都是同一份结果。
 */
export class IngredientDraftFinalCheckEvaluator {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(draft: IngredientCreationDraft): Promise<FinalCheckResult> {
    const plan = readMergePlan(draft);
    const profiles = usableProfiles(draft);

    if (profiles.length > 0) {
      return this.evaluateProfiles(draft, plan, profiles);
    }

    return this.evaluateMergePlan(draft, this.requireMergePlan(draft));
  }

  /** ③ 之后：终检以人改过的 profile entries 为准。 */
  private async evaluateProfiles(
    draft: IngredientCreationDraft,
    plan: MergePlan | null,
    profiles: ProfileDraft[],
  ): Promise<FinalCheckResult> {
    const entries = collectProfileEntries(profiles);
    const primaryProfile = selectPrimaryProfile(
      profiles,
      plan?.primarySourceRecordId,
    );
    const metricEntries =
      primaryProfile && Array.isArray(primaryProfile.entries)
        ? primaryProfile.entries
        : entries;

    const profileRecords = await this.loadSourceRecords(
      profiles.map((profile) => profile.sourceRecordId),
    );
    const profileBasis = resolveProfileBasis(
      profiles,
      profileRecords,
      plan?.primarySourceRecordId,
    );
    const basis = profileBasis ?? (await this.resolvePlanPrimaryBasis(plan));

    return runFinalCheck({
      entries,
      basis,
      macroSumG: sumMacroGrams(metricEntries),
      energyKcal: readEntryValue(metricEntries, ENERGY_KCAL_FIELD_PATH),
      energyFromMacrosKcal: energyFromMacrosKcal(metricEntries),
      coverage: {
        required: collectRequiredStates(draft),
        present: collectProfileStates(profiles),
      },
    });
  }

  /** 没有 profiles 时的旧路径：mergePlan + 证据账本。 */
  private async evaluateMergePlan(
    draft: IngredientCreationDraft,
    plan: MergePlan,
  ): Promise<FinalCheckResult> {
    const records = await this.loadSourceRecords(collectPlanSourceIds(plan));
    const primaryRecord = records.get(plan.primarySourceRecordId);
    const ledger = buildEvidenceLedger({
      plan,
      sources: [...records.values()],
    });

    return runFinalCheck({
      entries: ledger.entries,
      basis: resolveFinalCheckBasis(primaryRecord?.normalizedNutrition),
      macroSumG: sumMacroGrams(ledger.entries),
      energyKcal: readEntryValue(ledger.entries, ENERGY_KCAL_FIELD_PATH),
      energyFromMacrosKcal: energyFromMacrosKcal(ledger.entries),
      coverage: {
        required: collectRequiredStates(draft),
        present: collectPresentStates(
          draft,
          primaryRecord?.normalizedNutrition,
        ),
      },
    });
  }

  /** profile 侧口径取不到时，回退到 mergePlan 主来源的旧默认。 */
  private async resolvePlanPrimaryBasis(
    plan: MergePlan | null,
  ): Promise<FinalCheckBasis> {
    if (!plan) {
      return resolveFinalCheckBasis(undefined);
    }

    const records = await this.loadSourceRecords([plan.primarySourceRecordId]);
    return resolveFinalCheckBasis(
      records.get(plan.primarySourceRecordId)?.normalizedNutrition,
    );
  }

  private requireMergePlan(draft: IngredientCreationDraft): MergePlan {
    const plan = readMergePlan(draft);
    if (!plan) {
      throw new BadRequestException('草稿还没有缝合方案，请先生成缝合方案');
    }
    return plan;
  }

  /** 按 id 读来源记录；找不到的 id 不在 map 里，由调用方决定回退。 */
  private async loadSourceRecords(
    ids: readonly string[],
  ): Promise<Map<string, EvidenceLedgerSource>> {
    const uniqueIds = [
      ...new Set(
        ids.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ),
      ),
    ];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.nutritionSourceRecord.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, normalizedNutrition: true },
    });

    return new Map(
      rows.map((row) => [
        row.id,
        {
          sourceRecordId: row.id,
          normalizedNutrition: row.normalizedNutrition,
        } satisfies EvidenceLedgerSource,
      ]),
    );
  }
}
