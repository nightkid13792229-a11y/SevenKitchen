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
  name: '幼犬鸡肉',
  ready: true,
  canRelease: true,
  releaseDraft: { exists: false, updatedAt: null, changedFields: [] },
  hasPendingUpdates: true,
  pendingStageCodes: ['PUPPY_UNDER_14_WEEKS'],
  stages: [],
  presentation: {
    coverImageUrl: 'https://img.example.com/cover.jpg',
    coverTitle: '幼犬鸡肉',
    sellingPoint: '鲜肉低敏，幼犬日常',
    targetHealthTags: ['tag-1'],
    coverBadges: ['低脂'],
    coverBadgeIds: ['tag-1']
  },
  blockers: [],
  warnings: [],
  summary: {
    totalStageCount: 1,
    publishableStageCount: 1,
    pendingStageCount: 1,
    publishedStageCount: 1,
    upToDateStageCount: 0,
    designedStageCount: 1,
    actionableStageCount: 1
  }
}

const draftResult = {
  changedFields: ['name'],
  updatedAt: '2026-11-08T12:00:00.000Z',
  name: '幼犬鸡肉 · 新',
  presentation: {
    coverImageUrl: 'https://img.example.com/cover.jpg',
    coverTitle: '幼犬鸡肉',
    sellingPoint: '鲜肉低敏，幼犬日常',
    targetHealthTags: ['tag-1'],
    coverBadges: ['低脂'],
    coverBadgeIds: ['tag-1']
  }
}

const releaseResult = {
  seriesId: 'series-1',
  name: '幼犬鸡肉',
  businessStatus: 'PUBLIC',
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

  it('保存草稿走 PATCH /recipe-designer/series/:id/release-draft（带乐观锁）', async () => {
    transport.patch.mockResolvedValue(draftResult)
    const payload = {
      name: '幼犬鸡肉 · 新',
      expectedUpdatedAt: '2026-11-08T11:59:00.000Z'
    }

    const result = await recipeDesignerApi.saveSeriesReleaseDraft(
      'series-1',
      payload
    )

    expect(transport.patch).toHaveBeenCalledWith(
      '/recipe-designer/series/series-1/release-draft',
      payload
    )
    expect(result).toBe(draftResult)
  })

  it('发布走 POST /recipe-designer/series/:id/release', async () => {
    transport.post.mockResolvedValue(releaseResult)

    const result = await recipeDesignerApi.releaseSeries('series-1')

    expect(transport.post).toHaveBeenCalledWith(
      '/recipe-designer/series/series-1/release',
      {}
    )
    expect(result).toBe(releaseResult)
  })

  it('发布时带上草稿时间做并发保护，不再传阶段代码', async () => {
    transport.post.mockResolvedValue(releaseResult)

    await recipeDesignerApi.releaseSeries('series-1', {
      expectedDraftUpdatedAt: '2026-11-08T12:00:00.000Z'
    })

    expect(transport.post).toHaveBeenCalledWith(
      '/recipe-designer/series/series-1/release',
      { expectedDraftUpdatedAt: '2026-11-08T12:00:00.000Z' }
    )
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
