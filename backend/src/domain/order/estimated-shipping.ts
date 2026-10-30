/**
 * 预计发货日（2026-10-30）。
 *
 * 口径沿用订单详情页一直以来的做法：制作日 + 1 天。
 * 抽成纯函数，是为了让"我的订单"卡片和详情页用同一条规则 ——
 * 以前这段逻辑内联在详情接口里，列表要显示就得再抄一遍，
 * 两处一旦改一处就会对不上。
 *
 * 返回 ISO 字符串；没有排产日期或日期不可解析时返回 null，
 * 调用方负责显示"等待排期"，不要把异常日期丢给顾客。
 */
export function computeEstimatedShippingDate(
  targetProductionDate: Date | null | undefined,
): string | null {
  if (!targetProductionDate) return null;

  const shippingDate = new Date(targetProductionDate);
  if (Number.isNaN(shippingDate.getTime())) return null;

  shippingDate.setDate(shippingDate.getDate() + 1);
  return shippingDate.toISOString();
}
