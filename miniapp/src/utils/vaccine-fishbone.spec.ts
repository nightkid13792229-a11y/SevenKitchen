import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HISTORY_LIMIT,
  buildFishboneRows,
  fishboneSortDate,
  type FishboneStepLike,
} from './vaccine-fishbone'

/**
 * 鱼骨图布局的排序规则（2026-10-09 老板定：竖着画，历史 + 每类一条下一针）。
 *
 * 这些断言盯着的是"顺序"和"位置"——疫苗计划以前出的错一半都出在这里
 * （顺序倒挂、逾期被摆回过去、老年狗的历史把今天挤没）。
 */
const TODAY = '2026-10-09'

function step(partial: Partial<FishboneStepLike> & { key: string }): FishboneStepLike {
  return {
    kind: 'core',
    kindLabel: '核心疫苗',
    label: '核心疫苗 首免（一针）',
    windowStart: '2026-10-09',
    windowEnd: '2026-10-23',
    status: 'DUE',
    ...partial,
  }
}

describe('鱼骨图 · 节点站位', () => {
  it('已完成的按**实际接种日**排（不是按当初建议的窗口）', () => {
    expect(
      fishboneSortDate(
        step({
          key: 'a',
          status: 'DONE',
          windowStart: '2024-06-01',
          matchedRecordDate: '2024-08-18',
        }),
        TODAY,
      ),
    ).toBe('2024-08-18')
  })

  it('🔴 逾期的"该补了"落在今天，不许被摆回过去', () => {
    const overdue = step({
      key: 'lepto',
      kind: 'lepto',
      kindLabel: '钩端螺旋体',
      status: 'OVERDUE',
      windowStart: '2023-04-13',
      windowEnd: '2023-05-11',
    })

    expect(fishboneSortDate(overdue, TODAY)).toBe(TODAY)

    const layout = buildFishboneRows([overdue], { today: TODAY })
    expect(layout.nodes[0].sortDate).toBe(TODAY)
    expect(layout.nodes[0].isToday).toBe(true)
    expect(layout.nodes[0].isNext).toBe(true)
  })

  it('自上而下：今天/要做的在最上，历史在下面且越新越靠上', () => {
    const layout = buildFishboneRows(
      [
        step({ key: 'next', status: 'UPCOMING', windowStart: '2027-07-25', windowEnd: '2027-10-23' }),
        step({ key: 'old', status: 'DONE', windowStart: '2024-06-01', matchedRecordDate: '2024-08-18' }),
        step({ key: 'now', status: 'DUE', windowStart: '2026-10-09', windowEnd: '2026-10-23' }),
      ],
      { today: TODAY },
    )

    // 现在该做的 → 将来的 → 历史（越新越靠上）
    expect(layout.nodes.map((node) => node.key)).toEqual(['now', 'next', 'old'])
    // "今天"这条虚线画在最上方
    expect(layout.todayIndex).toBe(0)
    // 高亮的是"现在该做"的那条，不是三年后的
    expect(layout.nodes.find((node) => node.isNext)?.key).toBe('now')
  })

  it('全都是历史时，历史按"越新越靠上"排，今天那条线仍在最上方', () => {
    const layout = buildFishboneRows(
      [
        step({ key: 'old', status: 'DONE', windowStart: '2024-08-18', matchedRecordDate: '2024-08-18' }),
        step({ key: 'new', status: 'DONE', windowStart: '2026-07-25', matchedRecordDate: '2026-07-25' }),
      ],
      { today: TODAY },
    )

    expect(layout.nodes.map((node) => node.key)).toEqual(['new', 'old'])
    expect(layout.todayIndex).toBe(0)
  })
})

describe('鱼骨图 · 每一类的下一针高亮', () => {
  it('同一天有多条待做时，该补了优先于该打了', () => {
    const layout = buildFishboneRows(
      [
        step({ key: 'due', status: 'DUE', windowStart: '2026-10-09', windowEnd: '2026-10-23' }),
        step({
          key: 'overdue',
          kind: 'lepto',
          kindLabel: '钩端螺旋体',
          status: 'OVERDUE',
          windowStart: '2023-04-13',
          windowEnd: '2023-05-11',
        }),
      ],
      { today: TODAY },
    )

    expect(layout.nodes.filter((node) => node.isNext).map((node) => node.key)).toEqual(['overdue'])
  })

  it('全都做完了就没有高亮的那一条', () => {
    const layout = buildFishboneRows(
      [step({ key: 'a', status: 'DONE', windowStart: '2024-08-18', matchedRecordDate: '2024-08-18' })],
      { today: TODAY },
    )

    expect(layout.nodes.some((node) => node.isNext)).toBe(false)
  })
})

