import { describe, expect, it } from 'vitest'
import { buildAssessmentBar } from '../assessmentBar'

describe('buildAssessmentBar', () => {
  it('只有下限时：下限固定在 1/3，柱长按「下限的百分比」画', () => {
    const geom = buildAssessmentBar({ minValue: 21, currentValue: 121.8 })
    expect(geom.minLinePct).toBeCloseTo(33.333, 2)
    expect(geom.maxLinePct).toBeNull()
    expect(geom.deviationText).toBe('达成 580%')
    expect(geom.deviationTone).toBe('success')
    // 580% 超出 0–300% 轨道刻度 → 截断并标记
    expect(geom.saturated).toBe(true)
    expect(geom.barPos).toBe(100)
  })

  it('只有下限且未超刻度时不会被标记为截断', () => {
    const geom = buildAssessmentBar({ minValue: 10, currentValue: 25 })
    expect(geom.deviationText).toBe('达成 250%')
    expect(geom.saturated).toBe(false)
    expect(geom.barPos).toBeCloseTo(83.333, 2)
  })

  it('超上限时给出「超上限 X%」，并给出斜纹段宽度', () => {
    // 下限 1.45 / 上限 3.0 / 当前 3.72 → 超出上限 24%
    const geom = buildAssessmentBar({
      minValue: 1.45,
      maxValue: 3,
      currentValue: 3.72,
    })
    expect(geom.deviationText).toBe('超上限 24%')
    expect(geom.deviationTone).toBe('danger')
    expect(geom.minLinePct).toBeCloseTo(33.333, 2)
    expect(geom.maxLinePct).toBeCloseTo(66.667, 2)
    // 柱子越过虚线的那一段就是超出量
    expect(geom.overWidthPct).toBeGreaterThan(0)
    expect(geom.barPos).toBeCloseTo(66.667 + geom.overWidthPct, 2)
    expect(geom.gapWidthPct).toBe(0)
  })

  it('低于下限时给出「低于下限 X%」，缺口段从柱尾到实线', () => {
    // 下限 2.0 / 当前 1.24 → 低于下限 38%
    const geom = buildAssessmentBar({
      minValue: 2,
      maxValue: 6,
      currentValue: 1.24,
    })
    expect(geom.deviationText).toBe('低于下限 38%')
    expect(geom.deviationTone).toBe('warning')
    expect(geom.gapWidthPct).toBeGreaterThan(0)
    expect(geom.barPos).toBeCloseTo(33.333 - geom.gapWidthPct, 2)
    expect(geom.overWidthPct).toBe(0)
  })

  it('区间内时沿用达成度（相对下限）', () => {
    const geom = buildAssessmentBar({
      minValue: 1.45,
      maxValue: 3,
      currentValue: 1.75,
    })
    expect(geom.deviationText).toBe('达成 121%')
    expect(geom.deviationTone).toBe('success')
    expect(geom.overWidthPct).toBe(0)
    expect(geom.gapWidthPct).toBe(0)
    expect(geom.saturated).toBe(false)
  })

  it('只有上限的营养素：达标时按占上限比例展示，超标时给出超出比例', () => {
    const ok = buildAssessmentBar({ maxValue: 100, currentValue: 80 })
    expect(ok.deviationText).toBe('占上限 80%')
    expect(ok.minLinePct).toBeNull()
    expect(ok.maxLinePct).toBeCloseTo(66.667, 2)

    const over = buildAssessmentBar({ maxValue: 100, currentValue: 150 })
    expect(over.deviationText).toBe('超上限 50%')
    expect(over.deviationTone).toBe('danger')
  })

  it('没有上下限时不出柱条', () => {
    const geom = buildAssessmentBar({ currentValue: 8.2 })
    expect(geom.hasBar).toBe(false)
    expect(geom.noneText).toBe('参考指标（无标准上下限）')
    expect(geom.deviationText).toBe('')
  })

  it('缺少当前含量时不报错', () => {
    const geom = buildAssessmentBar({ minValue: 1, maxValue: 2, currentValue: null })
    expect(geom.hasBar).toBe(true)
    expect(geom.barPos).toBe(0)
    expect(geom.deviationText).toBe('')
  })

  it('比例尺指标（RATIO）的单位后缀为 :1', () => {
    const geom = buildAssessmentBar({
      minValue: 1,
      maxValue: 2,
      currentValue: 1.26,
      expressionBasis: 'RATIO',
    })
    expect(geom.tooltipText).toContain(':1')
    expect(geom.deviationText).toBe('达成 126%')
  })
})
