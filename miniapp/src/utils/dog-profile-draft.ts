const STORAGE_KEY = 'dog_profile_drafts'

type DraftMap = Record<string, any>

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

export function saveDogProfileDraft(customerId: string, scope: string, value: any) {
  const current = readDraftMap()
  current[buildKey(customerId, scope)] = value
  writeDraftMap(current)
}

export function loadDogProfileDraft(customerId: string, scope: string) {
  const current = readDraftMap()
  return current[buildKey(customerId, scope)] || null
}

export function clearDogProfileDraft(customerId: string, scope: string) {
  const current = readDraftMap()
  delete current[buildKey(customerId, scope)]
  writeDraftMap(current)
}
