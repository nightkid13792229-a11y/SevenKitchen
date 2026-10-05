import { describe, expect, it } from 'vitest'
import {
  candidateLabel,
  isFoodCandidate,
  mergeAllergyCandidates,
  normalizeGroup,
  normalizeLevel,
  type ScannedAllergen,
} from './allergy-candidates'

/**
 * 过敏报告识别结果的整理（2026-10-05）。
 *
 * 这一组锁的是**真实踩到的坑**：老板那份两页报告，第 1 页只有数值和颜色条，
 * 模型照颜色把一批"弱阳性"猜成了"阳性"；第 2 页才是真正的判定区，
 * 写的是"弱阳性"。合并时必须以判定页为准。
 */
describe('过敏报告 · 候选整理', () => {
  const item = (name: string, level = 'UNKNOWN', group = 'UNKNOWN'): ScannedAllergen => ({
    name,
    level,
    group,
  })

  it('等级与分组都过闭集校验，认不出来一律 UNKNOWN（不猜）', () => {
    expect(normalizeLevel('positive')).toBe('POSITIVE')
    expect(normalizeLevel('弱阳性')).toBe('UNKNOWN')
    expect(normalizeGroup('food')).toBe('FOOD')
    expect(normalizeGroup('吸入组')).toBe('UNKNOWN')
    expect(normalizeGroup(undefined)).toBe('UNKNOWN')
  })

  it('只把食物类当候选：环境类与阴性项都挡在外面', () => {
    expect(isFoodCandidate(item('鸡肉', 'POSITIVE', 'FOOD'))).toBe(true)
    expect(isFoodCandidate(item('粉尘螨', 'POSITIVE', 'ENVIRONMENT'))).toBe(false)
    expect(isFoodCandidate(item('小麦', 'NEGATIVE', 'FOOD'))).toBe(false)
    // 分组没读到的照样给家长看（宁可多列一项，也不能藏起真过敏原）
    expect(isFoodCandidate(item('玉米'))).toBe(true)
  })

  it('标签把报告写的结论带出来，没写就只给名字', () => {
    expect(candidateLabel(item('鸡肉', 'POSITIVE'))).toBe('鸡肉 · 阳性')
    expect(candidateLabel(item('小麦', 'WEAK_POSITIVE'))).toBe('小麦 · 弱阳性')
    expect(candidateLabel(item('玉米'))).toBe('玉米')
  })

  it('多页合并：同一项只留一条', () => {
    const merged = mergeAllergyCandidates([
      { items: [item('鸡肉'), item('小麦')], hasVerdict: false },
      { items: [item('鸡肉'), item('牛肉')], hasVerdict: false },
    ])

    expect(merged.map((entry) => entry.name)).toEqual(['鸡肉', '小麦', '牛肉'])
  })

  it('判定页的等级覆盖"照颜色条猜"的等级（生产实测的那一次）', () => {
    const merged = mergeAllergyCandidates([
      // 第 1 页：只有数值与颜色条，模型照颜色猜成了阳性
      { items: [item('小麦', 'POSITIVE', 'FOOD'), item('花生', 'POSITIVE', 'FOOD')], hasVerdict: false },
      // 第 2 页：真正的判定区，写的是弱阳性 / 阳性
      { items: [item('小麦', 'WEAK_POSITIVE', 'FOOD'), item('花生', 'POSITIVE', 'FOOD')], hasVerdict: true },
    ])

    expect(merged.find((entry) => entry.name === '小麦')?.level).toBe('WEAK_POSITIVE')
    expect(merged.find((entry) => entry.name === '花生')?.level).toBe('POSITIVE')
  })

  it('没有判定区那一页的等级一律不当真：颜色条不是报告写的字', () => {
    /**
     * 生产实测：只有数值与颜色条的那一页，模型会把一批"弱阳性"读成"阳性"。
     * 名字与分组照收（分组是表格里的一列），但等级不能当真 ——
     * 当真了就会把"弱阳性"记成"阳性"（后端按阳性落成确诊，食谱彻底避开）。
     */
    const merged = mergeAllergyCandidates([
      { items: [item('豌豆', 'POSITIVE', 'FOOD'), item('西瓜', 'POSITIVE', 'FOOD')], hasVerdict: false },
      { items: [item('小麦', 'WEAK_POSITIVE', 'FOOD')], hasVerdict: true },
    ])

    expect(merged.find((entry) => entry.name === '豌豆')).toEqual({
      name: '豌豆',
      level: 'UNKNOWN',
      group: 'FOOD',
    })
    expect(merged.find((entry) => entry.name === '西瓜')?.level).toBe('UNKNOWN')
    // 判定页读到的照旧
    expect(merged.find((entry) => entry.name === '小麦')?.level).toBe('WEAK_POSITIVE')
  })

  it('反过来不许被盖掉：判定页先读到时，后面的猜测页改不动它', () => {
    const merged = mergeAllergyCandidates([
      { items: [item('小麦', 'WEAK_POSITIVE', 'FOOD')], hasVerdict: true },
      { items: [item('小麦', 'POSITIVE', 'FOOD')], hasVerdict: false },
    ])

    expect(merged[0].level).toBe('WEAK_POSITIVE')
  })

  it('都是判定页时只补空：后面读到等级/分组就补上，UNKNOWN 不会盖掉已读到的值', () => {
    const merged = mergeAllergyCandidates([
      { items: [item('鸡肉')], hasVerdict: true },
      { items: [item('鸡肉', 'WEAK_POSITIVE', 'FOOD')], hasVerdict: true },
      { items: [item('鸡肉')], hasVerdict: true },
    ])

    expect(merged[0]).toEqual({ name: '鸡肉', level: 'WEAK_POSITIVE', group: 'FOOD' })
  })

  it('空名字不进结果（模型偶尔会回一条只有等级的）', () => {
    const merged = mergeAllergyCandidates([
      { items: [item('', 'POSITIVE', 'FOOD'), item('鸡肉', 'POSITIVE', 'FOOD')], hasVerdict: true },
    ])

    expect(merged.map((entry) => entry.name)).toEqual(['鸡肉'])
  })

  it('没有判定区的整份报告：等级保持 UNKNOWN，不编', () => {
    const merged = mergeAllergyCandidates([
      { items: [item('小麦', 'UNKNOWN', 'FOOD'), item('大米', 'UNKNOWN', 'FOOD')], hasVerdict: false },
    ])

    expect(merged.every((entry) => entry.level === 'UNKNOWN')).toBe(true)
    // 但名字与分组照旧可用
    expect(merged).toHaveLength(2)
    expect(merged[0].group).toBe('FOOD')
  })
})

