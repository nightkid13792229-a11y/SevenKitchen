import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getDefaultProcurementStrategyForType,
  getIngredientTypeCapabilities,
  shouldLoadChildSkuData,
  shouldShowPackagingStockPolicyFields,
  shouldShowSupplementPurchaseFields,
  shouldShowSupplementPurchaseLinkField,
} from '../src/utils/ingredientTypeCapabilities.ts'

// Task 2 UI expectation checklist:
// FOOD: keep DIY 推荐商品 + 采购 SKU sections and allow nutrition editing
// SUPPLEMENT: hide child SKU sections, show diyEnabled/procurementEnabled toggles and single-layer product fields
// PACKAGING: hide nutrition entry and DIY controls, show procurementEnabled only with single-layer procurement fields

test('FOOD keeps child SKU model and nutrition editing', () => {
  const caps = getIngredientTypeCapabilities('FOOD')

  assert.equal(caps.supportsNutritionEditing, true)
  assert.equal(caps.supportsChildSkus, true)
  assert.equal(caps.usesSingleLayerProductFields, false)
  assert.equal(caps.supportsDiyToggle, false)
  assert.equal(caps.supportsProcurementToggle, false)
  assert.equal(caps.supportsDirectProcurementFields, false)
  assert.equal(shouldLoadChildSkuData('FOOD', true), true)
})

test('SUPPLEMENT uses single-layer product editing and no child SKUs', () => {
  const caps = getIngredientTypeCapabilities('SUPPLEMENT')

  assert.equal(caps.supportsNutritionEditing, true)
  assert.equal(caps.supportsChildSkus, false)
  assert.equal(caps.usesSingleLayerProductFields, true)
  assert.equal(caps.supportsDiyToggle, true)
  assert.equal(caps.supportsProcurementToggle, true)
  assert.equal(caps.supportsDirectProcurementFields, true)
  assert.equal(shouldLoadChildSkuData('SUPPLEMENT', true), false)
})

test('PACKAGING uses single-layer procurement editing without nutrition or DIY', () => {
  const caps = getIngredientTypeCapabilities('PACKAGING')

  assert.equal(caps.supportsNutritionEditing, false)
  assert.equal(caps.supportsChildSkus, false)
  assert.equal(caps.usesSingleLayerProductFields, true)
  assert.equal(caps.supportsDiyToggle, false)
  assert.equal(caps.supportsProcurementToggle, true)
  assert.equal(caps.supportsDirectProcurementFields, true)
  assert.equal(caps.showTagSelector, false)
  assert.equal(caps.showProcurementStrategyEditor, false)
  assert.equal(caps.showSupplierField, false)
  assert.equal(shouldLoadChildSkuData('PACKAGING', true), false)
})

test('FOOD keeps tag selector and procurement strategy editor visible', () => {
  const caps = getIngredientTypeCapabilities('FOOD')

  assert.equal(caps.showTagSelector, true)
  assert.equal(caps.showProcurementStrategyEditor, true)
  assert.equal(caps.showSupplierField, false)
})

test('SUPPLEMENT hides weakly-used fields from the main form', () => {
  const caps = getIngredientTypeCapabilities('SUPPLEMENT')

  assert.equal(caps.showTagSelector, true)
  assert.equal(caps.showProcurementStrategyEditor, false)
  assert.equal(caps.showSupplierField, false)
  assert.equal(caps.showSupplementDisplayUnitField, false)
  assert.equal(caps.showSupplementImageField, true)
  assert.equal(caps.showSupplementMarketingHighlightsField, false)
  assert.equal(caps.showSupplementCategoryField, false)
})

test('packaging defaults to stock replenishment strategy', () => {
  assert.equal(getDefaultProcurementStrategyForType('PACKAGING'), 'STOCK_REPLENISHMENT')
  assert.equal(getDefaultProcurementStrategyForType('FOOD'), 'DAILY_PURCHASE')
  assert.equal(getDefaultProcurementStrategyForType('SUPPLEMENT'), 'DAILY_PURCHASE')
})

test('packaging stock policy fields require procurement', () => {
  assert.equal(
    shouldShowPackagingStockPolicyFields({
      type: 'PACKAGING',
      procurementEnabled: true,
      procurementStrategy: 'STOCK_REPLENISHMENT',
    }),
    true
  )
  assert.equal(
    shouldShowPackagingStockPolicyFields({
      type: 'PACKAGING',
      procurementEnabled: true,
      procurementStrategy: 'HYBRID',
    }),
    true
  )
  assert.equal(
    shouldShowPackagingStockPolicyFields({
      type: 'PACKAGING',
      procurementEnabled: true,
      procurementStrategy: 'DAILY_PURCHASE',
    }),
    true
  )
  assert.equal(
    shouldShowPackagingStockPolicyFields({
      type: 'PACKAGING',
      procurementEnabled: false,
      procurementStrategy: 'STOCK_REPLENISHMENT',
    }),
    false
  )
  assert.equal(
    shouldShowPackagingStockPolicyFields({
      type: 'FOOD',
      procurementEnabled: true,
      procurementStrategy: 'STOCK_REPLENISHMENT',
    }),
    false
  )
})

test('supplement purchase link only shows when diy is enabled', () => {
  assert.equal(shouldShowSupplementPurchaseLinkField({ type: 'SUPPLEMENT', diyEnabled: true }), true)
  assert.equal(shouldShowSupplementPurchaseLinkField({ type: 'SUPPLEMENT', diyEnabled: false }), false)
  assert.equal(shouldShowSupplementPurchaseLinkField({ type: 'FOOD', diyEnabled: true }), false)
})

test('supplement procurement fields only show when procurement is enabled', () => {
  assert.equal(shouldShowSupplementPurchaseFields({ type: 'SUPPLEMENT', procurementEnabled: true }), true)
  assert.equal(shouldShowSupplementPurchaseFields({ type: 'SUPPLEMENT', procurementEnabled: false }), false)
  assert.equal(shouldShowSupplementPurchaseFields({ type: 'PACKAGING', procurementEnabled: true }), false)
})
