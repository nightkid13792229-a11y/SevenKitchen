import {
  DOG_PROFILE_CREATE_STEPS,
  DOG_PROFILE_RECOMMENDATION_FIELDS,
  type DogProfileCreateStep,
} from '../constants/dog-profile'
import {
  isCreateBasicStepReady,
  isCreateFeedingStepReady,
} from './dog-profile-create-view'

const DOG_PROFILE_ENTRY_ROUTE = '/pages/dog-profile-overview/index'
const DOG_PROFILE_CREATE_ROUTE = '/pages/dog-create/index'

export type DogProfileEditSection = 'basic' | 'feeding' | 'health'

export interface DogProfileCreateStepAvailability {
  basic: boolean
  feeding: boolean
  recommendation: boolean
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

function normalizeDate(value: unknown) {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return value
  }

  return new Date(trimmed).toISOString()
}

function normalizeArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function normalizeRequiredText(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function normalizeAttachmentArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
}

function compactPayload(payload: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  )
}

function isBlankHealthField(value: unknown) {
  if (Array.isArray(value)) {
    return value.length === 0
  }

  return !hasValue(value)
}

function isBlankHealthRecord(record: Record<string, any>, keys: string[]) {
  return keys.every(key => isBlankHealthField(record[key]))
}

function normalizeMedicalRecord(record: Record<string, any>) {
  return {
    chiefComplaint: normalizeRequiredText(record?.chiefComplaint),
    visitDate: normalizeOptionalText(record?.visitDate),
    diagnosis: normalizeOptionalText(record?.diagnosis),
    notes: normalizeOptionalText(record?.notes),
    attachments: normalizeAttachmentArray(record?.attachments),
  }
}

function normalizeCheckupRecord(record: Record<string, any>) {
  return {
    checkupType: normalizeRequiredText(record?.checkupType),
    checkupDate: normalizeRequiredText(record?.checkupDate),
    notes: normalizeOptionalText(record?.notes),
    attachments: normalizeAttachmentArray(record?.attachments),
  }
}

function normalizeAllergyRecord(record: Record<string, any>) {
  return {
    allergen: normalizeRequiredText(record?.allergen),
    notes: normalizeOptionalText(record?.notes),
    attachments: normalizeAttachmentArray(record?.attachments),
  }
}

function normalizeHealthRecords(form: Record<string, any>) {
  const medicalRecords = normalizeArray(form.medicalRecords)
    .map(normalizeMedicalRecord)
    .filter(record => !isBlankHealthRecord(record, ['chiefComplaint', 'visitDate', 'diagnosis', 'notes', 'attachments']))
  const checkupRecords = normalizeArray(form.checkupRecords)
    .map(normalizeCheckupRecord)
    .filter(record => !isBlankHealthRecord(record, ['checkupType', 'checkupDate', 'notes', 'attachments']))
  const allergyRecords = normalizeArray(form.allergyRecords)
    .map(normalizeAllergyRecord)
    .filter(record => !isBlankHealthRecord(record, ['allergen', 'notes', 'attachments']))

  return { medicalRecords, checkupRecords, allergyRecords }
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
    return availability.recommendation
  }

  return availability.recommendation
}

export function resolveDogProfileEntryRoute(dogId?: string) {
  if (!dogId) {
    return DOG_PROFILE_CREATE_ROUTE
  }

  return `${DOG_PROFILE_ENTRY_ROUTE}?dogId=${encodeURIComponent(dogId)}`
}

export function getDogCreateLegacyRedirectRoute(dogId?: string) {
  return dogId ? resolveDogProfileEntryRoute(dogId) : ''
}

export function getCreateStepAvailability(form: Record<string, any>): DogProfileCreateStepAvailability {
  const basic = isCreateBasicStepReady(form)
  const feeding = basic
  const feedingParametersReady = isCreateFeedingStepReady(form)
  const needsManualTreatKcal = form.treatInputMode === 'EXACT_KCAL'
  const hasValidManualTreatKcal = parseNonNegativeNumber(form.manualTreatKcal) !== null
  const recommendation = Boolean(
    basic &&
    feedingParametersReady &&
    (!needsManualTreatKcal || hasValidManualTreatKcal),
  )

  return { basic, feeding, recommendation }
}

/**
 * 体况评分 / 活动量的兜底值（2026-09-27，U3）。
 *
 * 建档页不再预选这两项（原先默认 5 分与"低活动"会让顾客无意识地跳过，
 * 数据库里因此分不清"顾客选过"还是"系统填的"）。
 * 但老板决定**不强制阻断**：没选也能建档，用这里的兜底值先算出热量，
 * 同时把"未确认"如实提交上去 —— 定制门槛按确认状态判定，不按有没有值。
 *
 * 兜底值刻意保持与改造前一致，避免悄悄改变已上线建议的热量口径。
 */
export const DEFAULT_BCS_SCORE = 5
export const DEFAULT_ACTIVITY_LEVEL = 'LOW'