/**
 * 强阳性要单独显示（2026-10-05 老板反馈"强阳性的过敏原并未被识别出来"）。
 *
 * 报告把结论分成弱阳性 / 阳性 / 强阳性三档，老板最需要一眼看到的就是
 * 强阳性那几条 —— 它们同时也是后端落成"确诊"的那种。
 */
describe('过敏报告 · 强阳性', () => {
  const item = (name: string, level = 'UNKNOWN', group = 'FOOD'): ScannedAllergen => ({
    name,
    level,
    group,
  })

  it('强阳性有自己的标签，不再被并进"阳性"', () => {
    expect(candidateLabel(item('花生', 'STRONG_POSITIVE'))).toBe('花生 · 强阳性')
    expect(candidateLabel(item('海带', 'POSITIVE'))).toBe('海带 · 阳性')
  })

  it('强阳性照旧算候选、默认会被记上（不是被过滤掉）', () => {
    expect(isFoodCandidate(item('花生', 'STRONG_POSITIVE'))).toBe(true)
  })

  it('中文"强阳性"也能归一（模型偶尔照抄报告中文）', () => {
    expect(normalizeLevel('STRONG_POSITIVE')).toBe('STRONG_POSITIVE')
    expect(normalizeLevel('strong_positive')).toBe('STRONG_POSITIVE')
    // 中文由后端归一（那里有别名表），前端只认英文，认不出就是不显示
    expect(normalizeLevel('强阳性')).toBe('UNKNOWN')
  })

  it('判定页写的强阳性不会被别页的"阳性"盖掉', () => {
    const merged = mergeAllergyCandidates([
      { items: [item('花生', 'POSITIVE')], hasVerdict: false },
      { items: [item('花生', 'STRONG_POSITIVE')], hasVerdict: true },
    ])

    expect(merged[0].level).toBe('STRONG_POSITIVE')
  })
})
