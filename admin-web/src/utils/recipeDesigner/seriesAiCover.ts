import { isTemporarySeriesName } from './seriesName'

/**
 * 系列 AI 封面的纯逻辑（2026-10-27）。
 *
 * 都放在这里而不是抽屉里，是为了能单测：
 *  · 什么时候按钮可用 / 不可用的原因；
 *  · `save` 什么时候是 true（只有「空封面 + 未上线」）；
 *  · 按钮、提示、成功文案。
 *
 * 抽屉只负责把状态喂进来、把结果渲染出去。
 */

/** DeepSeek + Seedream 总预算 290 秒；前端留 300 秒兜底 */
export const SERIES_AI_COVER_TIMEOUT_MS = 300_000
export const SERIES_AI_COVER_TIMEOUT_MESSAGE = '生成超时（300 秒），请点重试'

export interface SeriesAiCoverContext {
  isAdmin: boolean
  /** null = 还没查完 / 查失败 */
  available: boolean | null
  generating: boolean
  /** 上传 / 保存 / 发布 / 下架进行中（避免两个写封面的动作打架） */
  busy: boolean
  /** 已成功写库的系列名（抽屉里改名保存后更新） */
  savedSeriesName?: string | null
  hasCover: boolean
  /** 已上线过（含待更新） */
  isLive: boolean
}

/**
 * 按钮为什么不能点；空串 = 可以点。
 *
 * 优先级很重要：生成中不显示「请稍候」之类的废话，直接靠按钮转圈；
 * 非管理员整个按钮都不渲染，也不该出现在提示里。
 */
export function resolveSeriesAiCoverUnavailableReason(
  ctx: SeriesAiCoverContext
): string {
  if (!ctx.isAdmin) return ''
  if (ctx.generating) return ''
  if (ctx.busy) return '正在保存，请稍候…'
  if (ctx.available === null) return '正在检查 AI 生图是否可用…'
  if (ctx.available === false) {
    return 'AI 自动封面未启用：到「AI / Agent 配置」的「AI 食谱封面」配置 DeepSeek 与 Seedream。'
  }

  const name = String(ctx.savedSeriesName ?? '').trim()
  if (!name || isTemporarySeriesName(name)) {
    return '先把系列名称改成正式名称（离开输入框自动保存），再生成封面。'
  }

  return ''
}

/** 封面下方那行小字：不可用原因优先，否则解释点下去会发生什么 */
export function resolveSeriesAiCoverHint(ctx: SeriesAiCoverContext): string {
  // 非管理员看不到生图按钮，也不该看到「AI 会怎么生成」这行提示
  if (!ctx.isAdmin) return ''

  const reason = resolveSeriesAiCoverUnavailableReason(ctx)
  if (reason) return reason

  if (ctx.hasCover) {
    return '重新生成会先出预览，点「用这张」才替换。'
  }
  if (ctx.isLive) {
    return '生成后先看预览，确认后点「保存发布设置」才会生效。'
  }
  return '按系列名和最近一份草稿的食材生成，约 20–40 秒；生成后先预览，点「用这张」再保存。'
}

export function resolveSeriesAiCoverButtonLabel(
  hasCover: boolean,
  generating: boolean
): string {
  if (generating) return '生成中…'
  return hasCover ? '重新生成' : 'AI 生成图片'
}
