import { describe, expect, it } from 'vitest'
import {
  buildDogCreatePayload,
  buildDogEditPayload,
  buildOverviewTaskCards,
  canAdvanceCreateStep,
  getDogHealthValidationError,
  getCreateStepAvailability,
  getNextCreateStep,
  getRecommendationDirtyFields,
  resolveDogProfileEntryRoute,
  shouldAutoPreviewRecommendation,
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

  it('keeps overview feeding and recommendation incomplete for mixed breed without size class override', () => {
    const cards = buildOverviewTaskCards({
      profile: {
        name: '七七',
        breedId: MIXED_BREED_VIRTUAL_ID,
        birthday: '2021-01-01',
        currentWeightKg: 11,
        activityLevel: 'NORMAL',
        mealsPerDay: 2,
        bcsScore: 5,
        treatInputMode: 'ESTIMATE_LEVEL',
      },
      dirtyFields: [],
      healthCount: 0,
    })

    expect(cards.find(card => card.key === 'feeding')?.status).not.toBe('complete')
    expect(cards.find(card => card.key === 'recommendation')?.status).not.toBe('complete')
  })

  it('keeps overview feeding and recommendation incomplete for exact kcal without manual kcal', () => {
    const cards = buildOverviewTaskCards({
      profile: {
        name: '七七',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2021-01-01',
        currentWeightKg: 11,
        activityLevel: 'NORMAL',
        mealsPerDay: 2,
        bcsScore: 5,
        treatInputMode: 'EXACT_KCAL',
      },
      dirtyFields: [],
      healthCount: 0,
    })

    expect(cards.find(card => card.key === 'feeding')?.status).not.toBe('complete')
    expect(cards.find(card => card.key === 'recommendation')?.status).not.toBe('complete')
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

  it('keeps recommendation locked when weight input is not a valid number', () => {
    expect(
      getCreateStepAvailability({
        name: '七七',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2021-01-01',
        currentWeightKg: 'abc',
        activityLevel: 'NORMAL',
      }).recommendation,
    ).toBe(false)
  })

  it('advances feeding to the recommendation step in create mode', () => {
    expect(getNextCreateStep('feeding')).toBe('recommendation')
  })

  it('allows recommendation to advance to health when create prerequisites are complete even without preview state', () => {
    expect(
      canAdvanceCreateStep(
        'recommendation',
        getCreateStepAvailability({
          name: '七七',
          breedId: '550e8400-e29b-41d4-a716-446655440000',
          birthday: '2021-01-01',
          currentWeightKg: '11.0',
          activityLevel: 'NORMAL',
          mealsPerDay: '2',
          treatInputMode: 'ESTIMATE_LEVEL',
          treatLevel: 'LOW',
        }),
      ),
    ).toBe(true)
  })

  it('auto previews when calculation-related fields change', () => {
    expect(shouldAutoPreviewRecommendation(['currentWeightKg'])).toBe(true)
  })

  it('does not auto preview for non-calculation dirty fields', () => {
    expect(shouldAutoPreviewRecommendation(['allergyFoods'])).toBe(false)
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

  it('keeps recommendation locked for exact kcal mode with non-numeric manual treat kcal', () => {
    expect(
      getCreateStepAvailability({
        name: '七七',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2021-01-01',
        currentWeightKg: '11.0',
        activityLevel: 'NORMAL',
        treatInputMode: 'EXACT_KCAL',
        manualTreatKcal: 'abc',
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

  it('omits manual treat kcal in exact mode when the value is not numeric', () => {
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
      manualTreatKcal: 'abc',
      allergyFoods: '',
      pickyFoods: '',
    })

    expect(payload.treatInputMode).toBe('EXACT_KCAL')
    expect(payload.manualTreatKcal).toBeUndefined()
  })

  it('builds a basic edit payload without unrelated feeding or health fields', () => {
    const payload = buildDogEditPayload({
      name: '七七',
      birthday: '2021-01-01',
      gender: 'FEMALE',
      currentWeightKg: '12.4',
      medicalRecords: [{ chiefComplaint: '胃炎' }],
    }, 'basic')

    expect(payload).toEqual({
      name: '七七',
      birthday: '2021-01-01T00:00:00.000Z',
      gender: 'FEMALE',
    })
  })

  it('builds a feeding edit payload with normalized values and cleared manual treat kcal outside exact mode', () => {
    const payload = buildDogEditPayload({
      currentWeightKg: '11',
      bcsScore: 5,
      activityLevel: 'NORMAL',
      mealsPerDay: '',
      sizeClassOverride: 'MEDIUM',
      treatInputMode: '',
      treatLevel: 'LOW',
      manualTreatKcal: '88.5',
      allergyFoods: '鸡肉',
    }, 'feeding')

    expect(payload).toEqual({
      currentWeightKg: 11,
      bcsScore: 5,
      activityLevel: 'NORMAL',
      mealsPerDay: 2,
      sizeClassOverride: 'MEDIUM',
      treatInputMode: 'ESTIMATE_LEVEL',
      treatLevel: 'LOW',
      manualTreatKcal: null,
    })
  })

  it('builds a health edit payload with the real page contract and drops blank draft rows', () => {
    const payload = buildDogEditPayload({
      medicalRecords: [
        {
          chiefComplaint: ' 胃炎 ',
          visitDate: '2024-05-01',
          diagnosis: ' 肠胃炎 ',
          notes: ' 复诊 ',
          attachments: ['a'],
        },
        {
          chiefComplaint: '',
          visitDate: '',
          diagnosis: '',
          notes: '',
          attachments: [],
        },
      ],
      checkupRecords: [
        {
          checkupType: '年度体检',
          checkupDate: '2025-01-01',
          notes: ' 正常 ',
          attachments: ['b'],
        },
        {
          checkupType: '',
          checkupDate: '',
          notes: '',
          attachments: [],
        },
      ],
      allergyRecords: [
        {
          allergen: ' 鸡肉 ',
          notes: ' 确认过敏 ',
          attachments: ['c'],
        },
        {
          allergen: '',
          notes: '',
          attachments: [],
        },
      ],
      allergyFoods: ' 牛肉 ',
      pickyFoods: '   ',
    }, 'health')

    expect(payload).toEqual({
      medicalRecords: [
        {
          chiefComplaint: '胃炎',
          visitDate: '2024-05-01',
          diagnosis: '肠胃炎',
          notes: '复诊',
          attachments: ['a'],
        },
      ],
      checkupRecords: [
        {
          checkupType: '年度体检',
          checkupDate: '2025-01-01',
          notes: '正常',
          attachments: ['b'],
        },
      ],
      allergyRecords: [
        {
          allergen: '鸡肉',
          notes: '确认过敏',
          attachments: ['c'],
        },
      ],
      allergyFoods: '牛肉',
      pickyFoods: null,
    })
  })

  it('reports validation errors for partially completed health rows', () => {
    expect(
      getDogHealthValidationError({
        medicalRecords: [{ chiefComplaint: '', visitDate: '2024-05-01', notes: '', attachments: [] }],
      }),
    ).toBe('请补充第 1 条病史记录的症状或疾病')

    expect(
      getDogHealthValidationError({
        checkupRecords: [{ checkupType: '年度体检', checkupDate: '', notes: '', attachments: [] }],
      }),
    ).toBe('请补充第 1 条体检记录的体检日期')

    expect(
      getDogHealthValidationError({
        allergyRecords: [{ allergen: '', notes: '疑似对鸡肉不耐受', attachments: [] }],
      }),
    ).toBe('请补充第 1 条过敏记录的过敏原')
  })
})
