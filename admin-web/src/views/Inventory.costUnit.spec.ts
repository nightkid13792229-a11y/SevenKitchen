import { describe, expect, it } from 'vitest'
/**
 * 库存页 · 食材按「元/基准单位」显示成本（2026-11-07 · 2026-11-08 复核）
 *
 * 库存接口的 currentPricePerPurchaseUnit 是「每个采购单位」的价
 * （秋刀鱼 9.99/袋），必须 ÷ 换算比才是每克成本。
 * 具体换算与 6 位小数由 `formatInventoryCost` 负责，行为测试见
 * `src/utils/costFormat.spec.ts`。
 */
import inventorySource from './Inventory.vue?raw'

describe('库存页 · 成本单位', () => {
  it('成本列统一交给 formatInventoryCost（食材按克、非食材按采购单位）', () => {
    expect(inventorySource).toContain('formatInventoryCost')
    expect(inventorySource).toContain('{{ formatInventoryCost(row) }}')
  })

  it('不再提供手工改成本的入口（成本只能来自采购商品与报销）', () => {
    expect(inventorySource).not.toContain('改成本')
    expect(inventorySource).not.toContain('costPreviewText')
  })
})
