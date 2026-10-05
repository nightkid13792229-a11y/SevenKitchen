/**
 * 过敏报告识别结果的整理（2026-10-05 第十一期）。
 *
 * 为什么单独一个文件：多页报告的"同一项在哪一页读到、以哪一页为准"
 * 是一段有真实规则、且会出错的逻辑（生产实测踩过），
 * 埋在页面组件里没法单独测。这里只做纯函数，组件负责画界面。
 */

/** 报告里读到的一项：名字 + 报告写的结论等级 + 报告写的分组 */
export interface ScannedAllergen {
  name: string
  level: string
  group: string
}

/** 一页报告的结果 */
export interface ScannedAllergenPage {
  items: ScannedAllergen[]
  /**
   * 这一页上有没有「结果判定 / 结论」那一段（后端照模型的话回传）。
   *
   * 为什么需要：多页报告常常只在最后一页写判定，前面几页只有数值与颜色条。
   * 生产实测：模型会照颜色条把"弱阳性"猜成"阳性"，而判定页写的是"弱阳性" ——
   * 两份打架时必须以**有判定的那一页**为准，不能被猜出来的那份顶掉。
   */
  hasVerdict: boolean
}

/** 报告上写的结论等级 → 给家长看的中文（认不出来就不显示，不编） */
export const LEVEL_LABELS: Record<string, string> = {
  POSITIVE: '阳性',
  WEAK_POSITIVE: '弱阳性',
  SUSPECTED: '疑似',
}

const LEVELS = ['POSITIVE', 'WEAK_POSITIVE', 'SUSPECTED', 'NEGATIVE']
const GROUPS = ['FOOD', 'ENVIRONMENT', 'OTHER']

export function normalizeLevel(value: unknown): string {
  const text = String(value || '').toUpperCase()
  return LEVELS.includes(text) ? text : 'UNKNOWN'
}

export function normalizeGroup(value: unknown): string {
  const text = String(value || '').toUpperCase()
  return GROUPS.includes(text) ? text : 'UNKNOWN'
}

/**
 * 只列食物类：环境类（尘螨/花粉/霉菌…）与吃的东西无关；
 * 阴性项也挡在外面 —— 阴性恰恰说明不过敏，记进"过敏信息"是反的。
 * 后端已经过滤/分级过，前端再挡一道：不该依赖服务端一定守规矩。
 */
export function isFoodCandidate(item: ScannedAllergen): boolean {
  return item.group !== 'ENVIRONMENT' && item.level !== 'NEGATIVE'
}

/** 候选标签：报告写了结论就带上（「鸡肉 · 阳性」），没写就只给名字 */
export function candidateLabel(item: ScannedAllergen): string {
  const label = LEVEL_LABELS[item.level]
  return label ? `${item.name} · ${label}` : item.name
}

/**
 * 多页结果合并。
 *
 * 规则（按页顺序过一遍）：
 *   · 同一项第一次出现 → 收下
 *   · 再次出现：**有判定的那一页可以覆盖没判定的那一页的等级**（这是关键，
 *     见 ScannedAllergenPage.hasVerdict 的说明）
 *   · 其余情况只补空：新的一页读到了等级/分组而旧的是 UNKNOWN 时补上，
 *     不拿 UNKNOWN 去盖掉已经读到的值
 */
export function mergeAllergyCandidates(
  pages: ScannedAllergenPage[],
): ScannedAllergen[] {
  const merged = new Map<string, { item: ScannedAllergen; fromVerdict: boolean }>()

  for (const page of pages) {
    for (const item of page.items) {
      if (!item.name) continue

      const existing = merged.get(item.name)
      if (!existing) {
        merged.set(item.name, { item: { ...item }, fromVerdict: page.hasVerdict })
        continue
      }

      // 判定页的等级更可信：覆盖掉"照颜色条猜"的那一份
      if (page.hasVerdict && !existing.fromVerdict) {
        if (item.level !== 'UNKNOWN') existing.item.level = item.level
        if (item.group !== 'UNKNOWN') existing.item.group = item.group
        existing.fromVerdict = true
        continue
      }

      if (existing.item.level === 'UNKNOWN' && item.level !== 'UNKNOWN') {
        existing.item.level = item.level
      }
      if (existing.item.group === 'UNKNOWN' && item.group !== 'UNKNOWN') {
        existing.item.group = item.group
      }
    }
  }

  return Array.from(merged.values()).map((entry) => entry.item)
}
