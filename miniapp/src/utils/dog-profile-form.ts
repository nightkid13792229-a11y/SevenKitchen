import {
  DOG_PROFILE_RECOMMENDATION_FIELDS,
} from '../constants/dog-profile'

export function getRecommendationDirtyFields(
  previousForm: Record<string, any>,
  nextForm: Record<string, any>,
) {
  return DOG_PROFILE_RECOMMENDATION_FIELDS.filter(
    field => previousForm[field] !== nextForm[field],
  )
}

export function getCreateStepAvailability(form: Record<string, any>) {
  const basic = Boolean(form.name && form.breedId && form.birthday)
  const feeding = basic
  const recommendation = Boolean(basic && form.currentWeightKg && form.activityLevel)

  return { basic: true, feeding, recommendation, health: recommendation }
}

export function buildDogCreatePayload(form: Record<string, any>) {
  const payload: Record<string, any> = {
    ...form,
    birthday: new Date(form.birthday).toISOString(),
    currentWeightKg: parseFloat(form.currentWeightKg),
    mealsPerDay: parseInt(form.mealsPerDay, 10) || 2,
  }

  if (form.treatInputMode === 'EXACT_KCAL' && form.manualTreatKcal !== '' && form.manualTreatKcal != null) {
    payload.manualTreatKcal = parseFloat(form.manualTreatKcal)
  } else {
    delete payload.manualTreatKcal
  }

  return payload
}
