import { describe, expect, it } from 'vitest'
import {
  getCreateAvatarPlaceholder,
  getCreateActivityChoices,
  getCreateBasicFieldKeys,
  getCreateBcsOptions,
  getCreateGenderChoices,
  getCreateManualBreedLabels,
  getCreateNeuterHint,
  getCreateMixedBreedSizeHint,
  shouldShowCreateMixedBreedSizeSummary,
  getCreateBcsToneClass,
  getCreateFeedingImpact,
  getCreateFeedingFieldKeys,
  getCreateMealChoices,
  getCreateTreatChoices,
  isCreateBasicStepReady,
  isCreateFeedingStepReady,
  normalizeCreateActivityLevel,
  normalizeCreateBcsScore,
  normalizeCreateMealsPerDay,
  normalizeCreateTreatLevel,
  resolveCreateDraftStep,
  shouldShowCreateWeightManagementEntry,
} from './dog-profile-create-view'

describe('create step boundaries', () => {
  it('keeps weight and neuter in basic info instead of feeding', () => {
    expect(getCreateBasicFieldKeys()).toContain('currentWeightKg')
    expect(getCreateBasicFieldKeys()).toContain('isNeutered')
    expect(getCreateFeedingFieldKeys()).not.toContain('currentWeightKg')
    expect(getCreateFeedingFieldKeys()).not.toContain('isNeutered')
  })

  it('never shows weight-management entry during initial creation', () => {
    expect(shouldShowCreateWeightManagementEntry()).toBe(false)
  })

  it('treats invalid weight as incomplete basic create input', () => {
    expect(
      isCreateBasicStepReady({
        name: '七七',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2021-01-01',
        currentWeightKg: 'abc',
        isNeutered: false,
      }),
    ).toBe(false)
  })

  it('keeps feeding readiness focused on actual feeding fields', () => {
    expect(
      isCreateFeedingStepReady({
        bcsScore: 5,
        activityLevel: 'NORMAL',
        mealsPerDay: '2',
        treatLevel: 'LOW',
        currentWeightKg: 'abc',
      }),
    ).toBe(true)
  })

  it('provides create-step feeding cards without weight or exact-kcal input helpers', () => {
    expect(getCreateFeedingFieldKeys()).toEqual(['bcsScore', 'activityLevel', 'mealsPerDay', 'treatLevel'])
    expect(getCreateActivityChoices()).toHaveLength(5)
    expect(getCreateActivityChoices().map(option => option.value)).toEqual([
      'RESTING',
      'LOW',
      'NORMAL',
      'HIGH',
      'WORKING',
    ])
    expect(getCreateActivityChoices()[1]).toMatchObject({
      value: 'LOW',
      label: '城市日常',
      description: expect.stringContaining('30-45分钟'),
    })
    expect(getCreateMealChoices()).toEqual([
      { value: '1', label: '1 餐/天' },
      { value: '2', label: '2 餐/天' },
      { value: '3', label: '3 餐/天' },
      { value: '4', label: '4 餐/天' },
      { value: '5', label: '5 餐/天' },
    ])
    expect(getCreateTreatChoices()).toMatchObject([
      { level: 'NONE', label: '不给零食', description: '不为零食额外预留热量，全部热量用于主食' },
      { level: 'LOW', label: '较少零食', description: '用于预留少量零食的热量，剔除零食热量后再计算主食热量' },
      { level: 'MODERATE', label: '适中零食', description: '用于预留适中零食的热量，剔除零食热量后再计算主食热量' },
      { level: 'HIGH', label: '较多零食', description: '用于预留较多零食的热量，剔除零食热量后再计算主食热量' },
    ])
  })

  it('reuses the shared feeding explanation helpers for bcs, activity, and treat', () => {
    expect(getCreateBcsOptions()).toHaveLength(9)
    expect(getCreateBcsOptions()[0]).not.toHaveProperty('detail')
    expect(getCreateFeedingImpact('bcs').title).toBe('BCS 如何影响热量')
    expect(getCreateFeedingImpact('activity').title).toBe('活动水平如何影响热量')
    expect(getCreateFeedingImpact('treat').title).toBe('零食如何影响热量')
  })

  it('maps bcs scores to a slim visual gradient from thin to obese', () => {
    expect(getCreateBcsToneClass(1)).toBe('bcs-choice-card--score-1')
    expect(getCreateBcsToneClass(3)).toBe('bcs-choice-card--score-3')
    expect(getCreateBcsToneClass(5)).toBe('bcs-choice-card--score-5')
    expect(getCreateBcsToneClass(7)).toBe('bcs-choice-card--score-7')
    expect(getCreateBcsToneClass(9)).toBe('bcs-choice-card--score-9')
    expect(getCreateBcsToneClass(12)).toBe('bcs-choice-card--score-5')
  })

  it('uses a dog placeholder avatar instead of name-derived text in create mode', () => {
    expect(getCreateAvatarPlaceholder()).toBe('🐶')
  })

  it('exposes friendly gender choices and neuter hint copy for step 1', () => {
    expect(getCreateGenderChoices()).toEqual([
      { value: 'MALE', label: '弟弟', symbol: '♂' },
      { value: 'FEMALE', label: '妹妹', symbol: '♀' },
    ])
    expect(getCreateNeuterHint()).toBe('是否绝育会影响小家伙的热量评估。')
  })

  it('provides concise manual-breed labels for name input and adult size selection', () => {
    expect(getCreateManualBreedLabels()).toEqual({
      nameTitle: '填写品种名称',
      sizeTitle: '选择成年后体型',
      sizeHint: '无法预估成年体型建议选【中型犬】',
    })
  })

  it('only shows the mixed-breed size hint before the adult size is chosen', () => {
    expect(getCreateMixedBreedSizeHint(false)).toBe('请选择成年后的体型')
    expect(getCreateMixedBreedSizeHint(true)).toBe('')
  })

  it('shows a static mixed-breed size summary after the adult size has been selected', () => {
    expect(shouldShowCreateMixedBreedSizeSummary(true, true)).toBe(true)
    expect(shouldShowCreateMixedBreedSizeSummary(true, false)).toBe(false)
    expect(shouldShowCreateMixedBreedSizeSummary(false, true)).toBe(false)
  })

  it('rejects out-of-range feeding values even when restored from drafts or legacy data', () => {
    expect(isCreateFeedingStepReady({
      bcsScore: 12,
      activityLevel: 'EXTREME',
      mealsPerDay: '99',
      treatLevel: 'EXACT_KCAL',
    })).toBe(false)
  })

  it('normalizes invalid restored values back to safe Step 2 defaults', () => {
    expect(normalizeCreateBcsScore('12')).toBe(5)
    expect(normalizeCreateActivityLevel('EXTREME')).toBe('LOW')
    expect(normalizeCreateMealsPerDay('99')).toBe('2')
    expect(normalizeCreateTreatLevel('EXACT_KCAL')).toBe('LOW')
  })

  it('restores health drafts back to recommendation until a fresh result is regenerated', () => {
    expect(resolveCreateDraftStep('health', {
      name: '七七',
      breedId: '550e8400-e29b-41d4-a716-446655440000',
      birthday: '2021-01-01',
      currentWeightKg: '8.6',
      isNeutered: true,
      bcsScore: 5,
      activityLevel: 'NORMAL',
      mealsPerDay: '2',
      treatLevel: 'LOW',
    })).toBe('recommendation')
  })
})
