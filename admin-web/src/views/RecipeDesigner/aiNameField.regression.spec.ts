import { describe, expect, it } from 'vitest'
import fieldSource from '@/views/RecipeDesigner/components/AiNameField.vue?raw'
import apiSource from '@/api/recipeNaming.ts?raw'

describe('AI 命名字段', () => {
  it('输入框旁有 AI 生成按钮与 12 字计数器', () => {
    expect(fieldSource).toContain('AI 生成')
    expect(fieldSource).toContain('/ {{ RECIPE_NAME_MAX_LENGTH }}')
  })

  it('超长的候选被丢弃，不是截断', () => {
    expect(fieldSource).toContain(
      'countLength(item.name) <= RECIPE_NAME_MAX_LENGTH'
    )
    expect(fieldSource).not.toContain('.slice(0,')
  })

  it('命中禁用词的候选保留，但提示合规存疑', () => {
    expect(fieldSource).toContain('complianceWarning')
    expect(fieldSource).toContain('合规存疑')
  })

  it('AI 不可用时按钮禁用而不是点了报错', () => {
    expect(fieldSource).toContain(':disabled="!available || !seriesId"')
    expect(fieldSource).toContain('AI 命名服务未配置')
  })

  it('生成失败会恢复按钮并可重试', () => {
    expect(fieldSource).toContain('finally')
    expect(fieldSource).toContain('generating.value = false')
  })

  it('接口路径与后端一致，且只生成不落库', () => {
    expect(apiSource).toContain("'/admin/recipe-designer/naming/availability'")
    expect(apiSource).toContain(
      '`/admin/recipe-designer/series/${seriesId}/name-candidates`'
    )
    expect(apiSource).not.toContain('updateSeries')
  })
})
