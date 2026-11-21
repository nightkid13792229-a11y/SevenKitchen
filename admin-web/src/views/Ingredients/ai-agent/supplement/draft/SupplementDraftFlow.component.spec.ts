// @vitest-environment jsdom
/**
 * 草稿流程外壳的导航守卫测试（jsdom + @vue/test-utils）。
 *
 * 复核点：保存失败时点「返回草稿列表」不能悄悄清空编辑状态，
 * 必须留在编辑页并显示失败原因；保存成功后才回列表并 reset。
 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import type {
  SupplementDraftPayload,
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

import SupplementDraftFlow from './SupplementDraftFlow.vue'

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
})
