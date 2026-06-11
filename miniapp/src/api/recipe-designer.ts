import { request, getToken } from '../utils/api'
import { getBaseUrl } from '../utils/config'

export type FediafDogScenario =
  | 'EARLY_GROWTH_REPRODUCTION'
  | 'REPRODUCTION'
  | 'LATE_GROWTH'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110'

export const FEDIAF_DOG_SCENARIO_LABELS: Record<FediafDogScenario, string> = {
  EARLY_GROWTH_REPRODUCTION: '小于14周龄幼犬',
  REPRODUCTION: '繁殖期母犬',
  LATE_GROWTH: '大于等于14周龄幼犬',
  ADULT_MER_95: '低能量需求成年犬（95ME）',
  ADULT_MER_110: '普通成年犬（110ME）',
}

export const FEDIAF_DOG_SCENARIO_DESCRIPTIONS: Partial<Record<FediafDogScenario, string>> = {
  EARLY_GROWTH_REPRODUCTION: '适用于小于14周龄、仍处于快速生长期的幼犬。',
  LATE_GROWTH: '适用于大于等于14周龄、仍未达到成年体型的幼犬。',
  ADULT_MER_95: '低活动、老年、易胖、控重、室内低运动；不确定时优先选此项。',
  ADULT_MER_110: '体况理想、3-7岁、每日活动约1-3小时、无需控重。',
  REPRODUCTION: '适用于妊娠后期（约第6周至分娩）及哺乳期（分娩至断奶）；不适用于单纯备孕或配种早期。',
}

export interface DesignRecipeDraftPayload {
  name: string
  scenario: FediafDogScenario
  notes?: string
  targetHealthTags?: string[]
  applicableLifeStages?: string[]
}

export type RecipeSeriesStageStatus =
  | 'NOT_DESIGNED'
  | 'DRAFT'
  | 'MODIFIED'
  | 'IN_REVIEW'
  | 'PUBLISHED'
  | 'PRIVATE_CUSTOM'
  | 'NEEDS_CHANGES'

export type RecipeDesignerSeriesStatusFilter = 'DRAFT' | 'PUBLIC' | 'PRIVATE_CUSTOM'

export type RecipeDesignerSeriesStatusCategory =
  | 'NOT_DESIGNED'
  | RecipeDesignerSeriesStatusFilter

export interface RecipeDesignerSeriesStage {
  lifeStage: string
  label: string
  scenario: FediafDogScenario
  status: RecipeSeriesStageStatus
  recipeStatusCategory?: RecipeDesignerSeriesStatusCategory
  draftId?: string
  recipeId?: string
  updatedAt?: string
}

export interface RecipeDesignerSeriesCard {
  id: string
  name: string
  updatedAt?: string
  publishedStageCount: number
  stages: RecipeDesignerSeriesStage[]
}

export interface CreateRecipeSeriesPayload {
  name: string
  scenario?: FediafDogScenario
}

export interface RecipeDesignerSeriesListQuery {
  status?: RecipeDesignerSeriesStatusFilter
}

export interface DeleteRecipeSeriesPayload {
  confirmName: string
  confirmUserVisibleRemoval: boolean
}

export interface CreateRecipeSeriesStageDraftPayload {
  scenario: FediafDogScenario
  sourceDraftId?: string
}

export interface DesignRecipeItemPayload {
  ingredientId?: string
  nutritionFoodId: string
  weightG: number
  preparationMethod?: string
  nutrientTargetKey?: string
  nutrientTargetValue?: number
  sortOrder?: number
  includeInAssessment?: boolean
}

export interface UpdateDesignRecipeItemPayload {
  weightG?: number
  preparationMethod?: string | null
  nutrientTargetKey?: string | null
  nutrientTargetValue?: number | null
  sortOrder?: number
  includeInAssessment?: boolean
}

export interface PublishDesignRecipePayload {
  name?: string
  reviewNote?: string
}

export type SupplementNutritionBasisType =
  | 'PER_1_G'
  | 'PER_100_G'
  | 'PER_1_ML'
  | 'PER_100_ML'
  | 'PER_SERVING'

export type SupplementUsageUnit = 'g' | 'ml' | '粒' | '片' | '胶囊' | '平勺' | '份'

export interface CreateSupplementOptionPayload {
  name: string
  profileName?: string
  basisType?: SupplementNutritionBasisType
  usageUnit?: SupplementUsageUnit
  servingWeightG?: number
  densityGPerMl?: number
  nutrients: Record<string, number | string | null | undefined>
}

export interface SupplementLabelExtractionDraft {
  ingredientName?: string
  name?: string
  profileName?: string
  basisType?: SupplementNutritionBasisType
  usageUnit?: SupplementUsageUnit
  servingWeightG?: number
  densityGPerMl?: number
  nutrients: Record<string, number | string | null | undefined>
  rawIngredientsText?: string
  ocrText?: string
  ocrConfidence?: number
  warnings?: string[]
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  imageUrl?: string
  imageKey?: string
}

export type NutritionFoodStatus = 'PENDING' | 'VERIFIED' | 'DEPRECATED'

export interface NutritionFoodListQuery {
  status?: NutritionFoodStatus
  search?: string
  page?: number
  pageSize?: number
}

export interface NutritionFoodMappingSummary {
  id: string
  ingredientId: string
  isPrimary: boolean
  ingredient?: {
    id: string
    name: string
    type?: string
    unitDisplayLabel?: string | null
    purchaseUnit?: string
    properties?: Record<string, unknown> | null
  }
}

export interface NutritionFoodSummary {
  id: string
  name: string
  nameEn?: string
  category?: string
  dataSource?: string
  status?: NutritionFoodStatus
  mappings?: NutritionFoodMappingSummary[]
}

