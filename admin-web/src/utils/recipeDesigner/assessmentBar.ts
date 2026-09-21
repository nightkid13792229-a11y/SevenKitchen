/**
 * 营养评估柱状条的几何与文案计算（从 AssessmentPanel.vue 抽出，便于单测）。
 *
 * 比例尺约定（「三段式」）：轨道等分三段，实线（标准下限）固定在 1/3 处、
 * 虚线（标准上限）固定在 2/3 处，永远同时可见：
 * - 左段 0 → 下限：含量低于下限时落在这一段，柱尾离实线的距离＝差距占下限的比例；
 * - 中段 下限 → 上限：达标区间；
 * - 右段 上限 → 2×上限：超标时落在这一段，柱尾越过虚线的长度＝超出量占上限的比例；
 * - 只有下限（无上限）时轨道为 0 → 3×下限，100% 仍在 1/3 处。
 *
 * 因为每项营养素的比例尺不同，仅靠柱长无法横向比较，
 * 所以这里额外给出「超上限 24% / 低于下限 38% / 达成 234%」这类与标准线直接相关的文案，
 * 以及超出/不足那一段的长度，供界面画成斜纹并直接读数。
 */

const TRACK_THIRD = 100 / 3

export interface AssessmentBarInput {
  minValue?: number | null
  maxValue?: number | null
  currentValue?: number | null
  unit?: string | null
  expressionBasis?: string | null
  /** 表达基准文案，如「每1000千卡」 */
  basisLabel?: string | null
}

export interface AssessmentBarGeometry {
  hasBar: boolean
  /** 柱子终点（轨道百分比 0–100） */
  barPos: number
  /** 标准下限所在位置（有下限时固定 1/3） */
  minLinePct: number | null
  /** 标准上限所在位置（有上限时固定 2/3） */
  maxLinePct: number | null
  /** 超出上限那一段的宽度（轨道百分比），用于画斜纹 */
  overWidthPct: number
  /** 低于下限的缺口段宽度（轨道百分比），用于画斜纹 */
  gapWidthPct: number
  /** 含量的真实位置超出了轨道刻度（柱子被截断） */
  saturated: boolean
  /** 与标准线的相对差距文案，如「超上限 24%」 */
  deviationText: string
  deviationTone: 'success' | 'warning' | 'danger' | 'info'
  /** 达成度（相对下限；只有上限时相对上限） */
  contentPct: number | null
  tooltipText: string
  noneText: string
}

function toFiniteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function buildAssessmentBar(entry: AssessmentBarInput): AssessmentBarGeometry {
  const min = toFiniteOrNull(entry.minValue)
  const max = toFiniteOrNull(entry.maxValue)
  const cur = toFiniteOrNull(entry.currentValue)
  const unitSuffix =
    entry.expressionBasis === 'RATIO'
      ? ':1'
      : `${entry.unit || ''}${entry.basisLabel ? '/' + entry.basisLabel : ''}`
  const fmtNum = (value: number | null): string =>
    value == null ? '—' : Number(value).toFixed(2)

  const tooltipLines = [`当前含量：${fmtNum(cur)} ${unitSuffix}`]
  tooltipLines.push(
    min != null ? `标准下限：${fmtNum(min)} ${unitSuffix}` : '标准下限：未设下限',
  )
  tooltipLines.push(
    max != null ? `标准上限：${fmtNum(max)} ${unitSuffix}` : '标准上限：无上限',
  )

  if (min == null && max == null) {
    return {
      hasBar: false,
      barPos: 0,
      minLinePct: null,
      maxLinePct: null,
      overWidthPct: 0,
      gapWidthPct: 0,
      saturated: false,
      deviationText: '',
      deviationTone: 'info',
      contentPct: null,
      tooltipText: tooltipLines.join('\n'),
      noneText: '参考指标（无标准上下限）',
    }
  }

  const baseline = min ?? max ?? 0
  const contentPct = cur != null && baseline > 0 ? (cur / baseline) * 100 : null

  let barPos = 0
  if (cur != null && baseline > 0) {
    if (min != null && max != null) {
      if (cur < min) {
        barPos = (cur / min) * TRACK_THIRD
      } else if (cur <= max) {
        barPos = TRACK_THIRD + ((cur - min) / (max - min)) * TRACK_THIRD
      } else {
        barPos = TRACK_THIRD * 2 + ((cur - max) / max) * TRACK_THIRD
      }
    } else if (min != null) {
      // 无上限：轨道 0–300% 下限单位，100% 即 1/3 处
      barPos = (cur / min) * TRACK_THIRD
    } else if (max != null) {
      if (cur <= max) {
        barPos = (cur / max) * TRACK_THIRD * 2
      } else {
        barPos = TRACK_THIRD * 2 + ((cur - max) / max) * TRACK_THIRD
      }
    }
  }

  const trackMaxValue =
    min != null && max != null
      ? max * 2
      : min != null
        ? min * 3
        : (max ?? 0) * 2
  const saturated =
    cur != null && trackMaxValue > 0 ? cur > trackMaxValue : false
  const clampedBarPos = Math.min(Math.max(barPos, 0), 100)

  const minLinePct = min != null ? TRACK_THIRD : null
  const maxLinePct = max != null ? TRACK_THIRD * 2 : null

  // 超出上限（虚线右侧）与低于下限（柱尾到实线之间）的段落宽度
  const overWidthPct =
    cur != null && max != null && cur > max && maxLinePct != null
      ? Math.max(clampedBarPos - maxLinePct, 0)
      : 0
  const gapWidthPct =
    cur != null && min != null && cur < min && minLinePct != null
      ? Math.max(minLinePct - clampedBarPos, 0)
      : 0

  // 与标准线的相对差距：超标看超出上限多少，不足看低于下限多少，
  // 达标时沿用「达成度」（相对下限；只有上限时相对上限）。
  let deviationText = ''
  let deviationTone: AssessmentBarGeometry['deviationTone'] = 'info'
  if (cur != null) {
    if (max != null && cur > max) {
      const overPct = max > 0 ? ((cur - max) / max) * 100 : 0
      deviationText = `超上限 ${formatPercent(overPct)}`
      deviationTone = 'danger'
      tooltipLines.push(`判定：超出上限 ${overPct.toFixed(2)}%`)
    } else if (min != null && cur < min) {
      const shortPct = min > 0 ? ((min - cur) / min) * 100 : 0
      deviationText = `低于下限 ${formatPercent(shortPct)}`
      deviationTone = 'warning'
      tooltipLines.push(`判定：低于下限 ${shortPct.toFixed(2)}%`)
    } else if (contentPct != null) {
      deviationText =
        min == null ? `占上限 ${formatPercent(contentPct)}` : `达成 ${formatPercent(contentPct)}`
      deviationTone = 'success'
      tooltipLines.push(
        min == null
          ? `判定：占上限 ${contentPct.toFixed(2)}%`
          : `判定：达成下限的 ${contentPct.toFixed(2)}%`,
      )
    }
  }

  if (saturated) {
    tooltipLines.push(`含量超出本轨道刻度（最右端＝${fmtNum(trackMaxValue)} ${unitSuffix}）`)
  }

  return {
    hasBar: true,
    barPos: clampedBarPos,
    minLinePct,
    maxLinePct,
    overWidthPct,
    gapWidthPct,
    saturated,
    deviationText,
    deviationTone,
    contentPct,
    tooltipText: tooltipLines.join('\n'),
    noneText: '',
  }
}
