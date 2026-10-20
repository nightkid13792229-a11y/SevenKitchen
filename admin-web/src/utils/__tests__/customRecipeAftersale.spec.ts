import { describe, expect, it } from 'vitest'
import { buildAftersaleRecipeDetails } from '../customRecipeAftersale'

/**
 * 后台售后待办 · 多份售后的食谱明细（2026-10-21）
 *
 * 顾客现在可以按份提售后：一次选中几份食谱，每份写自己的诉求。
 * 客服必须一眼看清「涉及哪几份、每份要改什么」——
 * 只给 deliveryItemIds 等于让客服自己去库里翻。
 *
 * 这里测的是页面要渲染的那份数据：只有它对了，页面上的
 * 「涉及 N 份食谱 / 食谱名 / 每份说明」才有意义。
 */
describe('后台售后 · 多份售后的食谱明细', () => {
  it('★ 按选中顺序带出食谱名与每份的说明（说明按 id 对齐，不按数组下标猜）', () => {
    const rows = buildAftersaleRecipeDetails({
      deliveryItemIds: ['item-1', 'item-2'],
      items: [
        { deliveryItemId: 'item-1', recipeId: 'CR1', recipeName: '鸡肉南瓜' },
        { deliveryItemId: 'item-2', recipeId: 'CR2', recipeName: '鸭肉西兰花' },
      ],
      recipeRequests: [
        { deliveryItemId: 'item-2', description: '想换成鸭肉' },
        { deliveryItemId: 'item-1', description: '太油了' },
      ],
    })

    expect(rows).toEqual([
      {
        deliveryItemId: 'item-1',
        recipeName: '鸡肉南瓜',
        requestDescription: '太油了',
      },
      {
        deliveryItemId: 'item-2',
        recipeName: '鸭肉西兰花',
        requestDescription: '想换成鸭肉',
      },
    ])
  })

  it('老的单份售后没有按份选择 → 空数组（页面继续只显示原来那条说明）', () => {
    expect(buildAftersaleRecipeDetails({})).toEqual([])
    expect(buildAftersaleRecipeDetails({ deliveryItemIds: [] })).toEqual([])
  })

  it('明细被删或食谱没名字时仍保留这一份，避免显示出来的份数变少', () => {
    const rows = buildAftersaleRecipeDetails({
      deliveryItemIds: ['item-1', 'item-deleted'],
      items: [{ deliveryItemId: 'item-1', recipeId: null, recipeName: null }],
      recipeRequests: [],
    })

    expect(rows).toEqual([
      {
        deliveryItemId: 'item-1',
        recipeName: '未命名食谱',
        requestDescription: '',
      },
      {
        deliveryItemId: 'item-deleted',
        recipeName: '未命名食谱',
        requestDescription: '',
      },
    ])
  })
})
