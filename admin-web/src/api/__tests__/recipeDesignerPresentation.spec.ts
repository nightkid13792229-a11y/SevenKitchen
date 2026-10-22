import { beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn()
}))

vi.mock('@/api/index', () => ({ default: transport }))

import { recipeDesignerApi } from '@/api/recipeDesigner'

const snapshot = {
  draftId: 'draft-1',
  contentRevision: 5,
  coverImageUrl: 'https://img.example.com/cover.jpg',
  coverTitle: '鸡肉成犬',
  description: '鲜鸡肉为主料，适合成犬日常维持。',
  sellingPoint: '鲜肉低敏，日常维持',
  detailImages: null,
  videoUrl: null
}

describe('草稿产品展示 API', () => {
  beforeEach(() => {
    transport.patch.mockReset()
  })

  it('展示字段走 PATCH /recipe-designer/drafts/:id/presentation', async () => {
    transport.patch.mockResolvedValue(snapshot)
    const payload = {
      coverImageUrl: 'https://img.example.com/cover.jpg',
      coverTitle: '鸡肉成犬',
      description: null
    }

    await expect(
      recipeDesignerApi.updateDraftPresentation('draft-1', payload)
    ).resolves.toEqual(snapshot)

    expect(transport.patch).toHaveBeenCalledWith(
      '/recipe-designer/drafts/draft-1/presentation',
      payload
    )
  })

  it('适用生命阶段 / 健康标签走既有草稿 PATCH', async () => {
    transport.patch.mockResolvedValue({ id: 'draft-1' })
    const payload = {
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      targetHealthTags: ['tag-joint']
    }

    await recipeDesignerApi.updateDraft('draft-1', payload)

    expect(transport.patch).toHaveBeenCalledWith(
      '/recipe-designer/drafts/draft-1',
      payload
    )
  })
})