describe('鱼骨图 · 日期标注与年份分隔', () => {
  it('同一天的多条只标一次日期', () => {
    const layout = buildFishboneRows(
      [
        step({ key: 'a', status: 'DONE', windowStart: '2024-08-18', matchedRecordDate: '2024-08-18' }),
        step({ key: 'b', status: 'DONE', windowStart: '2024-08-18', matchedRecordDate: '2024-08-18' }),
      ],
      { today: TODAY },
    )

    expect(layout.nodes[0].showDate).toBe(true)
    expect(layout.nodes[1].showDate).toBe(false)
  })

  it('年份变了给一个分隔标签', () => {
    const layout = buildFishboneRows(
      [
        step({ key: 'a', status: 'DONE', windowStart: '2024-08-18', matchedRecordDate: '2024-08-18' }),
        step({ key: 'b', status: 'DONE', windowStart: '2025-08-18', matchedRecordDate: '2025-08-18' }),
      ],
      { today: TODAY },
    )

    // 倒序：2025 在前
    expect(layout.nodes[0].yearLabel).toBe('2025 年')
    expect(layout.nodes[1].yearLabel).toBe('2024 年')
    // 同一年里不重复标
    const sameYear = buildFishboneRows(
      [
        step({ key: 'a', status: 'DONE', windowStart: '2024-08-18', matchedRecordDate: '2024-08-18' }),
        step({ key: 'b', status: 'DONE', windowStart: '2024-09-18', matchedRecordDate: '2024-09-18' }),
      ],
      { today: TODAY },
    )
    expect(sameYear.nodes[1].yearLabel).toBe('')
  })
})

describe('鱼骨图 · 长历史折叠', () => {
  const history = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      step({
        key: `h${index}`,
        status: 'DONE',
        windowStart: `20${20 + index}-08-18`,
        matchedRecordDate: `20${20 + index}-08-18`,
      }),
    )

  it(`默认只留最近 ${DEFAULT_HISTORY_LIMIT} 条已完成，其余折叠并计数`, () => {
    const layout = buildFishboneRows(history(6), { today: TODAY })

    expect(layout.historyTotal).toBe(6)
    expect(layout.hiddenHistoryCount).toBe(3)
    // 留下的是**最近**的三条（倒序：最新在最上）
    expect(layout.nodes.map((node) => node.key)).toEqual(['h5', 'h4', 'h3'])
  })

  it('展开全部历史（historyLimit: 0）时不再折叠', () => {
    const layout = buildFishboneRows(history(6), { today: TODAY, historyLimit: 0 })

    expect(layout.hiddenHistoryCount).toBe(0)
    expect(layout.nodes).toHaveLength(6)
  })

  it('历史不多时不该出现"展开全部历史"', () => {
    const layout = buildFishboneRows(history(2), { today: TODAY })

    expect(layout.hiddenHistoryCount).toBe(0)
    expect(layout.nodes).toHaveLength(2)
  })
})

describe('鱼骨图 · 零记录的新狗（面包那种）', () => {
  it('三条都在"今天"这一格，且只有一条高亮为下一针', () => {
    const layout = buildFishboneRows(
      [
        step({ key: 'core', status: 'DUE' }),
        step({ key: 'lepto', kind: 'lepto', kindLabel: '钩端螺旋体', status: 'DUE' }),
        step({ key: 'rabies', kind: 'rabies', kindLabel: '狂犬疫苗', status: 'DUE' }),
      ],
      { today: TODAY },
    )

    expect(layout.todayIndex).toBe(0)
    expect(layout.nodes.every((node) => node.isToday)).toBe(true)
    expect(layout.nodes.filter((node) => node.isNext)).toHaveLength(1)
    expect(layout.hiddenHistoryCount).toBe(0)
  })
})
