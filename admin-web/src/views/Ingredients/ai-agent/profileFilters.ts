/**
 * 营养档案筛子：全部 / 只看有值 / 只看缺口。
 *
 * 纯函数、不依赖 Vue：60 个格子的行来自 `toProfileRows`，这里只按
 * `value` 是否为空筛，不看 `status` —— `0` 是合法值，不能当成缺口。
 */
import type { ProfileFieldRow, ProfileGroup } from './draftReview'

export type ProfileFilterMode = 'ALL' | 'FILLED' | 'MISSING'

export interface ProfileFilterCounts {
  all: number
  filled: number
  missing: number
}

/** 按筛子过滤行；`FILLED` 只认 `value !== null`（`0` 也算有值）。 */
export function filterProfileRows(
  rows: readonly ProfileFieldRow[],
  mode: ProfileFilterMode
): ProfileFieldRow[] {
  if (mode === 'FILLED') {
    return rows.filter((row) => row.value !== null)
  }
  if (mode === 'MISSING') {
    return rows.filter((row) => row.value === null)
  }
  return [...rows]
}

/** 当前档案的计数：三个数始终与同一份 rows 对齐（filled + missing = all）。 */
export function profileFilterCounts(
  rows: readonly ProfileFieldRow[]
): ProfileFilterCounts {
  const filled = rows.filter((row) => row.value !== null).length
  return {
    all: rows.length,
    filled,
    missing: rows.length - filled
  }
}

/** 整组没有可见行就不渲染（空组在任何筛子下都不渲染）。 */
export function groupVisibleOnFilter(
  group: ProfileGroup,
  mode: ProfileFilterMode
): boolean {
  return filterProfileRows(group.rows, mode).length > 0
}
