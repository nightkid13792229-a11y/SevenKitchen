import {
  getBcsChoiceOptions,
  getFeedingImpactExplanation,
} from './dog-profile-overview'

const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'
const TREAT_LEVEL_LABELS: Record<string, string> = {
  NONE: '不给零食',
  LOW: '较少零食',
  MODERATE: '适中零食',
  HIGH: '较多零食',
}
const TREAT_LEVEL_CHOICES = ['NONE', 'LOW', 'MODERATE', 'HIGH'] as const

const ACTIVITY_LEVEL_CHOICES = [
  {
    value: 'RESTING',
    label: '休息',
    description: '几乎不运动，主要时间休息',
  },
  {
    value: 'LOW',
    label: '低活动',
    description: '偶尔散步，每日运动少于30分钟',
  },
  {
    value: 'NORMAL',
    label: '正常活动',
    description: '每日散步1-2小时，正常活动量',
  },
  {
    value: 'HIGH',
    label: '高活动',
    description: '每日运动2-4小时，经常跑步或玩耍',
  },
  {
    value: 'WORKING',
    label: '工作犬',
    description: '高强度训练或工作犬场景',
  },
] as const

const MEAL_CHOICES = ['1', '2', '3', '4', '5'] as const
const VALID_ACTIVITY_LEVELS = new Set(ACTIVITY_LEVEL_CHOICES.map(option => option.value))
const VALID_MEAL_CHOICES = new Set(MEAL_CHOICES)
const VALID_TREAT_LEVELS = new Set(TREAT_LEVEL_CHOICES)
const VALID_BCS_SCORES = new Set(getBcsChoiceOptions().map(option => option.value))
const CREATE_GENDER_CHOICES = [
  { value: 'MALE', label: '弟弟', symbol: '♂' },
  { value: 'FEMALE', label: '妹妹', symbol: '♀' },
] as const

export function getCreateBasicFieldKeys() {
  return [
    'name',
    'gender',
    'birthday',
    'currentWeightKg',
    'breedId',
    'customBreedName',
    'sizeClassOverride',
    'isNeutered',
  ]
}

export function getCreateAvatarPlaceholder() {
  return '🐶'
}

export function getCreateGenderChoices() {
  return [...CREATE_GENDER_CHOICES]
}

export function getCreateNeuterHint() {
  return '是否绝育会影响小家伙的热量评估。'
}

export function getCreateManualBreedLabels() {
  return {
    nameTitle: '填写品种名称',
    sizeTitle: '选择成年后体型',
    sizeHint: '无法预估成年体型建议选【中型犬】',
  }
}

export function getCreateMixedBreedSizeHint(hasSelectedSize: boolean) {
  return hasSelectedSize ? '' : '请选择成年后的体型'
}

export function shouldShowCreateMixedBreedSizeSummary(
  isMixedBreed: boolean,
  hasSelectedSize: boolean,
) {
  return isMixedBreed && hasSelectedSize
}

export function getCreateFeedingFieldKeys() {
  return ['bcsScore', 'activityLevel', 'mealsPerDay', 'treatLevel']
}

export function getCreateActivityChoices() {
  return [...ACTIVITY_LEVEL_CHOICES]
}

export function getCreateMealChoices() {
  return MEAL_CHOICES.map(value => ({
    value,
    label: `${value} 餐/天`,
  }))
}

export function normalizeCreateBcsScore(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return VALID_BCS_SCORES.has(parsed) ? parsed : 5
}

function isValidCreateBcsScore(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return VALID_BCS_SCORES.has(parsed)
}

export function normalizeCreateActivityLevel(value: unknown) {
  if (typeof value !== 'string') {
    return 'NORMAL'
  }

  return VALID_ACTIVITY_LEVELS.has(value as (typeof ACTIVITY_LEVEL_CHOICES)[number]['value'])
    ? value
    : 'NORMAL'
}

function isValidCreateActivityLevel(value: unknown) {
  return typeof value === 'string'
    && VALID_ACTIVITY_LEVELS.has(value as (typeof ACTIVITY_LEVEL_CHOICES)[number]['value'])
}

