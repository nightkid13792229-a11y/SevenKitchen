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
/**
 * 零食档位（2026-09-27 由 4 档精简为 3 档）。
 *
 * 老板意见：「较少 / 适中 / 较多」三档对顾客来说决策成本偏高。
 * 生产真实分布也支持精简：较少 2996 / 适中 1118 / 不给 272 / 较多 162 ——
 * 中间那一档（适中）最不容易区分，故去掉。
 * 保留「不给」是因为确实有顾客完全不给零食，且它的预留比例是 0%。
 * 历史数据里已是 MODERATE 的档案不会被改写（见建档页的展示映射）。
 */
const TREAT_LEVEL_CHOICES = ['NONE', 'LOW', 'HIGH'] as const

const ACTIVITY_LEVEL_CHOICES = [
  {
    value: 'RESTING',
    label: '休息静养',
    description: '几乎不运动，主要时间在休息，或遵医嘱控量',
  },
  {
    value: 'LOW',
    label: '城市日常',
    description: '每天主要在小区遛 1-2 次，合计约 30-45 分钟 —— 多数城市犬属于这一档',
  },
  {
    value: 'NORMAL',
    label: '规律运动',
    description: '每天有稳定的主动运动，合计约 1 小时（例如固定的跑步、丢球）',
  },
  {
    value: 'HIGH',
    label: '高活动',
    description: '每天运动 2-4 小时，经常跑步、游泳或长时间玩耍',
  },
  {
    value: 'WORKING',
    label: '工作犬',
    description: '有实际工作任务或高强度训练（如护卫、搜救、竞赛）',
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
    return 'LOW'
  }

  return VALID_ACTIVITY_LEVELS.has(value as (typeof ACTIVITY_LEVEL_CHOICES)[number]['value'])
    ? value
    : 'LOW'
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
    // 2026-09-27：性别与绝育改为必填。
    // 注意 hasValue(false) 为真，所以绝育必须用 typeof 判断 ——
    // 否则 `false`（未绝育）会被当成"没选"，或反过来像以前那样永远通过。
    hasValue(form.gender) &&
    (form.isNeutered === true || form.isNeutered === false) &&
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
  }))
}

export function resolveCreateDraftStep(step: string, form: Record<string, any>) {
  if (!isCreateBasicStepReady(form)) {
    return 'basic'
  }

  if (!isCreateFeedingStepReady(form)) {
    return 'feeding'
  }

  // 旧草稿兼容：`health` 是 2026-09-27 短暂存在过、随后被老板删除的建档步骤。
  // 删步之后落到这里会一路掉回 'basic' —— 顾客明明填完了却被要求重填第 1 步。
  // 喂食信息已就绪，就直接恢复到结果页（原健康信息步骤的下一步）。
  if (step === 'health' || step === 'recommendation') {
    return 'recommendation'
  }

  if (step === 'feeding') {
    return 'feeding'
  }

  return 'basic'
}
