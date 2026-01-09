/**
 * Dog Domain Enums
 * These enums match the Prisma schema exactly.
 */

export enum DogSizeCategory {
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
  GIANT = 'GIANT',
}

export enum GrowthCurveType {
  STANDARD = 'STANDARD',
  SLOW = 'SLOW',
  VERY_SLOW = 'VERY_SLOW',
}

export enum DogGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export enum ActivityLevel {
  RESTING = 'RESTING',
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  WORKING = 'WORKING',
}

export enum LifeStageOverride {
  NONE = 'NONE',
  PREGNANCY = 'PREGNANCY',
  LACTATION = 'LACTATION',
  PUPPY = 'PUPPY',
  ADULT = 'ADULT',
  SENIOR = 'SENIOR',
}

export enum TreatInputMode {
  ESTIMATE_LEVEL = 'ESTIMATE_LEVEL',
  EXACT_KCAL = 'EXACT_KCAL',
}

export enum TreatLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
}

