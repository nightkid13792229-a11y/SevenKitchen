import { describe, expect, it } from 'vitest'
import {
  COOKING_TIME_JUDGEMENT,
  formatCookingTimes,
  getCookingTimes,
  isCookingTimeOverLimit,
} from './cooking-time'

describe('cooking-time · 按每袋重量取烹饪时间', () => {
  it('≤150g：蒸炖 10 分钟、低温慢煮 30 分钟', () => {
    expect(getCookingTimes(150)).toEqual({ steam: 10, stew: 10, sousvide: 30 })
    expect(getCookingTimes(80)).toEqual({ steam: 10, stew: 10, sousvide: 30 })
  })

  it('151–250g：蒸炖 15 分钟、低温慢煮 45 分钟', () => {
    expect(getCookingTimes(151)).toEqual({ steam: 15, stew: 15, sousvide: 45 })
    expect(getCookingTimes(250)).toEqual({ steam: 15, stew: 15, sousvide: 45 })
  })

  it('251–400g：蒸炖 20 分钟、低温慢煮 60 分钟', () => {
    expect(getCookingTimes(251)).toEqual({ steam: 20, stew: 20, sousvide: 60 })
    expect(getCookingTimes(400)).toEqual({ steam: 20, stew: 20, sousvide: 60 })
  })

  it('401–600g：蒸炖 25 分钟、低温慢煮 90 分钟', () => {
    expect(getCookingTimes(401)).toEqual({ steam: 25, stew: 25, sousvide: 90 })
    expect(getCookingTimes(600)).toEqual({ steam: 25, stew: 25, sousvide: 90 })
  })

  it('超过 600g 不给固定时间', () => {
    expect(getCookingTimes(601)).toBeNull()
    expect(getCookingTimes(1200)).toBeNull()
    expect(isCookingTimeOverLimit(601)).toBe(true)
    expect(isCookingTimeOverLimit(600)).toBe(false)
  })

  it('重量不合法时不猜时间', () => {
    expect(getCookingTimes(0)).toBeNull()
    expect(getCookingTimes(-10)).toBeNull()
    expect(getCookingTimes(Number.NaN)).toBeNull()
    expect(getCookingTimes(null)).toBeNull()
    expect(getCookingTimes(undefined)).toBeNull()
  })

  it('展示文案：蒸炖带「约」，低温慢煮不带', () => {
    expect(formatCookingTimes(300)).toEqual({
      steam: '约 20 分钟',
      stew: '约 20 分钟',
      sousvide: '60 分钟',
    })
    expect(formatCookingTimes(700)).toBeNull()
  })

  it('判定标准用「出浴」，并覆盖蒸炖与低温慢煮', () => {
    expect(COOKING_TIME_JUDGEMENT).toContain('蒸和炖的出锅判定标准')
    expect(COOKING_TIME_JUDGEMENT).toContain('鲜食中心没有可见血水')
    expect(COOKING_TIME_JUDGEMENT).toContain('低温慢煮的出浴判定标准')
    expect(COOKING_TIME_JUDGEMENT).toContain('65℃')
    expect(COOKING_TIME_JUDGEMENT).not.toContain('出炉')
  })
})
