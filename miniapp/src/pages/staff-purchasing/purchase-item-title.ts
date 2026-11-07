function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 原料明细卡片的标题（2026-11-07 老板定）。
 *
 * 三类原料都显示原料名称：
 * - 食材：采购商品名（如「黑猪嫩里脊」）不再当原料名，只留在采购记录里；
 * - 补剂、包装材料：本身就是单层产品，原料名就是商品名，不存在另一层商品名。
 *
 * 老数据可能没有 ingredientName，逐级回退，最后才用采购商品名兜底，避免出现「未知原料」。
 */
export function resolvePurchaseItemTitle(item: any): string {
  const ingredientName =
    normalizeText(item?.ingredientName) || normalizeText(item?.ingredient?.name);

  return (
    ingredientName ||
    normalizeText(item?.resolvedProcurementSkuName) ||
    normalizeText(item?.resolvedSuggestedProductName) ||
    '未知原料'
  );
}
