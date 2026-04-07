import {
  getBcsChoiceOptions,
  getFeedingImpactExplanation,
} from './dog-profile-overview'

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

export function getCreateBcsOptions() {
  return getBcsChoiceOptions()
}

export function getCreateFeedingImpact(type: 'bcs' | 'activity' | 'treat') {
  return getFeedingImpactExplanation(type)
}

export function getCreateTreatChoices() {
  return ['NONE', 'LOW', 'MODERATE', 'HIGH'].map(level => ({
    level,
    label: TREAT_LEVEL_LABELS[level],
  }))
}
