import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('checkout direct-buy storage contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/checkout/index.vue'),
    'utf-8',
  )

  it('reads direct_buy_order_config from storage for direct-buy navigation', () => {
    expect(source).toContain("uni.getStorageSync('direct_buy_order_config')")
    expect(source).toContain('storedSnapshotId')
  })

  it('uses stored direct-buy config only when it matches the URL snapshot', () => {
    expect(source).toContain('rawStoredConfig')
    expect(source).toContain('optionSnapshotId = readTextValue(options.snapshotId)')
    expect(source).toContain('storedSnapshotId = readTextValue(rawStoredConfig.snapshotId)')
    expect(source).toContain('shouldUseStoredConfig')
    expect(source).toContain('storedSnapshotId === optionSnapshotId')
    expect(source).toContain('storedConfig = shouldUseStoredConfig ? rawStoredConfig : {}')
    expect(source).toContain('pricingSnapshotId.value = optionSnapshotId || storedSnapshotId || null')
    expect(source).toContain('buildDirectBuyPrice(storedConfig, options)')
    expect(source).toContain('buildDirectBuyOrderConfig(storedConfig, options)')
    expect(source).not.toContain('buildDirectBuyPrice(rawStoredConfig, options)')
    expect(source).not.toContain('buildDirectBuyOrderConfig(rawStoredConfig, options)')
  })

  it('includes package plan and ingredient source plan label in order config', () => {
    expect(source).toContain('packagePlan')
    expect(source).toContain('ingredientSourcePlanLabel')
  })

  it('preserves preparation and cooking methods from stored config', () => {
    expect(source).toContain('preparationMethod')
    expect(source).toContain('cookingMethod')
  })

  it('can refresh an expired direct-buy pricing snapshot from stored order inputs', () => {
    expect(source).toContain('refreshDirectBuyPricingSnapshot')
    expect(source).toContain('isPricingSnapshotExpiredError')
    expect(source).toContain("url: '/orders/pricing/preview'")
    expect(source).toContain('dogId: orderConfig.value.dogId')
    expect(source).toContain('recipeId: orderConfig.value.recipeId')
    expect(source).toContain('ingredientSourcePlan: orderConfig.value.ingredientSourcePlan')
    expect(source).toContain('addressId: selectedAddress.value?.id')
    expect(source).toContain("uni.setStorageSync('direct_buy_order_config'")
    expect(source).toContain('价格已更新，请确认后重新提交')
  })

  it('keeps total amount and estimated feed days available on checkout', () => {
    expect(source).toContain('estimatedFeedDays')
    expect(source).toContain('totalAmount')
    expect(source).toContain('bottom-bar')
    expect(source).toContain('预计可喂')
  })

  it('matches the recipe order bottom bar layout for amount and package summary', () => {
    const templateSource = source.slice(0, source.indexOf('<script setup'))
    const bottomBarBlocks = [...source.matchAll(/\.bottom-bar\s*\{([\s\S]*?)\}/g)]
      .map((match) => match[1])
    const bottomPriceBlocks = [...source.matchAll(/\.bottom-price\s*\{([\s\S]*?)\}/g)]
      .map((match) => match[1])
    const submitButtonBlocks = [...source.matchAll(/\.btn-submit-order\s*\{([\s\S]*?)\}/g)]
      .map((match) => match[1])

    expect(templateSource).toContain('bottom-price')
    expect(templateSource).toContain('bottom-total')
    expect(templateSource).toContain('bottom-estimate')
    expect(templateSource).toContain('bottom-price-per-package')
    expect(templateSource).not.toContain('bottom-price-package-summary')
    expect(templateSource).toContain('btn-submit-order')
    expect(templateSource).toContain('提交订单')
    expect(templateSource).not.toContain('bottom-bar-amount-label')
    expect(templateSource).not.toContain('预计可喂{{ orderConfig.estimatedFeedDays }}天')

    expect(source).toContain('bottomPriceTitle')
    expect(source).toContain('bottomPricePerPackageText')
    expect(source).toContain('averagePricePerPackage')
    expect(source).toContain('¥${averagePricePerPackage.value.toFixed(2)}/袋')
    expect(source).not.toContain('bottomPricePackageSummaryText')
    expect(source).not.toContain('packagePlanSummaryText')
    expect(source).not.toContain('多规格共 ${orderConfig.value.totalPackages}袋')
    expect(source).not.toContain('bottomPriceSubtitle')
    expect(source).not.toContain('/袋 · ${packagePlanSummaryText.value}')

    expect(bottomBarBlocks.length).toBeGreaterThan(0)
    expect(bottomPriceBlocks.length).toBeGreaterThan(0)
    expect(submitButtonBlocks.length).toBeGreaterThan(0)

    bottomBarBlocks.forEach((block) => {
      expect(block).toContain('justify-content: space-between;')
    })

    bottomPriceBlocks.forEach((block) => {
      expect(block).toContain('margin-left: auto;')
      expect(block).toContain('margin-right: 0;')
      expect(block).toContain('flex: 0 1 auto;')
      expect(block).toContain('align-items: flex-end;')
      expect(block).toContain('text-align: right;')
      expect(block).not.toContain('flex: 1;')
    })

    submitButtonBlocks.forEach((block) => {
      expect(block).toContain('width: 240rpx;')
      expect(block).toContain('margin: 0;')
      expect(block).toContain('height: 80rpx;')
      expect(block).toContain('border-radius: 40rpx;')
    })
  })
})
