/**
 * 接种计划「竖版鱼骨图」的布局计算（2026-10-09）。
 *
 * 为什么单独放一个文件：这一块全是**位置计算**（谁在谁前面、今天插在哪、
 * 哪些历史要折叠），跟渲染无关。抽成纯函数才能用单测把排序规则钉死 ——
 * 之前疫苗计划出的错，一半都是"顺序"这类看不见的问题
 * （倒挂、逾期跑到后面、老年狗把成年加强排到首免前面）。
 *
 * 使用者：`components/dog-profile/VaccinePlanSection.vue`。
 *
 * ── 画法（老板 2026-10-09 定：竖着画）────────────────────────────────
 *   · 背骨 = 时间，**自上而下 = 由近到远**（今天 → 将来的待安排 → 越来越旧的历史）；
 *   · 每一针一个节点，从背骨斜着长出一张分支卡片；
 *   · 每一类**只放一条"下一针"**（与既有口径一致：不做的不显示、已完成的历史保留）；
 *   · "今天"是一条贯穿的虚线，画在最上方（"现在"的起点）。
 */

export type FishboneStatus = 'DONE' | 'DUE' | 'UPCOMING' | 'OVERDUE' | 'SKIPPED'

/** 布局只依赖这些字段（组件那边有更宽的类型，结构兼容即可） */
export interface FishboneStepLike {
  key: string
  kind: string
  kindLabel: string
  label: string
  windowStart: string
  windowEnd: string
  status: FishboneStatus
  statusLabel?: string
  matchedRecordDate?: string | null
  /** 顾客点过"推迟"（显示「你已推迟」，位置与状态不变） */
  deferred?: boolean
}

export interface FishboneNode<T extends FishboneStepLike = FishboneStepLike> {
  step: T
  key: string
  kindLabel: string
  /** 排序用的日期（YYYY-MM-DD） */
  sortDate: string
  /** 卡片上显示的那一行日期文案（按需由组件补窗口期） */
  dateText: string
  /** 落在"今天"这一格（逾期的"该补了"也算今天 —— 不能把它摆到过去里） */
  isToday: boolean
  /** 这一类的下一针（高亮的那一条） */
  isNext: boolean
  /** 同一天多条时，只有第一条标日期，其余的留空 */
  showDate: boolean
  /** 年份跟上一节点不同时给一个分隔标签（空 = 不显示） */
  yearLabel: string
  deferred: boolean
}

export interface FishboneLayout<T extends FishboneStepLike = FishboneStepLike> {
  nodes: FishboneNode<T>[]
  /** "今天"这条虚线插在 nodes 的哪个位置（= 排在今天之前的节点数） */
  todayIndex: number
  /** 被折叠掉的历史条数（> 0 时 UI 给「展开全部历史」） */
  hiddenHistoryCount: number
  /** 历史总条数（含被折叠的） */
  historyTotal: number
}

/** 默认只保留最近 3 条已完成，其余折叠 */
export const DEFAULT_HISTORY_LIMIT = 3

function dayPart(value: string): string {
  return String(value || '').slice(0, 10)
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b
}

/**
 * 这一针在时间轴上站的位置。
 *
 * · 已完成的：按**实际接种日**排（历史要真实，不能按"当初建议的窗口"排）；
 * · 还没做的：按窗口起点，但**不早于今天** —— 逾期那一针说的是"现在该补"，
 *   把它摆到三年前的位置上会让人以为那是历史。
 */
export function fishboneSortDate(step: FishboneStepLike, today: string): string {
  if (step.status === 'DONE') {
    return dayPart(step.matchedRecordDate || step.windowStart)
  }
  return maxDate(dayPart(step.windowStart), dayPart(today))
}

/**
 * 把计划的步骤排成鱼骨图的一列节点。
 *
 * @param steps   后端下发的 steps（已按"每类只留下一条下一针"筛过）
 * @param options birthday 可选，只用于组件显示月龄；today 必传（页面给）
 */
