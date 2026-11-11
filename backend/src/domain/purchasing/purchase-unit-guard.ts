/**
 * 采购数量的单位门禁（2026-11-11）。
 *
 * ## 为什么需要
 *
 * 采购记录的基准数量 = `数量 × 商品换算倍数`。这个公式本身没错，但它**默认**
 * "这行写的数量就是商品的那个单位"。识别结果页以前给了一份自己的单位清单
 * （袋/盒/份/包/瓶/个/组/罐），员工把「3 份」写进去、匹配的却是「1 箱 = 5000 克」
 * 的商品时，系统会老老实实算成 3 × 5000 = 15000 克 —— 差 10 倍，且不报错。
 *
 * 所以乘之前必须先问一句：这行写的单位和商品的单位是不是同一个。
 * 认不出、对不上，一律拦住并说清楚怎么办，不许静默替换。
 */

export type PurchaseUnitMismatchReason =
  | 'UNIT_MISSING'
  | 'UNIT_NOT_MATCH';

export type PurchaseUnitCheck =
  | { ok: true }
  | { ok: false; reason: PurchaseUnitMismatchReason };

const normalize = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();

/**
 * 这行的数量单位能不能按商品的倍数折算。
 *
 * - 商品没有采购单位：放行（老数据；调用方会退回"只有倍数"的口径）；
 * - 这行没写单位：放行（调用方按商品单位理解）；
 * - 两边写法一致（忽略大小写/空格）：放行；
 * - 其余：拒绝。
 */
export function checkQuantityUnitMatches(input: {
  lineUnit: string | null | undefined;
  skuPurchaseUnit: string | null | undefined;
}): PurchaseUnitCheck {
  const lineUnit = normalize(input.lineUnit);
  const skuUnit = normalize(input.skuPurchaseUnit);

  if (!skuUnit || !lineUnit) return { ok: true };
  if (lineUnit === skuUnit) return { ok: true };
  return { ok: false, reason: 'UNIT_NOT_MATCH' };
}

/** 给员工看的说明：说清"这行写的是什么、商品是按什么买的、可以怎么办" */
export function describeQuantityUnitMismatch(input: {
  lineName: string;
  lineUnit: string;
  skuPurchaseUnit: string;
}): string {
  return (
    `「${input.lineName}」这行写的是「${input.lineUnit}」，` +
    `商品是按「${input.skuPurchaseUnit}」买的：` +
    `请把单位改成「${input.skuPurchaseUnit}」，或换一个按「${input.lineUnit}」卖的商品`
  );
}
