/**
 * ④ 终检站的三栏展示规则。
 *
 * 页面**不判断能不能通过**：能不能通过只看后端 `FinalCheckResult`。
 * 这里只负责把后端给的三档稳定地摆到页面上 —— 同一份结果刷新两次，
 * 顺序必须一致，否则用户会以为检查结果变了。
 */
import type { CheckItem, FinalCheckResult } from '@/types/ingredientCreation'

export type CheckGroupKey = 'blocking' | 'exceptionable' | 'warnings'

export interface CheckGroupMeta {
  key: CheckGroupKey
  title: string
  description: string
  /** Element Plus 的语义色 */
  tone: 'danger' | 'warning' | 'info'
}

/**
 * 三栏的标题与说明。
 *
 * 拦死组的说明里必须写清楚「没有绕过按钮」：这是产品硬规则（设计文档第五节 ④），
 * 不能靠页面实现者自己记住。
 */
export const CHECK_GROUP_META: Readonly<Record<CheckGroupKey, CheckGroupMeta>> = {
  blocking: {
    key: 'blocking',
    title: '拦死',
    description: '没有绕过按钮，只能回上一步改数据，再重新终检。',
    tone: 'danger'
  },
  exceptionable: {
    key: 'exceptionable',
    title: '可例外',
    description: '必须写理由并记录操作人，才能放行。',
    tone: 'warning'
  },
  warnings: {
    key: 'warnings',
    title: '提醒',
    description: '可以忽略，但忽略也要留下操作人与时间。',
    tone: 'info'
  }
}

/**
 * 同一组内的固定展示顺序，与后端 `final-check.ts` 的产出顺序一致。
 *
 * 后端没给过的规则码排在已知规则之后，并保持后端原顺序（稳定排序）。
 */
const CHECK_CODE_ORDER: Readonly<Record<string, number>> = {
  UNIT_NOT_ALLOWED: 10,
  UNIT_MISMATCH: 20,
  CONVERSION_NOT_REVERSIBLE: 30,
  BASIS_NOT_CONVERTIBLE: 40,
  MACRO_SUM_OVER_100: 110,
  REQUIRED_STATE_MISSING: 120,
  LOW_COVERAGE: 130,
  ENERGY_CROSS_CHECK_DEVIATION: 210,
  MAGNITUDE_OUTLIER: 220
}

export interface GroupedCheckItems {
  blocking: CheckItem[]
  exceptionable: CheckItem[]
  warnings: CheckItem[]
}

function codeOrder(code: unknown): number {
  return typeof code === 'string' ? (CHECK_CODE_ORDER[code] ?? 1000) : 1000
}

/**
 * 稳定排序：先按规则码优先级，再按后端返回顺序。
 * 未知规则码之间保持原顺序，不按 alphabet 重排。
 */
function sortCheckItems(items: readonly CheckItem[] | null | undefined): CheckItem[] {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        codeOrder(left.item.code) - codeOrder(right.item.code) ||
        left.index - right.index
    )
    .map(({ item }) => item)
}

/**
 * 把后端终检结果按「拦死 / 可例外 / 提醒」分组。
 *
 * 只复制数组、不修改入参；空结果或字段缺失都返回三个空数组，
 * 页面不需要再写 `?.` 与兜底分支。
 */
export function groupCheckItems(
  result: FinalCheckResult | null | undefined
): GroupedCheckItems {
  return {
    blocking: sortCheckItems(result?.blocking),
    exceptionable: sortCheckItems(result?.exceptionable),
    warnings: sortCheckItems(result?.warnings)
  }
}
