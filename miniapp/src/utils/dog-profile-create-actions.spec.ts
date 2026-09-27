import { describe, expect, it } from 'vitest'
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

  it('健康信息步骤可继续且有「返回上一步」（加入该步骤时曾漏配）', () => {
    expect(
      getCreateWizardActionConfig({
        step: 'health',
        canAdvanceFromBasic: true,
        canAdvanceFromFeeding: true,
        canAdvanceFromRecommendation: false,
        canSubmit: false,
        recommendationReady: false,
        calculating: false,
      }),
    ).toEqual({
      primaryText: '下一步',
      // 健康信息可跳过：即便其它条件都不满足也必须能继续
      primaryDisabled: false,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
    })
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

  it('disables recommendation actions until a fresh result is ready', () => {
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
      primaryDisabled: true,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
    })
  })
})
