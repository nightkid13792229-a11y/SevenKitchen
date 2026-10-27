import { describe, expect, it } from 'vitest'
import editor from '@/views/RecipeDesigner/Editor.vue?raw'

/**
 * 配方编辑页 · 只保留一个 AI 入口（2026-10-27）
 *
 * 背景：编辑页原有「AI 设计建议」四步向导与「AI 设计对话」两个板块，
 * 功能重叠、模型配置也容易混淆。产品决定只保留对话式 Agent。
 *
 * 这组断言锁住：建议板块不会再被误加回来，且对话入口仍在。
 */
describe('配方编辑页 · AI 入口', () => {
  it('保留 AI 设计对话抽屉', () => {
    expect(editor).toContain('AI 设计对话')
    expect(editor).toContain('RecipeAgentDrawer')
    expect(editor).toContain('agentDrawerVisible')
  })

  it('AI 设计建议板块已清理干净', () => {
    expect(editor).not.toContain('AI 设计建议')
    expect(editor).not.toContain('AiDesignSuggestionPanel')
    expect(editor).not.toContain('aiPanelVisible')
    expect(editor).not.toContain('handleAiAddItem')
  })
})
