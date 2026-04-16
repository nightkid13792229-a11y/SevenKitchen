import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORDER_CYCLE_DAYS,
  buildDefaultPackagePlan,
  estimateFeedDays,
  getPackagePlanTotal,
  getSourcePlanLabel,
  isMinimumOrderMet,
} from './order-package-plan'

describe('order-package-plan miniapp helper', () => {
  it('uses 15 days as the default cycle', () => {
    expect(DEFAULT_ORDER_CYCLE_DAYS).toBe(15)
  })

  it('builds default package plan from daily intake and meals per day', () => {
    expect(
      buildDefaultPackagePlan({
        dailyIntakeG: 300,
        mealsPerDay: 2,
        days: 15,
      }),
    ).toEqual([{ packageSpecG: 150, packageCount: 30 }])
  })

  it('summarizes custom package rows', () => {
    const total = getPackagePlanTotal([
      { packageSpecG: 100, packageCount: 10 },
      { packageSpecG: 150, packageCount: 20 },
      { packageSpecG: 200, packageCount: 5 },
    ])

    expect(total).toEqual({ totalGrams: 5000, totalPackages: 35 })
    expect(isMinimumOrderMet(total.totalGrams)).toBe(true)
    expect(estimateFeedDays(total.totalGrams, 300)).toBe('16.7')
  })

  it('returns customer-facing source plan labels', () => {
    expect(getSourcePlanLabel('MARKET_PREMIUM')).toBe('尽量山姆、盒马、沃集鲜')
  })
})
