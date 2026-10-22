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
  DesignRecipeProductionStepsResult,
  DogDesignInsight,
  DraftAssessmentInputs,
  DraftLaunchReadiness,
  DraftNutritionReportEnvelope,
  DraftPresentationSnapshot,
  FediafDogScenario,
  IngredientOptionListResponse,
  IngredientRecommendationResult,
  NutritionPlanResult,
  RecipeAiDesignData,
  RecipeDesignerIngredientOption,
  RecipeDesignerSeriesCard,
  RecipeDesignerSeriesStatusFilter,
  RecipeReviewResult,
  SopResult,
  SupplementLabelExtractionDraft,
  SupplementNutritionBasisType,
  SupplementUsageUnit,
  UpdateDesignRecipeDraftPayload,
  UpdateDesignRecipeProductionStepsPayload,
  UpdateDogDesignNotesPayload,
  UpdateDraftPresentationPayload
} from '@/types/recipeDesigner'

export interface RecipeDesignerSeriesListQuery {
  status?: RecipeDesignerSeriesStatusFilter
  designMode?: 'CATALOG' | 'ORDER'
  search?: string
  page?: number
  pageSize?: number
}

export interface RecipeDesignerSeriesListResult {
  items: RecipeDesignerSeriesCard[]
  page: number
  pageSize: number
  hasMore: boolean
}

export interface CreateRecipeSeriesStageDraftPayload {
  scenario: FediafDogScenario
  sourceDraftId?: string
}

export interface CopyRecipeSeriesStageIngredientsPayload {
  sourceLifeStage: string
}

/** 补剂目标营养素写入定义（一个目标只对应一个 fieldPath） */
export interface RecipeDesignSupplementTargetPayload {
  fieldPath: string
  label?: string
  unit?: string
  /** 计算缓存；服务端始终按当前配方重新计算，不信任客户端值 */
  targetValuePerKg?: number
}

export interface DesignRecipeItemPayload {
  ingredientId?: string
  nutritionFoodId: string
  weightG: number
  preparationMethod?: string
  preparationNote?: string | null
  preparationSource?: 'AUTO' | 'MANUAL' | null
  nutrientTargetKey?: string
  nutrientTargetValue?: number
  /** 补剂目标营养素；补剂不传且档案没有默认目标时后端会 400 */
  supplementTargets?: RecipeDesignSupplementTargetPayload[]
  sortOrder?: number
  includeInAssessment?: boolean
}

export interface UpdateDesignRecipeItemPayload {
  weightG?: number
  preparationMethod?: string | null
  preparationNote?: string | null
  preparationSource?: 'AUTO' | 'MANUAL' | null
  nutrientTargetKey?: string | null
  nutrientTargetValue?: number | null
  supplementTargets?: RecipeDesignSupplementTargetPayload[]
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
  listSeries: (query: RecipeDesignerSeriesListQuery = {}): Promise<RecipeDesignerSeriesListResult> =>
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
  /**
   * 更新草稿基础字段（适用生命阶段 / 目标健康标签等）。
   *
   * 适用生命阶段与目标健康标签不在产品展示 PATCH 的字段范围内，
   * 产品线分支保存展示资料时需要调用这个既有接口。
   */
  updateDraft: (
    draftId: string,
    data: UpdateDesignRecipeDraftPayload,
  ): Promise<DesignRecipeDraftDetail> =>
    api.patch(`/recipe-designer/drafts/${draftId}`, data),
  /**
   * 按 patch semantics 保存产品展示字段（封面 / 文案）。
   * 显式 null 表示清空；响应只包含展示字段与新的 contentRevision。
   */
  updateDraftPresentation: (
    draftId: string,
    data: UpdateDraftPresentationPayload,
  ): Promise<DraftPresentationSnapshot> =>
    api.patch(`/recipe-designer/drafts/${draftId}/presentation`, data),
  /** 读取草稿的结构化制作步骤（Task 7：轻量刷新步骤区，不重拉整份草稿） */
  getDraftProductionSteps: (draftId: string): Promise<DesignRecipeProductionStepsResult> =>
    api.get(`/recipe-designer/drafts/${draftId}/production-steps`),
  /**
   * 上线检查：读取草稿的共享发布门槛（发布 / 加入待提交同一套判断）。
   * 只读预览，不改变草稿状态，也不会跳转路由。
   */
  getDraftLaunchReadiness: (draftId: string): Promise<DraftLaunchReadiness> =>
    api.get(`/recipe-designer/drafts/${draftId}/launch-readiness`),
  /**
   * 读取草稿最近一次持久化的营养报告（发布口径）。
   * 没有报告时后端返回 200 + `report: null`，不是错误。
   */
  getDraftNutritionReport: (draftId: string): Promise<DraftNutritionReportEnvelope> =>
    api.get(`/recipe-designer/drafts/${draftId}/nutrition-report`),
  /**
   * 生成并持久化草稿的最新营养报告；生成失败后端返回 400。
   * 成功后草稿的 contentRevision 即报告版本，之后修改草稿会让报告过期。
   */
  generateDraftNutritionReport: (draftId: string): Promise<DraftNutritionReportEnvelope> =>
    api.post(`/recipe-designer/drafts/${draftId}/nutrition-report`),
  /** 整组覆盖保存制作步骤；空数组表示清空 */
  updateDraftProductionSteps: (
    draftId: string,
    payload: UpdateDesignRecipeProductionStepsPayload,
  ): Promise<DesignRecipeProductionStepsResult> =>
    api.patch(`/recipe-designer/drafts/${draftId}/production-steps`, payload),
  createRevisionDraft: (draftId: string): Promise<unknown> =>
    api.post(`/recipe-designer/drafts/${draftId}/revisions`),
  revertDraftToLatestOfficial: (draftId: string): Promise<unknown> =>
    api.post(`/recipe-designer/drafts/${draftId}/revert-to-latest-official`),
  /**
   * 复制其他生命阶段的原料到目标阶段草稿（会先清空目标草稿的原料）。
   * 后端按生命阶段解析来源：优先用该阶段的设计草稿，没有草稿时用已发布正式版本。
   * 返回被更新的目标阶段草稿。
   */
  copySeriesStageIngredients: (
    seriesId: string,
    lifeStage: string,
    data: CopyRecipeSeriesStageIngredientsPayload,
  ): Promise<DesignRecipeDraftDetail> =>
    api.post(
      `/recipe-designer/series/${seriesId}/stages/${lifeStage}/copy-ingredients`,
      data,
    ),
  /**
   * 按**当前编辑内容**评估（2026-10-16 批次 5.3）。
   *
   * 与 `assessDraft(draftId)` 的区别：那个按草稿 id 从库里读，
   * 这个把**屏幕上还没保存的 items** 发过去 ——
   * 编辑器算的就是这一份，用前者会评估"上一次保存的版本"。
   *
   * 目标值（FEDIAF 标准）由后端按 scenario 取，客户端不用传。
   */
  assessItems: (payload: {
    scenario: string
    items: Array<{
      id: string
      name: string
      ingredientType?: string | null
      weightG: number
      nutritionProfile?: unknown
    }>
  }): Promise<Record<string, unknown>> =>
    api.post('/recipe-designer/assess-items', payload),

