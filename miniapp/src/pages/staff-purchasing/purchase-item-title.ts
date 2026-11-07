import { resolvePurchaseItemType } from './food-category-order';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 原料明细卡片的标题（2026-11-07 老板定）。
 *
 * 食材：显示原料名称（如「猪里脊」），不再拿采购商品名（如「黑猪嫩里脊」）当原料名。
 * 补剂 / 包装材料：仍是采购商品名，采购员要照着商品去买。
 *
 * 老数据可能没有 ingredientName，逐级回退，最后才用采购商品名兜底，避免出现「未知原料」。
 */
export function resolvePurchaseItemTitle(item: any): string {
  const ingredientName =
    normalizeText(item?.ingredientName) || normalizeText(item?.ingredient?.name);

  if (resolvePurchaseItemType(item) === 'FOOD' && ingredientName) {
    return ingredientName;
  }

  return (
    normalizeText(item?.resolvedProcurementSkuName) ||
    normalizeText(item?.resolvedSuggestedProductName) ||
    ingredientName ||
    '未知原料'
  );
}
