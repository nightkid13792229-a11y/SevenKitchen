/**
 * 格式化数字，保留指定小数位
 * @param value 数值
 * @param decimals 小数位数，默认2
 * @returns 格式化后的字符串，无效值返回'-'
 */
export function formatDecimal(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return value.toFixed(decimals);
}

/**
 * 现场读重量：1kg 以上用 kg（两位小数），1kg 以下用整数 g。
 * 卡片/详情标题用这个；原料配比、打印单仍用 formatDecimal 保留克级精度。
 */
export function formatWeightG(value: number | null | undefined): string {
  const amount = Number(value);
  if (value === null || value === undefined || !Number.isFinite(amount)) return '-';
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(2)}kg`;
  return `${amount.toFixed(0)}g`;
}
