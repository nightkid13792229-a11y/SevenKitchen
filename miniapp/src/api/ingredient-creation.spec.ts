import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/api', () => ({
  request: vi.fn(),
}))

import { request } from '../utils/api'
import {
  ingredientCreationApi,
  type CreateIngredientCreationJobPayload,
  type IngredientCreationJobStatus,
  type IngredientCreationMessagePayload,
  type UpdateIngredientCreationDraftPayload,
  type UpdateIngredientCreationDraftProfilePayload,
} from './ingredient-creation'

const mockedRequest = vi.mocked(request)

describe('ingredientCreationApi', () => {
  beforeEach(() => {
    mockedRequest.mockReset()
  })

  it('exports the ingredient creation job statuses used by the backend workflow', () => {
    const statuses = [
      'DRAFTING',
      'SEARCHING_SOURCES',
      'WAITING_USER',
      'BUILDING_REPORT',
      'READY_FOR_REVIEW',
      'CONFIRMED',
      'FAILED',
      'CANCELED',
    ] satisfies IngredientCreationJobStatus[]

    expect(statuses).toEqual([
      'DRAFTING',
      'SEARCHING_SOURCES',
      'WAITING_USER',
      'BUILDING_REPORT',
      'READY_FOR_REVIEW',
      'CONFIRMED',
      'FAILED',
      'CANCELED',
    ])
  })

  it('creates ingredient creation jobs through the admin endpoint', () => {
    const payload = {
      requestText: '新增一个适合每日采购的鸭胸肉食材',
    } satisfies CreateIngredientCreationJobPayload

    ingredientCreationApi.createJob(payload)

    expect(mockedRequest).toHaveBeenCalledWith({
      url: '/admin/ingredient-creation/jobs',
      method: 'POST',
      data: payload,
    })
  })

  it('confirms drafts through the admin draft confirmation endpoint', () => {
    ingredientCreationApi.confirmDraft('draft-1')

    expect(mockedRequest).toHaveBeenCalledWith({
      url: '/admin/ingredient-creation/drafts/draft-1/confirm',
      method: 'POST',
    })
  })

  it('uses stable admin paths for job list, detail, conversation, answer, and rerun actions', () => {
    const jobId = 'job-1'
    const message = {
      content: '请补充 USDA source',
    } satisfies IngredientCreationMessagePayload

    ingredientCreationApi.listJobs()
    ingredientCreationApi.getJob(jobId)
    ingredientCreationApi.addMessage(jobId, message)
    ingredientCreationApi.answerQuestion(jobId, message)
    ingredientCreationApi.rerunJob(jobId)

    expect(mockedRequest).toHaveBeenNthCalledWith(1, {
      url: '/admin/ingredient-creation/jobs',
      method: 'GET',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(2, {
      url: `/admin/ingredient-creation/jobs/${jobId}`,
      method: 'GET',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(3, {
      url: `/admin/ingredient-creation/jobs/${jobId}/messages`,
      method: 'POST',
      data: message,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(4, {
      url: `/admin/ingredient-creation/jobs/${jobId}/answer`,
      method: 'POST',
      data: message,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(5, {
      url: `/admin/ingredient-creation/jobs/${jobId}/rerun`,
      method: 'POST',
    })
  })

  it('updates draft and draft profile review fields through the admin endpoints', () => {
    const draftPayload = {
      suggestedName: '鸭胸肉',
      unitDisplayLabel: 'g',
      procurementStrategy: 'DAILY_PURCHASE',
      diyEnabled: true,
      procurementEnabled: true,
      notes: '去皮后称重',
    } satisfies UpdateIngredientCreationDraftPayload
    const profilePayload = {
      role: 'PRIMARY',
      suggestedDisplayNameZh: '鸭胸肉 生',
      preparationState: 'RAW',
      preparationStateLabel: '生',
      ediblePortionLabel: '去皮可食部',
      processingLabel: '去皮',
      agentRationale: '主档案用于生重录入',
      sortOrder: 0,
    } satisfies UpdateIngredientCreationDraftProfilePayload

    ingredientCreationApi.updateDraft('draft-1', draftPayload)
    ingredientCreationApi.updateDraftProfile('profile-1', profilePayload)

    expect(mockedRequest).toHaveBeenNthCalledWith(1, {
      url: '/admin/ingredient-creation/drafts/draft-1',
      method: 'PATCH',
      data: draftPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(2, {
      url: '/admin/ingredient-creation/draft-profiles/profile-1',
      method: 'PATCH',
      data: profilePayload,
    })
  })
})
