import type {
  IngredientCreationDraftSummary,
  SearchPlan,
} from '@/types/ingredientCreation'

/**
 * 草稿恢复的纯函数（2026-11-21）。
 *
 * 页面只负责把网址参数、草稿摘要和 payload 喂进来；「哪份能恢复、怎么显示
 * 最近编辑、方案卡要不要弹」都在这里判定，便于单测。
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 网址里的 draftId：只认非空字符串，其它一律当没带。 */
export function readDraftIdFromQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 64) return null
  return trimmed
}

/** 最近编辑的人话时间；非法时间返回空串，不显示 Invalid Date。 */
export function formatDraftUpdatedAt(
  iso: string,
  now: Date = new Date(),
): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const diffMs = Math.max(0, now.getTime() - then)
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return iso.slice(0, 10)
}

/** 多份未完成草稿时默认恢复最近编辑的一条。 */
export function pickLatestDraft(
  list: readonly IngredientCreationDraftSummary[],
): IngredientCreationDraftSummary | null {
  let latest: IngredientCreationDraftSummary | null = null
  let latestAt = -Infinity
  for (const item of list) {
    const at = Date.parse(item.updatedAt)
    if (Number.isFinite(at) && at > latestAt) {
      latest = item
      latestAt = at
    }
  }
  return latest
}

/** 从草稿 payload 恢复「待确认」的检索方案；已确认/已跳过的不要弹卡。 */
export function readPendingPlan(payload: unknown): SearchPlan | null {
  if (!isRecord(payload)) return null
  const plan = payload.searchPlan
  if (!isRecord(plan) || plan.status !== 'PENDING') return null
  return plan as unknown as SearchPlan
}
