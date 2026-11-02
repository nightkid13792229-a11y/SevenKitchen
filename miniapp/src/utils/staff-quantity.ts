/**
 * 员工端数量 / 单位格式化（2026-11-03）
 *
 * 背景：同一屏里曾同时出现 `561g`、`148 g`、`0g`、`1.924 份`、`100.00 g`，
 * 采购员需要在一行行数字里分辨哪种写法，容易看错。
 *
 * 统一规则：
 *   - 拉丁单位（g / kg / ml / L / oz…）与数字之间留一个空格：`148 g`、`7.5 ml`
 *   - 中文单位（片 / 粒 / 瓶 / 袋 / 份 / 盒 / 个…）与数字不空格：`2瓶`、`1份`
 *   - 小数位：g 取整；ml 最多 1 位；其余最多 2 位（可传 maxDecimals 覆盖）；
 *     末尾 0 去掉，避免 `13.70` 这种写法。
 *
 * 只做显示，不参与计算；计算仍用原始数值。
 */

const LATIN_UNITS = new Set([
  'g',
  'kg',
  'mg',
  'ml',
  'l',
  'oz',
  'lb',
  'cm',
  'mm',
  'm',
]);

export const isLatinMeasurementUnit = (unit?: string | null): boolean =>
  LATIN_UNITS.has(String(unit || '').trim().toLowerCase());

/** 去掉末尾 0：13.70 → 13.7，2.00 → 2 */
export function formatStaffDecimal(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const fixed = value.toFixed(Math.max(0, maxDecimals));
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

export interface FormatStaffQuantityOptions {
  /** 覆盖按单位推导的小数位 */
  maxDecimals?: number;
}

export function formatStaffQuantity(
  value: number,
  unit?: string | null,
  options: FormatStaffQuantityOptions = {},
): string {
  const numeric = Number(value);
  const normalizedUnit = String(unit || '').trim();
  const lowerUnit = normalizedUnit.toLowerCase();

  const defaultDecimals =
    lowerUnit === 'g' ? 0 : lowerUnit === 'ml' ? 1 : 2;
  const decimals = options.maxDecimals ?? defaultDecimals;

  const numberText = formatStaffDecimal(
    Number.isFinite(numeric) ? numeric : 0,
    decimals,
  );

  if (!normalizedUnit) {
    return numberText;
  }

  return isLatinMeasurementUnit(normalizedUnit)
    ? `${numberText} ${normalizedUnit}`
    : `${numberText}${normalizedUnit}`;
}
