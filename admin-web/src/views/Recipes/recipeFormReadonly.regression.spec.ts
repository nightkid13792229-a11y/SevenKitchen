import { describe, expect, it } from 'vitest'
import source from '@/views/Recipes/RecipeForm.vue?raw'

describe('旧食谱编辑页 · 设计器托管字段只读（2026-10-22）', () => {
  it('已有食谱的制作步骤输入框禁用并提示去设计器修改', () => {
    expect(source).toContain(':disabled="isEdit"')
    expect(source).toContain('制作步骤已由「食谱设计器」管理')
  })

  it('已有食谱的补剂目标字段、目标值和增删按钮禁用', () => {
    expect(source).toContain('class="supplement-target-field"')
    expect(source).toContain(':disabled="isEdit"')
    expect(source).toContain('补剂目标已由「食谱设计器」管理')
    expect(source).toContain(':disabled="isEdit" @click="addSupplementTarget"')
  })

  it('新建食谱仍可编辑', () => {
    expect(source).toContain('const isEdit = computed(() => !!recipeId.value)')
  })
})
