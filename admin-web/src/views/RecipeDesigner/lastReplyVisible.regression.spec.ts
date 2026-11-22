import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/RecipeAgentDrawer.vue?raw'

describe('AI 最后回复自动可见', () => {
  it('新助手回复出现时滚到回复本身，而不是滚到方案卡底部', () => {
    expect(drawerSource).toContain('lastAssistantMessageId')
    expect(drawerSource).toContain('scrollToMessage')
    expect(drawerSource).toContain('hasNewAssistant')
    expect(drawerSource).toContain(':data-message-id="message.id"')
  })
})
