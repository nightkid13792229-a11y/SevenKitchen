import { describe, expect, it } from 'vitest'
import listSource from './index.vue?raw'
import creationSource from './creation/index.vue?raw'
import creationApiSource from '@/api/ingredientCreation.ts?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * 「继续未完成」的入口、弹窗与跳转靠人工点按钮接入，纯函数之外的行为
 * 没有组件挂载环境可测，沿用仓库里的源码回归测试。
 */
describe('AI 新建原料 · 继续未完成入口', () => {
  const list = clean(listSource)
  const creation = clean(creationSource)
  const creationApi = clean(creationApiSource)

  it('原料列表的「AI 新建」变成含「新建 / 继续未完成」的下拉', () => {
    expect(list).toContain('<el-dropdown')
    expect(list).toContain('command="new"')
    expect(list).toContain('command="resume"')
    expect(list).toContain('新建')
    expect(list).toContain('resumeEntryLabel(unfinishedDrafts.length)')
  })

  it('没有未完成草稿时隐藏「继续未完成」入口', () => {
    expect(list).toContain('v-if="hasUnfinishedDrafts(unfinishedDrafts)"')
  })

  it('弹窗列出名字、中文站点与最后编辑时间', () => {
    expect(list).toContain('{{ draft.name }}')
    expect(list).toContain('creationStepLabel(draft.step)')
    expect(list).toContain('formatDraftUpdatedAt(draft.updatedAt)')
  })

  it('点一条草稿跳到带 draftId 的向导地址', () => {
    expect(list).toContain('handleResumeDraft(draft)')
    expect(list).toContain("name: 'IngredientCreation'")
    expect(list).toContain('draftId: draft.draftId')
  })

  it('列表页挂载时拉取未完成草稿（接口失败也不挡主列表）', () => {
    expect(list).toContain('ingredientCreationApi.listDrafts()')
    expect(list).toContain('loadUnfinishedDrafts')
  })

  it('API 客户端接上 GET /admin/ingredient-creation/drafts', () => {
    expect(creationApi).toContain('listDrafts')
    expect(creationApi).toContain('api.get(`${BASE}/drafts`)')
  })

  it('向导离开确认里说明草稿可保留并可从列表找回', () => {
    expect(creation).toContain('继续未完成')
    expect(creation).toContain('草稿会自动保存在服务器')
  })
})
