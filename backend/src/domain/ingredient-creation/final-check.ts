import type {
  CheckItem,
  FinalCheckResult,
  NutritionEvidenceEntry,
} from '../../application/ingredient-creation/ingredient-creation.types';
import { NUTRITION_FIELD_CATALOG } from '../ingredient/nutrition-field-catalog';
import type { PreparationState } from './preparation-state';
import { checkEntryUnits } from './unit-guard';

/**
 * 终检：只做汇总与分级，不改数据。
 *
 * 三档的含义（设计文档第五节 ④）：
 * - `blocking` 拦死：没有绕过按钮，只能回去改数据；
 * - `exceptionable` 可例外：必须写理由、记录人，事后可查；
 * - `warnings` 提醒：可以忽略，但忽略也留痕。
 */

export type ProfileBasis = 'PER_100_G' | 'PER_100_ML' | 'PER_SERVING';
export type SourceBasis = 'PER_100_G' | 'PER_SERVING';

export interface FinalCheckBasis {
  profileBasis: ProfileBasis;
  sourceBasis: SourceBasis;
  /** 「每份」换算成「每 100g」所需的份量克数；不知道时必须是 null。 */
  servingGrams: number | null;
}

export interface FinalCheckCoverage {
  required: PreparationState[];
  present: PreparationState[];
}

export interface FinalCheckInput {
  entries: readonly NutritionEvidenceEntry[];
  basis: FinalCheckBasis;
  macroSumG: number;
  energyKcal: number | null;
  energyFromMacrosKcal: number | null;
  coverage: FinalCheckCoverage;
  magnitudeOutlierFields?: readonly string[];
}

/**
 * 宏量之和的上限。USDA 等来源的四个宏量是分别测定、分别四舍五入的，
 * 误差不抵消，正常数据加起来也会略超 100（实测 101.07~101.23）。
 * 所以留 3% 容差：超过 103 才算异常。
 */
const MACRO_SUM_LIMIT_G = 103;
const ENERGY_DEVIATION_THRESHOLD = 0.1;

function isUsableServingGrams(value: number | null): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * 来源按每份给、档案按每 100g 要，却没有份量克数 —— 不得硬算，拦死。
 *
 * 份量克数为 null、0、负数或非有限数都视为「不知道」，因为都算不出每 100g。
 */
function hasBasisConversionGap(basis: FinalCheckBasis): boolean {
  return (
    basis.sourceBasis === 'PER_SERVING' &&
    basis.profileBasis === 'PER_100_G' &&
    !isUsableServingGrams(basis.servingGrams)
  );
}

function missingRequiredStateItems(coverage: FinalCheckCoverage): CheckItem[] {
  const present = new Set<PreparationState>(coverage.present);
  const seen = new Set<PreparationState>();
  const items: CheckItem[] = [];

  for (const state of coverage.required) {
    if (seen.has(state)) continue;
    seen.add(state);

    if (!present.has(state)) {
      items.push({
        code: 'REQUIRED_STATE_MISSING',
        message: `缺少必需的${state === 'RAW' ? '生' : '熟'}档案（${state}），需要补数据或登记例外。`,
      });
    }
  }

  return items;
}

/**
 * 能量 4/9/4 反算偏差 > 10% 只提醒，不拦。
 *
 * 声明能量为 null / 0 / 非有限数时不报：没有可用的比较基准，
 * 不能因此判断来源有问题；反算值缺失时同样不报。
 */
function energyDeviationWarning(
  energyKcal: number | null,
  energyFromMacrosKcal: number | null,
): CheckItem | null {
  if (energyKcal === null || energyFromMacrosKcal === null) {
    return null;
  }
  if (!Number.isFinite(energyKcal) || !Number.isFinite(energyFromMacrosKcal)) {
    return null;
  }
  if (energyKcal === 0) {
    return null;
  }

  const deviation = Math.abs(energyKcal - energyFromMacrosKcal) / energyKcal;
  if (deviation <= ENERGY_DEVIATION_THRESHOLD) {
    return null;
  }

  return {
    code: 'ENERGY_CROSS_CHECK_DEVIATION',
    message: `能量 ${energyKcal} kcal 与按 4/9/4 反算的 ${energyFromMacrosKcal} kcal 偏差 ${(deviation * 100).toFixed(1)}%，超过 10%。`,
  };
}

/**
 * 量级异常：每个字段一条提醒，按营养字段目录排序；重复字段只报一次，
 * 目录之外的字段排在最后（保持传入顺序）。
 */
function magnitudeOutlierWarnings(
  fields: readonly string[] | undefined,
): CheckItem[] {
  if (!fields) {
    return [];
  }

  const fieldIndex = new Map<string, number>(
    NUTRITION_FIELD_CATALOG.map((field, index) => [
      field.fieldPath as string,
      index,
    ]),
  );
  const seen = new Set<string>();
  const ordered: Array<{
    fieldPath: string;
    catalogIndex: number;
    sequence: number;
  }> = [];

  fields.forEach((raw, sequence) => {
    const fieldPath = raw.trim();
    if (!fieldPath || seen.has(fieldPath)) {
      return;
    }

    seen.add(fieldPath);
    ordered.push({
      fieldPath,
      catalogIndex: fieldIndex.get(fieldPath) ?? Number.MAX_SAFE_INTEGER,
      sequence,
    });
  });

  ordered.sort(
    (left, right) =>
      left.catalogIndex - right.catalogIndex || left.sequence - right.sequence,
  );

  return ordered.map(({ fieldPath }) => ({
    code: 'MAGNITUDE_OUTLIER',
    message: `字段 ${fieldPath} 的数值与同库同类词条量级差异过大，请核对。`,
    fieldPath,
  }));
}

/**
 * 跑一遍终检，按拦死 / 可例外 / 提醒三档返回。
 *
 * 每个桶内部的顺序是固定的：
 * - 拦死：单位与换算项（按字段目录顺序），最后是口径不可换算；
 * - 可例外：宏量和超限，然后按 `required` 顺序列出缺失状态；
 * - 提醒：能量反算偏差，然后按字段目录顺序列出量级异常。
 */
export function runFinalCheck(input: FinalCheckInput): FinalCheckResult {
  const blocking = checkEntryUnits(input.entries, NUTRITION_FIELD_CATALOG);
  const exceptionable: CheckItem[] = [];
  const warnings: CheckItem[] = [];

  if (hasBasisConversionGap(input.basis)) {
    blocking.push({
      code: 'BASIS_NOT_CONVERTIBLE',
      message:
        '来源按每份给出，档案口径是每 100g，但没有可用的份量克数，无法换算。',
    });
  }

  if (input.macroSumG > MACRO_SUM_LIMIT_G) {
    exceptionable.push({
      code: 'MACRO_SUM_OVER_100',
      message: `宏量之和为 ${input.macroSumG}g/100g，超过容差上限 103g/100g，需要登记例外。`,
    });
  }

  exceptionable.push(...missingRequiredStateItems(input.coverage));

  const energyWarning = energyDeviationWarning(
    input.energyKcal,
    input.energyFromMacrosKcal,
  );
  if (energyWarning) {
    warnings.push(energyWarning);
  }

  warnings.push(...magnitudeOutlierWarnings(input.magnitudeOutlierFields));

  return { blocking, exceptionable, warnings };
}
