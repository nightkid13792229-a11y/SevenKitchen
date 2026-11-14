/**
 * 补剂「上架清单」· 「上架」开关能不能点（2026-11-14）。
 *
 * 为什么单独拎出来：原来模板里写的是 `:disabled="!row.readyToSell"`，
 * 而后端的 readyToSell = **已上架 且 无红色问题** ——
 * 于是还没上架的条目永远是灰的：只能关、不能开，运营没法逐条上架，
 * 只能靠右上角「一键上架全部可生产补剂」一次性全开（挑不了条）。
 *
 * 现在的口径：
 *   · 未上架：档案没有红色问题（缺价 / 缺形态 / 液体 / 单位不可换算 /
 *     缺保质期 / 缺储存条件）就能点，点了就是上架；
 *   · 已上架：永远能点 —— 哪怕档案后来出了红色问题，也得允许先下架。
 */

export interface ListingIssueLike {
  level: string
}

export interface ListingRowLike {
  supplementRetailEnabled: boolean
  issues: ListingIssueLike[]
}

function hasBlockingError(row: ListingRowLike): boolean {
  return (row.issues || []).some((issue) => issue.level === 'ERROR')
}

export function canToggleListing(row: ListingRowLike): boolean {
  if (row.supplementRetailEnabled) {
    return true
  }
  return !hasBlockingError(row)
}

/** 「档案未补齐，无法上架」这句提示：只在"想开但开不了"的时候出现 */
export function showListingBlockedHint(row: ListingRowLike): boolean {
  return !row.supplementRetailEnabled && hasBlockingError(row)
}

/**
 * 「这条补剂配好了没」/「是不是新建还没配好」（2026-11-14 复审后补）。
 *
 * 口径只认两样已经存在的东西：
 *   · `supplementRetailEnabled`（是否上架）；
 *   · 后端 `issues`（ERROR 阻断上架；EQUIVALENCE_* 说明组不生效）。
 * 不再自己判断组状态/成员数——那会和「数据体检」出现两套口径。
 */
export const ATTENTION_WINDOW_DAYS = 7

export interface AttentionRowLike {
  createdAt?: string | null
  supplementRetailEnabled: boolean
  issues?: Array<{ level: string; code: string }>
}

/** 没配好：没上架、有阻断问题、或等价组有问题。 */
export function isNotLaunched(row: AttentionRowLike): boolean {
  if (!row.supplementRetailEnabled) return true

  const issues = row.issues || []
  if (issues.some((issue) => issue.level === 'ERROR')) return true
  return issues.some(
    (issue) => issue.level === 'WARN' && issue.code.startsWith('EQUIVALENCE_'),
  )
}

/**
 * 新建 7 天内还没配好——用来提醒「别让补剂白添加」。
 * 窗口按「建档至今」算，未来时间（时钟不准）不算新建。
 */
export function isRecentlyCreatedNotReady(
  row: AttentionRowLike,
  now: number = Date.now(),
): boolean {
  if (!row.createdAt) return false
  const createdAt = new Date(row.createdAt).getTime()
  if (!Number.isFinite(createdAt)) return false

  const days = (now - createdAt) / (24 * 60 * 60 * 1000)
  if (days < 0 || days > ATTENTION_WINDOW_DAYS) return false
  return isNotLaunched(row)
}

/** 兼容旧调用：等价于「新建 7 天未配好」。 */
export function needsAttention(
  row: AttentionRowLike,
  now: number = Date.now(),
): boolean {
  return isRecentlyCreatedNotReady(row, now)
}
