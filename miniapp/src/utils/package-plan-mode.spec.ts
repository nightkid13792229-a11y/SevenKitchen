import { describe, expect, it } from 'vitest'
import { inferPackagePlanMode } from './package-plan-mode'

describe('inferPackagePlanMode', () => {
  const context = { dailyIntakeG: 200, mealsPerDay: 2 }

  it('分装正好等于某个天数的默认值：认出天数', () => {
    // 200g/天 ÷ 2 餐 = 100g/袋；15 天 = 30 袋
    expect(inferPackagePlanMode([{ packageSpecG: 100, packageCount: 30 }], context)).toEqual({
      cycleDays: 15,
      isCustom: false
    })
  })

  it('7 天与 30 天也能认出来', () => {
    expect(
      inferPackagePlanMode([{ packageSpecG: 100, packageCount: 14 }], context).cycleDays
    ).toBe(7)
    expect(
      inferPackagePlanMode([{ packageSpecG: 100, packageCount: 60 }], context).cycleDays
    ).toBe(30)
  })

  it('对不上任何预设：判为自定义', () => {
    expect(
      inferPackagePlanMode([{ packageSpecG: 120, packageCount: 20 }], context)
    ).toEqual({ cycleDays: null, isCustom: true })
  })

  it('多行分装一律判为自定义', () => {
    expect(
      inferPackagePlanMode(
        [
          { packageSpecG: 100, packageCount: 14 },
          { packageSpecG: 200, packageCount: 2 }
        ],
        context
      )
    ).toEqual({ cycleDays: null, isCustom: true })
  })

  it('空分装或缺饭量：按自定义处理，不乱认天数', () => {
    expect(inferPackagePlanMode([], context)).toEqual({ cycleDays: null, isCustom: true })
    expect(inferPackagePlanMode([{ packageSpecG: 100, packageCount: 30 }], {
      dailyIntakeG: 0,
      mealsPerDay: 2
    })).toEqual({ cycleDays: null, isCustom: true })
  })
})
