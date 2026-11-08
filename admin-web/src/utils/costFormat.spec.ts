import { describe, expect, it } from 'vitest'
import { formatUnitCost } from './costFormat'

/**
 * 每基准单位成本的显示精度（2026-11-08）。
 *
 * 食材成本在库里是 6 位小数：9.99 ÷ 200g = 0.049950。
 * 页面如果按 2 位显示会变成 ¥0.05，看起来像系统少算了 0.00005。
 */
describe('formatUnitCost', () => {
  it('每克成本保留 6 位，0.04995 不会显示成 0.05', () => {
    expect(formatUnitCost(0.04995)).toBe('¥0.049950')
  })

  it('非食材的采购单位价仍按 2 位显示', () => {
    expect(formatUnitCost(0.04995, 2)).toBe('¥0.05')
  })

  it('缺失值显示「—」，不冒充 0', () => {
    expect(formatUnitCost(null)).toBe('—')
    expect(formatUnitCost(undefined)).toBe('—')
  })
})
