/**
 * Recipe Domain Enums
 * These enums match the Prisma schema exactly.
 */

export enum RecipeHealthTag {
  HEALTHY = 'HEALTHY',
  PICKY_EATER = 'PICKY_EATER',
  SENSITIVE_STOMACH = 'SENSITIVE_STOMACH',
  PANCREATITIS_SUPPORT = 'PANCREATITIS_SUPPORT',
  LOW_FAT = 'LOW_FAT',
  SKIN_COAT_CARE = 'SKIN_COAT_CARE',
}

export enum LifeStage {
  PUPPY_UNDER_14_WEEKS = 'PUPPY_UNDER_14_WEEKS',
  PUPPY_14_WEEKS_PLUS = 'PUPPY_14_WEEKS_PLUS',
  LOW_ACTIVITY_ADULT_OR_SENIOR = 'LOW_ACTIVITY_ADULT_OR_SENIOR',
  HIGH_ACTIVITY_ADULT = 'HIGH_ACTIVITY_ADULT',
  REPRODUCTION = 'REPRODUCTION',
}

export const RECIPE_LIFE_STAGE_LABELS: Record<string, string> = {
  [LifeStage.PUPPY_UNDER_14_WEEKS]: '小于14周幼犬',
  [LifeStage.PUPPY_14_WEEKS_PLUS]: '大于等于14周幼犬',
  [LifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR]: '低运动量成犬或老年犬',
  [LifeStage.HIGH_ACTIVITY_ADULT]: '普通或高运动量成犬',
  [LifeStage.REPRODUCTION]: '繁殖期',
  PUPPY: '幼犬',
  ADULT: '成犬',
  SENIOR: '老年犬',
  PREGNANCY: '妊娠期',
  LACTATION: '哺乳期',
};

export const RECIPE_LIFE_STAGE_OPTIONS = Object.values(LifeStage).map(
  (value) => ({
    value,
    label: RECIPE_LIFE_STAGE_LABELS[value],
  }),
);

export function getRecipeLifeStageLabel(stage: string): string {
  return RECIPE_LIFE_STAGE_LABELS[stage] || stage;
}

export enum RecipeStatus {
  DRAFT = 'DRAFT',
  PUBLIC = 'PUBLIC',
  PRIVATE_CUSTOM = 'PRIVATE_CUSTOM',
}

export enum NutritionStandard {
  NRC_2006 = 'NRC_2006',
  FEDIAF_2021 = 'FEDIAF_2021',
  FEDIAF_2024 = 'FEDIAF_2024',
  FEDIAF_2025 = 'FEDIAF_2025',
  AAFCO_2022 = 'AAFCO_2022',
}
