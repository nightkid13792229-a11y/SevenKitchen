import { describe, expect, it } from 'vitest'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'

describe('设计器 · AI 运行期间稳定刷新', () => {
  const editor = editorSource
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('收到 AI 运行状态后自己轮询，且先落盘人工修改', () => {
    expect(editor).toContain('@running-changed="handleAgentRunningChanged"')
    expect(editor).toContain('syncAgentDraft')
    expect(editor).toContain('flushNow()')
    expect(editor).toContain('hasPending()')
    expect(editor).toContain('onBeforeUnmount(() => stopAgentSync())')
  })

  it('当前订单槽位有未重新入仓的改动时给出提示', () => {
    expect(editor).toContain('currentOrderSlot?.stale')
    expect(editor).toContain('有新改动未重新入仓')
  })
})
