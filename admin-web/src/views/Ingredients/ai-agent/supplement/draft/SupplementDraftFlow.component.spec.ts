// @vitest-environment jsdom
/**
 * 草稿流程外壳的导航守卫测试（jsdom + @vue/test-utils）。
 *
 * 复核点：保存失败时点「返回草稿列表」不能悄悄清空编辑状态，
 * 必须留在编辑页并显示失败原因；保存成功后才回列表并 reset。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import type {
  SupplementDraftPayload,
  SupplementDraftReview,
  SupplementDraftValidationIssue,
  SupplementDraftView,
  SupplementWriteVerification
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

// 核验页里的修复入口用 useRouter；这里给一个最小 mock，避免 jsdom 里没有路由上下文。
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))

import SupplementDraftFlow from './SupplementDraftFlow.vue'

beforeEach(() => {
  // 每个用例从干净的调用次数开始；默认 mock 由各用例自己设置。
  vi.resetAllMocks()
})

function basePayload(): SupplementDraftPayload {
  return {
    basic: {
      name: '铜',
      brand: '',
      productModel: '',
      purchaseChannel: '',
      baseUnit: 'PCS',
      unitDisplayLabel: '粒',
      physicalForm: 'CAPSULE',
      servingUnitsPerDose: 1,
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 120,
      currentPricePerPurchaseUnit: 80.76,
      productionLossRate: 1.05,
      addTiming: 'BEFORE_MEAL'
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
    diy: { enabled: false, platform: '', linkUrl: '', imageUrl: '' },
    procurement: { enabled: false },
    equivalence: { groupId: null, priority: null, reapproveGroup: true },
    evidence: {
      frontImageUrl: '',
      labelImageUrl: '',
      productUrl: '',
      selectionNote: ''
    },
    review: { acknowledgedWarnings: [] }
  }
}

function draftView(name = '铜'): SupplementDraftView {
  const payload = basePayload()
  payload.basic.name = name
  return {
    id: 'draft-1',
    createdBy: 'admin-1',
    status: 'DRAFT',
    schemaVersion: 1,
    name,
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
    completeness: { totalRequired: 15, filledRequired: 9, missing: [] }
  }
}

/** 可控 Promise：模拟「保存请求还没回来时人又改了」。 */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function reviewFor(
  draft: SupplementDraftView,
  blockers: SupplementDraftValidationIssue[] = [],
  warnings: SupplementDraftValidationIssue[] = []
): SupplementDraftReview {
  return {
    draft,
    blockers,
    warnings,
    completeness: draft.completeness
  }
}

function verificationFor(ok = true): SupplementWriteVerification {
  return {
    ok,
    checkedAt: '2026-11-21T03:00:00.000Z',
    fields: [
      {
        key: 'basic.name',
        label: '原料名称',
        target: 'ingredient.name',
        expected: '铜',
        actual: '铜',
        ok: true
      }
    ],
    features: [
      {
        code: 'RECIPE',
        label: '配方可选',
        ok,
        severity: ok ? 'INFO' : 'ERROR',
        detail: ok ? '主映射 + 营养档案 VERIFIED' : '缺少主映射'
      }
    ]
  }
}

async function openEditor(wrapper: ReturnType<typeof mount>): Promise<void> {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await wrapper.find('[data-action="new-empty"]').trigger('click')
  await flushPromises()
}

