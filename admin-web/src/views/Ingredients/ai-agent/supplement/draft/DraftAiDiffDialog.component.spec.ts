// @vitest-environment jsdom
/**
 * AI 重填 diff 弹窗（Task 15 / spec §10.3）。
 *
 * 复核点：
 * - 只列真正变化的叶子路径，人改行标「人改，AI 未覆盖」且不可勾选采用；
 * - 「采用所选」发出勾选的路径；
 * - 「保留我的」发空数组，父级据此全部回退并标人改。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import type { SupplementDraftPayload } from '@/api/supplementDrafts'
import DraftAiDiffDialog from './DraftAiDiffDialog.vue'

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

function beforePayload(): SupplementDraftPayload {
  return basePayload()
}

function afterPayload(): SupplementDraftPayload {
  const payload = basePayload()
  payload.basic.name = '铜（AI）'
  payload.basic.brand = 'AI 品牌'
  payload.retail.enabled = true
  payload.retail.shelfLifeMonths = 24
  return payload
}

function mountDialog(manualFields: string[] = ['basic.brand']) {
  return mount(DraftAiDiffDialog, {
    props: {
      modelValue: true,
      before: beforePayload(),
      after: afterPayload(),
      manualFields
    },
    global: { plugins: [ElementPlus] }
  })
}

describe('AI 重填 diff 弹窗', () => {
  it('列出变化路径，人改行标「人改，AI 未覆盖」', () => {
    const wrapper = mountDialog()

    expect(wrapper.find('[data-diff-row="basic.name"]').exists()).toBe(true)
    expect(wrapper.find('[data-diff-row="retail.enabled"]').exists()).toBe(true)
    expect(wrapper.find('[data-diff-row="basic.brand"]').exists()).toBe(true)

    const manualRow = wrapper.find('[data-diff-row="basic.brand"]')
    expect(manualRow.text()).toContain('人改，AI 未覆盖')
    expect(
      manualRow.find('[data-manual-label="true"]').exists()
    ).toBe(true)
    expect(
      wrapper.find('[data-diff-row="basic.name"]').text()
    ).not.toContain('人改，AI 未覆盖')
  })

  it('「采用所选」只发出非人改且被勾选的路径', async () => {
    const wrapper = mountDialog()

    await wrapper.find('[data-action="diff-adopt"]').trigger('click')

    expect(wrapper.emitted('apply')).toHaveLength(1)
    expect(wrapper.emitted('apply')?.[0]).toEqual([
      ['basic.name', 'retail.enabled', 'retail.shelfLifeMonths']
    ])
    expect(wrapper.emitted('apply')?.[0]?.[0]).not.toContain('basic.brand')
  })

  it('取消勾选某项后，采用结果里不再包含它', async () => {
    const wrapper = mountDialog()

    const checkbox = wrapper.find(
      '[data-diff-check="basic.name"] input[type="checkbox"]'
    )
    expect(checkbox.exists()).toBe(true)
    await checkbox.setValue(false)

    await wrapper.find('[data-action="diff-adopt"]').trigger('click')
    expect(wrapper.emitted('apply')?.[0]).toEqual([
      ['retail.enabled', 'retail.shelfLifeMonths']
    ])
  })

  it('「保留我的」发出空数组（父级全部回退并标人改）', async () => {
    const wrapper = mountDialog()

    await wrapper.find('[data-action="diff-keep-mine"]').trigger('click')

    expect(wrapper.emitted('apply')).toHaveLength(1)
    expect(wrapper.emitted('apply')?.[0]).toEqual([[]])
  })
})
