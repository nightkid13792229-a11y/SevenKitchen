/**
 * 平台选项字典 · 后台维护 API（2026-10-16，食谱定制重构 批次 1.3）
 *
 * ## 为什么会有这个页面
 *
 * 老板要求「把所有的字段、算法等解耦出来」「前端只负责渲染」。
 * 在这之前，同一个状态码的中文在小程序 5 处、后台 1 处各写一份 ——
 * 加一个枚举要改六处（2026-10-04 加「已取消」时就漏了两处半）。
 *
 * 现在中文是**数据**，这个页面就是改它的地方：
 * 改一次，三个端一起变，不用发版。
 *
 * ## 两类选项集的差别（后端强制，前端只是提前把按钮置灰）
 *
 * · `ENUM` —— 取值由代码枚举定义，只能改标签/说明/色调/排序/启用，**不能增删**。
 *   代码里有 if-else 依赖这些值（例如「已付款才能取消」）。
 * · `DATA` —— 纯数据，可自由增删改。
 */
import api from './index'

export type OptionSetSourceType = 'ENUM' | 'DATA'

export interface PlatformOptionSetSummary {
  code: string
  name: string
  description: string | null
  sourceType: OptionSetSourceType
  /** 能不能增删条目（`DATA` 才行）—— 由后端算好，前端不判断 sourceType */
  canAddOrRemove: boolean
  itemCount: number
  enabledCount: number
}

export interface PlatformOptionItem {
  code: string
  label: string
  description: string | null
  tone: string | null
  icon: string | null
  sortOrder: number
  isDefault: boolean
  extra: Record<string, unknown> | null
}

export interface AdminPlatformOptionItem extends PlatformOptionItem {
  enabled: boolean
}

export interface PlatformOptionSetDetail {
  code: string
  name: string
  description: string | null
  sourceType: OptionSetSourceType
  items: AdminPlatformOptionItem[]
}

export interface UpdateOptionItemPayload {
  label?: string
  description?: string | null
  tone?: string | null
  icon?: string | null
  sortOrder?: number
  enabled?: boolean
}

export const platformOptionsApi = {
  /** 全部选项集的元信息 + 可用色彩档位（档位也由后端给，前端不写死） */
  listSets: (): Promise<{
    sets: PlatformOptionSetSummary[]
    tones: string[]
  }> => api.get('/admin/options'),

  getSet: (setCode: string): Promise<PlatformOptionSetDetail> =>
    api.get(`/admin/options/${encodeURIComponent(setCode)}`),

  updateItem: (
    setCode: string,
    code: string,
    payload: UpdateOptionItemPayload,
  ): Promise<void> =>
    api.put(
      `/admin/options/${encodeURIComponent(setCode)}/items/${encodeURIComponent(code)}`,
      payload,
    ),

  createItem: (
    setCode: string,
    payload: { code: string; label: string; sortOrder?: number },
  ): Promise<void> =>
    api.post(`/admin/options/${encodeURIComponent(setCode)}/items`, payload),

  deleteItem: (setCode: string, code: string): Promise<void> =>
    api.delete(
      `/admin/options/${encodeURIComponent(setCode)}/items/${encodeURIComponent(code)}`,
    ),
}