describe('草稿流程导航守卫', () => {
  it('保存失败时返回列表留在编辑页并显示原因，成功后重置回列表', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // 空列表 → 新建 → 进编辑页
    await wrapper.find('[data-action="new-empty"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-action="back"]').exists()).toBe(true)

    // 改个名字 → dirty → 保存失败
    await wrapper.find('.draft-editor__name input').setValue('铜（改）')
    await flushPromises()
    api.update.mockRejectedValueOnce({
      response: { status: 500, data: { message: '数据库连接失败' } }
    })

    await wrapper.find('[data-action="back"]').trigger('click')
    await flushPromises()

    // 还在编辑页，并且能看到失败原因
    expect(wrapper.find('[data-action="back"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="save"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('数据库连接失败')

    // 保存成功后再次返回，才回到列表
    api.update.mockResolvedValueOnce(draftView('铜（改）'))
    await wrapper.find('[data-action="back"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-action="back"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('还没有草稿')
    wrapper.unmount()
  })

  it('保存并离开时若保存期间又有改动，留在编辑页而不是清空', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)

    await wrapper.find('.draft-editor__name input').setValue('铜（改）')
    await flushPromises()

    const pending = deferred<SupplementDraftView>()
    api.update.mockReturnValueOnce(pending.promise)

    await wrapper.find('[data-action="save"]').trigger('click')
    await flushPromises()

    // 保存请求还没回来，人又改了一次。
    await wrapper.find('.draft-editor__name input').setValue('铜（改2）')
    pending.resolve(draftView('铜（改）'))
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // 服务端只保存了旧值；本地仍有新改动，不能离开。
    expect(wrapper.find('[data-action="back"]').exists()).toBe(true)
    expect(wrapper.find('[data-save-state="unsaved"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('AI 返回变化时弹 diff；保留我的会回退并带 manualFields 保存', async () => {
    const draft = draftView('铜')
    draft.payload.evidence.frontImageUrl = 'https://example.com/front.png'
    draft.payload.evidence.labelImageUrl = 'https://example.com/label.png'
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)

    const aiDraft = draftView('AI 名字')
    aiDraft.payload.basic.name = 'AI 名字'
    aiDraft.payload.evidence.frontImageUrl = draft.payload.evidence.frontImageUrl
    aiDraft.payload.evidence.labelImageUrl = draft.payload.evidence.labelImageUrl
    api.aiFill.mockResolvedValueOnce(aiDraft)

    await wrapper.find('[data-action="run-ai"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-diff-row="basic.name"]').exists()).toBe(true)

    api.update.mockResolvedValueOnce(draftView('铜'))
    await wrapper.find('[data-action="diff-keep-mine"]').trigger('click')
    await flushPromises()

    expect(api.update).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        manualFields: expect.arrayContaining(['basic.name'])
      })
    )
    expect(wrapper.find('[data-diff-row="basic.name"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('409 时显示重新加载入口，点击后不用刷新浏览器就能取回服务端草稿', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)

    await wrapper.find('.draft-editor__name input').setValue('铜（改）')
    await flushPromises()
    api.update.mockRejectedValueOnce({ response: { status: 409 } })

    await wrapper.find('[data-action="back"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-action="reload"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('草稿已被更新')

    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm' as never)
    api.get.mockResolvedValueOnce(draftView('服务端版本'))

    await wrapper.find('[data-action="reload"]').trigger('click')
    await flushPromises()

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(
      (wrapper.find('.draft-editor__name input').element as HTMLInputElement)
        .value
    ).toBe('服务端版本')
    expect(wrapper.find('[data-action="reload"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('重新加载返回 404 时退回列表，不把 404 误当成普通错误', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)

    await wrapper.find('.draft-editor__name input').setValue('铜（改）')
    await flushPromises()
    api.update.mockRejectedValueOnce({ response: { status: 409 } })
    await wrapper.find('[data-action="back"]').trigger('click')
    await flushPromises()

    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm' as never)
    api.get.mockRejectedValueOnce({ response: { status: 404 } })

    await wrapper.find('[data-action="reload"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-action="back"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('还没有草稿')
    wrapper.unmount()
  })

  it('重新加载失败（非 404）保留冲突与本地内容，可继续重试', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)

    await wrapper.find('.draft-editor__name input').setValue('铜（改）')
    await flushPromises()
    api.update.mockRejectedValueOnce({ response: { status: 409 } })
    await wrapper.find('[data-action="back"]').trigger('click')
    await flushPromises()

    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm' as never)
    api.get.mockRejectedValueOnce({ response: { status: 500 } })

    await wrapper.find('[data-action="reload"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-action="back"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="reload"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('加载草稿失败')
    wrapper.unmount()
  })

  it('进入审核屏后写入失败留在审核屏，并显示后端原因', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)
    api.validate.mockResolvedValue(reviewFor(draft))

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)

    await wrapper.find('[data-action="review"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-review-screen]').exists()).toBe(true)

    api.finalize.mockRejectedValueOnce({
      response: { status: 400, data: { message: '写入前校验发现新的阻断项' } }
    })
    await wrapper.find('[data-action="finalize"]').trigger('click')
    await flushPromises()

    // 失败不能跳到核验页，也不能把审核屏藏起来。
    expect(wrapper.find('[data-review-screen]').exists()).toBe(true)
    expect(wrapper.text()).toContain('写入前校验发现新的阻断项')
    expect(wrapper.find('[data-finalize-overlay]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('写入中显示不可关闭遮罩，成功后进入核验页', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)
    api.validate.mockResolvedValue(reviewFor(draft))

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)

    await wrapper.find('[data-action="review"]').trigger('click')
    await flushPromises()

    const pending = deferred<{
      ingredientId: string
      nutritionFoodId: string
      evidenceId: string
      verification: SupplementWriteVerification
    }>()
    api.finalize.mockReturnValueOnce(pending.promise)

    await wrapper.find('[data-action="finalize"]').trigger('click')
    await flushPromises()

    const overlay = wrapper.find('[data-finalize-overlay]')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text()).toContain('校验')
    expect(overlay.text()).toContain('写原料')
    expect(overlay.text()).toContain('回读核验')
    // 写入中不能返回编辑。
    expect(wrapper.find('[data-action="back"]').attributes('disabled')).toBeDefined()

    pending.resolve({
      ingredientId: 'ingredient-1',
      nutritionFoodId: 'nutrition-1',
      evidenceId: 'evidence-1',
      verification: verificationFor()
    })
    await flushPromises()

    expect(wrapper.find('[data-finalize-overlay]').exists()).toBe(false)
    expect(wrapper.find('[data-verification-screen]').exists()).toBe(true)
    expect(wrapper.text()).toContain('已写入并核验通过')
    wrapper.unmount()
  })

  it('核验页「再建一条」回列表并新建下一张草稿', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)
    api.validate.mockResolvedValue(reviewFor(draft))
    api.finalize.mockResolvedValueOnce({
      ingredientId: 'ingredient-1',
      nutritionFoodId: 'nutrition-1',
      evidenceId: 'evidence-1',
      verification: verificationFor()
    })

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)
    await wrapper.find('[data-action="review"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-action="finalize"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-verification-screen]').exists()).toBe(true)

    await wrapper.find('[data-action="create-another"]').trigger('click')
    await flushPromises()

    expect(api.create).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-action="back"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('校验期间锁住编辑，校验回来前不显示审核屏', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)

    const pending = deferred<SupplementDraftReview>()
    api.validate.mockReturnValueOnce(pending.promise)

    await wrapper.find('[data-action="review"]').trigger('click')
    await flushPromises()

    // 校验还没回来：不能提前进审核屏，也不能继续改草稿。
    expect(wrapper.find('[data-review-screen]').exists()).toBe(false)
    expect(wrapper.find('[data-lock-state="validating"]').exists()).toBe(true)
    expect(wrapper.find('.draft-editor__body').attributes('inert')).toBeDefined()

    pending.resolve(reviewFor(draft))
    await flushPromises()

    expect(wrapper.find('[data-review-screen]').exists()).toBe(true)
    expect(wrapper.find('[data-lock-state="validating"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('进审核前保存失败时不切审核屏，并显示保存原因', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)
    await wrapper.find('.draft-editor__name input').setValue('铜（改）')
    await flushPromises()

    api.update.mockRejectedValueOnce({
      response: { status: 500, data: { message: '数据库连接失败' } }
    })
    await wrapper.find('[data-action="review"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-review-screen]').exists()).toBe(false)
    expect(api.validate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('数据库连接失败')
    wrapper.unmount()
  })

  it('审核屏勾选提醒把 ackKey 写回草稿，参数含多个冒号也不丢', async () => {
    const draft = draftView()
    const warning: SupplementDraftValidationIssue = {
      code: 'LABEL_NAME_UNVERIFIED',
      level: 'WARNING',
      message: '标签名称还没在目录里核对',
      fieldPath: 'label.labelNames',
      ackKey: 'LABEL_NAME_UNVERIFIED:铜:Swanson'
    }
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)
    api.validate.mockResolvedValue(reviewFor(draft, [], [warning]))
    api.update.mockResolvedValue(draft)

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)

    await wrapper.find('[data-action="review"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-review-screen]').exists()).toBe(true)

    await wrapper.find('[data-warning] input[type="checkbox"]').setValue(true)
    // 自动保存有 800ms 防抖；等它把 ack 写回草稿。
    await new Promise((resolve) => setTimeout(resolve, 850))
    await flushPromises()

    expect(api.update).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        payload: expect.objectContaining({
          review: {
            acknowledgedWarnings: [
              { code: 'LABEL_NAME_UNVERIFIED', paramsHash: '铜:Swanson' }
            ]
          }
        })
      })
    )
    wrapper.unmount()
  })

  it('finalize 400 后刷新 review，阻断项出现且「确认写入」禁用', async () => {
    const draft = draftView()
    const blocker: SupplementDraftValidationIssue = {
      code: 'NAME_REQUIRED',
      level: 'BLOCKER',
      message: '请填写原料名称',
      fieldPath: 'basic.name'
    }
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)
    api.validate
      .mockResolvedValueOnce(reviewFor(draft))
      .mockResolvedValueOnce(reviewFor(draft, [blocker]))

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)
    await wrapper.find('[data-action="review"]').trigger('click')
    await flushPromises()

    api.finalize.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { message: '有 1 个阻断项，暂时不能写入' }
      }
    })
    await wrapper.find('[data-action="finalize"]').trigger('click')
    await flushPromises()

    // 失败后必须重新校验；审核屏不能继续显示旧的「可以写入」。
    expect(api.validate).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('请填写原料名称')
    expect(wrapper.text()).toContain('有 1 个阻断项，暂时不能写入')
    expect(wrapper.find('[data-action="finalize"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('409 重复建档显示已有记录入口，可跳原料库', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)
    api.validate.mockResolvedValue(reviewFor(draft))

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)
    await wrapper.find('[data-action="review"]').trigger('click')
    await flushPromises()

    api.finalize.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          message: '同名同品牌同规格的补剂已存在',
          ingredientId: 'ingredient-existing'
        }
      }
    })
    await wrapper.find('[data-action="finalize"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-duplicate-record]').exists()).toBe(true)
    expect(wrapper.text()).toContain('ingredient-existing')
    expect(wrapper.text()).toContain('这条补剂已有记录')
    expect(wrapper.find('[data-action="finalize"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-action="go-ingredients"]').trigger('click')
    expect(router.push).toHaveBeenCalledWith('/ingredients')
    wrapper.unmount()
  })

  it('409 草稿被更新时显示重新加载按钮，确认后重新加载并校验', async () => {
    const draft = draftView()
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(draft)
    api.get.mockResolvedValue(draft)
    api.validate.mockResolvedValue(reviewFor(draft))

    const wrapper = mount(SupplementDraftFlow, {
      global: { plugins: [ElementPlus] }
    })
    await openEditor(wrapper)
    await wrapper.find('[data-action="review"]').trigger('click')
    await flushPromises()

    api.finalize.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { message: '草稿已被更新，请刷新后再试' }
      }
    })
    await wrapper.find('[data-action="finalize"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-stale-conflict]').exists()).toBe(true)
    expect(wrapper.find('[data-action="finalize"]').attributes('disabled')).toBeDefined()
    const reload = wrapper.find('[data-action="review-reload"]')
    expect(reload.exists()).toBe(true)

    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm' as never)
    api.get.mockResolvedValueOnce(draftView('服务端版本'))

    await reload.trigger('click')
    await flushPromises()

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-review-screen]').exists()).toBe(true)
    wrapper.unmount()
  })
})
