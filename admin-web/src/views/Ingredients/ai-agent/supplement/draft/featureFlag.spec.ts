/**
 * 补剂草稿流程开关的读取规则。
 *
 * 只认构建变量 VITE_SUPPLEMENT_DRAFT_FLOW === 'true'；未设置或任何其他值
 * 都必须回到旧的两段式流程，保证默认关、随时可回滚。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSupplementDraftFlowEnabled } from './featureFlag'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isSupplementDraftFlowEnabled', () => {
  it('未设置时默认关闭', () => {
    vi.stubEnv('VITE_SUPPLEMENT_DRAFT_FLOW', undefined)
    expect(isSupplementDraftFlowEnabled()).toBe(false)
  })

  it('显式设置为 true 时开启', () => {
    vi.stubEnv('VITE_SUPPLEMENT_DRAFT_FLOW', 'true')
    expect(isSupplementDraftFlowEnabled()).toBe(true)
  })

  it('其他取值一律关闭', () => {
    for (const value of ['false', 'TRUE', '1', 'yes', ' true ']) {
      vi.stubEnv('VITE_SUPPLEMENT_DRAFT_FLOW', value)
      expect(isSupplementDraftFlowEnabled(), value).toBe(false)
    }
  })
})
