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
  PUPPY = 'PUPPY',
  ADULT = 'ADULT',
  SENIOR = 'SENIOR',
  PREGNANCY = 'PREGNANCY',
  LACTATION = 'LACTATION',
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
  AAFCO_2022 = 'AAFCO_2022',
}

