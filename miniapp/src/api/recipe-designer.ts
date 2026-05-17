import { request } from '../utils/api'

export type FediafDogScenario =
  | 'EARLY_GROWTH_REPRODUCTION'
  | 'LATE_GROWTH'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110'

export const FEDIAF_DOG_SCENARIO_LABELS: Record<FediafDogScenario, string> = {
  EARLY_GROWTH_REPRODUCTION: '<14周幼犬 / 繁殖期',
  LATE_GROWTH: '>=14周幼犬',
  ADULT_MER_95: '成年犬 MER 95',
  ADULT_MER_110: '成年犬 MER 110',
}

export interface DesignRecipeDraftPayload {
  name: string
  scenario: FediafDogScenario
  notes?: string
  targetHealthTags?: string[]
  applicableLifeStages?: string[]
}

export interface DesignRecipeItemPayload {
  nutritionFoodId: string
  weightG: number
  preparationMethod?: string
  nutrientTargetKey?: string
  nutrientTargetValue?: number
  sortOrder?: number
}

export interface UpdateDesignRecipeItemPayload {
  weightG?: number
  preparationMethod?: string | null
  nutrientTargetKey?: string | null
  nutrientTargetValue?: number | null
  sortOrder?: number
}

export interface PublishDesignRecipePayload {
  reviewNote?: string
}

export const recipeDesignerApi = {
  listDrafts: () => request({ url: '/recipe-designer/drafts', method: 'GET' }),
  createDraft: (data: DesignRecipeDraftPayload) =>
    request({ url: '/recipe-designer/drafts', method: 'POST', data }),
  updateDraft: (draftId: string, data: Partial<DesignRecipeDraftPayload>) =>
    request({ url: `/recipe-designer/drafts/${draftId}`, method: 'PATCH', data }),
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
