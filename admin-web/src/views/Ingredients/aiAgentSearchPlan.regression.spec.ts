import { describe, expect, it } from 'vitest'
import pageSource from './ai-agent/index.vue?raw'
import apiSource from '@/api/ingredientCreation.ts?raw'
import typesSource from '@/types/ingredientCreation.ts?raw'

function clean(source: string) {
  return source.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * 「检索方案」这张卡：AI 查完库、写草稿之前必须先拿到人的确认。
 *
 * 判定逻辑在 agentStream / 后端领域层各自有用例；这里用源码回归钉住接线：
 * 卡在、确认走那个接口、确认后会自己继续一轮。
 */
describe('AI 添加原料 · 检索方案确认', () => {
  const page = clean(pageSource)

  it('页面渲染方案卡，并把待确认方案放进状态', () => {
    expect(page).toContain('pendingPlan')
    expect(page).toContain('检索方案，待你确认')
    expect(page).toContain('确认并填写原料档案和营养档案')
  })

  it('汇报与候选都用表格展示，且不再重复展示搜索词/目标库编辑区', () => {
    expect(page).toContain('营养库')
    expect(page).toContain('命中')
    expect(page).toContain('轮次')
    expect(page).toContain('候选档案')
    expect(page).not.toContain('addPlanKeyword')
    expect(page).not.toContain('目标库编辑')
  })

  it('候选记录在卡里以表格多选呈现，并显示汇报与事实列', () => {
    expect(page).toContain('selectedRecordIds')
    expect(page).toContain('libraryReports')
    expect(page).toContain('isCandidateDisabled')
    expect(page).toContain('入选原因')
  })

  it('确认走 confirmSearchPlan，并自动继续一轮', () => {
    expect(page).toContain('confirmSearchPlan')
    expect(page).toContain('各写一份营养档案')
  })

  it('接口与类型都在该在的位置', () => {
    expect(apiSource).toContain('search-plan/confirm')
    expect(typesSource).toContain('export interface SearchPlan')
  })
})
