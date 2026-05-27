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
    expect(detailSource).toContain('对话记录')
    expect(detailSource).toContain('查看草稿')
    expect(detailSource).toContain('&jobId=${job.value.id}')
    expect(detailSource).not.toContain('WAITING_USER 回答')
    expect(detailSource).not.toContain('>messages<')
    expect(detailSource).toContain('hasLoadedOnce')
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

  it('loads draft review from a job id instead of scanning all jobs', () => {
    expect(draftSource).toContain('jobId')
    expect(draftSource).toContain('请从任务详情页进入草稿审核')
    expect(draftSource).toContain('ingredientCreationApi.getJob(jobId.value)')
    expect(draftSource).not.toContain('ingredientCreationApi.listJobs')
  })

  it('keeps draft edit, update, and confirm actions admin-only while staff can review read-only data', () => {
    expect(draftSource).toContain('class="readonly-note"')
    expect(draftSource).toContain('仅管理员可编辑草稿信息')
    expect(draftSource).toContain('v-if="isAdmin" class="admin-edit-section"')
    expect(draftSource).toContain('v-if="isAdmin" class="profile-edit-section"')
    expect(draftSource).toContain('if (!isAdmin.value')
    expect(draftSource).toContain('ingredientCreationApi.updateDraft')
    expect(draftSource).toContain('ingredientCreationApi.updateDraftProfile')
  })

  it('resolves admin role from current user first and refreshes uncertain local storage from the API', () => {
    const userStorageIndex = draftSource.indexOf("uni.getStorageSync('user')")
    const userInfoStorageIndex = draftSource.indexOf("uni.getStorageSync('userInfo')")

    expect(draftSource).toContain("import { request } from '../../utils/api'")
    expect(draftSource).toContain('/users/me')
    expect(draftSource).toContain("uni.getStorageSync('token')")
    expect(userStorageIndex).toBeGreaterThanOrEqual(0)
    expect(userInfoStorageIndex).toBeGreaterThan(userStorageIndex)
    expect(draftSource).toContain('refreshCurrentUserRole')
  })
})