export function normalizeCreateMealsPerDay(value: unknown) {
  if (typeof value === 'number') {
    const normalized = String(value)
    return VALID_MEAL_CHOICES.has(normalized as (typeof MEAL_CHOICES)[number]) ? normalized : '2'
  }

  if (typeof value !== 'string') {
    return '2'
  }

  const trimmed = value.trim()
  return VALID_MEAL_CHOICES.has(trimmed as (typeof MEAL_CHOICES)[number]) ? trimmed : '2'
}

function isValidCreateMealsPerDay(value: unknown) {
  if (typeof value === 'number') {
    return VALID_MEAL_CHOICES.has(String(value) as (typeof MEAL_CHOICES)[number])
  }

  if (typeof value !== 'string') {
    return false
  }

  return VALID_MEAL_CHOICES.has(value.trim() as (typeof MEAL_CHOICES)[number])
}

export function normalizeCreateTreatLevel(value: unknown) {
  if (typeof value !== 'string') {
    return 'LOW'
  }

  return VALID_TREAT_LEVELS.has(value as (typeof TREAT_LEVEL_CHOICES)[number]) ? value : 'LOW'
}

function isValidCreateTreatLevel(value: unknown) {
  return typeof value === 'string'
    && VALID_TREAT_LEVELS.has(value as (typeof TREAT_LEVEL_CHOICES)[number])
}

export function shouldShowCreateWeightManagementEntry() {
  return false
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

function hasValidWeight(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 && value <= 200
  }

  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 200
}

function hasValidMealsPerDay(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0
  }

  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0
}

export function getCreateBcsOptions() {
  return getBcsChoiceOptions().map(option => ({
    value: option.value,
    label: option.label,
    status: option.status,
  }))
}

export function getCreateBcsToneClass(value: unknown) {
  return `bcs-choice-card--score-${normalizeCreateBcsScore(value)}`
}

export function getCreateFeedingImpact(type: 'bcs' | 'activity' | 'treat') {
  return getFeedingImpactExplanation(type)
}

export function isCreateBasicStepReady(form: Record<string, any>) {
  const needsSizeClassOverride = form.breedId === MIXED_BREED_VIRTUAL_ID

  return Boolean(
    hasValue(form.name) &&
    hasValue(form.breedId) &&
    hasValue(form.birthday) &&
    hasValidWeight(form.currentWeightKg) &&
    hasValue(form.isNeutered) &&
    (!needsSizeClassOverride || hasValue(form.sizeClassOverride)),
  )
}

export function isCreateFeedingStepReady(form: Record<string, any>) {
  return Boolean(
    isValidCreateBcsScore(form.bcsScore) &&
    isValidCreateActivityLevel(form.activityLevel) &&
    hasValidMealsPerDay(form.mealsPerDay) &&
    isValidCreateMealsPerDay(form.mealsPerDay) &&
    isValidCreateTreatLevel(form.treatLevel),
  )
}

export function getCreateTreatChoices() {
  return TREAT_LEVEL_CHOICES.map(level => ({
    level,
    label: TREAT_LEVEL_LABELS[level],
    description: {
      NONE: '不为零食额外预留热量，全部热量用于主食',
      LOW: '用于预留少量零食的热量，剔除零食热量后再计算主食热量',
      MODERATE: '用于预留适中零食的热量，剔除零食热量后再计算主食热量',
      HIGH: '用于预留较多零食的热量，剔除零食热量后再计算主食热量',
    }[level],
  }))
}

export function resolveCreateDraftStep(step: string, form: Record<string, any>) {
  if (!isCreateBasicStepReady(form)) {
    return 'basic'
  }

  if (!isCreateFeedingStepReady(form)) {
    return 'feeding'
  }

  if (step === 'health' || step === 'recommendation') {
    return 'recommendation'
  }

  if (step === 'feeding') {
    return 'feeding'
  }

  return 'basic'
}
