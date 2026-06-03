import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sourceExists = (path: string) => existsSync(resolve(process.cwd(), path))
const readSource = (path: string) => {
  const absolutePath = resolve(process.cwd(), path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : ''
}

const staffWorkbenchSource = readSource('src/pages/staff-workbench/index.vue')
const pagesJsonSource = readSource('src/pages.json')

describe('ingredient creation miniapp removal', () => {
  it('does not expose AI ingredient creation from the staff workbench', () => {
    expect(staffWorkbenchSource).not.toContain('AI 新增食材')
    expect(staffWorkbenchSource).not.toContain('goToIngredientCreation')
    expect(staffWorkbenchSource).not.toContain('/pages/ingredient-creation/list')
    expect(staffWorkbenchSource).not.toContain('ingredient-creation')
  })

  it('does not register AI ingredient creation pages', () => {
    expect(pagesJsonSource).not.toContain('pages/ingredient-creation')
    expect(pagesJsonSource).not.toContain('AI 新增食材')
    expect(pagesJsonSource).not.toContain('新增食材任务')
    expect(pagesJsonSource).not.toContain('食材草稿审核')
  })

  it('does not keep miniapp AI ingredient creation pages or API client', () => {
    expect(sourceExists('src/pages/ingredient-creation/list.vue')).toBe(false)
    expect(sourceExists('src/pages/ingredient-creation/detail.vue')).toBe(false)
    expect(sourceExists('src/pages/ingredient-creation/draft.vue')).toBe(false)
    expect(sourceExists('src/api/ingredient-creation.ts')).toBe(false)
    expect(sourceExists('src/api/ingredient-creation.spec.ts')).toBe(false)
  })
})