export function buildDogCreatePayload(form: Record<string, any>) {
  const treatInputMode = form.treatInputMode || 'ESTIMATE_LEVEL'
  const manualTreatKcal = parseNonNegativeNumber(form.manualTreatKcal)
  const healthRecords = normalizeHealthRecords(form)

  return compactPayload({
    name: normalizeRequiredText(form.name),
    breedId: hasValue(form.breedId) ? form.breedId : undefined,
    customBreedName: normalizeOptionalText(form.customBreedName),
    birthday: normalizeDate(form.birthday),
    currentWeightKg: parseValidWeight(form.currentWeightKg) ?? parseFloat(form.currentWeightKg),
    gender: form.gender,
    isNeutered: Boolean(form.isNeutered),
    lifeStageOverride: hasValue(form.lifeStageOverride) ? form.lifeStageOverride : 'NONE',
    sizeClassOverride: form.sizeClassOverride ?? null,
    bcsScore: parseNonNegativeNumber(form.bcsScore) ?? DEFAULT_BCS_SCORE,
    activityLevel: hasValue(form.activityLevel)
      ? form.activityLevel
      : DEFAULT_ACTIVITY_LEVEL,
    // 顾客是否亲自选过 —— 门槛按这个判定，不是"有没有值"
    bcsScoreConfirmed: Boolean(form.bcsScoreConfirmed),
    activityLevelConfirmed: Boolean(form.activityLevelConfirmed),
    mealsPerDayConfirmed: Boolean(form.mealsPerDayConfirmed),
    mealsPerDay: parseInt(form.mealsPerDay, 10) || 2,
    treatInputMode,
    treatLevel: hasValue(form.treatLevel) ? form.treatLevel : undefined,
    manualTreatKcal:
      treatInputMode === 'EXACT_KCAL'
        ? (manualTreatKcal ?? undefined)
        : undefined,
    ...healthRecords,
    allergyFoods: normalizeOptionalText(form.allergyFoods),
    pickyFoods: normalizeOptionalText(form.pickyFoods),
  })
}

export function getDogHealthValidationError(form: Record<string, any>) {
  const medicalRecords = normalizeArray(form.medicalRecords).map(normalizeMedicalRecord)
  for (let index = 0; index < medicalRecords.length; index += 1) {
    const record = medicalRecords[index]
    if (isBlankHealthRecord(record, ['chiefComplaint', 'visitDate', 'diagnosis', 'notes', 'attachments'])) {
      continue
    }

    if (!record.chiefComplaint) {
      return `请补充第 ${index + 1} 条病史记录的症状或疾病`
    }
  }

  const checkupRecords = normalizeArray(form.checkupRecords).map(normalizeCheckupRecord)
  for (let index = 0; index < checkupRecords.length; index += 1) {
    const record = checkupRecords[index]
    if (isBlankHealthRecord(record, ['checkupType', 'checkupDate', 'notes', 'attachments'])) {
      continue
    }

    if (!record.checkupType) {
      return `请补充第 ${index + 1} 条体检记录的体检类型`
    }

    if (!record.checkupDate) {
      return `请补充第 ${index + 1} 条体检记录的体检日期`
    }
  }

  const allergyRecords = normalizeArray(form.allergyRecords).map(normalizeAllergyRecord)
  for (let index = 0; index < allergyRecords.length; index += 1) {
    const record = allergyRecords[index]
    if (isBlankHealthRecord(record, ['allergen', 'notes', 'attachments'])) {
      continue
    }

    if (!record.allergen) {
      return `请补充第 ${index + 1} 条过敏记录的过敏原`
    }
  }

  return null
}

export function buildDogEditPayload(
  form: Record<string, any>,
  section: DogProfileEditSection,
) {
  if (section === 'basic') {
    const weight = parseValidWeight(form.currentWeightKg)

    return compactPayload({
      name: normalizeRequiredText(form.name),
      breedId: hasValue(form.breedId) ? form.breedId : undefined,
      customBreedName: normalizeOptionalText(form.customBreedName),
      birthday: normalizeDate(form.birthday),
      currentWeightKg: weight ?? undefined,
      gender: form.gender,
      isNeutered: typeof form.isNeutered === 'boolean' ? form.isNeutered : undefined,
      sizeClassOverride: form.sizeClassOverride ?? null,
    })
  }

  if (section === 'feeding') {
    const treatInputMode = form.treatInputMode || 'ESTIMATE_LEVEL'
    const bcsScore = parseNonNegativeNumber(form.bcsScore)
    const manualTreatKcal = parseNonNegativeNumber(form.manualTreatKcal)

    return compactPayload({
      bcsScore: bcsScore ?? undefined,
      activityLevel: hasValue(form.activityLevel) ? form.activityLevel : undefined,
      // 顾客在概览页点了这两项，也算确认过（只认 true，不会清掉已有确认）
      ...(form.bcsScoreConfirmed ? { bcsScoreConfirmed: true } : {}),
      ...(form.activityLevelConfirmed ? { activityLevelConfirmed: true } : {}),
      ...(form.mealsPerDayConfirmed ? { mealsPerDayConfirmed: true } : {}),
      sizeClassOverride: form.sizeClassOverride ?? null,
      mealsPerDay: parseInt(form.mealsPerDay, 10) || 2,
      treatInputMode,
      treatLevel: hasValue(form.treatLevel) ? form.treatLevel : undefined,
      manualTreatKcal: treatInputMode === 'EXACT_KCAL'
        ? (manualTreatKcal ?? undefined)
        : null,
    })
  }

  const healthRecords = normalizeHealthRecords(form)

  return {
    ...healthRecords,
    allergyFoods: normalizeOptionalText(form.allergyFoods),
    pickyFoods: normalizeOptionalText(form.pickyFoods),
  }
}
