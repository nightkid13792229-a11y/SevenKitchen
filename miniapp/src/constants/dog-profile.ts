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
