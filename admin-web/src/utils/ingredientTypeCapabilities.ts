export type IngredientTypeCapabilityKey = 'FOOD' | 'SUPPLEMENT' | 'PACKAGING'

export interface IngredientTypeCapabilities {
  supportsNutritionEditing: boolean
  supportsChildSkus: boolean
  usesSingleLayerProductFields: boolean
  supportsDiyToggle: boolean
  supportsProcurementToggle: boolean
  supportsDirectProcurementFields: boolean
  showTagSelector: boolean
  showProcurementStrategyEditor: boolean
  showSupplierField: boolean
  showSupplementDisplayUnitField: boolean
  showSupplementImageField: boolean
  showSupplementMarketingHighlightsField: boolean
  showSupplementCategoryField: boolean
}

export function getIngredientTypeCapabilities(type: IngredientTypeCapabilityKey): IngredientTypeCapabilities {
  switch (type) {
    case 'FOOD':
      return {
        supportsNutritionEditing: true,
        supportsChildSkus: true,
        usesSingleLayerProductFields: false,
        supportsDiyToggle: false,
        supportsProcurementToggle: false,
        supportsDirectProcurementFields: false,
        showTagSelector: true,
        showProcurementStrategyEditor: true,
        showSupplierField: false,
        showSupplementDisplayUnitField: false,
        showSupplementImageField: false,
        showSupplementMarketingHighlightsField: false,
        showSupplementCategoryField: false
      }
    case 'SUPPLEMENT':
      return {
        supportsNutritionEditing: true,
        supportsChildSkus: false,
        usesSingleLayerProductFields: true,
        supportsDiyToggle: true,
        supportsProcurementToggle: true,
        supportsDirectProcurementFields: true,
        showTagSelector: true,
        showProcurementStrategyEditor: false,
        showSupplierField: false,
        showSupplementDisplayUnitField: false,
        showSupplementImageField: true,
        showSupplementMarketingHighlightsField: false,
        showSupplementCategoryField: false
      }
    case 'PACKAGING':
      return {
        supportsNutritionEditing: false,
        supportsChildSkus: false,
        usesSingleLayerProductFields: true,
        supportsDiyToggle: false,
        supportsProcurementToggle: true,
        supportsDirectProcurementFields: true,
        showTagSelector: false,
        showProcurementStrategyEditor: false,
        showSupplierField: false,
        showSupplementDisplayUnitField: false,
        showSupplementImageField: false,
        showSupplementMarketingHighlightsField: false,
        showSupplementCategoryField: false
      }
  }
}

export function shouldLoadChildSkuData(type: IngredientTypeCapabilityKey, isEdit: boolean): boolean {
  return isEdit && getIngredientTypeCapabilities(type).supportsChildSkus
}

export function getDefaultProcurementStrategyForType(
  type: IngredientTypeCapabilityKey
): 'DAILY_PURCHASE' | 'STOCK_REPLENISHMENT' {
  return type === 'PACKAGING' ? 'STOCK_REPLENISHMENT' : 'DAILY_PURCHASE'
}

export function shouldShowPackagingStockPolicyFields(params: {
  type: IngredientTypeCapabilityKey
  procurementEnabled: boolean
  procurementStrategy: 'DAILY_PURCHASE' | 'STOCK_REPLENISHMENT' | 'HYBRID'
}): boolean {
  return params.type === 'PACKAGING' && params.procurementEnabled
}

export function shouldShowSupplementPurchaseLinkField(params: {
  type: IngredientTypeCapabilityKey
  diyEnabled: boolean
}): boolean {
  return params.type === 'SUPPLEMENT' && params.diyEnabled
}

export function shouldShowSupplementPurchaseFields(params: {
  type: IngredientTypeCapabilityKey
  procurementEnabled: boolean
}): boolean {
  return params.type === 'SUPPLEMENT' && params.procurementEnabled
}
