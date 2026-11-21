/**
 * 草稿 composable 的状态与请求守卫测试。
 *
 * 两条回归点（2026-11-22 复核）：
 * 1. `dirty` / `saveError` 必须真实：改动=未保存、保存失败不冒充已保存；
 * 2. 请求带 epoch：A 草稿的 validate/runAi 回来时如果已经 reset/切到 B，
 *    结果必须整段丢弃，不能覆盖 B 的 draft/review。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type {
  SupplementDraftPayload,
  SupplementDraftReview,
  SupplementDraftView
} from '@/api/supplementDrafts'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  discard: vi.fn(),
  aiFill: vi.fn(),
  validate: vi.fn(),
  finalize: vi.fn(),
  getVerification: vi.fn(),
  reverify: vi.fn(),
  recommendGroups: vi.fn()
}))

vi.mock('@/api/supplementDrafts', () => ({ supplementDraftsApi: api }))

import { useSupplementDraft } from './useSupplementDraft'

beforeEach(() => {
  // 每个用例都从干净的 mock 队列开始，避免上一个用例的 Once 残留。
  vi.resetAllMocks()
})

/** 一张最小可用的完整草稿载荷（空值形状与后端 normalize 一致）。 */
function basePayload(): SupplementDraftPayload {
  return {
    basic: {
      name: '',
      brand: '',
      productModel: '',
      purchaseChannel: '',
      baseUnit: 'PCS',
      unitDisplayLabel: '',
      physicalForm: null,
      servingUnitsPerDose: null,
      purchaseUnit: '',
      purchaseToBaseRatio: null,
      currentPricePerPurchaseUnit: null,
      productionLossRate: 1.05,
      addTiming: ''
    },
    nutrition: {
      servingNutrients: {},
      defaultTargetFields: [],
      labelText: ''
    },
    label: {
      labelCategory: null,
      labelNames: [],
      tagNames: [],
      labelNameSource: ''
    },
    retail: {
      enabled: false,
      shelfLifeMonths: null,
      openedShelfLifeDays: null,
      storageCondition: '',
      isOilBased: false,
      noSaleReason: null
    },
    diy: {
      enabled: false,
      platform: '',
      linkUrl: '',
      imageUrl: ''
    },
    procurement: {
      enabled: false
    },
    equivalence: {
      groupId: null,
      priority: null,
      reapproveGroup: true
    },
    evidence: {
      frontImageUrl: '',
      labelImageUrl: '',
      productUrl: '',
      selectionNote: ''
    },
    review: {
      acknowledgedWarnings: []
    }
  }
}

function draftView(
  id: string,
  overrides: Partial<SupplementDraftView> = {}
): SupplementDraftView {
  const payload = basePayload()
  return {
    id,
    createdBy: 'admin-1',
    status: 'DRAFT',
    schemaVersion: 1,
    name: '铜',
    payload,
    aiSnapshot: null,
    manualFields: [],
    verification: null,
    finalizedIngredientId: null,
    finalizedNutritionFoodId: null,
    finalizedEvidenceId: null,
    finalizedAt: null,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
    completeness: { totalRequired: 15, filledRequired: 0, missing: [] },
    ...overrides
  }
}

/** 在 effectScope 里建 composable，测试结束能一次清掉 watch 与防抖定时器。 */
function setup(id: string) {
  const scope = effectScope()
  const draftId = ref<string | null>(id)
  const state = scope.run(() => useSupplementDraft(draftId))
  if (!state) {
    throw new Error('useSupplementDraft 没有返回状态')
  }
  return { scope, draftId, state }
}

