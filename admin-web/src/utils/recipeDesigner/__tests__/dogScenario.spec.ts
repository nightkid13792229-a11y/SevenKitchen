import { describe, expect, it } from 'vitest'
import {
  resolveDogScenarioFromDetail,
  type DogScenarioCalcDetailsLike,
  type DogScenarioDetailLike,
  type DogScenarioProfileLike
} from '../dogScenario'

const NOW = new Date(2026, 9, 21, 12, 0, 0)

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

function detail(
  calcDetails: DogScenarioCalcDetailsLike = {},
  profile: DogScenarioProfileLike = {}
): DogScenarioDetailLike {
  return {
    profile,
    calcResult: { calcDetails }
  }
}

describe('resolveDogScenarioFromDetail', () => {
  it('maps puppies under 14 weeks to early growth', () => {
    expect(
      resolveDogScenarioFromDetail(
        detail({ lifeStage: 'PUPPY', ageMonths: 3, activityLevel: 'NORMAL' }),
        NOW
      )
    ).toBe('EARLY_GROWTH_REPRODUCTION')
  })

  it('maps puppies at 14 weeks or older to late growth', () => {
    expect(
      resolveDogScenarioFromDetail(
        detail({ lifeStage: 'PUPPY', ageMonths: 4, activityLevel: 'NORMAL' }),
        NOW
      )
    ).toBe('LATE_GROWTH')
  })

  it('uses the birthday (precise weeks) ahead of the floored ageMonths', () => {
    const fourteenWeeks = detail(
      { lifeStage: 'PUPPY', ageMonths: 3, activityLevel: 'NORMAL' },
      { birthday: daysAgo(98) }
    )
    expect(resolveDogScenarioFromDetail(fourteenWeeks, NOW)).toBe('LATE_GROWTH')

    const thirteenWeeks = detail(
      { lifeStage: 'PUPPY', ageMonths: 3, activityLevel: 'NORMAL' },
      { birthday: daysAgo(97) }
    )
    expect(resolveDogScenarioFromDetail(thirteenWeeks, NOW)).toBe(
      'EARLY_GROWTH_REPRODUCTION'
    )
  })

  it('accepts effectiveLifeStage and v2 puppy stage labels', () => {
    expect(
      resolveDogScenarioFromDetail(
        detail({ effectiveLifeStage: 'PUPPY', ageMonths: 3 }),
        NOW
      )
    ).toBe('EARLY_GROWTH_REPRODUCTION')
    expect(
      resolveDogScenarioFromDetail(
        detail({ lifeStage: 'PUPPY_GROWTH_CURVE', ageMonths: 4 }),
        NOW
      )
    ).toBe('LATE_GROWTH')
  })

  it('maps pregnancy and lactation to reproduction', () => {
    for (const lifeStage of ['PREGNANCY', 'LACTATION', 'PREGNANCY_EARLY', 'PREGNANCY_LATE']) {
      expect(resolveDogScenarioFromDetail(detail({ lifeStage }), NOW)).toBe('REPRODUCTION')
    }
  })

  it('maps senior dogs to the 95ME adult scenario', () => {
    for (const lifeStage of ['SENIOR', 'ADULT_SENIOR', 'LOW_ACTIVITY_ADULT_OR_SENIOR']) {
      expect(resolveDogScenarioFromDetail(detail({ lifeStage }), NOW)).toBe('ADULT_MER_95')
    }
  })

  it('maps adult activity levels', () => {
    for (const activityLevel of ['RESTING', 'LOW']) {
      expect(
        resolveDogScenarioFromDetail(detail({ lifeStage: 'ADULT', activityLevel }), NOW)
      ).toBe('ADULT_MER_95')
    }
    for (const activityLevel of ['NORMAL', 'HIGH', 'WORKING']) {
      expect(
        resolveDogScenarioFromDetail(detail({ lifeStage: 'ADULT', activityLevel }), NOW)
      ).toBe('ADULT_MER_110')
    }
  })

  it('falls back to profile fields when calcDetails are missing', () => {
    expect(
      resolveDogScenarioFromDetail({ profile: { lifeStageOverride: 'SENIOR' } }, NOW)
    ).toBe('ADULT_MER_95')
    expect(
      resolveDogScenarioFromDetail(
        { profile: { lifeStageOverride: 'ADULT', activityLevel: 'RESTING' } },
        NOW
      )
    ).toBe('ADULT_MER_95')
    expect(
      resolveDogScenarioFromDetail(
        { profile: { lifeStageOverride: 'PUPPY', birthday: daysAgo(90) } },
        NOW
      )
    ).toBe('EARLY_GROWTH_REPRODUCTION')
  })

  it('reads dog detail wrapped under data', () => {
    expect(
      resolveDogScenarioFromDetail(
        { data: detail({ lifeStage: 'ADULT', activityLevel: 'NORMAL' }) },
        NOW
      )
    ).toBe('ADULT_MER_110')
  })

  it('leaves the scenario undefined instead of guessing on missing data', () => {
    expect(resolveDogScenarioFromDetail(undefined, NOW)).toBeUndefined()
    expect(resolveDogScenarioFromDetail({}, NOW)).toBeUndefined()
    expect(resolveDogScenarioFromDetail(detail({ lifeStage: 'ADULT' }), NOW)).toBeUndefined()
    expect(resolveDogScenarioFromDetail(detail({ lifeStage: 'PUPPY' }), NOW)).toBeUndefined()
    expect(
      resolveDogScenarioFromDetail(
        detail({ lifeStage: 'ADULT', activityLevel: 'MYSTERY' }),
        NOW
      )
    ).toBeUndefined()
    expect(
      resolveDogScenarioFromDetail(
        detail({ lifeStage: 'UNKNOWN', activityLevel: 'NORMAL' }),
        NOW
      )
    ).toBeUndefined()
  })
})
