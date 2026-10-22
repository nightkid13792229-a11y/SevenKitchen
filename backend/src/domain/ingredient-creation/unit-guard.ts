import type {
  CheckItem,
  NutritionEvidenceEntry,
} from '../../application/ingredient-creation/ingredient-creation.types';
import type { NutritionFieldDefinition } from '../ingredient/nutrition-field-catalog';

/**
 * 单位闸门：只做两件事 —— 单位归一 / 合法性，以及换算能不能反算回去。
 *
 * 这里是「数据不可以出错」的最后一道关，所以规则全部是确定性的：
 * 不猜单位、不把不认识的东西当成目录单位、换算不闭合一律拦死。
 */

/** 目录里的微克用的是希腊字母 μ（U+03BC），归一结果用微符号 µ（U+00B5）。 */
const MICROGRAM = '\u00b5g';

/** 质量单位到克的换算系数；不在这张表里的都不是质量单位。 */
const MASS_UNIT_GRAMS: Readonly<Record<string, number>> = {
  g: 1,
  mg: 1e-3,
  [MICROGRAM]: 1e-6,
};

/** 换算反算的相对误差上限：超过它就算「换算不闭合」。 */
const CONVERSION_RELATIVE_TOLERANCE = 1e-6;

/**
 * 把来源 / 表单里的单位写法归一成目录单位。
 *
 * 只认下面这些写法（大小写不敏感、忽略首尾空白、先做 NFKC 归一化）：
 * - `μg` / `µg` / `mcg` / `MCG` → `µg`
 * - `g` / `G` / `gram` / `grams` → `g`
 * - `mg` / `MG` → `mg`
 * - `kcal` / `KCAL` / `千卡` → `kcal`
 * - `IU` / `iu` → `IU`
 *
 * 复合单位（`mg/kg`、`g/100g`）与其它任何写法一律返回 `null`；
 * **不猜、不截断、不当成目录单位**。
 */
export function normalizeUnit(raw: string): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const value = raw
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    // NFKC 会把微符号（U+00B5）变成希腊字母 μ（U+03BC），这里统一回微符号。
    .replace(/[μ\u00b5]/g, MICROGRAM.charAt(0));

  switch (value) {
    case MICROGRAM:
    case 'mcg':
      return MICROGRAM;
    case 'g':
    case 'gram':
    case 'grams':
      return 'g';
    case 'mg':
      return 'mg';
    case 'kcal':
    case '千卡':
      return 'kcal';
    case 'iu':
      return 'IU';
    default:
      return null;
  }
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMassUnit(unit: string): boolean {
  return Object.prototype.hasOwnProperty.call(MASS_UNIT_GRAMS, unit);
}

/** 相对误差：以两者中较大的绝对值为基准；两边都是 0 时视为完全相等。 */
function relativeDifference(left: number, right: number): number {
  if (left === right) return 0;
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return scale === 0 ? 0 : Math.abs(left - right) / scale;
}

function conversionNotReversible(
  entry: NutritionEvidenceEntry,
  detail: string,
): CheckItem {
  return {
    code: 'CONVERSION_NOT_REVERSIBLE',
    message: `字段 ${entry.fieldPath} 的换算无法反算：${detail}`,
    fieldPath: entry.fieldPath,
  };
}

/**
 * 换算闭合：只有 `CONVERTED` 行需要检查。
 *
 * - 源单位与目标单位都是质量单位（g / mg / µg）：按质量换算反算回 `sourceValue`，
 *   相对误差 > 1e-6 → `CONVERSION_NOT_REVERSIBLE`。
 * - 非质量换算（如 IU → µg）：无法用固定系数反算，必须记录非空 `formula`，
 *   否则同样是 `CONVERSION_NOT_REVERSIBLE`。
 *
 * 缺少原始值或最终值、源单位认不出（例如 `mg/kg`）都属于「算不回去」，一律拦死。
 */
