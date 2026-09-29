import { describe, expect, it } from 'vitest'
import { DOG_PROFILE_CREATE_STEPS } from '../constants/dog-profile'
import { getCreateWizardActionConfig } from './dog-profile-create-actions'

describe('dog-profile-create-actions', () => {
  it('keeps step 1 as a simple next-step action', () => {
    expect(
      getCreateWizardActionConfig({
        step: 'basic',
        canAdvanceFromBasic: true,
        canAdvanceFromFeeding: false,
        canAdvanceFromRecommendation: false,
        canSubmit: false,
        recommendationReady: false,
        calculating: false,
      }),
    ).toMatchObject({
      primaryText: '下一步',
      primaryDisabled: false,
      secondaryText: undefined,
    })
  })

  it('disables step 1 primary action until the card is complete', () => {
    expect(
      getCreateWizardActionConfig({
        step: 'basic',
        canAdvanceFromBasic: false,
        canAdvanceFromFeeding: false,
        canAdvanceFromRecommendation: false,
        canSubmit: false,
        recommendationReady: false,
        calculating: false,
      }),
    ).toMatchObject({
      primaryText: '下一步',
      primaryDisabled: true,
      secondaryText: undefined,
    })
  })

  it('feeding 步骤的按钮是「下一步」（喂食建议要在最后一页才展示）', () => {
    expect(
      getCreateWizardActionConfig({
        step: 'feeding',
        canAdvanceFromBasic: true,
        canAdvanceFromFeeding: true,
        canAdvanceFromRecommendation: false,
        canSubmit: false,
        recommendationReady: false,
        calculating: false,
      }),
    ).toEqual({
      primaryText: '下一步',
      primaryDisabled: false,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
    })
  })

  it('建档流程只有 3 步，不存在「健康信息」步骤的按钮配置', () => {
    // 2026-09-27 老板决定：健康信息不在建档流程里收集。
    // 这里守住"别再加回来"：任何一步都不允许出现只有 3 步之外的步骤名。
    const configuredSteps = (['basic', 'feeding', 'recommendation', 'health'] as const)
      .map(step => getCreateWizardActionConfig({
        step: step as any,
        canAdvanceFromBasic: true,
        canAdvanceFromFeeding: true,
        canAdvanceFromRecommendation: true,
        canSubmit: true,
        recommendationReady: true,
        calculating: false,
      }).primaryText)

    // 前三步各有各的按钮文案；'health' 已不在步骤类型里，只会落进默认分支
    expect(configuredSteps.slice(0, 3)).toEqual(['下一步', '下一步', '完成建档'])
    expect(DOG_PROFILE_CREATE_STEPS).toEqual(['basic', 'feeding', 'recommendation'])
  })

  it('lets the recommendation step complete the profile directly', () => {
    expect(
      getCreateWizardActionConfig({
        step: 'recommendation',
        canAdvanceFromBasic: true,
        canAdvanceFromFeeding: true,
        canAdvanceFromRecommendation: true,
        canSubmit: true,
        recommendationReady: true,
        calculating: false,
      }),
    ).toEqual({
      primaryText: '完成建档',
      primaryDisabled: false,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
    })
  })

  it('第三步「体态评估」整步可跳过：能量卡没就绪也能完成建档', () => {
    expect(
      getCreateWizardActionConfig({
        step: 'recommendation',
        canAdvanceFromBasic: true,
        canAdvanceFromFeeding: true,
        canAdvanceFromRecommendation: true,
        canSubmit: true,
        recommendationReady: false,
        calculating: false,
      }),
    ).toEqual({
      primaryText: '完成建档',
      // 没答体况 → 没有能量卡。这一步可跳过，所以按钮必须仍可点。
      // 原先这里带 !recommendationReady，等于"没答体况就建不了档"。
      primaryDisabled: false,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
    })
  })
})
