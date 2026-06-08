export interface DogWithId {
  id: string
}

export interface ProfileWeightChangeOptions {
  previousWeightKg?: number | null
  nextWeightKg?: number | null
}

export interface ProfileWeightRecordPayloadOptions {
  recordDate: string
  weightKg: number
  note?: string
}

export interface WeightSyncPromptDecisionOptions {
  currentWeightKg?: number | null
  newWeightKg: number
  recordDate: string
  latestRecordDate?: string | null
}

function isValidWeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function findPreferredDogIndex(dogs: DogWithId[], preferredDogId?: string | null) {
  if (!preferredDogId) {
    return -1
  }

  return dogs.findIndex((dog) => dog.id === preferredDogId)
}

export function getWeightSyncSignalKey(dogId: string) {
  return `dog-weight-sync:${dogId}`
}

export function getWeightSyncValueKey(dogId: string) {
  return `dog-weight-sync-value:${dogId}`
}

export function buildInitialWeightRecordPayload(
  options: ProfileWeightRecordPayloadOptions,
) {
  return {
    recordDate: options.recordDate,
    weightKg: options.weightKg,
    note: options.note?.trim() || '建档初始体重',
    syncedToProfile: true,
  }
}

export function shouldPersistProfileWeightRecord(options: ProfileWeightChangeOptions) {
  const { previousWeightKg, nextWeightKg } = options

  if (!isValidWeight(nextWeightKg)) {
    return false
  }

  if (!isValidWeight(previousWeightKg)) {
    return true
  }

  return Math.abs(previousWeightKg - nextWeightKg) >= 0.001
}

export function buildProfileWeightRecordPayload(options: ProfileWeightRecordPayloadOptions) {
  return {
    recordDate: options.recordDate,
    weightKg: options.weightKg,
    note: options.note?.trim() || '档案体重更新',
    syncedToProfile: true,
  }
}

export function shouldDefaultSyncCurrentWeightRecord(
  options: WeightSyncPromptDecisionOptions,
) {
  const {
    currentWeightKg,
    newWeightKg,
    recordDate,
    latestRecordDate,
  } = options

  if (!isValidWeight(currentWeightKg) || !isValidWeight(newWeightKg)) {
    return false
  }

  if (Math.abs(currentWeightKg - newWeightKg) < 0.001) {
    return false
  }

  if (latestRecordDate && recordDate < latestRecordDate) {
    return false
  }

  return true
}

export function formatWeightRecordDateTick(recordDate: string) {
  if (!recordDate) {
    return ''
  }

  const [year, month, day] = recordDate.split('-').map((part) => parseInt(part, 10))
  if (!month || !day) {
    return recordDate
  }

  return `${month}/${day}`
}

export function formatWeightChangeText(
  currentWeightKg: number,
  previousWeightKg: number,
) {
  if (!isValidWeight(currentWeightKg) || !isValidWeight(previousWeightKg)) {
    return '→'
  }

  const diff = currentWeightKg - previousWeightKg
  if (Math.abs(diff) < 0.001) {
    return '→'
  }

  const percent = (Math.abs(diff) / previousWeightKg) * 100
  const roundedPercent = Math.round(percent * 10) / 10
  const formattedPercent = Number.isInteger(roundedPercent)
    ? String(roundedPercent)
    : roundedPercent.toFixed(1)

  return `${diff > 0 ? '↑' : '↓'}${formattedPercent}%`
}

export function getWeightChartDateTickIndexes(total: number) {
  if (total <= 0) {
    return []
  }

  if (total <= 4) {
    return Array.from({ length: total }, (_, index) => index)
  }

  return [0, Math.floor((total - 1) / 3), Math.floor(((total - 1) * 2) / 3), total - 1]
}
