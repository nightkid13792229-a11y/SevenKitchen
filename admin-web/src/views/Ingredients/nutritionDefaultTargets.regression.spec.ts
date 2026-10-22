import { describe, expect, it } from 'vitest'
import editorSource from '@/views/Ingredients/components/IngredientNutritionEditor.vue?raw'
import dialogSource from '@/views/Ingredients/components/IngredientNutritionDialog.vue?raw'
import ingredientsApiSource from '@/api/ingredients.ts?raw'
import ingredientTypesSource from '@/types/ingredient.ts?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('营养档案 · 默认补剂目标营养素', () => {
  const editor = clean(editorSource)
  const dialog = clean(dialogSource)
  const api = clean(ingredientsApiSource)
  const types = clean(ingredientTypesSource)

  it('只有补剂营养档案显示默认目标配置区', () => {
    expect(editor).toContain('v-if="isSupplementProfile"')
    expect(editor).toContain('默认补剂目标营养素')
    expect(editor).toContain(
      'props.ingredientType === IngredientType.SUPPLEMENT'
    )
  })

  it('从营养字段目录选择，支持多选并包含派生组合字段', () => {
    expect(editor).toContain('NUTRITION_FIELD_CATALOG')
    expect(editor).toContain('DERIVED_NUTRITION_FIELD_CATALOG')
    expect(editor).toContain('v-model="selectedTargetFieldPaths"')
    expect(editor).toContain('multiple')
    expect(editor).toContain('filterable')
    expect(editor).toContain('derived.formula !== "SUM"')
    expect(editor).toContain('组合合计')
  })

  it('只允许非空且大于 0 的字段，并防止重复目标', () => {
    expect(editor).toContain('value <= 0')
    expect(editor).toContain('seenFieldPaths')
    expect(editor).toContain('normalizeSupplementTargetDefinitions')
  })

  it('保存/清空默认目标，并对失效目标给出明确提示', () => {
    expect(editor).toContain('update:defaultSupplementTargets')
    expect(editor).toContain('buildDefaultSupplementTargetPayload')
    expect(editor).toContain('未配置默认目标')
    expect(editor).toContain('当前档案中为空或为 0')
    expect(editor).toContain('不锁定食谱内选择')
  })

  it('营养档案 API 支持读取与写入 defaultSupplementTargets', () => {
    expect(api).toContain('getDetail')
    expect(api).toContain('`/nutrition-foods/${id}`')
    expect(api).toContain('defaultSupplementTargets')
    expect(types).toContain('interface NutritionSupplementTarget')
    expect(types).toContain('defaultSupplementTargets?:')
  })

  it('档案弹窗把默认目标传给编辑器并随营养数据一起保存', () => {
    expect(dialog).toContain(
      ':default-supplement-targets="draftDefaultSupplementTargets"'
    )
    expect(dialog).toContain('@update:default-supplement-targets')
    expect(dialog).toContain('loadDefaultSupplementTargets')
    expect(dialog).toContain('defaultSupplementTargetsPayload')
    expect(dialog).toContain('defaultSupplementTargets: defaultSupplementTargetsPayload')
    expect(dialog).toContain(
      'props.ingredient.type === IngredientType.SUPPLEMENT'
    )
  })
})
