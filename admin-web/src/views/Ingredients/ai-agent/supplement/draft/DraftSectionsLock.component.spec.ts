// @vitest-environment jsdom
/**
 * AI 起草 / 差异弹窗期间，窗口级粘贴必须被区块自己拒绝。
 *
 * 编辑页的 inert 只能挡住鼠标与焦点，挡不住 `window` 上的 paste 事件；
 * 这里直接给两个接收图片的区块做回归。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import type {
  SupplementDraftDiy,
  SupplementDraftEvidence
} from '@/api/supplementDrafts'

const upload = vi.hoisted(() => vi.fn())

vi.mock('@/api/ingredients', () => ({
  ingredientApi: { uploadIngredientDiyImage: upload }
}))

import EvidenceSection from './sections/EvidenceSection.vue'
import DiySection from './sections/DiySection.vue'

function baseEvidence(): SupplementDraftEvidence {
  return {
    frontImageUrl: '',
    labelImageUrl: '',
    productUrl: '',
    selectionNote: ''
  }
}

function baseDiy(): SupplementDraftDiy {
  return { enabled: true, platform: 'IHERB', linkUrl: '', imageUrl: '' }
}

/** 构造一个带图片文件的 window paste 事件。 */
function pasteEventWithImage(): Event {
  const file = new File(['fake-image'], 'paste.png', { type: 'image/png' })
  const event = new Event('paste', { bubbles: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => file
        }
      ]
    }
  })
  return event
}

beforeEach(() => {
  upload.mockReset()
  upload.mockResolvedValue({ url: 'https://example.com/pasted.png' })
})

describe('区块锁定期间的粘贴', () => {
  it('EvidenceSection locked=true 时粘贴不调用上传，也不改图片', async () => {
    const wrapper = mount(EvidenceSection, {
      props: { modelValue: baseEvidence(), locked: true },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()

    window.dispatchEvent(pasteEventWithImage())
    await flushPromises()

    expect(upload).not.toHaveBeenCalled()
    expect(wrapper.props('modelValue').frontImageUrl).toBe('')
    wrapper.unmount()
  })

  it('DiySection locked=true 时粘贴不调用上传，也不改图片', async () => {
    const wrapper = mount(DiySection, {
      props: { modelValue: baseDiy(), locked: true },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()

    window.dispatchEvent(pasteEventWithImage())
    await flushPromises()

    expect(upload).not.toHaveBeenCalled()
    expect(wrapper.props('modelValue').imageUrl).toBe('')
    wrapper.unmount()
  })

  it('未锁定时粘贴仍会上传（证明拦截只在 locked 时生效）', async () => {
    const wrapper = mount(EvidenceSection, {
      props: { modelValue: baseEvidence(), locked: false },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()

    window.dispatchEvent(pasteEventWithImage())
    await flushPromises()

    expect(upload).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
