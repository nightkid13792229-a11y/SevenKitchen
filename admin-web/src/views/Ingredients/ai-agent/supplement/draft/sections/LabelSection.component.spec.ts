// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import LabelSection from './LabelSection.vue'

function mountSection() {
  return mount(LabelSection, {
    props: {
      modelValue: {
        labelCategory: 'FEED_ADDITIVE',
        labelNames: ['牛磺酸'],
        tagNames: ['氨基酸'],
        labelNameSource: ''
      },
      addTiming: 'BEFORE_MIXING'
    },
    global: { plugins: [ElementPlus] }
  })
}

describe('补剂标签区块', () => {
  it('不再显示标签分类标签字段，保留规范名和添加时机', () => {
    const wrapper = mountSection()

    expect(wrapper.text()).toContain('标签分类')
    expect(wrapper.text()).toContain('标签名称')
    expect(wrapper.text()).toContain('添加时机')
    expect(wrapper.text()).not.toContain('标签分类标签')
  })
})