export function buildFishboneRows<T extends FishboneStepLike>(
  steps: T[],
  options: {
    today: string
    /** 历史折叠上限；传 Infinity 或 0 表示不折叠 */
    historyLimit?: number
  },
): FishboneLayout<T> {
  const today = dayPart(options.today)
  const limit =
    options.historyLimit === undefined ? DEFAULT_HISTORY_LIMIT : options.historyLimit

  const decorated = (steps || [])
    .filter((step) => step && step.key)
    .map((step, index) => ({
      step,
      index,
      sortDate: fishboneSortDate(step, today),
      isDone: step.status === 'DONE',
    }))

  /*
   * 顺序（2026-10-09 老板第二次定稿）：
   *   · **要做的在上、做完的历史在下**；
   *   · 要做的里面：今天这一格在最上，越远的将来越靠下（升序）；
   *   · 历史里面：**越新越靠上**（降序）。
   *
   * 为什么改成这样：老板的原话是"日期接近的在上方，日期比较远的、过去的日期在下方"，
   * 而且他 2026-10-06 就说过"最早的已经完成的疫苗记录反而排在最上面"——
   * 老的升序时间轴（过去 → 今天 → 将来）等于把三年前的历史摆在第一屏。
   * 现在第一屏是"今天该做什么"，历史往下翻，越翻越旧（与接种记录列表同一读法）。
   *
   * 同一天时保持后端给的顺序（那一层已经考虑过程序顺序）。
   */
  decorated.sort((a, b) => {
    if (a.isDone !== b.isDone) return a.isDone ? 1 : -1
    if (a.sortDate !== b.sortDate) {
      return a.isDone
        ? b.sortDate.localeCompare(a.sortDate)
        : a.sortDate.localeCompare(b.sortDate)
    }
    return a.index - b.index
  })

  const historyTotal = decorated.filter((item) => item.isDone).length

  /*
   * 历史折叠：只保留**最近** limit 条已完成。
   * 现在是倒序排列，最近的就在历史段的最前面。
   */
  const keep = new Set<number>()
  if (limit > 0 && historyTotal > limit) {
    const doneIndexes = decorated
      .map((item, position) => ({ position, isDone: item.isDone }))
      .filter((item) => item.isDone)
      .map((item) => item.position)
    for (const position of doneIndexes.slice(0, limit)) {
      keep.add(position)
    }
  }

  const visible =
    limit > 0 && historyTotal > limit
      ? decorated.filter((item, position) => !item.isDone || keep.has(position))
      : decorated

  const hiddenHistoryCount = decorated.length - visible.length

  /*
   * "今天"这条虚线画在最上方 —— 它是"现在"的起点：
   * 线下面第一段是今天及以后要做的，再往下是已经做完的历史。
   */
  const todayIndex = 0

  let previousDate = ''
  let previousYear = ''
  const nodes: FishboneNode<T>[] = visible.map((item) => {
    const dateText = item.sortDate
    const showDate = dateText !== previousDate
    const year = dateText.slice(0, 4)
    const yearLabel = year && year !== previousYear ? `${year} 年` : ''
    previousDate = dateText
    previousYear = year

    return {
      step: item.step,
      key: item.step.key,
      kindLabel: item.step.kindLabel,
      sortDate: item.sortDate,
      dateText,
      isToday: item.sortDate >= today && !item.isDone,
      isNext: false,
      showDate,
      yearLabel,
      deferred: Boolean(item.step.deferred),
    }
  })

  /*
   * 每一类的"下一针"高亮一条：优先**今天这一格**里的第一条，
   * 其次整列里最早的那条待做（与顶部"下一针"的取值口径一致：
   * 该补了 → 该打了 → 待安排，同状态里取窗口最早的）。
   */
  const pendingRank = (node: FishboneNode<T>) => {
    if (node.step.status === 'OVERDUE') return 0
    if (node.step.status === 'DUE') return 1
    return 2
  }
  const pending = nodes
    .filter((node) => node.step.status === 'DUE' || node.step.status === 'OVERDUE' || node.step.status === 'UPCOMING')
    .sort((a, b) => pendingRank(a) - pendingRank(b) || a.sortDate.localeCompare(b.sortDate))
  if (pending.length > 0) {
    pending[0].isNext = true
  }

  return { nodes, todayIndex, hiddenHistoryCount, historyTotal }
}
