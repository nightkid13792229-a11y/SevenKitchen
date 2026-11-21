/**
 * 营养素单位换算（2026-11-21）。
 *
 * 方案的数值约束只写“数值 + 表达基准”（%DM / 每1000kcal / 每MJ），
 * 但每个营养素自身的计量单位不同：蛋白/脂肪/钙磷常用 g，锌铜碘常用 mg，
 * 维生素 A/D 常用 IU。评估目标自带单位，必须在落成 override 时换算，
 * 不能统一按 g 解释，否则 15 mg 会被当成 15 g（差 1000 倍）。
 *
 * 这里只做质量单位换算；IU 与质量单位之间没有通用换算系数，只能同单位。
 * 换算失败返回 null，由调用方给出可执行的错误，不能静默按原值使用。
 */

const MASS_UNITS = new Set(['g', 'mg', 'ug']);

const MASS_FACTOR: Record<string, number> = {
  g: 1,
  mg: 1 / 1000,
  ug: 1 / 1_000_000,
};

/** 统一写法：μg / mcg → ug；其余小写去空格。 */
export function normalizeNutrientUnit(unit: string | null | undefined): string {
  const normalized = String(unit ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'μg' || normalized === 'mcg') return 'ug';
  return normalized;
}

/** 两个单位是否可换算（同单位，或同为质量单位）。 */
export function canConvertNutrientUnit(
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined,
): boolean {
  const from = normalizeNutrientUnit(fromUnit);
  const to = normalizeNutrientUnit(toUnit);
  if (!from || !to) return false;
  if (from === to) return true;
  return MASS_UNITS.has(from) && MASS_UNITS.has(to);
}

/**
 * 把 `value` 从 `fromUnit` 换到 `toUnit`。
 *
 * 不可换算时返回 null（调用方要报错），不要像旧的 `convertUnitValue`
 * 那样 `?? value` —— 那会把不兼容单位当成同单位，静默算错。
 */
export function convertNutrientValue(
  value: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined,
): number | null {
  if (!Number.isFinite(value)) return null;
  const from = normalizeNutrientUnit(fromUnit);
  const to = normalizeNutrientUnit(toUnit);
  if (!from || !to) return null;
  if (from === to) return value;

  const fromFactor = MASS_FACTOR[from];
  const toFactor = MASS_FACTOR[to];
  if (fromFactor === undefined || toFactor === undefined) return null;

  return (value * fromFactor) / toFactor;
}
