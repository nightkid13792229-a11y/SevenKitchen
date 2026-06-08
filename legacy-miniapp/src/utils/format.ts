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
