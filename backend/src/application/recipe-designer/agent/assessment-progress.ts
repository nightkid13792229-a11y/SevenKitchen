/**
 * 评估进度签名：只把「还差什么」编码成短字符串。
 *
 * 目的不是判断营养是否合理，而是识别“改了几次，缺口还是那些、
 * 数值也几乎没动”的空转。配方改没改不看 revision —— 改了但缺口没变，
 * 对推进仍然是无进展。
 */
export function assessmentGapSignature(result: unknown): string | null {
  const data = (result as any)?.data;
  if (!data || data.ok === false) return null;
  if (data.isCompliant === true) return 'compliant';
  const gaps = Array.isArray(data.gaps) ? data.gaps : [];
  if (gaps.length === 0) return null;

  const parts = gaps
    .map((gap: any) => {
      const key = String(gap?.key ?? gap?.nutrientKey ?? '');
      const status = String(gap?.status ?? '');
      const value = round(gap?.value);
      const min = round(gap?.min);
      const max = round(gap?.max);
      return `${key}|${status}|${value}|${min}|${max}`;
    })
    .sort();
  return parts.join(';');
}

function round(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toFixed(2);
}
