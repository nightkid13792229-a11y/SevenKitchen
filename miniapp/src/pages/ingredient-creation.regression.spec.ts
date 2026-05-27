import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => {
  const absolutePath = resolve(process.cwd(), path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : ''
}

const staffWorkbenchSource = readSource('src/pages/staff-workbench/index.vue')
const pagesJsonSource = readSource('src/pages.json')
const listSource = readSource('src/pages/ingredient-creation/list.vue')
const detailSource = readSource('src/pages/ingredient-creation/detail.vue')
const draftSource = readSource('src/pages/ingredient-creation/draft.vue')

describe('ingredient creation miniapp entry', () => {
  it('links staff workbench to the AI ingredient creation workflow', () => {
    expect(staffWorkbenchSource).toContain('AI 新增食材')
    expect(staffWorkbenchSource).toContain('goToIngredientCreation')
    expect(staffWorkbenchSource).toContain('/pages/ingredient-creation/list')
  })

  it('registers list, detail, and draft pages in pages.json', () => {
    expect(pagesJsonSource).toContain('"path": "pages/ingredient-creation/list"')
    expect(pagesJsonSource).toContain('"navigationBarTitleText": "AI 新增食材"')
    expect(pagesJsonSource).toContain('"path": "pages/ingredient-creation/detail"')
    expect(pagesJsonSource).toContain('"navigationBarTitleText": "新增食材任务"')
    expect(pagesJsonSource).toContain('"path": "pages/ingredient-creation/draft"')
    expect(pagesJsonSource).toContain('"navigationBarTitleText": "食材草稿审核"')
  })
})

describe('ingredient creation list page', () => {
  it('creates AI ingredient jobs from the internal workbench task list', () => {
    expect(listSource).toContain('ingredientCreationApi.listJobs')
    expect(listSource).toContain('ingredientCreationApi.createJob')
    expect(listSource).toContain('新增食材需求')
    expect(listSource).toContain('AI 新增食材')
  })
})

describe('ingredient creation detail page', () => {
  it('shows job conversation, waiting answers, additional instructions, and draft navigation', () => {
    expect(detailSource).toContain('ingredientCreationApi.getJob')
    expect(detailSource).toContain('ingredientCreationApi.answerQuestion')
    expect(detailSource).toContain('ingredientCreationApi.addMessage')
    expect(detailSource).toContain('WAITING_USER')
    expect(detailSource).toContain('messages')
    expect(detailSource).toContain('查看草稿')
  })
})

describe('ingredient creation draft page', () => {
  it('supports admin-only draft confirmation and completeness review', () => {
    expect(draftSource).toContain('ingredientCreationApi.confirmDraft')
    expect(draftSource).toContain('ingredientCreationApi.updateDraft')
    expect(draftSource).toContain('ingredientCreationApi.updateDraftProfile')
    expect(draftSource).toContain('isAdmin')
    expect(draftSource).toContain("draft?.status === 'READY_FOR_REVIEW'")
    expect(draftSource).toContain('确认创建正式原料')
    expect(draftSource).toContain('完整性')
    expect(draftSource).toContain('非零')
    expect(draftSource).toContain('零值')
    expect(draftSource).toContain('空值')
  })
})
