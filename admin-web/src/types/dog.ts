/**
 * Dog Domain Enums
 * Aligned with backend/src/domain/dog/enums.ts
 */

export enum DogGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE'
}

export enum ActivityLevel {
  RESTING = 'RESTING',
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  WORKING = 'WORKING'
}

export enum LifeStageOverride {
  NONE = 'NONE',
  PUPPY = 'PUPPY',
  ADULT = 'ADULT',
  SENIOR = 'SENIOR',
  PREGNANCY = 'PREGNANCY',
  LACTATION = 'LACTATION'
}

export enum DogSizeCategory {
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
  GIANT = 'GIANT'
}

export enum TreatInputMode {
  ESTIMATE_LEVEL = 'ESTIMATE_LEVEL',
  EXACT_KCAL = 'EXACT_KCAL'
}

export enum TreatLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH'
}

// UI display labels for enums
export const DogGenderLabels: Record<DogGender, string> = {
  [DogGender.MALE]: '公',
  [DogGender.FEMALE]: '母'
}

export const ActivityLevelLabels: Record<ActivityLevel, string> = {
  [ActivityLevel.RESTING]: '休息静养',
  [ActivityLevel.LOW]: '城市日常',
  [ActivityLevel.NORMAL]: '规律运动',
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

/**
 * Dog Profile Interface
 * Aligned with backend DogProfileDto
 */
export interface DogProfile {
  id: string
  ownerId: string
  name: string
  breedId: string
  customBreedName: string | null
  breedName?: string // Extended from breed lookup
  /** 归属客户微信昵称（/admin/dogs 返回） */
  ownerNickname?: string | null
  /** 归属客户手机号（/admin/dogs 返回） */
  ownerPhone?: string | null
  birthday: string // ISO 8601 date string
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

/**
 * Dog Calculation Result
 * Aligned with backend DogCalcResultDto
 */
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

/**
 * Dog Detail Response
 */
export interface DogDetailResponse {
  profile: DogProfile
  calcResult: DogCalcResult
}

/**
 * Dog Breed
 */
export interface DogBreed {
  id: string
  name: string
  aliases?: string[]
  sizeCategory: string
  adultAgeMonths: number
  seniorAgeYears: number
  averageAdultWeightKg: number
}

/**
 * Pagination Response
 */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

/**
 * Mixed Breed Virtual ID
 */
export const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Calculate age from birthday
 */
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
