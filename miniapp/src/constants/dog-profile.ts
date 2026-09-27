/**
 * 建档步骤。`health`（健康信息）于 2026-09-27 加入（U1 第 6 步）：
 * 建档是顾客注意力最集中的时刻，而健康信息原先只在"健康管理"页收集 ——
 * 那个入口藏在"编辑基础信息"里，实测 93.6% 的档案完全没有健康信息。
 * 因此把它做成建档的第 3 步，**可跳过**，并优先用"上传报告自动识别"降低填写成本。
 */
export const DOG_PROFILE_CREATE_STEPS = ['basic', 'feeding', 'health', 'recommendation'] as const

export type DogProfileCreateStep = (typeof DOG_PROFILE_CREATE_STEPS)[number]

export const DOG_PROFILE_RECOMMENDATION_FIELDS = [
  'breedId',
  'birthday',
  'currentWeightKg',
  'bcsScore',
  'activityLevel',
  'isNeutered',
  'lifeStageOverride',
  'sizeClassOverride',
  'mealsPerDay',
  'treatInputMode',
  'treatLevel',
  'manualTreatKcal',
] as const

export type DogProfileRecommendationField =
  (typeof DOG_PROFILE_RECOMMENDATION_FIELDS)[number]
