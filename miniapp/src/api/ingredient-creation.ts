import { request } from '../utils/api'

const INGREDIENT_CREATION_BASE_PATH = '/admin/ingredient-creation'

export type IngredientCreationJobStatus =
  | 'DRAFTING'
  | 'SEARCHING_SOURCES'
  | 'WAITING_USER'
  | 'BUILDING_REPORT'
  | 'READY_FOR_REVIEW'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELED'

export type IngredientCreationProcurementStrategy =
  | 'DAILY_PURCHASE'
  | 'STOCK_REPLENISHMENT'
  | 'HYBRID'

export type IngredientCreationDraftProfileRole = 'PRIMARY' | 'SECONDARY'

export interface CreateIngredientCreationJobPayload {
  requestText: string
}

export interface IngredientCreationMessagePayload {
  content: string
}

export interface UpdateIngredientCreationDraftPayload {
  suggestedName?: string
  unitDisplayLabel?: string | null
  procurementStrategy?: IngredientCreationProcurementStrategy
  diyEnabled?: boolean
  procurementEnabled?: boolean
  notes?: string | null
}

export interface UpdateIngredientCreationDraftProfilePayload {
  role?: IngredientCreationDraftProfileRole
  suggestedDisplayNameZh?: string | null
  preparationState?: string | null
  preparationStateLabel?: string | null
  ediblePortionLabel?: string | null
  processingLabel?: string | null
  agentRationale?: string | null
  sortOrder?: number
}

export const ingredientCreationApi = {
  createJob: (data: CreateIngredientCreationJobPayload) =>
    request({ url: `${INGREDIENT_CREATION_BASE_PATH}/jobs`, method: 'POST', data }),
  listJobs: () =>
    request({ url: `${INGREDIENT_CREATION_BASE_PATH}/jobs`, method: 'GET' }),
  getJob: (id: string) =>
    request({ url: `${INGREDIENT_CREATION_BASE_PATH}/jobs/${id}`, method: 'GET' }),
  addMessage: (id: string, data: IngredientCreationMessagePayload) =>
    request({
      url: `${INGREDIENT_CREATION_BASE_PATH}/jobs/${id}/messages`,
      method: 'POST',
      data,
    }),
  answerQuestion: (id: string, data: IngredientCreationMessagePayload) =>
    request({
      url: `${INGREDIENT_CREATION_BASE_PATH}/jobs/${id}/answer`,
      method: 'POST',
      data,
    }),
  rerunJob: (id: string) =>
    request({
      url: `${INGREDIENT_CREATION_BASE_PATH}/jobs/${id}/rerun`,
      method: 'POST',
    }),
  updateDraft: (id: string, data: UpdateIngredientCreationDraftPayload) =>
    request({
      url: `${INGREDIENT_CREATION_BASE_PATH}/drafts/${id}`,
      method: 'PATCH',
      data,
    }),
  updateDraftProfile: (
    id: string,
    data: UpdateIngredientCreationDraftProfilePayload,
  ) =>
    request({
      url: `${INGREDIENT_CREATION_BASE_PATH}/draft-profiles/${id}`,
      method: 'PATCH',
      data,
    }),
  confirmDraft: (id: string) =>
    request({
      url: `${INGREDIENT_CREATION_BASE_PATH}/drafts/${id}/confirm`,
      method: 'POST',
    }),
}
