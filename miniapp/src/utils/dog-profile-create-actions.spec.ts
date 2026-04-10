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

  it('keeps feeding step on generate and back actions', () => {
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
      primaryText: '生成喂食建议',
      primaryDisabled: false,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
    })
  })

  it('keeps recommendation step on continue health-record entry with a save archive tertiary action', () => {
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
      primaryText: '继续填写健康记录',
      primaryDisabled: false,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
      tertiaryText: '保存档案',
      tertiaryDisabled: false,
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
      primaryText: '继续填写健康记录',
      primaryDisabled: true,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
      tertiaryText: '保存档案',
      tertiaryDisabled: true,
    })
  })

  it('keeps health step on complete, back, and skip-create actions', () => {
    expect(
      getCreateWizardActionConfig({
        step: 'health',
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
      tertiaryText: '跳过并创建',
      tertiaryDisabled: false,
    })
  })
})
