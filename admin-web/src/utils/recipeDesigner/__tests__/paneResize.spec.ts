import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PANE_WIDTHS,
  PANE_MAX_WIDTH,
  PANE_MIN_WIDTHS,
  resizePaneWidths
} from '../paneResize'

describe('resizePaneWidths', () => {
  const start = { ...DEFAULT_PANE_WIDTHS }

  it('拖原料库|配方明细：原料库跟着鼠标变宽，配方明细吸收差值', () => {
    const next = resizePaneWidths('library-items', start, 80, 900)
    expect(next.library).toBe(330)
    expect(next.dashboard).toBe(start.dashboard)
    expect(next.assessment).toBe(start.assessment)
    expect(next.dog).toBe(start.dog)
  })

  it('原料库最窄 200px，再往左拖不动', () => {
    const next = resizePaneWidths('library-items', start, -300, 900)
    expect(next.library).toBe(PANE_MIN_WIDTHS.library)
  })

  it('原料库不能把配方明细挤到 320px 以下', () => {
    // 250 + 400 - 320 = 330 是这次拖拽能到的上限
    const next = resizePaneWidths('library-items', start, 500, 400)
    expect(next.library).toBe(330)
    expect(next.library + 400).toBeGreaterThanOrEqual(250 + 400)
  })

  it('单栏有上限，换到小屏不会因为一栏过宽而满屏横滚', () => {
    const wide = { ...start, library: 700 }
    const next = resizePaneWidths('library-items', wide, 500, 1200)
    expect(next.library).toBe(PANE_MAX_WIDTH)
  })

  it('拖配方明细|仪表盘：往右拖仪表盘变窄，给配方明细让位', () => {
    const next = resizePaneWidths('items-dashboard', start, 60, 900)
    expect(next.dashboard).toBe(240)
    expect(next.library).toBe(start.library)
  })

  it('拖配方明细|仪表盘：仪表盘最多只能吃到配方明细的 320px 底线', () => {
    // 300 + 400 - 320 = 380 是这次拖拽能到的上限
    const next = resizePaneWidths('items-dashboard', start, -500, 400)
    expect(next.dashboard).toBe(380)
  })

  it('拖仪表盘|营养评估：两侧等量交换，配方明细不受影响', () => {
    const next = resizePaneWidths('dashboard-assessment', start, 50, 900)
    expect(next.dashboard).toBe(350)
    expect(next.assessment).toBe(280)
    // 总宽保持不变（配方明细是弹性列，不会因为这条分界改变）
    expect(next.dashboard + next.assessment).toBe(start.dashboard + start.assessment)
  })

  it('仪表盘|营养评估：营养评估最窄 280px', () => {
    const next = resizePaneWidths('dashboard-assessment', start, 500, 900)
    expect(next.assessment).toBe(280)
    expect(next.dashboard).toBe(350)
  })

  it('拖营养评估|爱犬信息：两侧等量交换，爱犬信息最窄 240px', () => {
    const next = resizePaneWidths('assessment-dog', start, 500, 900)
    expect(next.assessment).toBe(390)
    expect(next.dog).toBe(240)
    expect(next.assessment + next.dog).toBe(start.assessment + start.dog)
  })

  it('往左拖营养评估|爱犬信息：爱犬信息变宽，营养评估保底 280px', () => {
    const next = resizePaneWidths('assessment-dog', start, -500, 900)
    expect(next.assessment).toBe(280)
    expect(next.dog).toBe(350)
  })
})
