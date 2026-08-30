/**
 * 食谱设计器 API（Web 端）
 * 对应 backend /api/v1/recipe-designer/*
 */
import api from './index'
import type {
  AiDesignSuggestion,
  AssessmentTarget,
  CreateRecipeSeriesPayload,
  DesignerItem,
  DesignRecipeDraftDetail,
  DogDesignInsight,
  DraftAssessmentInputs,
  FediafDogScenario,
  IngredientOptionListResponse,
  RecipeDesignerIngredientOption,
  RecipeDesignerSeriesCard,
  RecipeDesignerSeriesStatusFilter,
  SupplementLabelExtractionDraft,
  SupplementNutritionBasisType,
  SupplementUsageUnit,
  UpdateDogDesignNotesPayload
} from '@/types/recipeDesigner'

export interface RecipeDesignerSeriesListQuery {
  status?: RecipeDesignerSeriesStatusFilter
}

export interface CreateRecipeSeriesStageDraftPayload {
  scenario: FediafDogScenario
  sourceDraftId?: string
}

export interface CopyRecipeStageItemsPayload {
  sourceDraftId: string
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

export interface IngredientOptionListQuery {
  search?: string
  category?: string
  type?: 'FOOD' | 'SUPPLEMENT'
  nutrientKey?: string
  scenario?: FediafDogScenario
  expressionBasis?: string
  page?: number
  pageSize?: number
}

export interface CreateSupplementOptionPayload {
  name: string
  profileName?: string
  basisType?: SupplementNutritionBasisType
  usageUnit?: SupplementUsageUnit
  servingWeightG?: number
  densityGPerMl?: number
  nutrients: Record<string, number | string | null | undefined>
}

export const recipeDesignerApi = {
  // 系列
  listSeries: (query: RecipeDesignerSeriesListQuery = {}): Promise<RecipeDesignerSeriesCard[]> =>
    api.get('/recipe-designer/series', { params: query }),
  createSeries: (data: CreateRecipeSeriesPayload): Promise<RecipeDesignerSeriesCard> =>
    api.post('/recipe-designer/series', data),
  renameSeries: (seriesId: string, data: { name: string }): Promise<RecipeDesignerSeriesCard> =>
    api.patch(`/recipe-designer/series/${seriesId}`, data),
  deleteSeries: (seriesId: string, data: { confirmName: string; confirmUserVisibleRemoval: boolean }): Promise<void> =>
    api.post(`/recipe-designer/series/${seriesId}/delete`, data),
  duplicateSeries: (seriesId: string): Promise<RecipeDesignerSeriesCard> =>
    api.post(`/recipe-designer/series/${seriesId}/duplicate`),
  duplicateSeriesStage: (seriesId: string, lifeStage: string): Promise<RecipeDesignerSeriesCard> =>
    api.post(`/recipe-designer/series/${seriesId}/stages/${lifeStage}/duplicate`),
  createSeriesStageDraft: (seriesId: string, data: CreateRecipeSeriesStageDraftPayload): Promise<DesignRecipeDraftDetail> =>
    api.post(`/recipe-designer/series/${seriesId}/stage-drafts`, data),
  setReferenceDog: (seriesId: string, referenceDogId: string | null): Promise<unknown> =>
    api.patch(`/recipe-designer/series/${seriesId}/reference-dog`, { referenceDogId }),

  // 草稿
  getDraft: (draftId: string): Promise<DesignRecipeDraftDetail> =>
    api.get(`/recipe-designer/drafts/${draftId}`),
  createRevisionDraft: (draftId: string): Promise<unknown> =>
    api.post(`/recipe-designer/drafts/${draftId}/revisions`),
  revertDraftToLatestOfficial: (draftId: string): Promise<unknown> =>
    api.post(`/recipe-designer/drafts/${draftId}/revert-to-latest-official`),
  copyStageItemsFromDraft: (draftId: string, data: CopyRecipeStageItemsPayload): Promise<unknown> =>
    api.post(`/recipe-designer/drafts/${draftId}/copy-items-from-stage`, data),
  assessDraft: (draftId: string): Promise<unknown> =>
    api.post(`/recipe-designer/drafts/${draftId}/assess`),
  publishDraft: (draftId: string, data?: PublishDesignRecipePayload): Promise<unknown> =>
    api.post(`/recipe-designer/drafts/${draftId}/publish`, data ?? {}),

  // 本地评估输入
  getAssessmentInputs: (draftId: string): Promise<DraftAssessmentInputs> =>
    api.get(`/recipe-designer/drafts/${draftId}/assessment-inputs`),

  // 明细项
  addItem: (draftId: string, data: DesignRecipeItemPayload): Promise<DesignerItem> =>
    api.post(`/recipe-designer/drafts/${draftId}/items`, data),
  updateItem: (itemId: string, data: UpdateDesignRecipeItemPayload): Promise<DesignerItem> =>
    api.patch(`/recipe-designer/items/${itemId}`, data),
  removeItem: (itemId: string): Promise<void> =>
    api.delete(`/recipe-designer/items/${itemId}`),
  batchUpdateItemOrder: (order: Array<{ id: string; sortOrder: number }>): Promise<{ updated: number }> =>
    api.post('/recipe-designer/items/batch-order', { order }),

  // 原料库
  listIngredientOptions: (query: IngredientOptionListQuery = {}): Promise<IngredientOptionListResponse> =>
    api.get('/recipe-designer/ingredient-options', { params: query }),
  listSupplementOptions: (): Promise<RecipeDesignerIngredientOption[]> =>
    api.get('/recipe-designer/ingredient-options', { params: { search: '', pageSize: 200 } })
      .then((res: IngredientOptionListResponse) =>
        (res.supplementData ?? res.data ?? []).filter(
          (option) => String(option.type).toUpperCase() === 'SUPPLEMENT'
        )
      ),

  // 补剂库
  createSupplementOption: (data: CreateSupplementOptionPayload): Promise<unknown> =>
    api.post('/recipe-designer/supplement-options', data),
  extractSupplementLabel: (file: File): Promise<SupplementLabelExtractionDraft> => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/recipe-designer/supplement-label/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  // 爱犬洞察 + AI 建议
  getDogDesignInsight: (dogId: string, recentDays?: number): Promise<DogDesignInsight> =>
    api.get(`/recipe-designer/dogs/${dogId}/design-insight`, {
      params: recentDays ? { recentDays } : undefined,
    }),
  updateDogDesignNotes: (dogId: string, data: UpdateDogDesignNotesPayload): Promise<unknown> =>
    api.patch(`/recipe-designer/dogs/${dogId}/design-notes`, data),
  generateAiSuggestions: (dogId: string, draftId?: string): Promise<AiDesignSuggestion> =>
    api.post(`/recipe-designer/dogs/${dogId}/design-insight/ai-suggest`, { draftId })
}
