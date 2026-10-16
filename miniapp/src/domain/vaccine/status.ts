/**
 * ══ 疫苗板块 · 状态 → 文案 / 颜色名（唯一一份）══════════════════════════════
 *
 * 技术方案《四、前端结构》：`status.ts` 是"状态 → 文案与颜色名"的**唯一一份**。
 *
 * 分工（改之前先看清，别越界）：
 *   · **后端**决定状态（`DONE` / `DUE` / `UPCOMING` / `OVERDUE`）、窗口、排序、"下一针"；
 *   · **这里**只把后端给的状态翻成页面上的字与颜色名；
 *   · **颜色值本身**不在这里 —— 在 `src/styles/vaccine-tokens.scss`（一处定义）。
 *     这里给的是**颜色名**（tone），组件用 `vk-tone--{tone}` 去套 token。
 *
 * ⚠️ 前端不做任何计划推算：本文件里没有"今天要不要打"这类判断，
 *    只有"这个状态该怎么写"和"这个日期该怎么排"。
 */

import type {
  AntibodyResult,
  AntibodyTarget,
  AntibodyTest,
  VaccineKind,
  VaccineLayer,
  VaccineStep,
  VaccineStepStatus,
} from './types'

/** 状态角标的颜色名（对应 vaccine-tokens.scss 里的状态色） */
export type VaccineStatusTone = 'due' | 'over' | 'done' | 'plain'

/** 层级的颜色名 */
export type VaccineLayerTone = 'must' | 'suggest'

/** 类别色条的颜色名 */
export type VaccineKindTone = 'core' | 'rabies' | 'lepto' | 'plain'

/**
 * 四种状态 → 角标文案 + 颜色名。
 *
 * 文案只在**后端没给 `statusLabel`** 时兜底（后端给了就以它为准 ——
 * 状态是后端算的，它能说出更准的话，例如"已用抗体检测替代"）。
 */
export const STEP_STATUS_META: Record<
  VaccineStepStatus,
  { label: string; tone: VaccineStatusTone }
> = {
  DONE: { label: '已完成', tone: 'done' },
  DUE: { label: '待接种', tone: 'due' },
  UPCOMING: { label: '还没到时间', tone: 'plain' },
  OVERDUE: { label: '尽快补种', tone: 'over' },
}

/** 角标文案：后端给的优先（它知道"这一针为什么不用打"） */
export function stepStatusLabel(step: VaccineStep): string {
  const fromServer = String(step?.statusLabel || '').trim()
  if (fromServer) return fromServer
  const meta = STEP_STATUS_META[step?.status]
  return meta ? meta.label : ''
}

export function stepStatusTone(step: VaccineStep): VaccineStatusTone {
  const meta = STEP_STATUS_META[step?.status]
  return meta ? meta.tone : 'plain'
}

/**
 * 两个层级标识（需求 R4）。
 *
 * 老板 2026-10-15 定：**每个待办项都带标识** ——
 * 之前只有钩端带，反而让人以为"没标的就是不重要"。
 */
export function stepLayerLabel(layer: VaccineLayer): string {
  return layer === 'SUGGEST' ? '强烈建议' : '必打'
}

export function stepLayerTone(layer: VaccineLayer): VaccineLayerTone {
  return layer === 'SUGGEST' ? 'suggest' : 'must'
}

/** 类别 → 色条颜色名（核心绿 / 狂犬棕 / 钩端青；认不出的类别用中性色） */
export function stepKindTone(kind: VaccineKind): VaccineKindTone {
  if (kind === 'core') return 'core'
  if (kind === 'rabies') return 'rabies'
  if (kind === 'lepto') return 'lepto'
  return 'plain'
}

/* ══ 日期 → 页面上的写法 ══════════════════════════════════════════════════
 *
 * ⚠️ 只做**字符串切片**，不用 `new Date(iso)`：
 *    后端下发的是"这一针该在哪天打"这个**日历日**，
 *    用 Date 解析再按本地时区打印，东八区凌晨会整体差一天（这个项目踩过）。
 */
