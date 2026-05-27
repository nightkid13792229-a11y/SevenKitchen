export interface BreedForLifeStage {
  id?: string
  adultAgeMonths?: number | null
  seniorAgeYears?: number | null
}

export interface DogForLifeStage {
  name?: string
  birthday?: string | null
  breedId?: string | null
  activityLevel?: string | null
  lifeStageOverride?: string | null
  breed?: BreedForLifeStage | null
}

const LIFE_STAGE_LABELS: Record<string, string> = {
  PUPPY_UNDER_14_WEEKS: '小于14周幼犬',
  PUPPY_14_WEEKS_PLUS: '大于等于14周幼犬',
  LOW_ACTIVITY_ADULT_OR_SENIOR: '低运动量成犬或老年犬',
  HIGH_ACTIVITY_ADULT: '普通或高运动量成犬',
  REPRODUCTION: '繁殖期',
  PUPPY: '幼犬',
  ADULT: '成犬',
  SENIOR: '老年犬',
  PREGNANCY: '妊娠期',
  LACTATION: '哺乳期',
}

const COMPATIBLE_RECIPE_STAGES_BY_DOG_STAGE: Record<string, string[]> = {
  PUPPY: ['PUPPY', 'PUPPY_UNDER_14_WEEKS', 'PUPPY_14_WEEKS_PLUS'],
  ADULT: ['ADULT', 'LOW_ACTIVITY_ADULT_OR_SENIOR', 'HIGH_ACTIVITY_ADULT'],
  SENIOR: ['SENIOR', 'LOW_ACTIVITY_ADULT_OR_SENIOR'],
  PREGNANCY: ['PREGNANCY', 'REPRODUCTION'],
  LACTATION: ['LACTATION', 'REPRODUCTION'],
  PUPPY_UNDER_14_WEEKS: ['PUPPY_UNDER_14_WEEKS', 'PUPPY'],
  PUPPY_14_WEEKS_PLUS: ['PUPPY_14_WEEKS_PLUS', 'PUPPY'],
  LOW_ACTIVITY_ADULT_OR_SENIOR: [
    'LOW_ACTIVITY_ADULT_OR_SENIOR',
    'ADULT',
    'SENIOR',
  ],
  HIGH_ACTIVITY_ADULT: ['HIGH_ACTIVITY_ADULT', 'ADULT'],
  REPRODUCTION: ['REPRODUCTION', 'PREGNANCY', 'LACTATION'],
}

const PUPPY_UNDER_14_WEEKS_DAYS = 14 * 7
const LOW_ACTIVITY_LEVELS = new Set(['RESTING', 'LOW'])

export function normalizeLifeStage(stage: unknown): string {
  return typeof stage === 'string' ? stage.trim().toUpperCase() : ''
}

export function normalizeLifeStages(stages: unknown): string[] {
  if (!Array.isArray(stages)) return []
  return stages
    .map(stage => normalizeLifeStage(stage))
    .filter((stage): stage is string => Boolean(stage))
}

export function getLifeStageLabel(stage: string | null | undefined): string {
  const normalizedStage = normalizeLifeStage(stage)
  if (!normalizedStage) return '未知'
  return LIFE_STAGE_LABELS[normalizedStage] || normalizedStage
}

export function formatLifeStageList(stages: unknown): string {
  return normalizeLifeStages(stages)
    .map(stage => getLifeStageLabel(stage))
    .join('、')
}

export function resolveDogLifeStage(
  dog: DogForLifeStage | null | undefined,
  breeds: BreedForLifeStage[],
  now = new Date(),
): string | null {
  if (!dog) return null

  const overrideStage = normalizeLifeStage(dog.lifeStageOverride)
  if (overrideStage && overrideStage !== 'NONE') {
    return overrideStage
  }

  if (!dog.birthday) return null

  const birthday = new Date(dog.birthday)
  if (Number.isNaN(birthday.getTime())) return null

  const breed = breeds.find(item => item.id === dog.breedId) || dog.breed
  const adultAgeMonths = Number(breed?.adultAgeMonths)
  if (!Number.isFinite(adultAgeMonths) || adultAgeMonths <= 0) {
    return null
  }

  const seniorAgeYears = Number(breed?.seniorAgeYears || 7)
  const ageInDays = Math.floor((now.getTime() - birthday.getTime()) / (1000 * 60 * 60 * 24))
  const ageInMonths = Math.floor(ageInDays / 30.4375)
  const ageInYears = ageInMonths / 12

  if (ageInMonths < adultAgeMonths) return 'PUPPY'
  if (ageInYears >= seniorAgeYears) return 'SENIOR'
  return 'ADULT'
}

