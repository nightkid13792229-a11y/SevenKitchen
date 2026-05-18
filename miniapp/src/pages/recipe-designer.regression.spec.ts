import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getAssessmentStatusClass,
  getOverallStatusLabel,
} from './recipe-designer/assessment'

const readSource = (path: string) => {
  const absolutePath = resolve(process.cwd(), path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : ''
}

const staffWorkbenchSource = readSource('src/pages/staff-workbench/index.vue')
const pagesJsonSource = readSource('src/pages.json')
const editorSource = readSource('src/pages/recipe-designer/editor.vue')
const listSource = readSource('src/pages/recipe-designer/list.vue')
const assessmentSource = readSource('src/pages/recipe-designer/assessment.ts')
const publishSource = readSource('src/pages/recipe-designer/publish.vue')

describe('recipe designer mobile entry', () => {
  it('links staff workbench to the recipe designer draft list', () => {
    expect(staffWorkbenchSource).toContain('食谱设计器')
    expect(staffWorkbenchSource).toContain('goToRecipeDesigner')
    expect(staffWorkbenchSource).toContain('/pages/recipe-designer/list')
  })

  it('registers recipe designer pages in pages.json', () => {
    expect(pagesJsonSource).toContain('pages/recipe-designer/list')
    expect(pagesJsonSource).toContain('pages/recipe-designer/editor')
    expect(pagesJsonSource).toContain('pages/recipe-designer/publish')
  })

  it('lets staff delete unpublished drafts from the draft list with confirmation', () => {
    expect(listSource).toContain('deleteDraft')
    expect(listSource).toContain('recipeDesignerApi.deleteDraft')
    expect(listSource).toContain('canDeleteDraft')
    expect(listSource).toContain('uni.showModal')
    expect(listSource).toContain('@tap.stop')
    expect(listSource).toContain('PUBLISHED')
  })

  it('guides new draft creation with recipe name and life stage before navigating to the editor', () => {
    expect(listSource).toContain('createSheetVisible')
    expect(listSource).toContain('newDraftName')
    expect(listSource).toContain('newDraftScenario')
    expect(listSource).toContain('生命阶段')
    expect(listSource).toContain('canSubmitNewDraft')
    expect(listSource).toContain('openCreateDraftSheet')
    expect(listSource).toContain('name: newDraftName.value.trim()')
    expect(listSource).not.toContain("name: '未命名配方'")
  })
})

describe('recipe designer editor guardrails', () => {
  it('uses the four supported scenario labels without legacy combined labels', () => {
    expect(editorSource).toContain('<14周幼犬 / 繁殖期')
    expect(editorSource).toContain('>=14周幼犬')
    expect(editorSource).toContain('成年犬 MER 95')
    expect(editorSource).toContain('成年犬 MER 110')
    expect(editorSource).not.toContain('幼犬统一')
    expect(editorSource).not.toContain('成年犬统一')
  })

  it('keeps first version weight editing focused on current total and item weightG', () => {
    expect(editorSource).toContain('总量 {{ currentTotalWeightG.toFixed(0) }}g')
    expect(editorSource).toContain('weightG')
    expect(editorSource).not.toContain('class="total-bar"')
    expect(editorSource).not.toContain('一键归一')
    expect(editorSource).not.toContain('缩放到')
    expect(editorSource).not.toContain('1kg')
  })

  it('uses life-stage wording and autosaves draft metadata instead of showing a manual save button', () => {
    expect(editorSource).toContain('生命阶段')
    expect(editorSource).not.toContain('评估场景')
    expect(editorSource).toContain('autoSaveDraftMetadata')
    expect(editorSource).toContain('metadataSaveLabel')
    expect(editorSource).toContain('flushMetadataAutosave')
    expect(editorSource).toContain('watch([draftName, scenario]')
    expect(editorSource).not.toContain("{{ saving ? '保存中' : '保存' }}")
    expect(editorSource).not.toContain('saveDraftMetadata')
  })

  it('reads persisted backend draft fields without changing the write payload contract', () => {
    expect(listSource).toContain('fediafDogScenario')
    expect(listSource).toContain('energyDensityKcalPerKg')
    expect(editorSource).toContain('fediafDogScenario')
    expect(editorSource).toContain('getDraftScenario')
  })

  it('shows assessment drawer and supports backend assessment statuses', () => {
    expect(editorSource).toContain('assessment-drawer')
    expect(editorSource).toContain('groupedEntries')
    expect(editorSource).toContain('detailCount')
    expect(editorSource).toContain('currentValue')
    expect(editorSource).toContain('minValue')
    expect(editorSource).toContain('maxValue')
    expect(editorSource).toContain('entry.label')
    expect(assessmentSource).toContain('MISSING_DATA')
    expect(assessmentSource).toContain('DEFICIENT')
    expect(assessmentSource).toContain('EXCESS')
    expect(assessmentSource).toContain('COMPLIANT')
  })

  it('maps backend overall assessment statuses used by publish and drawer badges', () => {
    expect(getOverallStatusLabel('COMPLIANT')).toBe('已达标')
    expect(getOverallStatusLabel('NON_COMPLIANT')).toBe('未达标/需审核')
    expect(getOverallStatusLabel('INCOMPLETE')).toBe('资料不完整')
    expect(getAssessmentStatusClass('NON_COMPLIANT')).toBe('status-deficient')
    expect(getAssessmentStatusClass('INCOMPLETE')).toBe('status-missing')
  })

  it('uses scenario for draft updates and never sends legacy scenario or nutrition ids while changing weight', () => {
    const updateDraftCall = editorSource.match(/recipeDesignerApi\.updateDraft\([\s\S]*?\)/)?.[0] || ''
    const updateWeightBlock = editorSource.match(/(?:async\s+)?function updateWeight[\s\S]*?\n}/)?.[0] || ''

    expect(updateDraftCall).toContain('scenario')
    expect(updateDraftCall).not.toContain('fediafDogScenario')
    expect(updateWeightBlock).toContain('recipeDesignerApi.updateItem')
    expect(updateWeightBlock).toContain('weightG')
    expect(updateWeightBlock).not.toContain('nutritionFoodId')
  })

  it('replaces the ingredient placeholder with a mobile picker that can add and remove items', () => {
    expect(editorSource).not.toContain('原料选择稍后接入')
    expect(editorSource).toContain('ingredient-picker-panel')
    expect(editorSource).toContain('openIngredientPicker')
    expect(editorSource).toContain('listIngredientOptions')
    expect(editorSource).toContain('ingredientSearchDebounceTimer')
    expect(editorSource).toContain('watch(ingredientSearchKeyword')
    expect(editorSource).toContain('selectedIngredientOption')
    expect(editorSource).toContain('selectedNutritionProfile')
    expect(editorSource).toContain('selectNutritionProfile')
    expect(editorSource).toContain('营养档案')
    expect(editorSource).toContain('ingredientId: selectedIngredientOption.value.id')
    expect(editorSource).toContain('confirmAddIngredient')
    expect(editorSource).toContain('recipeDesignerApi.addItem')
    expect(editorSource).toContain('removeIngredient')
    expect(editorSource).toContain('recipeDesignerApi.removeItem')
    expect(editorSource).not.toContain('hasPrimaryMapping')
    expect(editorSource).not.toContain('class="search-btn"')
    expect(editorSource).not.toContain('class="food-badge"')
    expect(editorSource).not.toContain('多档案')
    expect(editorSource).not.toContain('主档案')
  })
})

describe('recipe designer publish guardrails', () => {
  it('requires review notes for risky publish flow and calls publishDraft', () => {
    expect(publishSource).toContain('reviewNote')
    expect(publishSource).toContain('需审核配方必须填写审核说明')
    expect(publishSource).toContain('publishDraft')
  })
})
