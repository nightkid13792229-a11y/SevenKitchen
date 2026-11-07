/**
 * 采购明细的「数量 → 基准单位」换算该用谁的（2026-11-07 成本口径归位 · Task 6）。
 *
 * 结论：**跟采购商品走**。
 *
 * 为什么：实际买的是某个商品，一件 400g 和一件 500g 是两回事。
 * 原来一直按原料档案上的换算折 —— 原料只有一个换算，多个商品规格时必然错。
 * 食材的档案换算现在固定为 1 之后，这个错误会从「折算不准」放大成「2 袋记成 2 克」。
 *
 * 退回原料档案只发生在「这行没有选商品」时（历史数据、或还没补商品的原料）。
 */
export interface PurchaseLineRatioInput {
  /** 这一行选中的采购商品 id（可空） */
  procurementSkuId?: string | null;
  /** 该原料下挂着的采购商品 */
  skus?: Array<{
    id: string;
    purchaseToBaseRatio?: number | null;
  }> | null;
  /** 原料档案自己的换算（兜底） */
  ingredientRatio?: number | null;
}

export function resolvePurchaseLineRatio(
  input: PurchaseLineRatioInput,
): number | null {
  const match = input.procurementSkuId
    ? (input.skus ?? []).find((sku) => sku.id === input.procurementSkuId)
    : undefined;

  const skuRatio = toPositiveNumber(match?.purchaseToBaseRatio);
  if (skuRatio !== null) {
    return skuRatio;
  }

  return toPositiveNumber(input.ingredientRatio);
}

function toPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return num;
}
