/**
 * 两个子板块（DIY 推荐商品 / 采购 SKU）提交前的纯校验。
 *
 * 与标准原料编辑页的子弹窗保持同一口径：名称必填；SKU 的换算倍数必须大于 0，
 * 采购价不能为负，补货点 ≥ 安全库存，目标库存 ≥ 补货点。
 * 返回第一条错误文案；通过时返回 null。
 */
import type {
  ProcurementSkuDraft,
  RecommendedProductDraft
} from '@/types/ingredientCreation'

export function validateChildDrafts(
  products: readonly RecommendedProductDraft[],
  skus: readonly ProcurementSkuDraft[]
): string | null {
  for (const [index, row] of products.entries()) {
    if (!row.name.trim()) {
      return `第 ${index + 1} 个 DIY 推荐商品缺 SKU 名称`
    }
  }

  for (const [index, row] of skus.entries()) {
    if (!row.name.trim()) {
      return `第 ${index + 1} 个采购 SKU 缺 SKU 名称`
    }
    if (
      row.purchaseToBaseRatio !== null &&
      (!Number.isFinite(row.purchaseToBaseRatio) ||
        row.purchaseToBaseRatio <= 0)
    ) {
      return `采购 SKU「${row.name}」的换算倍数必须大于 0`
    }
    if (
      row.currentPurchasePrice !== null &&
      (!Number.isFinite(row.currentPurchasePrice) ||
        row.currentPurchasePrice < 0)
    ) {
      return `采购 SKU「${row.name}」的采购价不能为负数`
    }
    if (
      row.safetyStock !== null &&
      row.reorderPoint !== null &&
      row.reorderPoint < row.safetyStock
    ) {
      return `采购 SKU「${row.name}」的补货点必须大于或等于安全库存`
    }
    if (
      row.reorderPoint !== null &&
      row.targetStock !== null &&
      row.targetStock < row.reorderPoint
    ) {
      return `采购 SKU「${row.name}」的目标库存必须大于或等于补货点`
    }
  }

  return null
}
