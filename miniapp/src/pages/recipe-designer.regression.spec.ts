import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => {
  const absolutePath = resolve(process.cwd(), path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : ''
}

const staffWorkbenchSource = readSource('src/pages/staff-workbench/index.vue')
const pagesJsonSource = readSource('src/pages.json')
const editorSource = readSource('src/pages/recipe-designer/editor.vue')
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
    expect(editorSource).toContain('当前总量')
    expect(editorSource).toContain('weightG')
    expect(editorSource).not.toContain('一键归一')
    expect(editorSource).not.toContain('缩放到')
    expect(editorSource).not.toContain('1kg')
  })

  it('shows assessment drawer and supports backend assessment statuses', () => {
    expect(editorSource).toContain('assessment-drawer')
    expect(assessmentSource).toContain('MISSING_DATA')
    expect(assessmentSource).toContain('DEFICIENT')
    expect(assessmentSource).toContain('EXCESS')
    expect(assessmentSource).toContain('COMPLIANT')
  })

  it('uses scenario for draft updates and never sends legacy scenario or nutrition ids while changing weight', () => {
    const updateDraftCall = editorSource.match(/recipeDesignerApi\.updateDraft\([\s\S]*?\)/)?.[0] || ''
    const updateWeightBlock = editorSource.match(/(?:async\s+)?function updateWeight[\s\S]*?\n}/)?.[0] || ''

    expect(updateDraftCall).toContain('scenario')
    expect(editorSource).not.toContain('fediafDogScenario')
    expect(updateWeightBlock).toContain('recipeDesignerApi.updateItem')
    expect(updateWeightBlock).toContain('weightG')
    expect(updateWeightBlock).not.toContain('nutritionFoodId')
  })
})

describe('recipe designer publish guardrails', () => {
  it('requires review notes for risky publish flow and calls publishDraft', () => {
    expect(publishSource).toContain('reviewNote')
    expect(publishSource).toContain('需审核配方必须填写审核说明')
    expect(publishSource).toContain('publishDraft')
  })
})
