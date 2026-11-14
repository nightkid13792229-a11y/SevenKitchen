import { describe, expect, it } from 'vitest'
import { resolveLatestRecipeId } from './order-recipe-link'

describe('resolveLatestRecipeId', () => {
  it('普通鲜食 / 定制食谱：快照 id 就是食谱业务编号', () => {
    expect(resolveLatestRecipeId({ id: 'SK-RECIPE-1' })).toBe('SK-RECIPE-1')
  })

  it('去掉首尾空白；空 id 返回空串', () => {
    expect(resolveLatestRecipeId({ id: '  SK-RECIPE-1  ' })).toBe('SK-RECIPE-1')
    expect(resolveLatestRecipeId({ id: '   ' })).toBe('')
    expect(resolveLatestRecipeId(null)).toBe('')
    expect(resolveLatestRecipeId(undefined)).toBe('')
    expect(resolveLatestRecipeId({})).toBe('')
  })

  it('★ 试吃装快照的 id 是商品 ID，不能当食谱编号打开', () => {
    expect(
      resolveLatestRecipeId({ id: 'tasting-pack-product-id', kind: 'TASTING_PACK' }),
    ).toBe('')
  })

  it('★ 订单本身是试吃装时，就算快照没带 kind 也不给入口', () => {
    expect(
      resolveLatestRecipeId(
        { id: 'tasting-pack-product-id' },
        { tastingPackOrder: true },
      ),
    ).toBe('')
  })
})
