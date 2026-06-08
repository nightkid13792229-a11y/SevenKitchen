import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORDER_CYCLE_DAYS,
  MIN_PACKAGE_SPEC_G,
  ORDER_CYCLE_OPTIONS,
  SOURCE_PLAN_OPTIONS,
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

  it('summarizes custom package rows without silently raising below-minimum specs', () => {
    const total = getPackagePlanTotal([
      { packageSpecG: 10, packageCount: 2 },
      { packageSpecG: 100, packageCount: 10 },
      { packageSpecG: 150, packageCount: 20 },
      { packageSpecG: 200, packageCount: 5 },
    ])

    expect(total).toEqual({ totalGrams: 5020, totalPackages: 37 })
    expect(isMinimumOrderMet(total.totalGrams)).toBe(true)
    expect(estimateFeedDays(total.totalGrams, 300)).toBe('16.7')
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
    expect(getSourcePlanLabel('ORGANIC')).toBe('有机优先')
    expect(getSourcePlanLabel('MARKET_PREMIUM')).toBe('商超优先')
    expect(getSourcePlanLabel('WHOLESALE')).toBe('批发优先')
  })

  it('keeps source plan descriptions aligned with ordering copy', () => {
    expect(SOURCE_PLAN_OPTIONS).toEqual([
      {
        code: 'ORGANIC',
        label: '有机优先',
        description: '优先采购有机食材，如果没有有机来源，再向下选择。',
      },
      {
        code: 'MARKET_PREMIUM',
        label: '商超优先',
        description: '优先采购山姆、盒马等商超来源的食材，如果没有，再向下选择本地农贸市场或者批发市场的来源。',
      },
      {
        code: 'WHOLESALE',
        label: '批发优先',
        description: '优先采用本地大型食材批发市场来源，包括但不限于成都海吉星、海霸王、美菜网等批发市场。营养价值与有机或者商超来源几乎没有差异，但品控没有大型商超那么严格。',
      },
    ])
  })
})
