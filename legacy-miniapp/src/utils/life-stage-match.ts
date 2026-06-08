export interface BreedForLifeStage {
  id?: string
  adultAgeMonths?: number | null
  seniorAgeYears?: number | null
}

export interface DogForLifeStage {
  name?: string
  birthday?: string | null
  breedId?: string | null
  lifeStageOverride?: string | null
  breed?: BreedForLifeStage | null
}

const LIFE_STAGE_LABELS: Record<string, string> = {
  PUPPY: '幼犬',
  ADULT: '成犬',
  SENIOR: '老年犬',
  PREGNANCY: '妊娠期',
  LACTATION: '哺乳期',
}

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

export function isRecipeLifeStageMatch(
  applicableStages: unknown,
  dogLifeStage: string | null | undefined,
): boolean {
  const normalizedApplicableStages = normalizeLifeStages(applicableStages)
  if (normalizedApplicableStages.length === 0) return true

  const normalizedDogLifeStage = normalizeLifeStage(dogLifeStage)
  if (!normalizedDogLifeStage) return true

  return normalizedApplicableStages.includes(normalizedDogLifeStage)
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
