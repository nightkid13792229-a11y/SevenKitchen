import { describe, expect, it } from 'vitest'
import listSource from './index.vue?raw'
import aiCreatePageSource from './ai-create/index.vue?raw'
import chatStateSource from './ai-create/chatState.ts?raw'
import creationApiSource from '@/api/ingredientCreation.ts?raw'
import routerSource from '@/router/index.ts?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * 「AI 添加原料」入口与第一步页面的接线靠人工点按钮接入，
 * 对话状态本身由 chatState.spec.ts 覆盖；这里沿用仓库的源码回归测试，
 * 防止入口又退回隐藏的下拉、或者路由 / 接口路径被改错。
 */
describe('AI 添加原料 · 列表入口与第一步对话页', () => {
  const list = clean(listSource)
  const page = clean(aiCreatePageSource)
  const chatState = clean(chatStateSource)
  const creationApi = clean(creationApiSource)
  const router = clean(routerSource)

  it('原料列表的「AI 新建」下拉换成「AI 添加原料」按钮', () => {
    expect(list).toContain('AI 添加原料')
    expect(list).toContain("name: 'IngredientAiCreate'")
    expect(list).not.toContain('<el-dropdown')
    expect(list).not.toContain('AI_CREATION_ENABLED')
  })

  it('路由是 /ingredients/ai-create，name IngredientAiCreate，标题 AI 添加原料', () => {
    expect(router).toContain('ingredients/ai-create')
    expect(router).toContain('name: "IngredientAiCreate"')
    expect(router).toContain('title: "AI 添加原料"')
  })

  it('进入页面 AI 的第一句固定是「你要添加什么原料？」', () => {
    expect(chatState).toContain("export const WELCOME_TEXT = '你要添加什么原料？'")
    expect(page).toContain(
      'createIntakeChat(ingredientCreationApi.classifyIntake)'
    )
  })

  it('建议项点击、失败重试都接到对话控制器，页面不自己发请求', () => {
    expect(page).toContain('handleSuggestion(suggestion)')
    expect(page).toContain('handleRetry')
    expect(page).toContain('state.failedText')
    expect(page).not.toContain('api.post(')
  })

  it('API 客户端接上 POST /admin/ingredient-creation/intake/classify', () => {
    expect(creationApi).toContain('classifyIntake')
    expect(creationApi).toContain('api.post(`${BASE}/intake/classify`, { text })')
  })
})
