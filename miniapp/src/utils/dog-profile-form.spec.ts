import { describe, expect, it } from 'vitest'
import {
  buildDogCreatePayload,
  buildOverviewTaskCards,
  getCreateStepAvailability,
  getRecommendationDirtyFields,
  resolveDogProfileEntryRoute,
} from './dog-profile-form'

const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'

describe('dog-profile-form', () => {
  it('marks recommendation as dirty when weight changes', () => {
    expect(
      getRecommendationDirtyFields(
        { currentWeightKg: '10.0', activityLevel: 'NORMAL' },
        { currentWeightKg: '11.0', activityLevel: 'NORMAL' },
      ),
    ).toEqual(['currentWeightKg'])
  })

  it('tracks life stage and size class in recommendation dirty fields', () => {
    expect(
      getRecommendationDirtyFields(
        { lifeStageOverride: 'NONE', sizeClassOverride: null },
        { lifeStageOverride: 'ADULT', sizeClassOverride: 'MEDIUM' },
      ),
    ).toEqual(['lifeStageOverride', 'sizeClassOverride'])
  })

  it('routes existing dogs through the overview page', () => {
    expect(resolveDogProfileEntryRoute('dog-1')).toBe(
      '/pages/dog-profile-overview/index?dogId=dog-1',
    )
  })

  it('routes create entry to the dog create page', () => {
    expect(resolveDogProfileEntryRoute()).toBe('/pages/dog-create/index')
  })

  it('marks feeding as stale when the current weight changes', () => {
    const cards = buildOverviewTaskCards({
      profile: {
        currentWeightKg: 11,
        activityLevel: 'NORMAL',
        mealsPerDay: 2,
        treatInputMode: 'ESTIMATE_LEVEL',
      },
      dirtyFields: ['currentWeightKg'],
      healthCount: 0,
    })

    expect(cards.find(card => card.key === 'feeding')?.status).toBe('stale')
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

  it('keeps recommendation locked for mixed breed without size class override', () => {
    expect(
      getCreateStepAvailability({
        name: '七七',
        breedId: MIXED_BREED_VIRTUAL_ID,
        birthday: '2021-01-01',
        currentWeightKg: '11.0',
        activityLevel: 'NORMAL',
        sizeClassOverride: null,
      }).recommendation,
    ).toBe(false)
  })

  it('keeps recommendation locked for exact kcal mode without manual kcal', () => {
    expect(
      getCreateStepAvailability({
        name: '七七',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2021-01-01',
        currentWeightKg: '11.0',
        activityLevel: 'NORMAL',
        treatInputMode: 'EXACT_KCAL',
        manualTreatKcal: '',
      }).recommendation,
    ).toBe(false)
  })

  it('builds create payload with normalized birthday, fallback treat mode, and nulled optional text fields', () => {
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
      treatInputMode: '',
      treatLevel: 'LOW',
      manualTreatKcal: '',
      customBreedName: '   ',
      allergyFoods: '',
      pickyFoods: '   ',
    })

    expect(payload.birthday).toBe('2021-01-01T00:00:00.000Z')
    expect(payload.currentWeightKg).toBe(11)
    expect(payload.mealsPerDay).toBe(2)
    expect(payload.treatInputMode).toBe('ESTIMATE_LEVEL')
    expect(payload.customBreedName).toBeNull()
    expect(payload.allergyFoods).toBeNull()
    expect(payload.pickyFoods).toBeNull()
    expect(payload.manualTreatKcal).toBeUndefined()
  })

  it('builds create payload with parsed manual treat kcal in exact mode', () => {
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
      mealsPerDay: '3',
      treatInputMode: 'EXACT_KCAL',
      treatLevel: 'LOW',
      manualTreatKcal: '123.4',
      allergyFoods: '',
      pickyFoods: '',
    })

    expect(payload.treatInputMode).toBe('EXACT_KCAL')
    expect(payload.manualTreatKcal).toBe(123.4)
  })
})
