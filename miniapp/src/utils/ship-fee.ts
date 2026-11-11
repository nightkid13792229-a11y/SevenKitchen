/**
 * 实际运费的校验（2026-11-11）。
 *
 * 鲜食单、补剂单、合并/拆包页三处都要填「实际运费」，
 * 规则必须一模一样：必填、最多两位小数、不能为负。
 * 以前三处各写一份正则，合并发货页漏了「必填」的提示口径。
 */

/** 校验通过一定带数值，不通过一定带原因 —— 调用方不用再判 undefined */
export type ShipFeeParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

const FEE_PATTERN = /^\d+(\.\d{1,2})?$/;

export function parseShipFee(input: string | number | null | undefined): ShipFeeParseResult {
  const text = String(input ?? '').trim();
  if (!text) {
    return { ok: false, error: '请填写实际运费' };
  }
  if (!FEE_PATTERN.test(text)) {
    return { ok: false, error: '运费最多两位小数，例如 12.50' };
  }
  return { ok: true, value: Number(text) };
}