export function dateParts(value: string | null | undefined): { y: string; m: string; d: string } {
  const text = String(value || '').slice(0, 10)
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!matched) return { y: '', m: '', d: '' }
  return { y: matched[1], m: matched[2], d: matched[3] }
}

/** 2026/11/20 */
export function formatFullDate(value: string | null | undefined): string {
  const { y, m, d } = dateParts(value)
  return y ? `${y}/${m}/${d}` : ''
}

/** 11/20（同一年内的窗口，写得短一点） */
export function formatShortDate(value: string | null | undefined): string {
  const { m, d } = dateParts(value)
  return m ? `${m}/${d}` : ''
}

/** 2026/11（逾期项写"原建议时间"时只写到月，跟原型一致） */
export function formatYearMonth(value: string | null | undefined): string {
  const { y, m } = dateParts(value)
  return y ? `${y}/${m}` : ''
}

/**
 * 计划行左边那一列：主文案 + 小字。
 *
 * 逐条对着原型 A–K 十一屏：
 *   · 现在可打（DUE）      → `10/11 ~ 10/25` + `现在`
 *   · 还没到（UPCOMING）   → `2026/11/20` + `~ 12/20`
 *   · 尽快补种（OVERDUE）  → `尽快` + `已过`（没有原窗口时写 `现在`）
 *   · 已完成（DONE）       → `2025/06/02` + `已完成`
 */
export function stepWindowText(step: VaccineStep): { main: string; sub: string } {
  // 被抗体检测替代的那一行：时间是**下次评估**，不是"已完成"（原型 F）
  if (step.titer) {
    return { main: formatFullDate(step.titer.nextReviewAt), sub: '下次评估' }
  }
  if (step.status === 'OVERDUE') {
    return {
      main: '尽快',
      sub: step.missedWindowStart ? '已过' : '现在',
    }
  }
  if (step.status === 'DONE') {
    return { main: formatFullDate(step.windowStart), sub: '已完成' }
  }
  if (step.status === 'DUE') {
    return {
      main: `${formatShortDate(step.windowStart)} ~ ${formatShortDate(step.windowEnd)}`,
      sub: '现在',
    }
  }
  return {
    main: formatFullDate(step.windowStart),
    sub: `~ ${formatShortDate(step.windowEnd)}`,
  }
}

/**
 * 「下一针」卡上那行"什么时候"。
 *
 * 四句都是原型上的原话：
 *   · 现在在窗口里        → `建议接种时间 10/11 ~ 10/25`（原型 A）
 *   · 还没到窗口          → `建议接种时间 2026/11/20 ~ 12/20`（原型 C）
 *   · 逾期且有原窗口      → `建议尽快补种（原建议时间 2025/08/01 ~ 08/31，已过）`（原型 I）
 *   · 逾期但没有原窗口（一针未打、窗口刚挪到今天）→ `建议尽快安排`（原型 B）
 *
 * ⚠️ 窗口是后端算的，这里只是"怎么写出来"；"现在在不在窗口里"由 `status` 决定。
 */
export function stepWhenText(step: VaccineStep): string {
  if (step.titer) {
    return `建议下次评估 ${formatFullDate(step.titer.nextReviewAt)}`
  }
  if (step.status === 'OVERDUE') {
    if (step.missedWindowStart) {
      const start = formatFullDate(step.missedWindowStart)
      const end = formatShortDate(step.missedWindowEnd)
      const window = end ? `${start} ~ ${end}` : start
      return `建议尽快补种（原建议时间 ${window}，已过）`
    }
    return '建议尽快安排'
  }
  if (step.status === 'DONE') {
    return `已于 ${formatFullDate(step.windowStart)} 完成`
  }
  if (step.status === 'DUE') {
    const start = formatShortDate(step.windowStart)
    const end = formatShortDate(step.windowEnd)
    return `建议接种时间 ${end ? `${start} ~ ${end}` : start}`
  }
  const start = formatFullDate(step.windowStart)
  const end = step.windowEnd ? ` ~ ${formatShortDate(step.windowEnd)}` : ''
  return `建议接种时间 ${start}${end}`
}