export interface NutritionFoodListResponse {
  data: NutritionFoodSummary[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface IngredientOptionListQuery {
  search?: string
  nutrientKey?: string
  scenario?: FediafDogScenario
  expressionBasis?: string
  page?: number
  pageSize?: number
}

export interface IngredientNutrientMatch {
  nutrientKey: string
  label: string
  amount: number
  unit: string
  basis: string
  basisLabel: string
  displayText: string
  score?: number
}

export interface IngredientNutritionProfileOption {
  mappingId: string
  nutritionFoodId: string
  name: string
  nameEn?: string | null
  category?: string
  dataSource?: string
  status?: NutritionFoodStatus
  yieldRate?: number
  isPrimary?: boolean
  notes?: string | null
  nutrientMatch?: IngredientNutrientMatch
}

export interface RecipeDesignerIngredientOption {
  id: string
  name: string
  type?: string
  unitDisplayLabel?: string | null
  purchaseUnit?: string
  properties?: Record<string, unknown> | null
  brand?: string | null
  productModel?: string | null
  defaultNutritionFoodId?: string | null
  nutrientMatch?: IngredientNutrientMatch
  nutritionProfiles: IngredientNutritionProfileOption[]
}

export interface IngredientOptionListResponse {
  data: RecipeDesignerIngredientOption[]
  supplementData?: RecipeDesignerIngredientOption[]
  foodData?: RecipeDesignerIngredientOption[]
  supplementTotal?: number
  foodTotal?: number
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export const recipeDesignerApi = {
  listDrafts: () => request({ url: '/recipe-designer/drafts', method: 'GET' }),
  getDraft: (draftId: string) =>
    request({ url: `/recipe-designer/drafts/${draftId}`, method: 'GET' }),
  listSeries: (data: RecipeDesignerSeriesListQuery = {}) =>
    request({ url: '/recipe-designer/series', method: 'GET', data }),
  createSeries: (data: CreateRecipeSeriesPayload) =>
    request({ url: '/recipe-designer/series', method: 'POST', data }),
  renameSeries: (seriesId: string, data: { name: string }) =>
    request({ url: `/recipe-designer/series/${seriesId}`, method: 'PATCH', data }),
  deleteSeries: (seriesId: string, data: DeleteRecipeSeriesPayload) =>
    request({ url: `/recipe-designer/series/${seriesId}`, method: 'DELETE', data }),
  duplicateSeries: (seriesId: string) =>
    request({ url: `/recipe-designer/series/${seriesId}/duplicate`, method: 'POST' }),
  duplicateSeriesStage: (seriesId: string, lifeStage: string) =>
    request({
      url: `/recipe-designer/series/${seriesId}/stages/${lifeStage}/duplicate`,
      method: 'POST',
    }),
  createSeriesStageDraft: (seriesId: string, data: CreateRecipeSeriesStageDraftPayload) =>
    request({ url: `/recipe-designer/series/${seriesId}/stage-drafts`, method: 'POST', data }),
  listIngredientOptions: (data: IngredientOptionListQuery = {}) =>
    request({ url: '/recipe-designer/ingredient-options', method: 'GET', data }),
  listNutritionFoods: (data: NutritionFoodListQuery = {}) =>
    request({ url: '/nutrition-foods', method: 'GET', data }),
  createSupplementOption: (data: CreateSupplementOptionPayload) =>
    request({ url: '/recipe-designer/supplement-options', method: 'POST', data }),
  extractSupplementLabel: (filePath: string): Promise<SupplementLabelExtractionDraft> =>
    new Promise((resolve, reject) => {
      const token = getToken()
      const uploadUrl = `${getBaseUrl()}/recipe-designer/supplement-label/extract`
      uni.uploadFile({
        url: uploadUrl,
        filePath,
        name: 'file',
        header: {
          Authorization: token ? `Bearer ${token}` : '',
          'X-Customer-Id': uni.getStorageSync('userId') || '',
        },
        success: (res) => {
          try {
            const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            resolve((body?.data ?? body) as SupplementLabelExtractionDraft)
          } catch (error) {
            reject(error)
          }
        },
        fail: reject,
      })
    }),
  createDraft: (data: DesignRecipeDraftPayload) =>
    request({ url: '/recipe-designer/drafts', method: 'POST', data }),
  updateDraft: (draftId: string, data: Partial<DesignRecipeDraftPayload>) =>
    request({ url: `/recipe-designer/drafts/${draftId}`, method: 'PATCH', data }),
  deleteDraft: (draftId: string) =>
    request({ url: `/recipe-designer/drafts/${draftId}`, method: 'DELETE' }),
  createRevisionDraft: (draftId: string) =>
    request({ url: `/recipe-designer/drafts/${draftId}/revisions`, method: 'POST' }),
  addItem: (draftId: string, data: DesignRecipeItemPayload) =>
    request({ url: `/recipe-designer/drafts/${draftId}/items`, method: 'POST', data }),
  updateItem: (itemId: string, data: UpdateDesignRecipeItemPayload) =>
    request({ url: `/recipe-designer/items/${itemId}`, method: 'PATCH', data }),
  removeItem: (itemId: string) =>
    request({ url: `/recipe-designer/items/${itemId}`, method: 'DELETE' }),
  assessDraft: (draftId: string) =>
    request({ url: `/recipe-designer/drafts/${draftId}/assess`, method: 'POST' }),
  publishDraft: (draftId: string, data?: PublishDesignRecipePayload) =>
    request({
      url: `/recipe-designer/drafts/${draftId}/publish`,
      method: 'POST',
      ...(data !== undefined ? { data } : {}),
    }),
}
