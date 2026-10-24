import { describe, expect, it } from 'vitest'
import {
  buildAftersaleRecipeDetails,
  canRedeliverAftersaleBatch,
  resolveAftersaleRedeliverItemIds,
} from '../customRecipeAftersale'

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
        requestPhotos: [],
      },
      {
        deliveryItemId: 'item-2',
        recipeName: '鸭肉西兰花',
        requestDescription: '想换成鸭肉',
        requestPhotos: [],
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
        requestPhotos: [],
      },
      {
        deliveryItemId: 'item-deleted',
        recipeName: '未命名食谱',
        requestDescription: '',
        requestPhotos: [],
      },
    ])
  })

  it('★ 每份自己的附件按份带出', () => {
    const rows = buildAftersaleRecipeDetails({
      deliveryItemIds: ['item-1', 'item-2'],
      items: [
        { deliveryItemId: 'item-1', recipeId: 'CR1', recipeName: '鸡肉南瓜' },
        { deliveryItemId: 'item-2', recipeId: 'CR2', recipeName: '鸭肉西兰花' },
      ],
      recipeRequests: [
        {
          deliveryItemId: 'item-1',
          description: '太油了',
          photos: ['https://cdn.example.com/a.jpg'],
        },
        {
          deliveryItemId: 'item-2',
          description: '想换成鸭肉',
          photos: ['https://cdn.example.com/b.jpg'],
        },
      ],
    })

    expect(rows[0]?.requestPhotos).toEqual(['https://cdn.example.com/a.jpg'])
    expect(rows[1]?.requestPhotos).toEqual(['https://cdn.example.com/b.jpg'])
  })
})

/**
 * 按选中份重新交付（2026-10-21 · 多份售后改稿）
 *
 * 后台售后卡上多一个「按选中份重新交付」：
 *   · 只有**多份售后**（有选中明细 + 订单号）才显示，老的单份售后隐藏；
 *   · 载荷就是这张售后选中的那几份明细 id，顺序不能乱、空 id 不能发出去。
 *
 * 这两条判断放在纯函数里测 —— 页面在 node 环境挂不起来，
 * 而"什么时候能点"和"发什么给后端"正是最容易写错的两处。
 */
describe('后台售后 · 按选中份重新交付的入口与载荷', () => {
  it('★ 有选中明细 + 有订单号才显示按钮', () => {
    expect(
      canRedeliverAftersaleBatch({
        orderId: 'CR202610210001',
        deliveryItemIds: ['item-1'],
      }),
    ).toBe(true)

    expect(
      canRedeliverAftersaleBatch({
        orderId: 'CR202610210001',
        deliveryItemIds: ['item-1', 'item-2'],
      }),
    ).toBe(true)
  })

  it('★ 老的单份售后（没有 deliveryItemIds）不显示按钮', () => {
    expect(
      canRedeliverAftersaleBatch({ orderId: 'CR202610210001' }),
    ).toBe(false)
    expect(
      canRedeliverAftersaleBatch({
        orderId: 'CR202610210001',
        deliveryItemIds: [],
      }),
    ).toBe(false)
  })

  it('没有订单号（或只有空白）也不显示按钮', () => {
    expect(
      canRedeliverAftersaleBatch({ orderId: '', deliveryItemIds: ['item-1'] }),
    ).toBe(false)
    expect(
      canRedeliverAftersaleBatch({
        orderId: '   ',
        deliveryItemIds: ['item-1'],
      }),
    ).toBe(false)
  })

  it('全是空白 id 时等于没有选中明细，不能发请求', () => {
    expect(
      canRedeliverAftersaleBatch({
        orderId: 'CR202610210001',
        deliveryItemIds: ['', '   '],
      }),
    ).toBe(false)
  })

  it('★ 载荷保持选择顺序，去掉空白 id 与重复项', () => {
    expect(
      resolveAftersaleRedeliverItemIds({
        deliveryItemIds: [' item-2 ', 'item-1', '', 'item-2', '   '],
      }),
    ).toEqual(['item-2', 'item-1'])
  })

  it('老的单份售后没有载荷', () => {
    expect(resolveAftersaleRedeliverItemIds({})).toEqual([])
  })
})
