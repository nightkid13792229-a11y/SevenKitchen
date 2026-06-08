import {
  DOG_PROFILE_CREATE_STEPS,
  type DogProfileCreateStep,
} from '../constants/dog-profile'

const STORAGE_KEY = 'dog_profile_drafts'

type DraftMap = Record<string, any>
type DogProfileDraft = {
  step: DogProfileCreateStep
  form: Record<string, any>
}

function buildKey(customerId: string, scope: string) {
  return `${customerId}:${scope}`
}

function readDraftMap(): DraftMap {
  try {
    const value = uni.getStorageSync(STORAGE_KEY)
    return value && typeof value === 'object' ? value : {}
  } catch (err) {
    console.warn('Failed to read dog profile drafts:', err)
    return {}
  }
}

function writeDraftMap(value: DraftMap) {
  uni.setStorageSync(STORAGE_KEY, value)
}

function normalizeDogProfileDraft(value: any): DogProfileDraft | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const step = typeof value.step === 'string' && DOG_PROFILE_CREATE_STEPS.includes(value.step as DogProfileCreateStep)
    ? value.step as DogProfileCreateStep
    : 'basic'
  const form = value.form && typeof value.form === 'object' && !Array.isArray(value.form)
    ? value.form
    : null

  if (!form) {
    return null
  }

  return {
    step,
    form,
  }
}

export function saveDogProfileDraft(customerId: string, scope: string, value: any) {
  const current = readDraftMap()
  const draft = normalizeDogProfileDraft(value)

  if (!draft) {
    delete current[buildKey(customerId, scope)]
  } else {
    current[buildKey(customerId, scope)] = draft
  }

  writeDraftMap(current)
}

export function loadDogProfileDraft(customerId: string, scope: string) {
  const current = readDraftMap()
  return normalizeDogProfileDraft(current[buildKey(customerId, scope)])
}

export function clearDogProfileDraft(customerId: string, scope: string) {
  const current = readDraftMap()
  delete current[buildKey(customerId, scope)]
  writeDraftMap(current)
}
