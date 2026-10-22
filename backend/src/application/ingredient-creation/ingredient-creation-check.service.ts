import { BadRequestException, Injectable } from '@nestjs/common';
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
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import type {
  FinalCheckResult,
  IngredientCreationDraft,
  MergePlan,
  NutritionEvidenceEntry,
} from './ingredient-creation.types';

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
 * 已具备哪些生熟档案。
 *
 * 优先读 PATCH 存进草稿的 `profiles`；否则至少能从本次缝合的主来源
 * `meta.sampleState` 确定一份。都不确定时返回空数组，让终检如实报缺，
 * 不假装已经有了。
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

/**
 * 终检的应用服务。
 *
 * 职责：重建证据账本 → 算宏量与 4/9/4 反算能量 → 判断生熟覆盖 →
 * 调领域层 `runFinalCheck`。控制器不重算任何营养规则。
 *
 * 提交前也走同一套终检（`assertCommitAllowed`）：拦死项存在时直接 400，
 * 不盲信前端传来的「我检查过了」。
 */
@Injectable()
export class IngredientCreationCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly draftService: IngredientCreationDraftService,
  ) {}

  async runCheck(draftId: string): Promise<FinalCheckResult> {
    const draft = await this.draftService.get(draftId);
    return this.evaluateDraft(draft);
  }

  /**
   * 提交前置检查：跑同一套终检，有拦死项就 400 并带回阻断项。
   *
   * 返回值只表达「允许提交」；真正的写入由 `IngredientCreationCommitService` 负责。
   */
  async assertCommitAllowed(draftId: string): Promise<void> {
    const draft = await this.draftService.get(draftId);
    const result = await this.evaluateDraft(draft);

    if (result.blocking.length > 0) {
      throw new BadRequestException({
        message: '终检存在阻断项，不能提交',
        blocking: result.blocking,
      });
    }
  }

  private async evaluateDraft(
    draft: IngredientCreationDraft,
  ): Promise<FinalCheckResult> {
    const plan = this.requireMergePlan(draft);
    const records = await this.loadSourceProfiles(plan);
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

  private requireMergePlan(draft: IngredientCreationDraft): MergePlan {
    const plan = draft.payload.mergePlan;
    if (!isMergePlan(plan)) {
      throw new BadRequestException('草稿还没有缝合方案，请先生成缝合方案');
    }
    return plan;
  }

  /** 读齐方案引用到的来源档案（主来源、行来源、冲突候选来源）。 */
  private async loadSourceProfiles(
    plan: MergePlan,
  ): Promise<Map<string, EvidenceLedgerSource>> {
    const ids = new Set<string>([plan.primarySourceRecordId]);
    for (const row of plan.rows) {
      if (row.sourceRecordId) {
        ids.add(row.sourceRecordId);
      }
    }
    for (const conflict of plan.conflicts) {
      for (const candidate of conflict.candidates) {
        if (candidate.sourceRecordId) {
          ids.add(candidate.sourceRecordId);
        }
      }
    }

    const rows = await this.prisma.nutritionSourceRecord.findMany({
      where: { id: { in: [...ids] } },
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
