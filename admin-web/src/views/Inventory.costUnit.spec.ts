import { describe, expect, it } from 'vitest'
/**
 * 库存页 · 食材按「元/基准单位」改成本（2026-11-07 成本口径归位 · Task 13）
 *
 * 折算后所有食材的成本都是「元/克、6 位小数」。
 * 在这一格填 39.9（本来想填「一袋 39.9 元」）就是 39.9 元一克 —— 差 500 倍。
 */
import inventorySource from './Inventory.vue?raw'

describe('库存页 · 成本单位', () => {
  it('食材的单价显示按基准单位（元/g），不再跟着采购单位', () => {
    expect(inventorySource).toContain('formatCostUnit')
    expect(inventorySource).toMatch(/isFoodRow[\s\S]{0,160}baseUnit/)
  })

  it('食材成本保留 6 位小数，不把 0.04995 显示成 0.05', () => {
    expect(inventorySource).toContain('formatUnitCost')
    expect(inventorySource).toMatch(
      /formatUnitCost\(row\.currentPricePerPurchaseUnit,\s*isFoodRow\(row\)\s*\?\s*6\s*:\s*2\)/,
    )
  })

  it('不再提供手工改成本的入口（成本只能来自采购商品与报销）', () => {
    expect(inventorySource).not.toContain('改成本')
    expect(inventorySource).not.toContain('costPreviewText')
  })
})
