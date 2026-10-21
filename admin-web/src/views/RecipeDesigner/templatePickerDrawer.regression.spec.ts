import { describe, expect, it } from 'vitest'
import drawer from '@/views/RecipeDesigner/components/TemplatePickerDrawer.vue?raw'

describe('模板选择抽屉 · 搜索与展示', () => {
  it('按关键词和来源搜索模板', () => {
    expect(drawer).toContain('orderRecipeDesignApi.listTemplates')
    expect(drawer).toContain('v-model="keyword"')
    expect(drawer).toContain('@keyup.enter="loadTemplates"')
    expect(drawer).toContain('v-model="kind"')
    expect(drawer).toContain('全部来源')
  })

  it('每张模板卡片展示来源 / 阶段 / 主蛋白 / 原料数 / 营养摘要', () => {
    expect(drawer).toContain('sourceKindLabel(template.sourceKind)')
    expect(drawer).toContain('formatOrderDesignLifeStage(template.lifeStage)')
    expect(drawer).toContain('template.primaryProtein')
    expect(drawer).toContain('template.ingredientCount')
    expect(drawer).toContain('template.macroSummary')
    expect(drawer).toContain('row.dryMatterLabel')
    expect(drawer).toContain('row.energyPercentLabel')
  })
})

describe('模板选择抽屉 · 阶段提示只提示不阻断', () => {
  it('选中模板后比较阶段并显示警告', () => {
    expect(drawer).toContain('orderRecipeDesignApi.getTemplateStage(orderId, recipeId)')
    expect(drawer).toContain('stageComparison.warning')
    expect(drawer).toContain('阶段不一致只提示')
  })

  it('确认按钮的禁用条件只看是否选中 / 是否提交中，不看阶段警告', () => {
    const confirmLine = drawer
      .split('\n')
      .find((line) => line.includes('confirmButtonText') || line.includes('@click="confirmCreate"'))

    expect(confirmLine).toBeTruthy()
    expect(drawer).toContain(':disabled="!selectedRecipeId || creating"')
    const disabledLine = drawer
      .split('\n')
      .find((line) => line.includes(':disabled="!selectedRecipeId || creating"'))
    expect(disabledLine).toBeTruthy()
    expect(disabledLine).not.toContain('stageComparison')
    expect(drawer).not.toContain('if (stageComparison.value?.warning) return')
  })
})

describe('模板选择抽屉 · 同一模板可重复使用', () => {
  it('已用过的模板仍可选中，只做标记不置灰', () => {
    expect(drawer).toContain('usedSourceRecipeIds')
    expect(drawer).toContain('本单已用过 · 可重复')
    expect(drawer).not.toContain(':disabled="isUsed(')
    expect(drawer).not.toContain(":disabled=\"usedSourceRecipeIds.includes('")
  })

  it('确认后按 sourceRecipeId 创建独立草稿', () => {
    expect(drawer).toContain('orderRecipeDesignApi.createFromTemplate(orderId,')
    expect(drawer).toContain('sourceRecipeId: selectedRecipeId.value')
    expect(drawer).toContain("emit('created'")
  })
})
