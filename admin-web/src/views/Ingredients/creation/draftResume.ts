/**
 * 「继续未完成」入口的展示逻辑。
 *
 * 后端只给英文站点枚举、ISO 时间与草稿名；这里统一翻成用户能看懂的中文，
 * 避免每个模板各写一份映射、改一处漏一处。
 */
import { formatDateTime } from '@/utils/date'
import { stepList } from './stepState'

/** 脏数据（未知站点）不把英文枚举裸露给用户。 */
export const UNKNOWN_STEP_LABEL = '未知站点'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * 英文站点枚举 → 中文人话。
 *
 * 复用向导进度条的 `stepList` 标题（起手 / 营养依据 / 档案成型 / 终检 /
 * 原料档案 / 收尾），保证列表和向导里叫法一致。
 */
export function creationStepLabel(step: string): string {
  const matched = stepList.find((item) => item.step === step)
  return matched?.title ?? UNKNOWN_STEP_LABEL
}

/**
 * 「最后编辑」的人话：一周内显示相对时间，更早显示具体日期时间。
 *
 * `now` 可注入，测试里不依赖真实时钟。
 */
export function formatDraftUpdatedAt(
  value: string | Date | null | undefined,
  now: Date = new Date()
): string {
  if (!value) {
    return '-'
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  const diffMs = now.getTime() - date.getTime()
  // 时钟偏差（服务器比浏览器快一点）也按「刚刚」处理，不显示负数。
  if (diffMs < MINUTE_MS) {
    return '刚刚'
  }
  if (diffMs < HOUR_MS) {
    return `${Math.floor(diffMs / MINUTE_MS)} 分钟前`
  }
  if (diffMs < DAY_MS) {
    return `${Math.floor(diffMs / HOUR_MS)} 小时前`
  }
  if (diffMs < 7 * DAY_MS) {
    return `${Math.floor(diffMs / DAY_MS)} 天前`
  }

  return formatDateTime(date)
}

/** 没有未完成草稿（含接口没返回 / 加载失败）时，入口整个隐藏。 */
export function hasUnfinishedDrafts(
  drafts: readonly unknown[] | null | undefined
): boolean {
  return Array.isArray(drafts) && drafts.length > 0
}

/** 入口文案：继续未完成（N） */
export function resumeEntryLabel(count: number): string {
  return `继续未完成（${count}）`
}
