import {
  DOG_PROFILE_CREATE_STEPS,
  DOG_PROFILE_RECOMMENDATION_FIELDS,
  type DogProfileCreateStep,
} from '../constants/dog-profile'

const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'
const DOG_PROFILE_ENTRY_ROUTE = '/pages/dog-profile-overview/index'
const DOG_PROFILE_CREATE_ROUTE = '/pages/dog-create/index'
const DOG_PROFILE_FEEDING_FIELDS = [
  'currentWeightKg',
  'activityLevel',
  'mealsPerDay',
  'treatInputMode',
  'treatLevel',
] as const

export type DogProfileOverviewTaskStatus = 'complete' | 'stale' | 'pending'

export interface DogProfileOverviewTaskCard {
  key: 'basic' | 'feeding' | 'recommendation' | 'health'
  title: string
  status: DogProfileOverviewTaskStatus
  summary: string
  actionLabel: string
}

export interface DogProfileCreateStepAvailability {
  basic: true
  feeding: boolean
  recommendation: boolean
  health: boolean
}

function hasValue(value: unknown) {
  if (value == null) {
    return false
  }

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  return true
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') {
    return value ?? null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseNonNegativeNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function parseValidWeight(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 && value <= 200 ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 200 ? parsed : null
}

function hasAnyDirtyField(dirtyFields: string[] | undefined, fields: readonly string[]) {
  if (!Array.isArray(dirtyFields) || dirtyFields.length === 0) {
    return false
  }

  return fields.some(field => dirtyFields.includes(field))
}

function formatWeight(value: unknown) {
  if (!hasValue(value)) {
    return ''
  }

  const weight = typeof value === 'number' ? value : parseFloat(String(value))
  if (Number.isNaN(weight)) {
    return ''
  }

  return weight % 1 === 0 ? String(weight) : weight.toFixed(1)
}

function formatCountText(count: number | undefined, noun: string) {
  if (!count || count <= 0) {
    return `暂无${noun}`
  }

  return `已记录 ${count} 条${noun}`
}

export function getRecommendationDirtyFields(
  previousForm: Record<string, any>,
  nextForm: Record<string, any>,
) {
  return DOG_PROFILE_RECOMMENDATION_FIELDS.filter(
    field => previousForm[field] !== nextForm[field],
  )
}

export function getNextCreateStep(step: DogProfileCreateStep) {
  const currentIndex = DOG_PROFILE_CREATE_STEPS.indexOf(step)

  if (currentIndex === -1 || currentIndex === DOG_PROFILE_CREATE_STEPS.length - 1) {
    return step
  }

  return DOG_PROFILE_CREATE_STEPS[currentIndex + 1]
}

export function shouldAutoPreviewRecommendation(dirtyFields: string[] | undefined) {
  return hasAnyDirtyField(dirtyFields, DOG_PROFILE_RECOMMENDATION_FIELDS)
}

export function canAdvanceCreateStep(
  step: DogProfileCreateStep,
  availability: DogProfileCreateStepAvailability,
) {
  if (step === 'basic') {
    return availability.feeding
  }

  if (step === 'feeding') {
    return availability.recommendation
  }

  if (step === 'recommendation') {
    return availability.health
  }

  return availability.health
}

export function resolveDogProfileEntryRoute(dogId?: string) {
  if (!dogId) {
    return DOG_PROFILE_CREATE_ROUTE
  }

  return `${DOG_PROFILE_ENTRY_ROUTE}?dogId=${encodeURIComponent(dogId)}`
}

export function buildOverviewTaskCards({
  profile,
  dirtyFields,
  healthCount,
}: {
  profile: Record<string, any>
  dirtyFields?: string[]
  healthCount: number
}): DogProfileOverviewTaskCard[] {
  const hasBasicInfo = Boolean(
    hasValue(profile?.name) &&
    hasValue(profile?.breedId) &&
    hasValue(profile?.birthday),
  )
  const createStepAvailability = getCreateStepAvailability(profile)
  const needsSizeClassOverride = profile?.breedId === MIXED_BREED_VIRTUAL_ID
  const needsManualTreatKcal = profile?.treatInputMode === 'EXACT_KCAL'
  const hasValidWeight = parseValidWeight(profile?.currentWeightKg) !== null
  const hasValidManualTreatKcal = parseNonNegativeNumber(profile?.manualTreatKcal) !== null
  const feedingReady = Boolean(
    createStepAvailability.feeding &&
    hasValidWeight &&
    hasValue(profile?.activityLevel) &&
    hasValue(profile?.mealsPerDay) &&
    (!needsSizeClassOverride || hasValue(profile?.sizeClassOverride)) &&
    (!needsManualTreatKcal || hasValidManualTreatKcal),
  )
  const recommendationReady = createStepAvailability.recommendation
  const feedingStale = hasAnyDirtyField(dirtyFields, DOG_PROFILE_FEEDING_FIELDS)
  const recommendationStale = hasAnyDirtyField(dirtyFields, DOG_PROFILE_RECOMMENDATION_FIELDS)
  const weightText = formatWeight(profile?.currentWeightKg)

  return [
    {
      key: 'basic',
      title: '基础信息',
      status: hasBasicInfo ? 'complete' : 'pending',
      summary: hasBasicInfo
        ? `${profile?.name || '未命名'} · ${profile?.breedName || '品种未填'}`
        : '补齐姓名、品种和生日后即可继续',
      actionLabel: '去完善',
    },
    {
      key: 'feeding',
      title: '喂食信息',
      status: feedingStale ? 'stale' : (feedingReady ? 'complete' : 'pending'),
      summary: feedingStale
        ? '体重或喂食条件已变化，建议重新确认'
        : feedingReady
          ? `当前体重 ${weightText}kg，喂食条件已可用`
          : '补齐体重、活动量和餐数后生成建议',
      actionLabel: '去调整',
    },
    {
      key: 'recommendation',
      title: '喂食建议',
      status: recommendationStale ? 'stale' : (recommendationReady ? 'complete' : 'pending'),
      summary: recommendationStale
        ? '推荐结果相关字段有更新，建议重新计算'
        : recommendationReady
          ? '已具备生成喂食建议所需信息'
          : '补全推荐字段后即可生成建议',
      actionLabel: '去查看',
    },
    {
      key: 'health',
      title: '健康记录',
      status: healthCount > 0 ? 'complete' : 'pending',
      summary: formatCountText(healthCount, '健康记录'),
      actionLabel: '去补充',
    },
  ]
}

export function getCreateStepAvailability(form: Record<string, any>): DogProfileCreateStepAvailability {
  const basic = Boolean(
    hasValue(form.name) &&
    hasValue(form.breedId) &&
    hasValue(form.birthday),
  )
  const feeding = basic
  const needsSizeClassOverride = form.breedId === MIXED_BREED_VIRTUAL_ID
  const needsManualTreatKcal = form.treatInputMode === 'EXACT_KCAL'
  const hasValidWeight = parseValidWeight(form.currentWeightKg) !== null
  const hasValidManualTreatKcal = parseNonNegativeNumber(form.manualTreatKcal) !== null
  const recommendation = Boolean(
    basic &&
    hasValidWeight &&
    hasValue(form.activityLevel) &&
    (!needsSizeClassOverride || hasValue(form.sizeClassOverride)) &&
    (!needsManualTreatKcal || hasValidManualTreatKcal),
  )

  return { basic: true, feeding, recommendation, health: recommendation }
}

export function buildDogCreatePayload(form: Record<string, any>) {
  const treatInputMode = form.treatInputMode || 'ESTIMATE_LEVEL'
  const payload: Record<string, any> = {
    ...form,
    birthday: new Date(form.birthday).toISOString(),
    currentWeightKg: parseValidWeight(form.currentWeightKg) ?? parseFloat(form.currentWeightKg),
    mealsPerDay: parseInt(form.mealsPerDay, 10) || 2,
    treatInputMode,
    customBreedName: normalizeOptionalText(form.customBreedName),
    allergyFoods: normalizeOptionalText(form.allergyFoods),
    pickyFoods: normalizeOptionalText(form.pickyFoods),
  }

  const manualTreatKcal = parseNonNegativeNumber(form.manualTreatKcal)

  if (treatInputMode === 'EXACT_KCAL' && manualTreatKcal !== null) {
    payload.manualTreatKcal = manualTreatKcal
  } else {
    delete payload.manualTreatKcal
  }

  return payload
}
