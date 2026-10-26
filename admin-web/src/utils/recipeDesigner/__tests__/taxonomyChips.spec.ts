import { describe, expect, it } from 'vitest'
import { buildTaxonomyChips } from '@/utils/recipeDesigner/taxonomyChips'
import type {
  TaxonomyKindView,
  TaxonomySeriesItem
} from '@/types/recipeDesigner'

const kinds: TaxonomyKindView[] = [
  { id: 'k-decoration', code: 'SCENARIO', name: '场景', sort: 30, nodes: [], rollupSeriesCount: 0 },
  { id: 'k-protein', code: 'MAIN_PROTEIN', name: '主蛋白', sort: 10, nodes: [], rollupSeriesCount: 0 },
  { id: 'k-health', code: 'HEALTH_NEED', name: '健康需求', sort: 20, nodes: [], rollupSeriesCount: 0 }
]

const item: TaxonomySeriesItem = {
  id: 's1',
  name: '三文鱼 · 南瓜糙米',
  businessStatus: 'PUBLIC',
  referenceDogName: null,
  updatedAt: '2026-10-20T10:00:00.000Z',
  links: [
    { kindId: 'k-protein', kindCode: 'MAIN_PROTEIN', kindName: '主蛋白', nodeId: 'n1', nodeName: '三文鱼' },
    { kindId: 'k-decoration', kindCode: 'SCENARIO', kindName: '场景', nodeId: 'n2', nodeName: '日常主食' }
  ],
  missingKindCodes: ['HEALTH_NEED']
}

describe('buildTaxonomyChips', () => {
  it('已归分类显示「分类 节点」，未归分类显示虚线占位', () => {
    const chips = buildTaxonomyChips(item, kinds)
    expect(chips.map((chip) => chip.missing)).toEqual([false, true, false])
    expect(chips[0].label).toBe('主蛋白 三文鱼')
    expect(chips[1].label).toBe('健康需求 未归类')
  })

  it('顺序按分类 sort，不受 links 返回顺序影响', () => {
    expect(buildTaxonomyChips(item, kinds).map((chip) => chip.key)).toEqual([
      'MAIN_PROTEIN',
      'HEALTH_NEED',
      'SCENARIO'
    ])
  })

  it('完全没有归属时，每个分类都是占位', () => {
    const blank: TaxonomySeriesItem = { ...item, links: [], missingKindCodes: ['MAIN_PROTEIN', 'HEALTH_NEED', 'SCENARIO'] }
    expect(buildTaxonomyChips(blank, kinds).every((chip) => chip.missing)).toBe(true)
  })

  it('分类列表为空时返回空数组，不崩', () => {
    expect(buildTaxonomyChips(item, [])).toEqual([])
  })
})
