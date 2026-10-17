import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 补剂「一键买齐」守卫（2026-10-18）
 *
 * 这条链路的**关键风险是降级**：老快照里没有 `ingredientId`，
 * 如果无条件显示按钮，顾客点进去必然建不了下单行。
 */
describe('交付第 2 页 · 补剂一键买齐', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/custom-recipe/delivery-shopping.vue'),
    'utf-8',
  )

  it('★ 没有 ingredientId 就不显示按钮（老快照降级）', () => {
    expect(source).toContain('v-if="canBuySupplements"')
    expect(source).toContain('Boolean(item.ingredientId)')
  })

  it('★ 用量为 0 或 null 也不算可买（买了没意义）', () => {
    expect(source).toContain('Number(item.totalG) > 0')
    expect(source).toContain('item.totalG !== null')
  })

  it('★ 购物车行走本地存储（行带用量，塞不进 URL）', () => {
    expect(source).toContain('saveSupplementPurchaseDraft')
    expect(source).toContain("uni.navigateTo({ url: '/pages/supplement-order/index' })")
  })

  it('★ 只传确认存在的字段 —— recipeId 在 content.recipe 里，不是 delivery 顶层', () => {
    expect(source).toContain('recipeId: content.value.recipe?.recipeId')
    expect(source).not.toContain('delivery.value?.recipeId')
  })

  it('后端快照确实带上了 ingredientId（否则前端永远拿不到）', () => {
    const domain = readFileSync(
      resolve(process.cwd(), '../backend/src/domain/custom-recipe/custom-recipe.delivery.ts'),
      'utf-8',
    )
    expect(domain).toContain('ingredientId?: string | null')
  })
})
