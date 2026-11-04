/**
 * 旧草稿迁移：改动前采购信息挂在原料级，现在搬到「生产/采购SKU」。
 *
 * 纯函数只负责判断「有没有旧值、该生成哪条 SKU 草稿」；落库与标记由页面做。
 */
import type {
  IngredientDraft,
  ProcurementSkuDraft
} from '@/types/ingredientCreation'

export function buildLegacyProcurementSkuDraft(
  ingredient: IngredientDraft | null | undefined,
  key: string
): ProcurementSkuDraft | null {
  if (!ingredient) {
    return null
  }

  const hasLegacy =
    Boolean(ingredient.brand?.trim()) ||
    Boolean(ingredient.productModel?.trim()) ||
    Boolean(ingredient.purchaseChannel?.trim()) ||
    Boolean(ingredient.purchaseUnit?.trim()) ||
    typeof ingredient.purchaseToBaseRatio === 'number' ||
    typeof ingredient.currentPricePerPurchaseUnit === 'number' ||
    typeof ingredient.safetyStock === 'number' ||
    typeof ingredient.reorderPoint === 'number' ||
    typeof ingredient.targetStock === 'number'

  if (!hasLegacy) {
    return null
  }

  return {
    key,
    name: ingredient.name?.trim() || '旧版采购信息',
    brand: ingredient.brand ?? '',
    productModel: ingredient.productModel ?? '',
    purchaseChannel: ingredient.purchaseChannel ?? '',
    purchaseUnit: ingredient.purchaseUnit ?? '',
    purchaseToBaseRatio:
      typeof ingredient.purchaseToBaseRatio === 'number'
        ? ingredient.purchaseToBaseRatio
        : null,
    currentPurchasePrice:
      typeof ingredient.currentPricePerPurchaseUnit === 'number'
        ? ingredient.currentPricePerPurchaseUnit
        : null,
    openingStock: null,
    safetyStock:
      typeof ingredient.safetyStock === 'number' ? ingredient.safetyStock : null,
    reorderPoint:
      typeof ingredient.reorderPoint === 'number'
        ? ingredient.reorderPoint
        : null,
    targetStock:
      typeof ingredient.targetStock === 'number' ? ingredient.targetStock : null,
    notes: '从旧版原料级采购信息自动迁移',
    isActive: true
  }
}
