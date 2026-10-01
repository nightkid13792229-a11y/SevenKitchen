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
  /** 按主人筛选（后台给食谱选「客户 + 狗狗」时用） */
  ownerId?: string
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
  },

  /* ===== 健康档案（2026-10-01，第八期）=====
     营养师端：独立页面看某只狗的完整健康分析、报告原件、健康标签纠错，
     以及"哪些狗的健康信息最近被改过"。 */

  /** 某只狗的完整健康档案（含 AI 分析、报告原件、健康标签） */
  getHealthOverview: (id: string): Promise<any> => {
    return api.get(`/admin/dogs/${id}/health-overview`)
  },

  /** 修正健康标签：派生标签 − removed + added */
  setHealthTags: (
    id: string,
    data: { added?: string[]; removed?: string[] },
  ): Promise<any> => {
    return api.put(`/admin/dogs/${id}/health-tags`, data)
  },

  /** 最近改过健康记录的狗（带进行中的定制单），用于告知营养师 */
  listHealthUpdates: (days = 7): Promise<any> => {
    return api.get('/admin/dogs/health-updates', { params: { days } })
  }
}

export default dogApi
