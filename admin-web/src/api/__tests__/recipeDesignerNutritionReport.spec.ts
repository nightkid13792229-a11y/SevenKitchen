import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftNutritionReportEnvelope } from '@/types/recipeDesigner'

const transport = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn()
}))

vi.mock('@/api/index', () => ({ default: transport }))

import { recipeDesignerApi } from '@/api/recipeDesigner'

const snapshot: DraftNutritionReportEnvelope = {
  draftId: 'draft-1',
  generatedAt: '2026-10-22T12:00:00.000Z',
  revision: 3,
  stale: false,
  report: {
    ingredientRows: [
      {
        ingredientName: '鸡胸肉',
        amountLabel: '100g',
        weightPercentLabel: '100%'
      }
    ],
    macroRows: [],
    energyDensityRows: [],
    nutrientSections: {}
  }
}

describe('草稿营养报告 API', () => {
  beforeEach(() => {
    transport.get.mockReset()
    transport.post.mockReset()
  })

  it('读取走 GET /recipe-designer/drafts/:id/nutrition-report', async () => {
    transport.get.mockResolvedValue(snapshot)

    await expect(
      recipeDesignerApi.getDraftNutritionReport('draft-1')
    ).resolves.toEqual(snapshot)

    expect(transport.get).toHaveBeenCalledWith(
      '/recipe-designer/drafts/draft-1/nutrition-report'
    )
  })

  it('生成走 POST /recipe-designer/drafts/:id/nutrition-report', async () => {
    transport.post.mockResolvedValue(snapshot)

    await expect(
      recipeDesignerApi.generateDraftNutritionReport('draft-1')
    ).resolves.toEqual(snapshot)

    expect(transport.post).toHaveBeenCalledWith(
      '/recipe-designer/drafts/draft-1/nutrition-report'
    )
  })

  it('没有报告时 GET 仍按成功返回 report:null', async () => {
    const empty: DraftNutritionReportEnvelope = {
      draftId: 'draft-1',
      generatedAt: null,
      revision: null,
      stale: false,
      report: null
    }
    transport.get.mockResolvedValue(empty)

    await expect(
      recipeDesignerApi.getDraftNutritionReport('draft-1')
    ).resolves.toEqual(empty)
  })
})
