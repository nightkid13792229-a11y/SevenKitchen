import { describe, expect, it } from 'vitest'
import viewSource from '@/views/RecipeDesigner/components/TaxonomyView.vue?raw'
import dialogSource from '@/views/RecipeDesigner/components/TaxonomyClassifyDialog.vue?raw'
import indexSource from '@/views/RecipeDesigner/index.vue?raw'

describe('需求分类视图', () => {
  it('左树右列表 + 未归类入口', () => {
    expect(viewSource).toContain('未归类')
    expect(viewSource).toContain('el-tree')
    expect(viewSource).toContain('buildTaxonomyChips')
  })

  it('沿用页面上的产品线/订单、状态开关，避免定制食谱混进整理清单', () => {
    expect(viewSource).toContain('designMode?:')
    expect(viewSource).toContain('status?:')
    expect(viewSource).toContain('scopeParams()')
    expect(indexSource).toContain(':design-mode="filters.mode"')
    expect(indexSource).toContain(':status="filters.status"')
  })

  it('没归的分类显示占位，而不是不显示', () => {
    expect(viewSource).toContain('chip.missing')
  })

  it('列表页挂了「按需求分类」切换', () => {
    expect(indexSource).toContain('按需求分类')
    expect(indexSource).toContain('TaxonomyView')
    expect(indexSource).toContain("viewMode === 'TAXONOMY'")
  })

  it('归类弹窗：同分类单选、展示节点定义、单道/批量分别走不同接口', () => {
    expect(dialogSource).toContain('el-radio')
    expect(dialogSource).toContain('option.definition')
    expect(dialogSource).toContain('replaceLinks')
    expect(dialogSource).toContain('batchLinks')
  })

  it('弹窗底部说明归属不影响发布', () => {
    expect(dialogSource).toContain('不改配方、不触发发布')
  })
})
