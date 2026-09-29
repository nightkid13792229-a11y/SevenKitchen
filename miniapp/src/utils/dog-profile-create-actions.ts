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
    // 喂食信息之后就是最后一页，喂食建议要到那一页才展示。
    // 写「生成喂食建议」会让顾客以为点完就能看到建议。
    return {
      primaryText: '下一步',
      primaryDisabled: !input.canAdvanceFromFeeding,
      secondaryText: '返回上一步',
      secondaryDisabled: false,
    }
  }

  if (input.step === 'recommendation') {
    // 第 3 步是「体态评估」，**整步可以跳过**：
    // 体况问卷答不答都能建档，答了才在下方多出一张能量卡。
    // 因此这里不再要求 recommendationReady —— 原先那样会让"没答体况"
    // 变成"按钮点不动"，与"可跳过"直接矛盾。
    return {
      primaryText: '完成建档',
      primaryDisabled: !input.canAdvanceFromRecommendation || !input.canSubmit || input.calculating,
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
