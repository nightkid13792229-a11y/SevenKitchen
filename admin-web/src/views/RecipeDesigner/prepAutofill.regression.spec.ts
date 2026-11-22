import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/RecipeAgentDrawer.vue?raw'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'
import fieldSource from '@/views/RecipeDesigner/components/PreparationMethodField.vue?raw'
import apiSource from '@/api/recipes.ts?raw'

describe('预处理按原料+档案自动带出', () => {
  it('对话里不再出现预处理确认卡', () => {
    expect(drawerSource).not.toContain('visiblePreparationChanges')
    expect(drawerSource).not.toContain('预处理写法待确认')
    expect(drawerSource).not.toContain('用新的')
    expect(drawerSource).not.toContain('用旧的')
  })

  it('编辑器把当前营养档案传给预处理历史建议', () => {
    expect(editorSource).toContain(':nutrition-food-id="element.nutritionFoodId"')
    expect(editorSource).toContain('该原料 + 营养档案还没有预处理记录，请补充')
    expect(fieldSource).toContain('nutritionFoodId?: string | null')
    expect(fieldSource).toContain('nutritionFoodId || undefined')
    expect(apiSource).toContain('nutritionFoodId?: string')
  })
})
