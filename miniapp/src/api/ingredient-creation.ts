import { request } from '../utils/api'

const INGREDIENT_CREATION_BASE_PATH = '/admin/ingredient-creation'

export const INGREDIENT_CREATION_JOB_STATUSES = [
  'DRAFTING',
  'SEARCHING_SOURCES',
  'WAITING_USER',
  'BUILDING_REPORT',
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'FAILED',
  'CANCELED',
] as const

export type IngredientCreationJobStatus =
  (typeof INGREDIENT_CREATION_JOB_STATUSES)[number]

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

export type IngredientCreationDraftStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'CONFIRMED'
  | 'REJECTED'

export type IngredientCreationMessageRole =
  | 'USER'
  | 'AGENT'
  | 'PROGRESS'
  | 'QUESTION'
  | 'SYSTEM'

export interface IngredientCreationMissingField {
  fieldPath: string
  label: string
}

export interface IngredientCreationFieldSourceSummary {
  fieldPath: string
  label: string
  sourceType?: string | null
  sourceKey?: string | null
  confidenceLevel?: string | null
  compatibility?: string | null
}

export interface IngredientCreationCompletenessSummary {
  total: number
  filled: number
  nonZero: number
  zero: number
  empty: number
  missingFields: IngredientCreationMissingField[]
  sourceCoverage: {
    filledWithSource: number
    filledWithoutSource: number
  }
  fieldSources: IngredientCreationFieldSourceSummary[]
}

export interface IngredientCreationMessage {
  id: string
  jobId?: string
  role: IngredientCreationMessageRole
  content: string
  payload?: Record<string, unknown> | null
  createdAt?: string
}

export interface IngredientCreationDraftProfile {
  id: string
  draftId?: string
  role: IngredientCreationDraftProfileRole
  sourceRecordId?: string | null
  sourceType?: string | null
  sourceKey?: string | null
  sourceFoodName: string
  sourceFoodNameEn?: string | null
  suggestedDisplayNameZh?: string | null
  preparationState?: string | null
  preparationStateLabel?: string | null
  ediblePortionLabel?: string | null
  processingLabel?: string | null
  nutritionData?: Record<string, unknown>
  completenessSummary?: IngredientCreationCompletenessSummary
  fieldSourceSummary?: Record<string, unknown> | null
  supplementRiskSummary?: Record<string, unknown> | null
  agentRationale?: string | null
  sortOrder?: number
  createdAt?: string
  updatedAt?: string
}

export interface IngredientCreationDraft {
  id: string
  jobId?: string
  status: IngredientCreationDraftStatus
  suggestedName: string
  aliases?: string[]
  type?: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING'
  baseUnit?: 'G' | 'ML' | 'PCS'
  unitDisplayLabel?: string | null
  procurementStrategy?: IngredientCreationProcurementStrategy
  diyEnabled?: boolean
  procurementEnabled?: boolean
  notes?: string | null
  agentSummary?: string | null
  reviewReport?: Record<string, unknown> | null
  confirmedIngredientId?: string | null
  confirmedBy?: string | null
  confirmedAt?: string | null
  createdAt?: string
  updatedAt?: string
  profiles?: IngredientCreationDraftProfile[]
}

export interface IngredientCreationJob {
  id: string
  createdBy?: string
  status: IngredientCreationJobStatus
  requestText: string
  currentStage?: string | null
  progress: number
  waitingQuestion?: string | null
  errorMessage?: string | null
  agentProvider?: string | null
  agentModel?: string | null
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
  messages?: IngredientCreationMessage[]
  draft?: IngredientCreationDraft | null
}

export const ingredientCreationApi = {
  createJob: (data: CreateIngredientCreationJobPayload) =>
    request<IngredientCreationJob>({
      url: `${INGREDIENT_CREATION_BASE_PATH}/jobs`,
      method: 'POST',
      data,
    }),
  listJobs: () =>
    request<IngredientCreationJob[]>({
      url: `${INGREDIENT_CREATION_BASE_PATH}/jobs`,
      method: 'GET',
    }),
  getJob: (id: string) =>
    request<IngredientCreationJob>({
      url: `${INGREDIENT_CREATION_BASE_PATH}/jobs/${id}`,
      method: 'GET',
    }),
  addMessage: (id: string, data: IngredientCreationMessagePayload) =>
    request<IngredientCreationJob>({
      url: `${INGREDIENT_CREATION_BASE_PATH}/jobs/${id}/messages`,
      method: 'POST',
      data,
    }),
  answerQuestion: (id: string, data: IngredientCreationMessagePayload) =>
    request<IngredientCreationJob>({
      url: `${INGREDIENT_CREATION_BASE_PATH}/jobs/${id}/answer`,
      method: 'POST',
      data,
    }),
  rerunJob: (id: string) =>
    request<IngredientCreationDraft>({
      url: `${INGREDIENT_CREATION_BASE_PATH}/jobs/${id}/rerun`,
      method: 'POST',
    }),
  updateDraft: (id: string, data: UpdateIngredientCreationDraftPayload) =>
    request<IngredientCreationDraft>({
      url: `${INGREDIENT_CREATION_BASE_PATH}/drafts/${id}`,
      method: 'PATCH',
      data,
    }),
  updateDraftProfile: (
    id: string,
    data: UpdateIngredientCreationDraftProfilePayload,
  ) =>
    request<IngredientCreationDraftProfile>({
      url: `${INGREDIENT_CREATION_BASE_PATH}/draft-profiles/${id}`,
      method: 'PATCH',
      data,
    }),
  confirmDraft: (id: string) =>
    request<IngredientCreationDraft>({
      url: `${INGREDIENT_CREATION_BASE_PATH}/drafts/${id}/confirm`,
      method: 'POST',
    }),
}
