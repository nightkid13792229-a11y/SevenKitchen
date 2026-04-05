import {
  DOG_PROFILE_RECOMMENDATION_FIELDS,
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
  const feedingReady = Boolean(
    createStepAvailability.feeding &&
    hasValue(profile?.currentWeightKg) &&
    hasValue(profile?.activityLevel) &&
    hasValue(profile?.mealsPerDay) &&
    (!needsSizeClassOverride || hasValue(profile?.sizeClassOverride)) &&
    (!needsManualTreatKcal || hasValue(profile?.manualTreatKcal)),
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

export function getCreateStepAvailability(form: Record<string, any>) {
  const basic = Boolean(
    hasValue(form.name) &&
    hasValue(form.breedId) &&
    hasValue(form.birthday),
  )
  const feeding = basic
  const needsSizeClassOverride = form.breedId === MIXED_BREED_VIRTUAL_ID
  const needsManualTreatKcal = form.treatInputMode === 'EXACT_KCAL'
  const recommendation = Boolean(
    basic &&
    hasValue(form.currentWeightKg) &&
    hasValue(form.activityLevel) &&
    (!needsSizeClassOverride || hasValue(form.sizeClassOverride)) &&
    (!needsManualTreatKcal || hasValue(form.manualTreatKcal)),
  )

  return { basic: true, feeding, recommendation, health: recommendation }
}

export function buildDogCreatePayload(form: Record<string, any>) {
  const treatInputMode = form.treatInputMode || 'ESTIMATE_LEVEL'
  const payload: Record<string, any> = {
    ...form,
    birthday: new Date(form.birthday).toISOString(),
    currentWeightKg: parseFloat(form.currentWeightKg),
    mealsPerDay: parseInt(form.mealsPerDay, 10) || 2,
    treatInputMode,
    customBreedName: normalizeOptionalText(form.customBreedName),
    allergyFoods: normalizeOptionalText(form.allergyFoods),
    pickyFoods: normalizeOptionalText(form.pickyFoods),
  }

  if (treatInputMode === 'EXACT_KCAL' && hasValue(form.manualTreatKcal)) {
    payload.manualTreatKcal = parseFloat(form.manualTreatKcal)
  } else {
    delete payload.manualTreatKcal
  }

  return payload
}
