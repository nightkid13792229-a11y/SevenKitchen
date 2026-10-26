import { describe, expect, it } from 'vitest'
import type { ProfileFieldRow, ProfileGroup } from './draftReview'
import {
  filterProfileRows,
  groupVisibleOnFilter,
  profileFilterCounts
} from './profileFilters'
/**
 * admin-web 的 vitest 是 node 环境（没有 jsdom），营养页挂不起来；
 * 接线用 `?raw` 读源码断言（与订单中心回归测试同口径），算法仍由上面的纯函数单测覆盖。
 */
import pageSource from './index.vue?raw'

function makeRow(fieldPath: string, value: number | null): ProfileFieldRow {
  return {
    fieldPath,
    tabKey: 'macros',
    tabLabel: '宏量',
    label: fieldPath,
    unit: 'g',
    value,
    status: value === null ? 'PENDING' : 'DIRECT',
    statusLabel: value === null ? '待补' : '直接',
    statusType: value === null ? 'info' : 'success',
    sourceRecordId: null,
    sourceLabel: '—',
    formula: null
  }
}

function makeRows(): ProfileFieldRow[] {
  return [
    makeRow('macros.energyKcal', 195),
    makeRow('macros.crudeProtein', null),
    makeRow('macros.moisture', 0)
  ]
}

function makeGroup(rows: ProfileFieldRow[]): ProfileGroup {
  return {
    profileIndex: 0,
    preparationState: 'RAW',
    stateLabel: '生',
    sourceRecordId: 'src-raw',
    sourceLabel: '本地库',
    rows,
    pendingCount: rows.filter((row) => row.status === 'PENDING').length
  }
}

describe('营养档案筛子', () => {
  const rows = makeRows()

  it('只看有值包含 0，不包含 null', () => {
    expect(filterProfileRows(rows, 'FILLED').map((row) => row.fieldPath)).toEqual(
      ['macros.energyKcal', 'macros.moisture']
    )
  })

  it('只看缺口只包含 null，是有值的补集', () => {
    expect(filterProfileRows(rows, 'MISSING').map((row) => row.fieldPath)).toEqual(
      ['macros.crudeProtein']
    )
    expect(
      filterProfileRows(rows, 'FILLED').length +
        filterProfileRows(rows, 'MISSING').length
    ).toBe(rows.length)
  })

  it('计数与全量一致', () => {
    expect(profileFilterCounts(rows)).toEqual({
      all: 3,
      filled: 2,
      missing: 1
    })
    expect(filterProfileRows(rows, 'ALL')).toHaveLength(rows.length)
  })

  it('全是值、没有缺口的组在「只看缺口」下不显示', () => {
    const filledGroup = makeGroup([
      makeRow('macros.energyKcal', 195),
      makeRow('macros.moisture', 0)
    ])

    expect(groupVisibleOnFilter(filledGroup, 'MISSING')).toBe(false)
  })

  it('空组在任何筛子下都不显示', () => {
    const emptyGroup = makeGroup([])

    for (const mode of ['ALL', 'FILLED', 'MISSING'] as const) {
      expect(groupVisibleOnFilter(emptyGroup, mode)).toBe(false)
    }
  })
})

/** 剥注释后再断言 —— 注释里可能提到被删掉的旧实现。 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('营养页筛子接线', () => {
  const clean = stripComments(pageSource)

  it('三个筛子都带当前档案的计数，且没有「只看必需」', () => {
    expect(clean).toContain('全部 {{ group.counts.all }}')
    expect(clean).toContain('只看有值 {{ group.counts.filled }}')
    expect(clean).toContain('只看缺口 {{ group.counts.missing }}')
    expect(clean).not.toContain('只看必需')
  })

  it('按当前筛子过滤组内行，整组没有可见行就不渲染', () => {
    expect(clean).toContain('filterProfileRows(group.rows, mode)')
    expect(clean).toContain('groupVisibleOnFilter(group, mode)')
    expect(clean).toContain('v-for="group in visibleProfileGroups"')
  })
})
