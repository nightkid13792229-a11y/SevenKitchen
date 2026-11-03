import { describe, expect, it } from 'vitest'
import {
  EDIBLE_YIELD_PERCENT_MAX,
  EDIBLE_YIELD_PERCENT_MIN,
  isEdibleYieldPercentInRange,
  toEdibleYieldPercent,
  toEdibleYieldRate,
} from './edibleYield'

describe('可食部百分比换算', () => {
  it('库内比例换成页面百分数', () => {
    expect(toEdibleYieldPercent(0.85)).toBe(85)
    expect(toEdibleYieldPercent(0.875)).toBe(87.5)
    expect(toEdibleYieldPercent(1)).toBe(100)
  })

  it('页面百分数换成库内比例，保留四位小数', () => {
    expect(toEdibleYieldRate(85)).toBe(0.85)
    expect(toEdibleYieldRate(87.5)).toBe(0.875)
    expect(toEdibleYieldRate(100)).toBe(1)
  })

  it('非法值返回 null，不把 0 当合法比例', () => {
    expect(toEdibleYieldPercent(null)).toBeNull()
    expect(toEdibleYieldPercent('85' as never)).toBeNull()
    expect(toEdibleYieldRate(undefined)).toBeNull()
    expect(toEdibleYieldRate(Number.NaN)).toBeNull()
  })

  it('合法区间是 10–100', () => {
    expect(EDIBLE_YIELD_PERCENT_MIN).toBe(10)
    expect(EDIBLE_YIELD_PERCENT_MAX).toBe(100)
    expect(isEdibleYieldPercentInRange(10)).toBe(true)
    expect(isEdibleYieldPercentInRange(100)).toBe(true)
    expect(isEdibleYieldPercentInRange(9.9)).toBe(false)
    expect(isEdibleYieldPercentInRange(0)).toBe(false)
    expect(isEdibleYieldPercentInRange(null)).toBe(false)
  })
})
