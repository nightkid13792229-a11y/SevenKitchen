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
