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

export function getCreateFeedingFieldKeys() {
  return ['bcsScore', 'activityLevel', 'mealsPerDay', 'treatLevel']
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
  return getBcsChoiceOptions()
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
    hasValue(form.bcsScore) &&
    hasValue(form.activityLevel) &&
    hasValidMealsPerDay(form.mealsPerDay) &&
    hasValue(form.treatLevel),
  )
}

export function getCreateTreatChoices() {
  return ['NONE', 'LOW', 'MODERATE', 'HIGH'].map(level => ({
    level,
    label: TREAT_LEVEL_LABELS[level],
  }))
}
