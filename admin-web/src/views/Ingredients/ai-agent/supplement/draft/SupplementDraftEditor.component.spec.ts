// @vitest-environment jsdom
/**
 * 编辑页外壳的保存状态测试（jsdom + @vue/test-utils）。
 *
 * 复核点：顶部/底部不能再说「已自动保存」——防抖期间必须是「未保存」，
 * 保存失败必须显示「保存失败」，只有服务端确认过才是「已保存」。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import type {
  SupplementDraftPayload,
  SupplementDraftView
} from '@/api/supplementDrafts'
import SupplementDraftEditor from './SupplementDraftEditor.vue'

function basePayload(): SupplementDraftPayload {
  return {
    basic: {
      name: '铜',
      brand: 'Swanson',
      productModel: '120 粒/瓶',
      purchaseChannel: 'iHerb',
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
      servingNutrients: { 'minerals.copper': 2 },
      defaultTargetFields: ['minerals.copper'],
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

function draftView(): SupplementDraftView {
  return {
    id: 'draft-1',
    createdBy: 'admin-1',
    status: 'DRAFT',
    schemaVersion: 1,
    name: '铜',
    payload: basePayload(),
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

interface EditorProps {
  saving: boolean
  aiRunning: boolean
  validating: boolean
  finalizing: boolean
  dirty: boolean
  saveError: string
}

function mountEditor(overrides: Partial<EditorProps> = {}) {
  return mount(SupplementDraftEditor, {
    props: {
      draft: draftView(),
      saving: false,
      aiRunning: false,
      validating: false,
      finalizing: false,
      dirty: false,
      saveError: '',
      ...overrides
    },
    global: { plugins: [ElementPlus] }
  })
}

describe('草稿编辑页保存状态', () => {
  it('未保存 / 保存中 / 保存失败 / 已保存 四态真实显示', async () => {
    const wrapper = mountEditor({ dirty: true })

    expect(wrapper.find('[data-save-state="unsaved"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('未保存')

    await wrapper.setProps({ saving: true })
    expect(wrapper.find('[data-save-state="saving"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('保存中…')

    await wrapper.setProps({
      saving: false,
      saveError: '草稿已被更新，请刷新后再试'
    })
    expect(wrapper.find('[data-save-state="failed"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('保存失败')
    expect(
      wrapper.find('[data-save-state="failed"]').attributes('title')
    ).toContain('草稿已被更新')

    await wrapper.setProps({ saveError: '', dirty: false })
    expect(wrapper.find('[data-save-state="saved"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('已保存')
  })

  it('AI/校验/写入进行中时禁用保存并离开', async () => {
    const wrapper = mountEditor()
    expect(
      wrapper.find('[data-action="save"]').attributes('disabled')
    ).toBeUndefined()

    await wrapper.setProps({ aiRunning: true })
    expect(
      wrapper.find('[data-action="save"]').attributes('disabled')
    ).toBeDefined()

    await wrapper.setProps({ aiRunning: false, validating: true })
    expect(
      wrapper.find('[data-action="save"]').attributes('disabled')
    ).toBeDefined()

    await wrapper.setProps({ validating: false, finalizing: true })
    expect(
      wrapper.find('[data-action="save"]').attributes('disabled')
    ).toBeDefined()
  })
})
