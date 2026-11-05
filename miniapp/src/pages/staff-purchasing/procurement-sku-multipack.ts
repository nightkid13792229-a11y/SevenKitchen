/**
 * 多件装（箱/桶/提/件）的开关规则（2026-11-05）。
 *
 * 背景：AI 认出单位是"箱"，但没读出"一箱几件"时，如果把
 * "一箱里装了好几件"的开关留在关闭状态，页面会按 1 件算，
 * 库存和成本会静默差 N 倍（N = 真实箱规）。
 *
 * 规则：
 * 1. 读到了 >1 的件数：不管什么单位都保留这个乘法（原行为）；
 * 2. 箱/桶/提/件没读到件数（或读到 0/负数/非数字）：必须打开开关，
 *    让"一箱有几件"露出来、标红、挡住保存；
 * 3. 单件单位（袋/包/瓶/盒…）没读到件数：保持关闭，按 1 件算。
 */

export const MULTIPACK_UNITS = ['箱', '桶', '提', '件'];

export function shouldOpenMultipack(input: {
  purchaseUnit: string;
  packCountText: string;
  packCountMissing: boolean;
}): boolean {
  const { purchaseUnit, packCountText, packCountMissing } = input;
  const count = Number(packCountText);

  // 读到了多件：保留乘法，否则这 24 件会被悄悄丢掉
  if (Number.isFinite(count) && count > 1) {
    return true;
  }

  if (!MULTIPACK_UNITS.includes(purchaseUnit)) {
    return false;
  }

  // 箱/桶/提/件没读到件数：必须打开，不能按 1 件放过去
  if (packCountMissing || !String(packCountText || '').trim()) {
    return true;
  }

  // 读到了 0/负数/非数字：同样不能当成 1 件
  return !Number.isFinite(count) || count <= 0;
}
