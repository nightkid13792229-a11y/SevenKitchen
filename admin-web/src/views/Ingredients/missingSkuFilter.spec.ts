import { describe, expect, it } from 'vitest'
/**
 * 原料列表 · 「待补采购商品」筛选（2026-11-07 成本口径归位 · Task 12）
 *
 * 这张列表是唯一能刷出「还没补商品、在食谱里按 0 元算」的原料的地方，
 * 所以它必须能筛、能标。
 */
import ingredientsListSource from './index.vue?raw'

describe('原料列表 · 待补采购商品', () => {
  it('能按「待补采购商品」筛选', () => {
    expect(ingredientsListSource).toContain('filterMissingProcurementSku')
    expect(ingredientsListSource).toContain('只看待补采购商品')
  })

  it('行上打标记', () => {
    expect(ingredientsListSource).toContain('isPendingProcurementSku')
    expect(ingredientsListSource).toContain('待补采购商品')
  })

  it('只对食材判断（补剂和包材的采购口径挂在原料上）', () => {
    expect(ingredientsListSource).toMatch(
      /isPendingProcurementSku[\s\S]{0,200}IngredientType\.FOOD/,
    )
  })
})
