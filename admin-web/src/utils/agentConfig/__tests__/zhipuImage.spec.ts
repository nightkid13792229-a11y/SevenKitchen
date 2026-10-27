import { describe, expect, it } from 'vitest'
import {
  buildZhipuImageSettingsPayload,
  resolveZhipuImageStatus,
  validateZhipuImageForm,
  type ZhipuImageForm,
} from '../zhipuImage'
import type { ZhipuImageSettings } from '@/types/nutritionGovernance'

const form: ZhipuImageForm = {
  enabled: true,
  baseUrl: ' https://open.bigmodel.cn ',
  model: ' glm-image ',
  apiKey: ' key-1234 ',
}

const saved: ZhipuImageSettings = {
  purpose: 'RECIPE_COVER_IMAGE',
  provider: 'ZHIPU',
  enabled: true,
  baseUrl: 'https://open.bigmodel.cn',
  model: 'glm-image',
  apiKeyConfigured: true,
  apiKeyLast4: '1234',
  requestTimeoutMs: 90000,
  updatedAt: null,
}

describe('zhipuImage', () => {
  it('payload 去首尾空格；没填 Key 就不传', () => {
    expect(buildZhipuImageSettingsPayload(form)).toEqual({
      enabled: true,
      baseUrl: 'https://open.bigmodel.cn',
      model: 'glm-image',
      apiKey: 'key-1234',
    })
    expect(
      buildZhipuImageSettingsPayload({ ...form, apiKey: '   ' }),
    ).toEqual({
      enabled: true,
      baseUrl: 'https://open.bigmodel.cn',
      model: 'glm-image',
    })
  })

  it('状态：加载中 / 未配置 / 已配置未启用 / 已启用', () => {
    expect(resolveZhipuImageStatus(null)).toEqual({
      label: '加载中…',
      type: 'info',
    })
    expect(
      resolveZhipuImageStatus({
        ...saved,
        enabled: false,
      }),
    ).toEqual({ label: '已配置 Key，未启用', type: 'warning' })
    expect(resolveZhipuImageStatus(saved)).toEqual({
      label: '已启用',
      type: 'success',
    })
    expect(
      resolveZhipuImageStatus({
        ...saved,
        enabled: false,
        apiKeyConfigured: false,
        apiKeyLast4: null,
      }),
    ).toEqual({ label: '未配置 Key', type: 'info' })
  })

  it('校验：空 URL / 空模型 / 启用但无 Key', () => {
    expect(validateZhipuImageForm({ ...form, baseUrl: ' ' }, saved)).toContain(
      'Base URL',
    )
    expect(validateZhipuImageForm({ ...form, model: ' ' }, saved)).toContain(
      '模型',
    )
    expect(
      validateZhipuImageForm(
        { ...form, apiKey: '' },
        { ...saved, apiKeyConfigured: false },
      ),
    ).toContain('API Key')
    expect(
      validateZhipuImageForm(
        { ...form, enabled: false, apiKey: '' },
        { ...saved, apiKeyConfigured: false },
      ),
    ).toBe('')
    expect(validateZhipuImageForm(form, saved)).toBe('')
  })
})
