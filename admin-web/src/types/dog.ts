/**
 * Dog domain types aligned with backend dog enums.
 */

export const DogGender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE'
} as const

export type DogGender = (typeof DogGender)[keyof typeof DogGender]

export const ActivityLevel = {
  RESTING: 'RESTING',
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  WORKING: 'WORKING'
} as const

export type ActivityLevel = (typeof ActivityLevel)[keyof typeof ActivityLevel]

export const LifeStageOverride = {
  NONE: 'NONE',
  PUPPY: 'PUPPY',
  ADULT: 'ADULT',
  SENIOR: 'SENIOR',
  PREGNANCY: 'PREGNANCY',
  LACTATION: 'LACTATION'
} as const

export type LifeStageOverride =
  (typeof LifeStageOverride)[keyof typeof LifeStageOverride]

export const DogSizeCategory = {
  SMALL: 'SMALL',
  MEDIUM: 'MEDIUM',
  LARGE: 'LARGE',
  GIANT: 'GIANT'
} as const

export type DogSizeCategory =
  (typeof DogSizeCategory)[keyof typeof DogSizeCategory]

export const TreatInputMode = {
  ESTIMATE_LEVEL: 'ESTIMATE_LEVEL',
  EXACT_KCAL: 'EXACT_KCAL'
} as const

export type TreatInputMode =
  (typeof TreatInputMode)[keyof typeof TreatInputMode]

export const TreatLevel = {
  NONE: 'NONE',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH'
} as const

export type TreatLevel = (typeof TreatLevel)[keyof typeof TreatLevel]

export const DogGenderLabels: Record<DogGender, string> = {
  [DogGender.MALE]: '公',
  [DogGender.FEMALE]: '母'
}

export const ActivityLevelLabels: Record<ActivityLevel, string> = {
  [ActivityLevel.RESTING]: '静养',
  [ActivityLevel.LOW]: '低',
  [ActivityLevel.NORMAL]: '正常',
  [ActivityLevel.HIGH]: '高',
  [ActivityLevel.WORKING]: '工作犬'
}

export const LifeStageLabels: Record<LifeStageOverride, string> = {
  [LifeStageOverride.NONE]: '自动',
  [LifeStageOverride.PUPPY]: '幼犬',
  [LifeStageOverride.ADULT]: '成犬',
  [LifeStageOverride.SENIOR]: '老年',
  [LifeStageOverride.PREGNANCY]: '妊娠期',
  [LifeStageOverride.LACTATION]: '哺乳期'
}

export const DogSizeLabels: Record<DogSizeCategory, string> = {
  [DogSizeCategory.SMALL]: '小型',
  [DogSizeCategory.MEDIUM]: '中型',
  [DogSizeCategory.LARGE]: '大型',
  [DogSizeCategory.GIANT]: '巨型'
}

export const TreatLevelLabels: Record<TreatLevel, string> = {
  [TreatLevel.NONE]: '不喂',
  [TreatLevel.LOW]: '偶尔',
  [TreatLevel.MODERATE]: '经常',
  [TreatLevel.HIGH]: '疯狂'
}

export const TreatInputModeLabels: Record<TreatInputMode, string> = {
  [TreatInputMode.ESTIMATE_LEVEL]: '估算模式',
  [TreatInputMode.EXACT_KCAL]: '精确模式'
}

export interface DogProfile {
  id: string
  ownerId: string
  name: string
  breedId: string
  customBreedName: string | null
  breedName?: string
  birthday: string
  gender: DogGender
  isNeutered: boolean
  currentWeightKg: number
  bcsScore: number
  activityLevel: ActivityLevel
  lifeStageOverride: LifeStageOverride
  sizeClassOverride: DogSizeCategory | null
  mealsPerDay: number
  treatInputMode: TreatInputMode
  treatLevel: TreatLevel
  manualTreatKcal: number | null
  medicalHistory: string | null
  allergyFoods: string | null
  pickyFoods: string | null
  cachedTargetFoodKcal: number
  createdAt?: string
}

export interface DogCalcResult {
  rer: number
  totalDer: number
  finalFoodKcal: number
  treatDeduction: number
  isTreatCapped: boolean
  dailyIntakeG?: number
  calcDetails?: {
    weightKg: number
    ageMonths: number
    sizeClass: string
    lifeStage: string
    stageFactor: number
    bcsMultiplier: number
    isNeutered: boolean
    activityLevel: string
    treatMode: string
    treatLevel?: string
    treatPercentage?: number
  }
}

export interface DogDetailResponse {
  profile: DogProfile
  calcResult: DogCalcResult
}

export interface DogBreed {
  id: string
  name: string
  sizeCategory: string
  adultAgeMonths: number
  seniorAgeYears: number
  averageAdultWeightKg: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'

export function calculateAge(birthday: string): string {
  const birth = new Date(birthday)
  const now = new Date()
  const diffMs = now.getTime() - birth.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffMonths = Math.floor(diffDays / 30.44)
  const diffYears = Math.floor(diffDays / 365.25)

  if (diffYears >= 1) {
    const months = diffMonths - diffYears * 12
    return months > 0 ? `${diffYears}岁${months}个月` : `${diffYears}岁`
  }
  if (diffMonths >= 1) {
    return `${diffMonths}个月`
  }
  return `${diffDays}天`
}