describe('草稿保存状态', () => {
  it('改动后是未保存，保存成功才回到已保存', async () => {
    const original = draftView('draft-a')
    api.get.mockResolvedValueOnce(original)
    const { state, scope } = setup('draft-a')

    await state.load()
    expect(state.dirty.value).toBe(false)

    state.draft.value!.payload.basic.name = '铜（改）'
    await nextTick()
    expect(state.dirty.value).toBe(true)
    expect(state.saveError.value).toBe('')

    api.update.mockResolvedValueOnce(
      draftView('draft-a', { name: '铜（改）' })
    )
    const saved = await state.save()

    expect(saved?.name).toBe('铜（改）')
    expect(state.dirty.value).toBe(false)
    expect(state.saveError.value).toBe('')
    scope.stop()
  })

  it('保存失败写 saveError 且保持未保存，不复用共享 error', async () => {
    api.get.mockResolvedValueOnce(draftView('draft-a'))
    const { state, scope } = setup('draft-a')
    await state.load()

    state.draft.value!.payload.basic.name = '铜（改）'
    await nextTick()

    api.update.mockRejectedValueOnce({
      response: { status: 500, data: { message: '数据库连接失败' } }
    })
    const result = await state.save()

    expect(result).toBeNull()
    expect(state.saveError.value).toBe('数据库连接失败')
    expect(state.dirty.value).toBe(true)
    expect(state.error.value).toBeNull()
    scope.stop()
  })

  it('409 保存失败提示刷新，而不是拿本地值覆盖', async () => {
    api.get.mockResolvedValueOnce(draftView('draft-a'))
    const { state, scope } = setup('draft-a')
    await state.load()

    state.draft.value!.payload.basic.name = '铜（改）'
    await nextTick()

    api.update.mockRejectedValueOnce({ response: { status: 409 } })
    await state.save()

    expect(state.saveError.value).toContain('草稿已被更新')
    expect(state.dirty.value).toBe(true)
    scope.stop()
  })

  it('markManual 记录人改、标脏，并在保存时随 manualFields 发出', async () => {
    api.get.mockResolvedValueOnce(draftView('draft-a'))
    const { state, scope } = setup('draft-a')
    await state.load()

    state.markManual('basic.name')
    await nextTick()

    expect(state.manualFields.value).toContain('basic.name')
    expect(state.dirty.value).toBe(true)

    const saved = draftView('draft-a', { manualFields: ['basic.name'] })
    api.update.mockResolvedValueOnce(saved)
    await state.save()

    expect(api.update).toHaveBeenCalledWith(
      'draft-a',
      expect.objectContaining({
        manualFields: expect.arrayContaining(['basic.name'])
      })
    )
    expect(state.manualFields.value).toContain('basic.name')
    expect(state.dirty.value).toBe(false)
    scope.stop()
  })

  it('reset 清掉未保存与保存失败状态', async () => {
    api.get.mockResolvedValueOnce(draftView('draft-a'))
    const { state, scope } = setup('draft-a')
    await state.load()

    state.draft.value!.payload.basic.name = '铜（改）'
    await nextTick()
    api.update.mockRejectedValueOnce({ response: { status: 500 } })
    await state.save()

    state.reset()

    expect(state.draft.value).toBeNull()
    expect(state.dirty.value).toBe(false)
    expect(state.saveError.value).toBe('')
    expect(state.saving.value).toBe(false)
    scope.stop()
  })

  it('409 置 conflict，重新加载后以服务端 manualFields 为准', async () => {
    api.get.mockResolvedValueOnce(draftView('draft-a'))
    const { state, scope } = setup('draft-a')
    await state.load()

    state.draft.value!.payload.basic.name = '铜（改）'
    await nextTick()
    api.update.mockRejectedValueOnce({ response: { status: 409 } })
    await state.save()

    expect(state.conflict.value).toBe(true)
    expect(state.saveError.value).toContain('重新加载草稿')

    api.get.mockResolvedValueOnce(
      draftView('draft-a', {
        manualFields: ['basic.brand'],
        name: '服务端版本'
      })
    )
    await state.load()

    expect(state.conflict.value).toBe(false)
    expect(state.draft.value?.name).toBe('服务端版本')
    expect(state.manualFields.value).toEqual(['basic.brand'])
    scope.stop()
  })
})

