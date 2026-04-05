import {
  DOG_PROFILE_RECOMMENDATION_FIELDS,
} from '../constants/dog-profile'

const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'

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

export function getRecommendationDirtyFields(
  previousForm: Record<string, any>,
  nextForm: Record<string, any>,
) {
  return DOG_PROFILE_RECOMMENDATION_FIELDS.filter(
    field => previousForm[field] !== nextForm[field],
  )
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
