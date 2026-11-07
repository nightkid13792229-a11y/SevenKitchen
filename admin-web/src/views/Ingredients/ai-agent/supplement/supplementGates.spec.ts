import { describe, expect, it } from 'vitest'
import {
  convertPerUnit,
  evaluateSupplementGates,
  type SupplementGateInput
} from './supplementGates'

/**
 * 补剂的三道门禁。
 *
 * 这三道是**写入前唯一**的自动拦截，所以每一条都只判一件能说清的事：
 * 折算能不能回得去、单位有没有串、成本算不算得出来。判不出来的一律算不过，
 * 宁可让人回头补一格，也不要静默放过一个抄错的数字。
 */
const base: SupplementGateInput = {
  servingUnitsPerDose: 2,
  servingNutrients: { epa: 650, dha: 450 },
  perUnitNutrients: { epa: 325, dha: 225 },
  baseUnit: 'PCS',
  purchasePricePerPurchaseUnit: 398,
  purchaseToBaseRatio: 120
}

function gate(input: SupplementGateInput, key: string) {
  return evaluateSupplementGates(input).items.find((item) => item.key === key)!
}

describe('折算', () => {
  it('每份 2 粒折成每粒：650 → 325', () => {
    expect(convertPerUnit(650, 2)).toBe(325)
  })

  it('每份粒数为 0 时不折算，返回 null', () => {
    expect(convertPerUnit(650, 0)).toBeNull()
  })

  it('每份粒数不是整数时不折算，返回 null', () => {
    expect(convertPerUnit(650, 1.5)).toBeNull()
  })
})

describe('折算闭合', () => {
  it('N 与每粒值对得上时通过', () => {
    const report = evaluateSupplementGates(base)
    expect(gate(base, 'CONVERSION').passed).toBe(true)
    expect(report.passed).toBe(true)
  })

  it('每粒值与 N 对不上时拦死，detail 指出哪个字段', () => {
    const broken = { ...base, perUnitNutrients: { epa: 320, dha: 225 } }
    const item = gate(broken, 'CONVERSION')
    expect(item.passed).toBe(false)
    expect(item.detail).toContain('epa')
    expect(evaluateSupplementGates(broken).passed).toBe(false)
  })

  it('浮点尾数不误杀：325.0000001 × 2 视为通过', () => {
    const tiny = { ...base, perUnitNutrients: { epa: 325.0000001, dha: 225 } }
    expect(gate(tiny, 'CONVERSION').passed).toBe(true)
  })
})

describe('单位闭合', () => {
  it('基准单位是粒、N 是整数时通过', () => {
    expect(gate(base, 'UNIT').passed).toBe(true)
  })

  it('N 为 0 时拦死，光标指向每份粒数', () => {
    const item = gate({ ...base, servingUnitsPerDose: 0 }, 'UNIT')
    expect(item.passed).toBe(false)
    expect(item.anchor).toBe('servingUnitsPerDose')
  })

  it('基准单位不是个/件时拦死', () => {
    const item = gate({ ...base, baseUnit: 'G' }, 'UNIT')
    expect(item.passed).toBe(false)
    expect(item.anchor).toBe('baseUnit')
  })
})

describe('成本可算', () => {
  it('采购价与换算倍数都有、都大于 0 时通过', () => {
    expect(gate(base, 'COST').passed).toBe(true)
  })

  it('采购价 0 或留空时拦死', () => {
    for (const price of [0, null]) {
      const item = gate({ ...base, purchasePricePerPurchaseUnit: price }, 'COST')
      expect(item.passed).toBe(false)
      expect(item.anchor).toBe('purchasePricePerPurchaseUnit')
    }
  })

  it('换算倍数留空时拦死', () => {
    expect(gate({ ...base, purchaseToBaseRatio: null }, 'COST').passed).toBe(false)
  })
})