describe('在飞请求的草稿归属', () => {
  it('A 的加载结果回来时不会覆盖已打开的 B', async () => {
    const draftA = draftView('draft-a')
    const draftB = draftView('draft-b')
    let resolveA!: (value: SupplementDraftView) => void
    api.get.mockReturnValueOnce(
      new Promise<SupplementDraftView>((resolve) => {
        resolveA = resolve
      })
    )
    const { state, draftId, scope } = setup('draft-a')

    const pendingA = state.load()
    await nextTick()
    expect(api.get).toHaveBeenCalledTimes(1)

    state.reset()
    draftId.value = 'draft-b'
    api.get.mockResolvedValueOnce(draftB)
    await state.load()

    resolveA(draftA)
    await pendingA

    expect(state.draft.value?.id).toBe('draft-b')
    expect(state.loading.value).toBe(false)
    scope.stop()
  })

  it('切走后回来的校验结果不写进新草稿', async () => {
    const draftA = draftView('draft-a')
    const draftB = draftView('draft-b')
    api.get.mockResolvedValueOnce(draftA).mockResolvedValueOnce(draftB)
    const { state, draftId, scope } = setup('draft-a')
    await state.load()

    let resolveValidate!: (value: SupplementDraftReview) => void
    api.validate.mockReturnValueOnce(
      new Promise<SupplementDraftReview>((resolve) => {
        resolveValidate = resolve
      })
    )
    const pending = state.validate()
    await nextTick()
    expect(api.validate).toHaveBeenCalledTimes(1)

    // 模拟 Flow：返回列表（reset）→ 打开 B（load）
    state.reset()
    draftId.value = 'draft-b'
    await state.load()

    resolveValidate({
      draft: draftA,
      blockers: [],
      warnings: [],
      completeness: draftA.completeness
    })
    const result = await pending

    expect(result).toBeNull()
    expect(state.review.value).toBeNull()
    expect(state.draft.value?.id).toBe('draft-b')
    expect(state.validating.value).toBe(false)
    scope.stop()
  })

  it('AI 请求期间的人改不会被回包覆盖，并记进 manualFields', async () => {
    const draftA = draftView('draft-a')
    draftA.payload.evidence.frontImageUrl = 'https://example.com/front.png'
    draftA.payload.evidence.labelImageUrl = 'https://example.com/label.png'
    api.get.mockResolvedValueOnce(draftA)
    const { state, scope } = setup('draft-a')
    await state.load()

    let resolveAi!: (value: SupplementDraftView) => void
    api.aiFill.mockReturnValueOnce(
      new Promise<SupplementDraftView>((resolve) => {
        resolveAi = resolve
      })
    )
    const pending = state.runAi()
    await nextTick()
    expect(state.aiRunning.value).toBe(true)

    // 模拟 AI 期间仍有人改（正常 UI 有遮罩，这里验证兜底不被覆盖）。
    state.markManual('basic.name')
    state.draft.value!.payload.basic.name = '人改的名字'

    const aiView = draftView('draft-a', { name: 'AI 名字' })
    aiView.payload.basic.name = 'AI 新名字'
    resolveAi(aiView)
    await pending

    expect(state.draft.value?.payload.basic.name).toBe('人改的名字')
    expect(state.manualFields.value).toContain('basic.name')
    expect(state.error.value).toContain('AI 起草期间')
    scope.stop()
  })

  it('切走后回来的 AI 结果不覆盖新草稿', async () => {
    const draftA = draftView('draft-a')
    draftA.payload.evidence.frontImageUrl = 'https://example.com/front.png'
    draftA.payload.evidence.labelImageUrl = 'https://example.com/label.png'
    const draftB = draftView('draft-b')
    api.get.mockResolvedValueOnce(draftA).mockResolvedValueOnce(draftB)
    const { state, draftId, scope } = setup('draft-a')
    await state.load()

    let resolveAi!: (value: SupplementDraftView) => void
    api.aiFill.mockReturnValueOnce(
      new Promise<SupplementDraftView>((resolve) => {
        resolveAi = resolve
      })
    )
    const pending = state.runAi()
    await nextTick()
    expect(api.aiFill).toHaveBeenCalledTimes(1)

    state.reset()
    draftId.value = 'draft-b'
    await state.load()

    resolveAi(draftView('draft-a', { name: 'AI 改过的 A' }))
    const result = await pending

    expect(result).toBeNull()
    expect(state.draft.value?.id).toBe('draft-b')
    expect(state.draft.value?.name).toBe('铜')
    expect(state.aiRunning.value).toBe(false)
    scope.stop()
  })
})
