/**
 * 建档步骤。健康信息（过敏 / 检查报告 / 体重 / 疫苗）**不属于建档流程**。
 *
 * 历史：2026-09-27 曾把"健康信息"做成建档第 3 步（可跳过），理由是 93.6% 的
 * 档案没有任何健康记录。老板随后否掉了这个做法 —— 建档是顾客只想尽快填完的时刻，
 * 塞健康信息等于给建档加成本；健康记录应当由顾客**主动**去「健康管理」板块补充。
 * 因此 `health` 步骤已整步删除，建档回到 3 步。
 */
export const DOG_PROFILE_CREATE_STEPS = ['basic', 'feeding', 'recommendation'] as const

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