export function resolveDogRecipeLifeStage(
  dog: DogForLifeStage | null | undefined,
  breeds: BreedForLifeStage[],
  now = new Date(),
): string | null {
  if (!dog) return null

  const overrideStage = normalizeLifeStage(dog.lifeStageOverride)
  if (overrideStage === 'PREGNANCY' || overrideStage === 'LACTATION') {
    return 'REPRODUCTION'
  }

  const birthday = parseDogBirthday(dog.birthday)
  if (!birthday) {
    return resolveRecipeLifeStageFromManualOverride(overrideStage, dog)
  }

  const ageInDays = calculateAgeInDays(birthday, now)
  if (ageInDays < 0) return null
  if (ageInDays < PUPPY_UNDER_14_WEEKS_DAYS) {
    return 'PUPPY_UNDER_14_WEEKS'
  }

  const breed = breeds.find(item => item.id === dog.breedId) || dog.breed
  const adultAgeMonths = Number(breed?.adultAgeMonths)
  if (!Number.isFinite(adultAgeMonths) || adultAgeMonths <= 0) {
    return resolveRecipeLifeStageFromManualOverride(overrideStage, dog)
  }

  const ageInMonths = Math.floor(ageInDays / 30.4375)
  if (ageInMonths < adultAgeMonths || overrideStage === 'PUPPY') {
    return 'PUPPY_14_WEEKS_PLUS'
  }

  if (overrideStage === 'SENIOR') {
    return 'LOW_ACTIVITY_ADULT_OR_SENIOR'
  }

  const seniorAgeYears = Number(breed?.seniorAgeYears || 7)
  const ageInYears = ageInMonths / 12
  if (Number.isFinite(seniorAgeYears) && ageInYears >= seniorAgeYears) {
    return 'LOW_ACTIVITY_ADULT_OR_SENIOR'
  }

  return resolveAdultRecipeLifeStageFromActivity(dog.activityLevel)
}

function resolveRecipeLifeStageFromManualOverride(
  overrideStage: string,
  dog: DogForLifeStage,
): string | null {
  if (overrideStage === 'PUPPY') return 'PUPPY_14_WEEKS_PLUS'
  if (overrideStage === 'SENIOR') return 'LOW_ACTIVITY_ADULT_OR_SENIOR'
  if (overrideStage === 'ADULT') {
    return resolveAdultRecipeLifeStageFromActivity(dog.activityLevel)
  }
  return null
}

function resolveAdultRecipeLifeStageFromActivity(activityLevel: unknown) {
  const normalizedActivityLevel =
    typeof activityLevel === 'string' ? activityLevel.trim().toUpperCase() : ''

  return LOW_ACTIVITY_LEVELS.has(normalizedActivityLevel)
    ? 'LOW_ACTIVITY_ADULT_OR_SENIOR'
    : 'HIGH_ACTIVITY_ADULT'
}

function parseDogBirthday(birthday: string | null | undefined): Date | null {
  if (!birthday) return null
  const parsed = new Date(birthday)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function calculateAgeInDays(birthday: Date, now: Date) {
  return Math.floor((now.getTime() - birthday.getTime()) / (1000 * 60 * 60 * 24))
}

export function isRecipeLifeStageMatch(
  applicableStages: unknown,
  dogLifeStage: string | null | undefined,
): boolean {
  const normalizedApplicableStages = normalizeLifeStages(applicableStages)
  if (normalizedApplicableStages.length === 0) return true

  const normalizedDogLifeStage = normalizeLifeStage(dogLifeStage)
  if (!normalizedDogLifeStage) return true

  const compatibleStages =
    COMPATIBLE_RECIPE_STAGES_BY_DOG_STAGE[normalizedDogLifeStage] || [
      normalizedDogLifeStage,
    ]

  return compatibleStages.some(stage => normalizedApplicableStages.includes(stage))
}

export function buildLifeStageReminderText(options: {
  applicableStages: unknown
  dogLifeStage: string | null | undefined
  dogName?: string
}): string {
  const stageListText = formatLifeStageList(options.applicableStages)
  const dogName = options.dogName || '当前狗狗'
  const dogLifeStageText = getLifeStageLabel(options.dogLifeStage)

  if (!stageListText) {
    return `该食谱尚未配置适用生命阶段。当前选择的狗狗「${dogName}」为${dogLifeStageText}，建议确认后再继续。`
  }

  return `该食谱适用于：${stageListText}。当前选择的狗狗「${dogName}」为${dogLifeStageText}，建议确认后再继续。`
}
