import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/api', () => ({
  request: vi.fn(),
}))

import { request } from '../utils/api'
import {
  FEDIAF_DOG_SCENARIO_LABELS,
  recipeDesignerApi,
  type DesignRecipeDraftPayload,
  type FediafDogScenario,
} from './recipe-designer'

const mockedRequest = vi.mocked(request)

describe('recipeDesignerApi', () => {
  beforeEach(() => {
    mockedRequest.mockReset()
  })

  it('uses recipe designer draft and item endpoint paths', () => {
    const draftId = 'draft-1'
    const itemId = 'item-1'
    const draftPayload: DesignRecipeDraftPayload = {
      name: '成长配方',
      scenario: 'EARLY_GROWTH_REPRODUCTION',
      notes: 'calcium check',
    }
    const itemPayload = {
      nutritionFoodId: 'food-1',
      weightG: 120,
      preparationMethod: 'cooked',
      nutrientTargetKey: 'CA',
      nutrientTargetValue: 1.2,
      sortOrder: 1,
    }

    recipeDesignerApi.listDrafts()
    recipeDesignerApi.createDraft(draftPayload)
    recipeDesignerApi.updateDraft(draftId, draftPayload)
    recipeDesignerApi.addItem(draftId, itemPayload)
    recipeDesignerApi.updateItem(itemId, itemPayload)
    recipeDesignerApi.removeItem(itemId)
    recipeDesignerApi.assessDraft(draftId)
    recipeDesignerApi.publishDraft(draftId, { reviewNote: 'ready' })

    expect(mockedRequest).toHaveBeenNthCalledWith(1, {
      url: '/recipe-designer/drafts',
      method: 'GET',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(2, {
      url: '/recipe-designer/drafts',
      method: 'POST',
      data: draftPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(3, {
      url: `/recipe-designer/drafts/${draftId}`,
      method: 'PATCH',
      data: draftPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(4, {
      url: `/recipe-designer/drafts/${draftId}/items`,
      method: 'POST',
      data: itemPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(5, {
      url: `/recipe-designer/items/${itemId}`,
      method: 'PATCH',
      data: itemPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(6, {
      url: `/recipe-designer/items/${itemId}`,
      method: 'DELETE',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(7, {
      url: `/recipe-designer/drafts/${draftId}/assess`,
      method: 'POST',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(8, {
      url: `/recipe-designer/drafts/${draftId}/publish`,
      method: 'POST',
      data: { reviewNote: 'ready' },
    })
  })

  it('exports the supported FEDIAF dog scenarios without legacy scenario aliases', () => {
    expect(Object.keys(FEDIAF_DOG_SCENARIO_LABELS)).toEqual([
      'EARLY_GROWTH_REPRODUCTION',
      'LATE_GROWTH',
      'ADULT_MER_95',
      'ADULT_MER_110',
    ])
    expect(FEDIAF_DOG_SCENARIO_LABELS).toEqual({
      EARLY_GROWTH_REPRODUCTION: '<14周幼犬 / 繁殖期',
      LATE_GROWTH: '>=14周幼犬',
      ADULT_MER_95: '成年犬 MER 95',
      ADULT_MER_110: '成年犬 MER 110',
    } satisfies Record<FediafDogScenario, string>)
    expect(FEDIAF_DOG_SCENARIO_LABELS).not.toHaveProperty('PUPPY_ONLY')
    expect(FEDIAF_DOG_SCENARIO_LABELS).not.toHaveProperty('ADULT_ONLY')
  })

  it('sends draft payloads with scenario instead of the deprecated fediafDogScenario field', () => {
    const payload: DesignRecipeDraftPayload = {
      name: '成年维护配方',
      scenario: 'ADULT_MER_95',
      targetHealthTags: ['skin'],
      applicableLifeStages: ['adult'],
    }

    recipeDesignerApi.createDraft(payload)

    expect(mockedRequest).toHaveBeenCalledWith({
      url: '/recipe-designer/drafts',
      method: 'POST',
      data: payload,
    })
    expect(mockedRequest.mock.calls[0][0].data).toHaveProperty('scenario', 'ADULT_MER_95')
    expect(mockedRequest.mock.calls[0][0].data).not.toHaveProperty('fediafDogScenario')
  })

  it('keeps update and publish helper contracts aligned with backend DTOs', () => {
    recipeDesignerApi.updateItem('item-1', {
      preparationMethod: null,
      nutrientTargetKey: null,
      nutrientTargetValue: null,
    })
    recipeDesignerApi.publishDraft('draft-1')

    expect(mockedRequest).toHaveBeenNthCalledWith(1, {
      url: '/recipe-designer/items/item-1',
      method: 'PATCH',
      data: {
        preparationMethod: null,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
      },
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(2, {
      url: '/recipe-designer/drafts/draft-1/publish',
      method: 'POST',
    })
  })
})
