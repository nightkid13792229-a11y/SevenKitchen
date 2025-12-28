/**
 * Dog Profile API
 * Admin web interface for dog profile management
 */

import api from './index'
import type {
  DogProfile,
  DogDetailResponse,
  DogCalcResult,
  DogBreed,
  PaginatedResponse
} from '@/types/dog'
import type { ActivityLevel, LifeStageOverride, DogSizeCategory, TreatInputMode, TreatLevel, DogGender } from '@/types/dog'

/**
 * Dog List Query Parameters
 */
export interface DogListParams {
  page?: number
  pageSize?: number
  search?: string
  breedId?: string
}

/**
 * Create Dog DTO
 */
export interface CreateDogDto {
  ownerId: string
  name: string
  breedId: string
  customBreedName?: string | null
  birthday: string
  gender: DogGender
  isNeutered: boolean
  currentWeightKg: number
  bcsScore: number
  activityLevel: ActivityLevel
  lifeStageOverride: LifeStageOverride
  sizeClassOverride?: DogSizeCategory | null
  mealsPerDay?: number
  treatInputMode?: TreatInputMode
  treatLevel?: TreatLevel
  manualTreatKcal?: number | null
  medicalHistory?: string | null
  allergyFoods?: string | null
  pickyFoods?: string | null
}

/**
 * Update Dog DTO
 */
export interface UpdateDogDto {
  name?: string
  currentWeightKg?: number
  bcsScore?: number
  activityLevel?: ActivityLevel
  lifeStageOverride?: LifeStageOverride
  sizeClassOverride?: DogSizeCategory | null
  mealsPerDay?: number
  treatInputMode?: TreatInputMode
  treatLevel?: TreatLevel
  manualTreatKcal?: number | null
  medicalHistory?: string | null
  allergyFoods?: string | null
  pickyFoods?: string | null
}

/**
 * Calc Preview DTO
 */
export interface CalcPreviewDto {
  breedId: string
  birthday: string
  gender: DogGender
  isNeutered: boolean
  currentWeightKg: number
  bcsScore: number
  activityLevel: ActivityLevel
  lifeStageOverride: LifeStageOverride
  sizeClassOverride?: DogSizeCategory | null
  mealsPerDay?: number
  treatInputMode?: TreatInputMode
  treatLevel?: TreatLevel
  manualTreatKcal?: number | null
}

/**
 * Dog API
 */
export const dogApi = {
  /**
   * Get all dog profiles (admin - cross customer)
   */
  list: (params: DogListParams = {}): Promise<PaginatedResponse<DogProfile>> => {
    return api.get('/admin/dogs', { params })
  },

  /**
   * Get dog profile detail
   */
  getDetail: (id: string): Promise<DogDetailResponse> => {
    return api.get(`/admin/dogs/${id}`)
  },

  /**
   * Create dog profile (uses customer API with auth header)
   */
  create: (data: CreateDogDto): Promise<DogDetailResponse> => {
    return api.post('/dogs', data)
  },

  /**
   * Update dog profile
   */
  update: (id: string, data: UpdateDogDto): Promise<DogDetailResponse> => {
    return api.put(`/dogs/${id}`, data)
  },

  /**
   * Get all dog breeds
   */
  getBreeds: (): Promise<DogBreed[]> => {
    return api.get('/dogs/breeds')
  },

  /**
   * Calculate energy preview (dry-run, no database save)
   */
  calcPreview: (data: CalcPreviewDto): Promise<DogCalcResult> => {
    return api.post('/dogs/calc-preview', data)
  },

  /**
   * Delete dog profile (admin only)
   */
  delete: (id: string): Promise<void> => {
    return api.delete(`/admin/dogs/${id}`)
  }
}

export default dogApi
