import { describe, expect, it } from 'vitest'
import { getFeedingImpactExplanation } from './dog-profile-overview'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getCreateAvatarPlaceholder,
  getCreateActivityChoices,
  getCreateBasicFieldKeys,
  getCreateBcsOptions,
  getCreateGenderChoices,
  getCreateManualBreedLabels,
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
        // 性别与绝育自 2026-09-27 起为必填，夹具需补齐
        gender: 'MALE',
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
      // 2026-09-27：文案改为"对号入座式"，让顾客更容易把自己归到某一档
      description: expect.stringContaining('30-45 分钟'),
    })
    expect(getCreateMealChoices()).toEqual([
      { value: '1', label: '1 餐/天' },
      { value: '2', label: '2 餐/天' },
      { value: '3', label: '3 餐/天' },
      { value: '4', label: '4 餐/天' },
      { value: '5', label: '5 餐/天' },
    ])
    // 2026-09-27：零食由 4 档精简为 3 档（老板意见：较少/适中/较多 决策成本偏高），
    // 且各档不再展示长说明（改成标题下一句统一说明）
    expect(getCreateTreatChoices()).toEqual([
      { level: 'NONE', label: '不给零食' },
      { level: 'LOW', label: '较少零食' },
      { level: 'HIGH', label: '较多零食' },
    ])
    // 活动量不再带强度值（右侧信号条已按老板要求移除）
    for (const option of getCreateActivityChoices()) {
      expect(option).not.toHaveProperty('intensity')
    }
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

  it('exposes friendly gender choices for step 1', () => {
    expect(getCreateGenderChoices()).toEqual([
      { value: 'MALE', label: '弟弟', symbol: '♂' },
      { value: 'FEMALE', label: '妹妹', symbol: '♀' },
    ])
  })

  it('不再提供绝育说明文案（2026-09-27 老板要求该项下方不展示小字）', () => {
    // 说明文案与其工具函数一并移除，避免留下无人使用的死代码
    const source = readFileSync(
      resolve(process.cwd(), 'src/utils/dog-profile-create-view.ts'),
      'utf-8',
    )
    expect(source).not.toContain('getCreateNeuterHint')
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
      // 性别与绝育自 2026-09-27 起为必填，夹具需补齐
      gender: 'MALE',
      isNeutered: true,
      bcsScore: 5,
      activityLevel: 'NORMAL',
      mealsPerDay: '2',
      treatLevel: 'LOW',
    })).toBe('recommendation')
  })

  /**
   * 选择器与「热量影响」解释必须一致（2026-09-27）
   *
   * 老板验收时发现的真实缺陷：把零食选择器由 4 档精简为 3 档后，
   * 忘了同步「零食如何影响热量」的解释面板 —— 于是出现
   * 「面板讲 4 档、选项只有 3 档」的矛盾。
   *
   * 这类"改了 A 忘了改 B"最容易漏，所以直接用两份数据做一致性断言。
   */
  it('零食选择器与热量影响解释的档位保持一致', () => {
    const choiceLabels = getCreateTreatChoices().map(choice => choice.label)
    const explanationLabels = getFeedingImpactExplanation('treat').items.map(
      item => item.label,
    )

    expect(explanationLabels).toEqual(choiceLabels)
  })

  it('体况评分与活动量的解释仍覆盖全部档位', () => {
    // BCS 9 档：解释面板按分数区间归并（1-2/3/4-5/6/7/8/9），条数不必等于 9，
    // 但必须覆盖到每一档对应的区间描述，避免漏档
    expect(getFeedingImpactExplanation('bcs').items.length).toBeGreaterThanOrEqual(7)
    expect(getFeedingImpactExplanation('activity').items.length).toBeGreaterThanOrEqual(3)
  })
})
