import type {
  UpdateZhipuImageSettingsPayload,
  ZhipuImageSettings,
} from '@/types/nutritionGovernance'

/**
 * 智谱封面图配置的纯逻辑（2026-10-27）。
 *
 * 放这里而不是页面里，是为了能单测：
 *  · 提交时去掉首尾空格；没填 Key 就不传（后端保留原 Key）；
 *  · 状态标签：加载中 / 未配置 / 已配置未启用 / 已启用；
 *  · 先填 Key 再启用，避免保存出一个「启用了但没 Key」的配置。
 */
export interface ZhipuImageForm {
  enabled: boolean
  baseUrl: string
  model: string
  apiKey: string
}

export interface ZhipuImageStatus {
  label: string
  type: 'success' | 'warning' | 'info'
}

export function buildZhipuImageSettingsPayload(
  form: ZhipuImageForm
): UpdateZhipuImageSettingsPayload {
  const payload: UpdateZhipuImageSettingsPayload = {
    enabled: form.enabled,
    baseUrl: form.baseUrl.trim(),
    model: form.model.trim(),
  }
  const apiKey = form.apiKey.trim()
  return apiKey ? { ...payload, apiKey } : payload
}

export function resolveZhipuImageStatus(
  settings: ZhipuImageSettings | null
): ZhipuImageStatus {
  if (!settings) return { label: '加载中…', type: 'info' }
  if (settings.enabled && settings.apiKeyConfigured) {
    return { label: '已启用', type: 'success' }
  }
  if (settings.apiKeyConfigured) {
    return { label: '已配置 Key，未启用', type: 'warning' }
  }
  return { label: '未配置 Key', type: 'info' }
}

export function validateZhipuImageForm(
  form: ZhipuImageForm,
  settings: ZhipuImageSettings | null
): string {
  if (!form.baseUrl.trim()) return '智谱 Base URL 不能为空'
  if (!form.model.trim()) return '智谱模型不能为空'
  if (form.enabled && !form.apiKey.trim() && !settings?.apiKeyConfigured) {
    return '先填写智谱 API Key，再启用'
  }
  return ''
}
