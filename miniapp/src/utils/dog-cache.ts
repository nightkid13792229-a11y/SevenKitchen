// utils/dog-cache.ts
// MVP: Local cache for dog profiles when GET /dogs endpoint is missing
// This allows the dog list to show newly created dogs immediately

const STORAGE_KEY = 'dogs_cache'

export interface DogDto {
  id: string
  name: string
  currentWeightKg?: number
  breedId?: string
  birthday?: string
  gender?: string
  isNeutered?: boolean
  bcsScore?: number
  activityLevel?: string
  lifeStageOverride?: string
  mealsPerDay?: number
  treatInputMode?: string
  treatLevel?: string
  manualTreatKcal?: number
  medicalHistory?: string
  allergyFoods?: string
  pickyFoods?: string
  [key: string]: any // Allow additional fields from backend
}

/**
 * Get cached dogs from storage
 * Returns empty array if cache doesn't exist or is invalid
 */
export function getCachedDogs(): DogDto[] {
  try {
    const cached = uni.getStorageSync(STORAGE_KEY)
    if (Array.isArray(cached)) {
      return cached
    }
  } catch (err) {
    console.warn('Failed to read dogs cache from storage:', err)
  }
  return []
}

/**
 * Add a dog to cache (prepend, de-duplicate by id)
 * If dog with same id exists, it's replaced
 */
export function addDogToCache(dog: DogDto): void {
  if (!dog || !dog.id) {
    console.warn('Cannot add invalid dog to cache:', dog)
    return
  }

  try {
    const cached = getCachedDogs()
    
    // Remove existing dog with same id (de-duplicate)
    const filtered = cached.filter(d => d.id !== dog.id)
    
    // Prepend new dog to the beginning
    const updated = [dog, ...filtered]
    
    uni.setStorageSync(STORAGE_KEY, updated)
    console.info(`[DogCache] Added dog ${dog.id} (${dog.name}) to cache. Cache size: ${updated.length}`)
  } catch (err) {
    console.error('Failed to add dog to cache:', err)
  }
}

/**
 * Set the entire dogs cache (replace all)
 * Used when backend returns a full list
 */
export function setCachedDogs(dogs: DogDto[]): void {
  if (!Array.isArray(dogs)) {
    console.warn('Cannot set cache with non-array:', dogs)
    return
  }

  try {
    uni.setStorageSync(STORAGE_KEY, dogs)
    console.info(`[DogCache] Set cache with ${dogs.length} dogs`)
  } catch (err) {
    console.error('Failed to set dogs cache:', err)
  }
}

/**
 * Clear the dogs cache
 */
export function removeDogFromCache(dogId: string): void {
  if (!dogId) return

  try {
    const cached = getCachedDogs()
    const filtered = cached.filter(d => d.id !== dogId)
    uni.setStorageSync(STORAGE_KEY, filtered)
    console.info(`[DogCache] Removed dog ${dogId} from cache. Cache size: ${filtered.length}`)
  } catch (err) {
    console.error('Failed to remove dog from cache:', err)
  }
}

export function clearDogsCache(): void {
  try {
    uni.removeStorageSync(STORAGE_KEY)
    console.info('[DogCache] Cache cleared')
  } catch (err) {
    console.error('Failed to clear dogs cache:', err)
  }
}

/**
 * Get a cached dog by id
 * Returns null if the cache is missing or the dog is not found
 */
export function getCachedDogById(dogId: string): DogDto | null {
  if (!dogId) {
    return null
  }

  return getCachedDogs().find(dog => dog.id === dogId) || null
}
