import { describe, expect, it } from 'vitest'
import {
  MIN_ASSISTED_ORDER_G,
  needsAmountAdjustReason,
  resolveDaysForMinOrder,
  resolveDaysUntilMinOrder,
} from './assistedOrder'

describe('代客下单确认页的纯规则', () => {
  it('3kg 的小狗 7 天不足 1000g，自动抬到够 1000g 的天数', () => {
    expect(resolveDaysForMinOrder(100, 7)).toEqual({ days: 10, raised: true })
  })

  it('已经够 1000g 就不动天数', () => {
    expect(resolveDaysForMinOrder(447, 7)).toEqual({ days: 7, raised: false })
  })

  it('最低订购量按 1000g 算', () => {
    expect(MIN_ASSISTED_ORDER_G).toBe(1000)
    // 999g 还不够，1000g 刚好够
    expect(resolveDaysForMinOrder(999, 1).raised).toBe(true)
    expect(resolveDaysForMinOrder(1000, 1).raised).toBe(false)
  })

  it('每日克数不合法直接报错，不静默返回', () => {
    expect(() => resolveDaysForMinOrder(0, 7)).toThrow()
  })

  it('实收与报价差 1 分钱就算不一致', () => {
    expect(needsAmountAdjustReason(428, 428.01)).toBe(true)
    expect(needsAmountAdjustReason(428, 428)).toBe(false)
    expect(needsAmountAdjustReason(428, 400)).toBe(true)
  })

  it('按真实分装总重抬天数：3 餐向下取整差一点也要补够', () => {
    // 100g/天、3 餐 → 每袋 33g，7 天只有 693g；10 天 990g 仍不够；11 天 1089g 才够
    const result = resolveDaysUntilMinOrder(7, (days) => 33 * 3 * days, 1000)
    expect(result).toEqual({ days: 11, raised: true })
  })

  it('按真实分装总重已经够 1000g 就不动', () => {
    const result = resolveDaysUntilMinOrder(7, (days) => 224 * 2 * days, 1000)
    expect(result).toEqual({ days: 7, raised: false })
  })
})