  assessContributors: (payload: {
    scenario: string
    nutrientKey: string
    items: Array<{
      id: string
      name: string
      ingredientType?: string | null
      weightG: number
      nutritionProfile?: unknown
    }>
  }): Promise<{ nutrientKey: string; contributors: Array<Record<string, unknown>> }> =>
    api.post('/recipe-designer/assess-contributors', payload),

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
  getDogDesignInsight: (
    dogId: string,
    recentDays?: number,
    draftId?: string
  ): Promise<DogDesignInsight> =>
    api.get(`/recipe-designer/dogs/${dogId}/design-insight`, {
      params: {
        ...(recentDays ? { recentDays } : {}),
        ...(draftId ? { draftId } : {}),
      },
    }),
  updateDogDesignNotes: (dogId: string, data: UpdateDogDesignNotesPayload): Promise<unknown> =>
    api.patch(`/recipe-designer/dogs/${dogId}/design-notes`, data),
  generateAiSuggestions: (dogId: string, draftId?: string): Promise<AiDesignSuggestion> =>
    api.post(`/recipe-designer/dogs/${dogId}/design-insight/ai-suggest`, { draftId }),

  // AI 设计建议四步向导（AI 生成耗时较长，单独设置较长的请求超时，避免 30s 默认超时误判失败）
  generateAiNutritionPlan: (dogId: string, draftId?: string, userNotes?: string | null): Promise<NutritionPlanResult> =>
    api.post(`/recipe-designer/dogs/${dogId}/design-insight/ai-nutrition-plan`, { draftId, userNotes }, { timeout: 180000 }),
  acceptAiNutritionPlan: (
    draftId: string,
    data: { accepted: boolean; note?: string | null; plan?: NutritionPlanResult | null }
  ): Promise<NutritionPlanResult> =>
    api.post(`/recipe-designer/drafts/${draftId}/ai/nutrition-plan/accept`, data),
  generateAiIngredientRecommendation: (draftId: string): Promise<IngredientRecommendationResult> =>
    api.post(`/recipe-designer/drafts/${draftId}/ai/ingredient-recommendation`, undefined, { timeout: 180000 }),
  reviewAiRecipe: (draftId: string): Promise<RecipeReviewResult> =>
    api.post(`/recipe-designer/drafts/${draftId}/ai/review`, undefined, { timeout: 180000 }),
  generateAiSop: (draftId: string): Promise<SopResult> =>
    api.post(`/recipe-designer/drafts/${draftId}/ai/sop`, undefined, { timeout: 180000 }),
  getAiDesignData: (draftId: string): Promise<RecipeAiDesignData> =>
    api.get(`/recipe-designer/drafts/${draftId}/ai-design-data`),
}
