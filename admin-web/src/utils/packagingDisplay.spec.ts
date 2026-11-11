import { describe, expect, it } from 'vitest'

import {
  formatPackagingText,
  legacyPackaging,
  ratioOf,
} from './packagingDisplay'

describe('ratioOf', () => {
  it('连乘中间层再乘末层', () => {
    expect(
      ratioOf({ links: [{ count: 10, unit: '捆' }], amount: 500, amountUnit: 'G' }),
    ).toBe(5000)
  })

  it('没有中间层时就是末层', () => {
    expect(ratioOf({ links: [], amount: 1000, amountUnit: 'G' })).toBe(1000)
  })

  it('缺数量时返回 0，不乱猜', () => {
    expect(ratioOf({ links: [{ count: 0, unit: '捆' }], amount: 500, amountUnit: 'G' })).toBe(0)
    expect(ratioOf(null)).toBe(0)
  })
})

describe('formatPackagingText', () => {
  it('渲染成一句人话', () => {
    expect(
      formatPackagingText(
        { links: [{ count: 10, unit: '捆' }], amount: 500, amountUnit: 'G' },
        '箱',
      ),
    ).toBe('1 箱 = 10 捆 × 500 克')
  })

  it('按个记账时保留「枚」', () => {
    expect(
      formatPackagingText(
        { links: [], amount: 30, amountUnit: 'PCS', amountLabel: '枚' },
        '盒',
      ),
    ).toBe('1 盒 = 30 枚')
  })

  it('没有层级时返回空串，不显示半句话', () => {
    expect(formatPackagingText(null, '箱')).toBe('')
  })
})

describe('legacyPackaging', () => {
  it('把"一件多少克"折成单层，倍数不变', () => {
    const spec = legacyPackaging(1590, 'G', '30枚 1.59kg')
    expect(spec).toEqual({
      links: [],
      amount: 1590,
      amountUnit: 'G',
      printedText: '30枚 1.59kg',
    })
    expect(ratioOf(spec)).toBe(1590)
  })

  it('非法倍数给 0，不填假数据', () => {
    expect(legacyPackaging(0, 'G').amount).toBe(0)
    expect(legacyPackaging(null, 'ML').amountUnit).toBe('ML')
  })
})
