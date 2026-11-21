// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ProcurementSection from './ProcurementSection.vue'

function mountSection() {
  return mount(ProcurementSection, {
    props: {
      modelValue: { enabled: true },
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 120,
      currentPricePerPurchaseUnit: 98.5,
      unitDisplayLabel: '粒'
    },
    global: { plugins: [ElementPlus] }
  })
}

describe('补剂生产采购区块', () => {
  it('保留生产采购意向，不显示食品采购 SKU 提示', () => {
    const wrapper = mountSection()

    expect(wrapper.text()).toContain('生产采购意向')
    expect(wrapper.text()).toContain('是否用于生产/采购')
    expect(wrapper.text()).not.toContain('采购 SKU')
  })
})
