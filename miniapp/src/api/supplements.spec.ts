import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * 补剂商城：购买草稿的本地存储与状态文案。
 * request 相关逻辑依赖 uni 运行时，这里只覆盖不依赖网络的部分。
 */

const storage = new Map<string, unknown>()

;(globalThis as any).uni = {
  setStorageSync: (key: string, value: unknown) => {
    storage.set(key, value)
  },
  getStorageSync: (key: string) => (storage.has(key) ? storage.get(key) : ''),
  removeStorageSync: (key: string) => {
    storage.delete(key)
  },
}

let mod: typeof import('./supplements')

beforeAll(async () => {
  mod = await import('./supplements')
})

beforeEach(() => {
  storage.clear()
})

describe('补剂购买草稿', () => {
  it('保存后能原样读回', () => {
    mod.saveSupplementPurchaseDraft({
      lines: [
        { ingredientId: 'kelp', amount: 22.7, name: '海藻粉', unit: '平勺' },
        { ingredientId: 'choline', amount: 5.48, name: '胆碱片', unit: '片' },
      ],
      recipeId: 'recipe-1',
      recipeName: '萝卜绿豆鸭胸猪里脊',
      dogName: '拿铁',
      cycleDays: 7,
    })

    const draft = mod.readSupplementPurchaseDraft()

    expect(draft).not.toBeNull()
    expect(draft!.lines).toHaveLength(2)
    expect(draft!.lines[0]).toEqual({
      ingredientId: 'kelp',
      amount: 22.7,
      name: '海藻粉',
      unit: '平勺',
    })
    expect(draft!.recipeName).toBe('萝卜绿豆鸭胸猪里脊')
    expect(draft!.cycleDays).toBe(7)
  })

  it('没有草稿时返回 null', () => {
    expect(mod.readSupplementPurchaseDraft()).toBeNull()
  })

  it('空清单视为无效草稿', () => {
    mod.saveSupplementPurchaseDraft({ lines: [] })
    expect(mod.readSupplementPurchaseDraft()).toBeNull()
  })

  it('存储内容损坏时返回 null 而不是抛错', () => {
    storage.set('supplementPurchaseDraft', '{不是合法 JSON')
    expect(mod.readSupplementPurchaseDraft()).toBeNull()
  })

  it('可以清除草稿', () => {
    mod.saveSupplementPurchaseDraft({
      lines: [{ ingredientId: 'kelp', amount: 1 }],
    })
    mod.clearSupplementPurchaseDraft()
    expect(mod.readSupplementPurchaseDraft()).toBeNull()
  })
})

describe('补剂订单状态文案', () => {
  it('覆盖全部后端状态', () => {
    const statuses = [
      'PENDING_PAYMENT',
      'PAID',
      'PACKING',
      'PACKED',
      'SHIPPED',
      'COMPLETED',
      'CANCELLED',
      'AFTERSALE',
    ]

    statuses.forEach((status) => {
      expect(mod.SUPPLEMENT_ORDER_STATUS_LABELS[status]).toBeTruthy()
    })

    expect(mod.SUPPLEMENT_ORDER_STATUS_LABELS.PENDING_PAYMENT).toBe('待付款')
    expect(mod.SUPPLEMENT_ORDER_STATUS_LABELS.PACKED).toBe('待发货')
    expect(mod.SUPPLEMENT_ORDER_STATUS_LABELS.AFTERSALE).toBe('售后处理中')
  })
})
