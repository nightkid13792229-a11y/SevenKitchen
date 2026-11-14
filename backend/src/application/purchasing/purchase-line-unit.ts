/**
 * 订单行的数量单位：占位单位跟随采购商品（2026-11-14）。
 *
 * ## 为什么
 *
 * 截图只写「紫甘蓝 700g」时，700g 是**规格**，按份还是按盒卖只有商品档案知道。
 * 老提示词让模型认不出就写「件」占位，行上就永久留一个「1件」；一旦挂上
 * 「按份卖」的商品，单位门禁必然报「单位对不上」，员工得逐行手改。
 *
 * 所以：占位单位（空 / 「件」）不参与记账，挂上商品时直接采用商品的采购单位。
 * 只跟「单件包装」（份/盒/袋/瓶…）：商品的单位是「箱/提/桶/组/件」时不动 ——
 * 截图里的「2件」不等于「2箱」，那正是门禁要拦的情况。
 */

import {
  isMultipackUnit,
  type PurchaseUnitOption,
} from './purchase-unit-catalog';

/**
 * 这行的单位是不是「还没定」？
 *
 * 空值、以及历史数据里的「件」都算占位：模型以前认不出包装时统一写「件」。
 */
export function isPlaceholderLineUnit(
  unit: string | null | undefined,
): boolean {
  const text = String(unit ?? '').trim();
  return text.length === 0 || text === '件';
}

/**
 * 占位单位跟随商品的采购单位；其余一律原样返回（绝不猜、绝不换算）。
 *
 * 返回 null = 这行仍没有单位（商品也没填单位，或商品按整件卖、需要员工自己确认）。
 */
export function resolveLineUnitFromSku(input: {
  lineUnit: string | null | undefined;
  skuPurchaseUnit: string | null | undefined;
  unitOptions: PurchaseUnitOption[];
}): string | null {
  const lineUnit = String(input.lineUnit ?? '').trim();
  const skuUnit = String(input.skuPurchaseUnit ?? '').trim();
  if (!skuUnit) return lineUnit || null;
  if (!isPlaceholderLineUnit(lineUnit)) return lineUnit;
  // 整件单位不跟：截图「2件」挂到「1箱=30件」的商品上，自动变成 2 箱就错了。
  if (isMultipackUnit(input.unitOptions, skuUnit)) return lineUnit || null;
  return skuUnit;
}
