import { describe, expect, it } from 'vitest'
import {
  buildDogCreatePayload,
  getCreateStepAvailability,
  getRecommendationDirtyFields,
} from './dog-profile-form'

describe('dog-profile-form', () => {
  it('marks recommendation as dirty when weight changes', () => {
    expect(
      getRecommendationDirtyFields(
        { currentWeightKg: '10.0', activityLevel: 'NORMAL' },
        { currentWeightKg: '11.0', activityLevel: 'NORMAL' },
      ),
    ).toEqual(['currentWeightKg'])
  })

  it('unlocks recommendation after feeding fields are complete', () => {
    expect(
      getCreateStepAvailability({
        name: '七七',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2021-01-01',
        currentWeightKg: '11.0',
        activityLevel: 'NORMAL',
      }).recommendation,
    ).toBe(true)
  })

  it('builds create payload with normalized birthday and meals fallback', () => {
    const payload = buildDogCreatePayload({
      name: '七七',
      breedId: '550e8400-e29b-41d4-a716-446655440000',
      birthday: '2021-01-01',
      gender: 'MALE',
      isNeutered: false,
      currentWeightKg: '11',
      bcsScore: 5,
      activityLevel: 'NORMAL',
      lifeStageOverride: 'NONE',
      sizeClassOverride: null,
      mealsPerDay: '',
      treatInputMode: 'ESTIMATE_LEVEL',
      treatLevel: 'LOW',
      manualTreatKcal: '',
      allergyFoods: '',
      pickyFoods: '',
    })

    expect(payload.birthday).toBe('2021-01-01T00:00:00.000Z')
    expect(payload.mealsPerDay).toBe(2)
  })
})