function checkConversionClosure(
  entry: NutritionEvidenceEntry,
  targetUnit: string,
): CheckItem | null {
  if (entry.status !== 'CONVERTED') {
    return null;
  }

  const sourceUnit = entry.sourceUnit ? normalizeUnit(entry.sourceUnit) : null;

  if (sourceUnit && isMassUnit(sourceUnit) && isMassUnit(targetUnit)) {
    if (
      !isFiniteNumber(entry.sourceValue) ||
      !isFiniteNumber(entry.finalValue)
    ) {
      return conversionNotReversible(
        entry,
        '标记为已换算，但缺少原始值或最终值。',
      );
    }

    const expected =
      entry.sourceValue *
      (MASS_UNIT_GRAMS[sourceUnit] / MASS_UNIT_GRAMS[targetUnit]);

    if (
      relativeDifference(expected, entry.finalValue) >
      CONVERSION_RELATIVE_TOLERANCE
    ) {
      return conversionNotReversible(
        entry,
        `${entry.sourceValue} ${entry.sourceUnit} 按质量换算应为 ${expected} ${entry.unit}，实际是 ${entry.finalValue} ${entry.unit}。`,
      );
    }

    return null;
  }

  if (!entry.formula || entry.formula.trim() === '') {
    return conversionNotReversible(
      entry,
      `从 ${entry.sourceUnit ?? '（空）'} 到 ${entry.unit} 不是质量换算，必须记录换算公式。`,
    );
  }

  return null;
}

function checkEntryUnit(
  entry: NutritionEvidenceEntry,
  field: NutritionFieldDefinition | undefined,
): CheckItem | null {
  if (!field) {
    return {
      code: 'UNIT_NOT_ALLOWED',
      message: `字段 ${entry.fieldPath} 不在营养字段目录里，无法确认允许单位。`,
      fieldPath: entry.fieldPath,
    };
  }

  const normalizedUnit = normalizeUnit(entry.unit);
  if (!normalizedUnit) {
    return {
      code: 'UNIT_NOT_ALLOWED',
      message: `字段 ${entry.fieldPath} 的单位「${entry.unit}」不在允许集合里，只接受 ${field.unit}。`,
      fieldPath: entry.fieldPath,
    };
  }

  // 目录单位也要归一：目录里写的是希腊字母 μ，而归一结果是微符号 µ。
  const catalogUnit = normalizeUnit(field.unit) ?? field.unit.trim();
  if (normalizedUnit !== catalogUnit) {
    return {
      code: 'UNIT_MISMATCH',
      message: `字段 ${entry.fieldPath} 的单位「${entry.unit}」与目录单位 ${field.unit} 不一致。`,
      fieldPath: entry.fieldPath,
    };
  }

  return checkConversionClosure(entry, normalizedUnit);
}

/**
 * 校验一组证据账本的单位与换算。
 *
 * 返回**拦死项**（`CheckItem[]`）；一条证据最多产生一项，避免同一个根因刷屏：
 * 单位不合法 / 与目录不一致时先报单位问题，不再对那一行做换算闭合检查。
 *
 * 输出按营养字段目录顺序排列（同字段多条时保持传入顺序），
 * 目录之外的字段排在最后 —— 结果稳定，可直接断言。
 */
export function checkEntryUnits(
  entries: readonly NutritionEvidenceEntry[],
  catalog: readonly NutritionFieldDefinition[],
): CheckItem[] {
  const fieldIndex = new Map<string, number>();
  const fieldByPath = new Map<string, NutritionFieldDefinition>();

  catalog.forEach((field, index) => {
    fieldIndex.set(field.fieldPath as string, index);
    fieldByPath.set(field.fieldPath as string, field);
  });

  const ordered: Array<{
    item: CheckItem;
    catalogIndex: number;
    sequence: number;
  }> = [];

  entries.forEach((entry, sequence) => {
    const item = checkEntryUnit(entry, fieldByPath.get(entry.fieldPath));
    if (item) {
      ordered.push({
        item,
        catalogIndex:
          fieldIndex.get(entry.fieldPath) ?? Number.MAX_SAFE_INTEGER,
        sequence,
      });
    }
  });

  return ordered
    .sort(
      (left, right) =>
        left.catalogIndex - right.catalogIndex ||
        left.sequence - right.sequence,
    )
    .map((entry) => entry.item);
}
