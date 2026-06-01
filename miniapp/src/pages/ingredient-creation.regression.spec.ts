import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => {
  const absolutePath = resolve(process.cwd(), path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : ''
}

const existsInProject = (path: string) => existsSync(resolve(process.cwd(), path))

describe('removed ingredient creation miniapp surface', () => {
  const staffWorkbenchSource = readSource('src/pages/staff-workbench/index.vue')
  const pagesJsonSource = readSource('src/pages.json')

  it('does not expose AI ingredient creation from staff workbench', () => {
    expect(staffWorkbenchSource).not.toContain('AI 新增食材')
    expect(staffWorkbenchSource).not.toContain('goToIngredientCreation')
    expect(staffWorkbenchSource).not.toContain('/pages/ingredient-creation/list')
    expect(staffWorkbenchSource).not.toContain('ingredient-creation')
  })

  it('does not register ingredient creation pages in pages.json', () => {
    expect(pagesJsonSource).not.toContain('pages/ingredient-creation')
    expect(pagesJsonSource).not.toContain('AI 新增食材')
    expect(pagesJsonSource).not.toContain('新增食材任务')
    expect(pagesJsonSource).not.toContain('食材草稿审核')
  })

  it('keeps the miniapp source tree free of ingredient creation pages and API client', () => {
    expect(existsInProject('src/api/ingredient-creation.ts')).toBe(false)
    expect(existsInProject('src/api/ingredient-creation.spec.ts')).toBe(false)
    expect(existsInProject('src/pages/ingredient-creation/list.vue')).toBe(false)
    expect(existsInProject('src/pages/ingredient-creation/detail.vue')).toBe(false)
    expect(existsInProject('src/pages/ingredient-creation/draft.vue')).toBe(false)
  })
})
