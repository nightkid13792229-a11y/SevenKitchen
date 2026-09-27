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
    // 2026-09-27 老板指正：加入「健康信息」第 3 步之后，这一颗按钮实际是
    // **去下一步**（先进入健康信息页），喂食建议要到最后一页才展示。
    // 继续写「生成喂食建议」会让顾客以为点完就能看到建议。
    return {
      primaryText: '下一步',
      primaryDisabled: !input.canAdvanceFromFeeding,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
    }
  }

  if (input.step === 'health') {
    // 健康信息可跳过：无条件允许继续。
    // （此前没有这一分支，落到了默认分支 —— 于是这一步**没有「返回上一步」按钮**，
    //   顾客从健康信息页回不到喂食信息页。这是加入该步骤时漏掉的。）
    return {
      primaryText: '下一步',
      primaryDisabled: false,
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