/**
 * 计划行标题下面那行小字。
 *
 * ⚠️ 2026-10-16 修（老板截图："免疫计划中的依据说明文案需要默认展开吗？太占版面了吧"）：
 *    这里原来优先写后端的 `basis` —— 那是**整段依据**（实测 120 多字、带指南引注），
 *    结果计划里每一行都糊着一大段，五行计划占了整整两屏，记录区被挤到看不见。
 *
 *    改法：计划行**只说这一行的状态**，不复述依据。
 *      · 已完成   → `已完成`
 *      · 逾期     → `原建议时间 X 已过`（原型 I 的原话）
 *      · 其余     → 不写（左边已经写了"现在/尽快"、右边有"必打/强烈建议"）
 *    依据与那句短话留给「下一针」卡片 —— 家长是在那里读"为什么"的。
 */
export function stepRowNote(step: VaccineStep): { text: string; overdue: boolean } {
  // 抗体检测替代（原型 F 那一行的原话）
  if (step.titer) {
    return {
      text: `这次不用打：抗体检测合格（${formatFullDate(step.titer.testedAt)}）`,
      overdue: false,
    }
  }
  if (step.status === 'OVERDUE' && step.missedWindowStart) {
    return {
      text: `原建议时间 ${formatYearMonth(step.missedWindowStart)} 已过`,
      overdue: true,
    }
  }
  if (step.status === 'DONE') return { text: '已完成', overdue: false }
  return { text: '', overdue: false }
}

/** 计划行标题：`核心疫苗 · 第 1 针`（类别 · 步骤名） */
export function stepTitle(step: VaccineStep): string {
  const kindLabel = String(step?.kindLabel || '').trim()
  const label = String(step?.label || '').trim()
  if (kindLabel && label) return `${kindLabel} · ${label}`
  return kindLabel || label
}

/* ══ 忽略（"不做"）的原因 ═════════════════════════════════════════════════ */

/** 两个选项行为一致，区别只是把"为什么"记下来（需求 R5） */
export const IGNORE_REASON_LABELS: Record<string, string> = {
  NOT_NOW: '这次先不打',
  STOPPED: '不再接种了',
}

export function ignoreReasonLabel(reason: string | null | undefined): string {
  const key = String(reason || '')
  return IGNORE_REASON_LABELS[key] || ''
}

/* ══ 抗体检测（记录区那一行 + 录入器）══════════════════════════════════════ */

export const ANTIBODY_TARGET_LABELS: Record<AntibodyTarget, string> = {
  CORE: '核心三项',
  RABIES: '狂犬',
}

/**
 * 报告没给结论时写"请让兽医判读"—— 我们不设阈值、不替家长拍板（需求 R14）。
 */
export const ANTIBODY_RESULT_LABELS: Record<AntibodyResult, string> = {
  PASS: '合格',
  FAIL: '不合格',
  UNKNOWN: '请让兽医判读',
}

export function antibodyTargetLabel(target: AntibodyTarget): string {
  return ANTIBODY_TARGET_LABELS[target] || String(target)
}

export function antibodyResultLabel(result: AntibodyResult): string {
  return ANTIBODY_RESULT_LABELS[result] || ''
}

/** 记录区那一行的名字：`抗体检测 · 核心三项（合格）`（原型 F 屏的原话） */
export function antibodyEntryTitle(test: AntibodyTest): string {
  const targets = (test?.targets || []).map((item) => antibodyTargetLabel(item)).join('、')
  const result = antibodyResultLabel(test?.result)
  const head = targets ? `抗体检测 · ${targets}` : '抗体检测'
  return result ? `${head}（${result}）` : head
}
