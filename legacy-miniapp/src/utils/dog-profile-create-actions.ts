import { type DogProfileCreateStep } from '../constants/dog-profile'

export interface CreateWizardActionConfig {
  primaryText: string
  primaryDisabled: boolean
  secondaryText?: string
  secondaryDisabled?: boolean
  tertiaryText?: string
  tertiaryDisabled?: boolean
}

interface CreateWizardActionInput {
  step: DogProfileCreateStep
  canAdvanceFromBasic: boolean
  canAdvanceFromFeeding: boolean
  canAdvanceFromRecommendation: boolean
  canSubmit: boolean
  recommendationReady: boolean
  calculating: boolean
}

export function getCreateWizardActionConfig(input: CreateWizardActionInput): CreateWizardActionConfig {
  if (input.step === 'feeding') {
    return {
      primaryText: '生成喂食建议',
      primaryDisabled: !input.canAdvanceFromFeeding,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
    }
  }

  if (input.step === 'recommendation') {
    return {
      primaryText: '完成建档',
      primaryDisabled: !input.canAdvanceFromRecommendation || !input.canSubmit || !input.recommendationReady || input.calculating,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
    }
  }

  return {
    primaryText: '下一步',
    primaryDisabled: !input.canAdvanceFromBasic,
    secondaryText: undefined,
  }
}
