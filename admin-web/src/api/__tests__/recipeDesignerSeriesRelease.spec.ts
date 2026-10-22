import { beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn()
}))

vi.mock('@/api/index', () => ({ default: transport }))

import { recipeDesignerApi } from '@/api/recipeDesigner'

const readiness = {
  seriesId: 'series-1',
  designMode: 'CATALOG',
  businessStatus: 'PUBLIC',
  releaseState: 'NEEDS_UPDATE',
  ready: true,
  hasPendingUpdates: true,
  pendingStageCodes: ['PUPPY_UNDER_14_WEEKS'],
  requiredLifeStages: ['PUPPY_UNDER_14_WEEKS'],
  requiredStages: [],
  stages: [],
  presentation: {
    coverImageUrl: 'https://img.example.com/cover.jpg',
    coverTitle: '幼犬鸡肉',
    sellingPoint: '鲜肉低敏，幼犬日常',
    targetHealthTags: ['tag-1']
  },
  blockers: [],
  warnings: [],
  summary: {
    requiredStageCount: 1,
    readyStageCount: 1,
    publishedStageCount: 1,
    designedStageCount: 1,
    pendingStageCount: 1
  }
}

const settingsSnapshot = {
  seriesId: 'series-1',
  name: '幼犬鸡肉',
  designMode: 'CATALOG',
  businessStatus: 'DRAFT',
  requiredLifeStages: ['PUPPY_UNDER_14_WEEKS'],
  coverImageUrl: 'https://img.example.com/cover.jpg',
  coverTitle: '幼犬鸡肉',
  sellingPoint: '鲜肉低敏，幼犬日常',
  targetHealthTags: ['tag-1'],
  updatedAt: '2026-10-22T12:00:00.000Z'
}

const releaseResult = {
  seriesId: 'series-1',
  name: '幼犬鸡肉',
  businessStatus: 'PUBLIC',
  requiredLifeStages: ['PUPPY_UNDER_14_WEEKS'],
  releasedStageCodes: ['PUPPY_UNDER_14_WEEKS'],
  publishedRecipeCount: 1,
  updatedRecipeCount: 1,
  releasedAt: '2026-10-22T12:05:00.000Z'
}

const unpublishResult = {
  seriesId: 'series-1',
  name: '幼犬鸡肉',
  businessStatus: 'DRAFT',
  releaseState: 'UNPUBLISHED',
  unpublishedRecipeCount: 1,
  remainingPublicRecipeCount: 0,
  unpublishedAt: '2026-10-22T12:10:00.000Z'
}

describe('系列发布 API', () => {
  beforeEach(() => {
    transport.get.mockReset()
    transport.post.mockReset()
    transport.patch.mockReset()
  })

  it('读取门槛走 GET /recipe-designer/series/:id/release-readiness', async () => {
    transport.get.mockResolvedValue(readiness)

    const result = await recipeDesignerApi.getSeriesReleaseReadiness('series-1')

    expect(transport.get).toHaveBeenCalledWith(
      '/recipe-designer/series/series-1/release-readiness'
    )
    expect(result).toBe(readiness)
  })

  it('保存设置走 PATCH /recipe-designer/series/:id/release-settings', async () => {
    transport.patch.mockResolvedValue(settingsSnapshot)
    const payload = {
      requiredLifeStages: ['PUPPY_UNDER_14_WEEKS'],
      coverTitle: '幼犬鸡肉',
      sellingPoint: '鲜肉低敏，幼犬日常',
      targetHealthTags: ['tag-1']
    }

    const result = await recipeDesignerApi.updateSeriesReleaseSettings(
      'series-1',
      payload
    )

    expect(transport.patch).toHaveBeenCalledWith(
      '/recipe-designer/series/series-1/release-settings',
      payload
    )
    expect(result).toBe(settingsSnapshot)
  })

  it('发布走 POST /recipe-designer/series/:id/release', async () => {
    transport.post.mockResolvedValue(releaseResult)

    const result = await recipeDesignerApi.releaseSeries('series-1')

    expect(transport.post).toHaveBeenCalledWith(
      '/recipe-designer/series/series-1/release'
    )
    expect(result).toBe(releaseResult)
  })

  it('下架走 POST /recipe-designer/series/:id/unpublish', async () => {
    transport.post.mockResolvedValue(unpublishResult)

    const result = await recipeDesignerApi.unpublishSeries('series-1')

    expect(transport.post).toHaveBeenCalledWith(
      '/recipe-designer/series/series-1/unpublish'
    )
    expect(result).toBe(unpublishResult)
    expect(result.releaseState).toBe('UNPUBLISHED')
  })
})
