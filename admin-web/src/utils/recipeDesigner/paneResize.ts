/**
 * 配方编辑器五栏栏宽拖拽（2026-10-29）。
 *
 * 页面是「原料库 | 配方明细 | 关键比例 | 营养评估 | 爱犬信息」五栏：
 * - 配方明细是弹性列（flex:1），窗口变宽变窄由它吸收；
 * - 其余四栏是固定像素宽，用户可以拖分界来放大/缩小。
 *
 * 分界拖拽有两种结算方式：
 * - 贴着配方明细的两条分界：固定栏 ±dx，配方明细吸收差值；
 * - 仪表盘|营养评估、营养评估|爱犬信息：两侧等量交换，总宽不变，
 *   配方明细完全不受影响（否则拖动右侧分界时，右侧面板会反向移动）。
 */

export interface PaneWidths {
  library: number
  dashboard: number
  assessment: number
  dog: number
}

export type PaneSplitterKey =
  | 'library-items'
  | 'items-dashboard'
  | 'dashboard-assessment'
  | 'assessment-dog'

export const DEFAULT_PANE_WIDTHS: PaneWidths = {
  library: 250,
  dashboard: 300,
  assessment: 330,
  dog: 300
}

export const PANE_MIN_WIDTHS = {
  library: 200,
  /** 配方明细（弹性列） */
  items: 320,
  dashboard: 240,
  assessment: 280,
  dog: 240
} as const

/** 单栏上限：避免拖出离谱的宽度后，换到小屏幕直接满屏横向滚动 */
export const PANE_MAX_WIDTH = 720

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 根据拖拽的横向位移计算新的栏宽。
 *
 * @param splitter 正在拖的分界
 * @param start 拖拽开始时的栏宽（拖动过程中始终以它 + 总位移计算，避免累积误差）
 * @param dx 相对拖拽起点的横向位移（向右为正）
 * @param itemsWidth 拖拽开始时「配方明细」的实际宽度，用于给它留出最小空间
 */
export function resizePaneWidths(
  splitter: PaneSplitterKey,
  start: PaneWidths,
  dx: number,
  itemsWidth: number
): PaneWidths {
  const next: PaneWidths = { ...start }

  switch (splitter) {
    case 'library-items': {
      // 往右拖 = 原料库变宽、配方明细变窄
      const max = Math.max(
        PANE_MIN_WIDTHS.library,
        Math.min(PANE_MAX_WIDTH, start.library + itemsWidth - PANE_MIN_WIDTHS.items)
      )
      next.library = clamp(start.library + dx, PANE_MIN_WIDTHS.library, max)
      break
    }
    case 'items-dashboard': {
      // 往右拖 = 仪表盘变窄、配方明细变宽
      const max = Math.max(
        PANE_MIN_WIDTHS.dashboard,
        Math.min(PANE_MAX_WIDTH, start.dashboard + itemsWidth - PANE_MIN_WIDTHS.items)
      )
      next.dashboard = clamp(start.dashboard - dx, PANE_MIN_WIDTHS.dashboard, max)
      break
    }
    case 'dashboard-assessment': {
      // 两侧等量交换：仪表盘变宽多少，营养评估就窄多少
      const total = start.dashboard + start.assessment
      const lo = Math.min(PANE_MIN_WIDTHS.dashboard, total - PANE_MIN_WIDTHS.assessment)
      const hi = Math.max(PANE_MIN_WIDTHS.dashboard, total - PANE_MIN_WIDTHS.assessment)
      next.dashboard = clamp(start.dashboard + dx, lo, hi)
      next.assessment = total - next.dashboard
      break
    }
    case 'assessment-dog': {
      // 两侧等量交换：营养评估变宽多少，爱犬信息就窄多少
      const total = start.assessment + start.dog
      const lo = Math.min(PANE_MIN_WIDTHS.assessment, total - PANE_MIN_WIDTHS.dog)
      const hi = Math.max(PANE_MIN_WIDTHS.assessment, total - PANE_MIN_WIDTHS.dog)
      next.assessment = clamp(start.assessment + dx, lo, hi)
      next.dog = total - next.assessment
      break
    }
  }

  next.library = Math.round(next.library)
  next.dashboard = Math.round(next.dashboard)
  next.assessment = Math.round(next.assessment)
  next.dog = Math.round(next.dog)
  return next
}
