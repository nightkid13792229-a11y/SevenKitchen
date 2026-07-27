import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('../utils/api', () => ({
  request: vi.fn(),
  getToken: () => 'token-123',
}))

vi.mock('../utils/config', () => ({
  getBaseUrl: () => 'https://api.example.com/api/v1',
}))

import { request } from '../utils/api'
import {
  FEDIAF_DOG_SCENARIO_LABELS,
  recipeDesignerApi,
  type DesignRecipeDraftPayload,
  type IngredientOptionListQuery,
  type CreateSupplementOptionPayload,
  type UpdateDesignRecipeItemPayload,
  type FediafDogScenario,
} from './recipe-designer'

const mockedRequest = vi.mocked(request)
const uploadFile = vi.fn()
const getStorageSync = vi.fn(() => 'staff-1')
const apiSourcePath = resolve(process.cwd(), 'src/api/recipe-designer.ts')
const apiSource = existsSync(apiSourcePath) ? readFileSync(apiSourcePath, 'utf-8') : ''

vi.stubGlobal('uni', {
  uploadFile,
  getStorageSync,
})

describe('recipeDesignerApi', () => {
  beforeEach(() => {
    mockedRequest.mockReset()
    uploadFile.mockReset()
    getStorageSync.mockClear()
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
      ingredientId: 'ingredient-1',
      nutritionFoodId: 'food-1',
      weightG: 120,
      preparationMethod: 'cooked',
      nutrientTargetKey: 'CA',
      nutrientTargetValue: 1.2,
      supplementTargets: [
        {
          fieldPath: 'minerals.calcium',
          nutrientTargetKey: 'calcium',
          label: '钙',
          unit: 'mg',
        },
      ],
      sortOrder: 1,
    } satisfies Parameters<typeof recipeDesignerApi.addItem>[1]
    const updateItemPayload = {
      weightG: 150,
      preparationMethod: 'steamed',
      nutrientTargetKey: 'CA',
      nutrientTargetValue: 1.4,
      supplementTargets: [
        {
          fieldPath: 'minerals.calcium',
          nutrientTargetKey: 'calcium',
          label: '钙',
          unit: 'mg',
        },
      ],
      sortOrder: 2,
      includeInAssessment: false,
    } satisfies UpdateDesignRecipeItemPayload

    recipeDesignerApi.listDrafts()
    recipeDesignerApi.getDraft(draftId)
    recipeDesignerApi.createDraft(draftPayload)
    recipeDesignerApi.updateDraft(draftId, draftPayload)
    recipeDesignerApi.addItem(draftId, itemPayload)
    recipeDesignerApi.updateItem(itemId, updateItemPayload)
    recipeDesignerApi.reorderItems(draftId, {
      items: [
        { id: 'item-2', sortOrder: 0 },
        { id: 'item-1', sortOrder: 1 },
      ],
    })
    recipeDesignerApi.removeItem(itemId)
    recipeDesignerApi.assessDraft(draftId)
    recipeDesignerApi.publishDraft(draftId, { reviewNote: 'ready' })

    expect(mockedRequest).toHaveBeenNthCalledWith(1, {
      url: '/recipe-designer/drafts',
      method: 'GET',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(2, {
      url: `/recipe-designer/drafts/${draftId}`,
      method: 'GET',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(3, {
      url: '/recipe-designer/drafts',
      method: 'POST',
      data: draftPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(4, {
      url: `/recipe-designer/drafts/${draftId}`,
      method: 'PATCH',
      data: draftPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(5, {
      url: `/recipe-designer/drafts/${draftId}/items`,
      method: 'POST',
      data: itemPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(6, {
      url: `/recipe-designer/items/${itemId}`,
      method: 'PATCH',
      data: updateItemPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(7, {
      url: `/recipe-designer/drafts/${draftId}/items/reorder`,
      method: 'PATCH',
      data: {
        items: [
          { id: 'item-2', sortOrder: 0 },
          { id: 'item-1', sortOrder: 1 },
        ],
      },
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(8, {
      url: `/recipe-designer/items/${itemId}`,
      method: 'DELETE',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(9, {
      url: `/recipe-designer/drafts/${draftId}/assess`,
      method: 'POST',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(10, {
      url: `/recipe-designer/drafts/${draftId}/publish`,
      method: 'POST',
      data: { reviewNote: 'ready' },
    })
  })

  it('uses recipe designer series endpoint paths', () => {
    const seriesId = 'series-1'
    const createPayload = {
      name: '金毛全阶段配方',
      scenario: 'ADULT_MER_110',
    } satisfies Parameters<typeof recipeDesignerApi.createSeries>[0]
    const renamePayload = { name: '金毛五阶段配方' }
    const deletePayload = {
      confirmName: '金毛五阶段配方',
      confirmUserVisibleRemoval: true,
    } satisfies Parameters<typeof recipeDesignerApi.deleteSeries>[1]
    const stagePayload = {
      scenario: 'EARLY_GROWTH_REPRODUCTION',
      sourceDraftId: 'published-adult-design',
    } satisfies Parameters<typeof recipeDesignerApi.createSeriesStageDraft>[1]
    const stageIngredientCopyPayload = {
      sourceLifeStage: 'HIGH_ACTIVITY_ADULT',
    } satisfies Parameters<typeof recipeDesignerApi.copySeriesStageIngredients>[2]

    recipeDesignerApi.listSeries({ page: 2, pageSize: 20 })
    recipeDesignerApi.createSeries(createPayload)
    recipeDesignerApi.renameSeries(seriesId, renamePayload)
    recipeDesignerApi.deleteSeries(seriesId, deletePayload)
    recipeDesignerApi.createSeriesStageDraft(seriesId, stagePayload)
    recipeDesignerApi.duplicateSeries(seriesId)
    recipeDesignerApi.duplicateSeriesStage(seriesId, 'HIGH_ACTIVITY_ADULT')
    recipeDesignerApi.copySeriesStageIngredients(
      seriesId,
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
      stageIngredientCopyPayload,
    )

    expect(mockedRequest).toHaveBeenNthCalledWith(1, {
      url: '/recipe-designer/series',
      method: 'GET',
      data: { page: 2, pageSize: 20 },
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(2, {
      url: '/recipe-designer/series',
      method: 'POST',
      data: createPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(3, {
      url: `/recipe-designer/series/${seriesId}`,
      method: 'PATCH',
      data: renamePayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(4, {
      url: `/recipe-designer/series/${seriesId}/delete`,
      method: 'POST',
      data: deletePayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(5, {
      url: `/recipe-designer/series/${seriesId}/stage-drafts`,
      method: 'POST',
      data: stagePayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(6, {
      url: `/recipe-designer/series/${seriesId}/duplicate`,
      method: 'POST',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(7, {
      url: `/recipe-designer/series/${seriesId}/stages/HIGH_ACTIVITY_ADULT/duplicate`,
      method: 'POST',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(8, {
      url: `/recipe-designer/series/${seriesId}/stages/LOW_ACTIVITY_ADULT_OR_SENIOR/copy-ingredients`,
      method: 'POST',
      data: stageIngredientCopyPayload,
    })
  })

  it('keeps customer dog-first series and private snapshot API contracts', () => {
    expect(apiSource).toContain('dogId?: string')
    expect(apiSource).toContain('RecipeDesignerCustomerSeriesCard')
    expect(apiSource).toContain('createPrivateRecipeSnapshot')
    expect(apiSource).toContain('/private-recipe-snapshot')

    const createPayload = {
      name: 'Star 的鲜食食谱',
      dogId: 'dog-1',
      scenario: 'ADULT_MER_95',
    }

    recipeDesignerApi.createSeries(createPayload)
    recipeDesignerApi.createPrivateRecipeSnapshot('draft-1', { target: 'ORDER' })

    expect(mockedRequest).toHaveBeenNthCalledWith(1, {
      url: '/recipe-designer/series',
      method: 'POST',
      data: createPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(2, {
      url: '/recipe-designer/drafts/draft-1/private-recipe-snapshot',
      method: 'POST',
      data: { target: 'ORDER' },
    })
  })

  it('exports the supported FEDIAF dog scenarios without legacy scenario aliases', () => {
    expect(Object.keys(FEDIAF_DOG_SCENARIO_LABELS)).toEqual([
      'EARLY_GROWTH_REPRODUCTION',
      'REPRODUCTION',
      'LATE_GROWTH',
      'ADULT_MER_95',
      'ADULT_MER_110',
    ])
    expect(FEDIAF_DOG_SCENARIO_LABELS).toEqual({
      EARLY_GROWTH_REPRODUCTION: '小于14周龄幼犬',
      REPRODUCTION: '繁殖期母犬',
      LATE_GROWTH: '大于等于14周龄幼犬',
      ADULT_MER_95: '低能量需求成年犬（95ME）',
      ADULT_MER_110: '普通成年犬（110ME）',
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
      supplementTargets: null,
    })
    recipeDesignerApi.publishDraft('draft-1', { name: '三文鱼成犬维护' })

    expect(mockedRequest).toHaveBeenNthCalledWith(1, {
      url: '/recipe-designer/items/item-1',
      method: 'PATCH',
      data: {
        preparationMethod: null,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        supplementTargets: null,
      },
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(2, {
      url: '/recipe-designer/drafts/draft-1/publish',
      method: 'POST',
      data: { name: '三文鱼成犬维护' },
    })
  })

  it('persists a complete draft item order through the batch item-order endpoint', () => {
    recipeDesignerApi.updateItemOrder('draft-1', ['item-3', 'item-1', 'item-2'])

    expect(mockedRequest).toHaveBeenCalledWith({
      url: '/recipe-designer/drafts/draft-1/item-order',
      method: 'PUT',
      data: { itemIds: ['item-3', 'item-1', 'item-2'] },
    })
  })

  it('deletes unpublished design drafts through the draft endpoint', () => {
    recipeDesignerApi.deleteDraft('draft-1')

    expect(mockedRequest).toHaveBeenCalledWith({
      url: '/recipe-designer/drafts/draft-1',
      method: 'DELETE',
    })
  })

  it('creates editable revision drafts from published recipe designer drafts', () => {
    recipeDesignerApi.createRevisionDraft('draft-1')

    expect(mockedRequest).toHaveBeenCalledWith({
      url: '/recipe-designer/drafts/draft-1/revisions',
      method: 'POST',
    })
  })

  it('lists standard ingredient options for the ingredient picker', () => {
    const query = {
      search: 'chicken',
      page: 2,
      pageSize: 20,
      nutrientKey: 'calcium',
      scenario: 'ADULT_MER_110',
      expressionBasis: 'PER_1000_KCAL_ME',
    } satisfies IngredientOptionListQuery

    recipeDesignerApi.listIngredientOptions(query)

    expect(mockedRequest).toHaveBeenCalledWith({
      url: '/recipe-designer/ingredient-options',
      method: 'GET',
      data: query,
    })
  })

  it('creates internal supplement ingredient options from the recipe designer picker', () => {
    const payload = {
      name: '柠檬酸钙',
      profileName: '柠檬酸钙 手工补剂档案',
      basisType: 'PER_1_G',
      usageUnit: 'g',
      nutrients: {
        'minerals.calcium': 210,
        'vitamins.vitaminD': '',
      },
    } satisfies CreateSupplementOptionPayload

    recipeDesignerApi.createSupplementOption(payload)

    expect(mockedRequest).toHaveBeenCalledWith({
      url: '/recipe-designer/supplement-options',
      method: 'POST',
      data: payload,
    })
  })

  it('uploads a supplement label image for OCR plus DeepSeek prefill', async () => {
    uploadFile.mockImplementation((options: any) => {
      options.success({
        statusCode: 201,
        data: JSON.stringify({
          code: 0,
          data: {
            ingredientName: '柠檬酸钙',
            profileName: '柠檬酸钙 包装识别档案',
            usageUnit: '粒',
            basisType: 'PER_SERVING',
            nutrients: { 'minerals.calcium': 200 },
            warnings: [],
            confidence: 'HIGH',
            ocrText: '每粒含钙 200mg',
            imageUrl: 'https://cdn.example.com/label.jpg',
            imageKey: 'recipe-designer-supplement-labels/label.jpg',
          },
        }),
      })
    })

    await expect(
      recipeDesignerApi.extractSupplementLabel('/tmp/label.jpg'),
    ).resolves.toEqual({
      ingredientName: '柠檬酸钙',
      profileName: '柠檬酸钙 包装识别档案',
      usageUnit: '粒',
      basisType: 'PER_SERVING',
      nutrients: { 'minerals.calcium': 200 },
      warnings: [],
      confidence: 'HIGH',
      ocrText: '每粒含钙 200mg',
      imageUrl: 'https://cdn.example.com/label.jpg',
      imageKey: 'recipe-designer-supplement-labels/label.jpg',
    })

    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/api/v1/recipe-designer/supplement-label/extract',
        filePath: '/tmp/label.jpg',
        name: 'file',
        header: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'X-Customer-Id': 'staff-1',
        }),
      }),
    )
  })
})
