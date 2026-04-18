import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORDER_CYCLE_DAYS,
  MIN_PACKAGE_SPEC_G,
  ORDER_CYCLE_OPTIONS,
  buildDefaultPackagePlan,
  estimateFeedDays,
  getPackagePlanTotal,
  getSourcePlanLabel,
  isMinimumOrderMet,
} from './order-package-plan'

describe('order-package-plan miniapp helper', () => {
  it('uses 7 days as the default cycle', () => {
    expect(DEFAULT_ORDER_CYCLE_DAYS).toBe(7)
  })

  it('uses 30g as the minimum package spec', () => {
    expect(MIN_PACKAGE_SPEC_G).toBe(30)
  })

  it('exposes the supported cycle options', () => {
    expect(ORDER_CYCLE_OPTIONS).toEqual([7, 15, 30])
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

  it('does not generate package specs below the minimum', () => {
    expect(
      buildDefaultPackagePlan({
        dailyIntakeG: 40,
        mealsPerDay: 2,
        days: 7,
      }),
    ).toEqual([{ packageSpecG: 30, packageCount: 14 }])
  })

  it('falls back to the default cycle when days are invalid', () => {
    expect(
      buildDefaultPackagePlan({
        dailyIntakeG: 300,
        mealsPerDay: 2,
        days: 0,
      }),
    ).toEqual([{ packageSpecG: 150, packageCount: 14 }])

    expect(
      buildDefaultPackagePlan({
        dailyIntakeG: 300,
        mealsPerDay: 2,
        days: Number.NaN,
      }),
    ).toEqual([{ packageSpecG: 150, packageCount: 14 }])
  })

  it('summarizes custom package rows', () => {
    const total = getPackagePlanTotal([
      { packageSpecG: 10, packageCount: 2 },
      { packageSpecG: 100, packageCount: 10 },
      { packageSpecG: 150, packageCount: 20 },
      { packageSpecG: 200, packageCount: 5 },
    ])

    expect(total).toEqual({ totalGrams: 5060, totalPackages: 37 })
    expect(isMinimumOrderMet(total.totalGrams)).toBe(true)
    expect(estimateFeedDays(total.totalGrams, 300)).toBe('16.9')
  })

  it('ignores invalid rows instead of producing NaN totals', () => {
    const total = getPackagePlanTotal([
      { packageSpecG: 100.8, packageCount: 10.6 },
      { packageSpecG: -50, packageCount: 20 },
      { packageSpecG: Number.NaN, packageCount: Number.POSITIVE_INFINITY },
      { packageSpecG: 200, packageCount: 5 },
    ])

    expect(total).toEqual({ totalGrams: 2000, totalPackages: 15 })
  })

  it('validates minimum order and feed-day estimates defensively', () => {
    expect(isMinimumOrderMet(999)).toBe(false)
    expect(isMinimumOrderMet(1000)).toBe(true)
    expect(isMinimumOrderMet(Number.NaN)).toBe(false)
    expect(estimateFeedDays(Number.NaN, 300)).toBe('-')
    expect(estimateFeedDays(5000, Number.NaN)).toBe('-')
    expect(estimateFeedDays(0, 300)).toBe('-')
  })

  it('returns customer-facing source plan labels', () => {
    expect(getSourcePlanLabel('MARKET_PREMIUM')).toBe('尽量山姆、盒马、沃集鲜')
  })
})
