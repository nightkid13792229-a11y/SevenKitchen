import { describe, expect, it } from 'vitest'
import apiSource from '@/api/recipeTaxonomy.ts?raw'
import typeSource from '@/types/recipeDesigner.ts?raw'

describe('需求分类 · 前后端契约', () => {
  it('七个接口路径与后端 controller 一致', () => {
    expect(apiSource).toContain("'/admin/recipe-taxonomy/tree'")
    expect(apiSource).toContain("'/admin/recipe-taxonomy/series'")
    expect(apiSource).toContain(
      '`/admin/recipe-taxonomy/series/${seriesId}/links`'
    )
    expect(apiSource).toContain(
      "'/admin/recipe-taxonomy/series/batch-links'"
    )
    expect(apiSource).toContain("'/admin/recipe-taxonomy/nodes'")
    expect(apiSource).toContain('`/admin/recipe-taxonomy/nodes/${nodeId}`')
  })

  it('类型里带缺分类字段，卡片才能显示"未归类"占位', () => {
    expect(typeSource).toContain('missingKindCodes')
    expect(typeSource).toContain('rollupSeriesCount')
  })

  it('未归类用字符串 true 传参，避免后端 Boolean 解析歧义', () => {
    expect(apiSource).toContain("params.unclassified ? 'true' : undefined")
  })
})
