import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/RecipeAgentDrawer.vue?raw'

describe('Agent 最后一轮回复刷新', () => {
  it('run 结束后补拉一次消息，避免只看到执行记录', () => {
    expect(drawerSource).toContain('scheduleFinalRefresh')
    expect(drawerSource).toContain('finalRefreshTimer')
    expect(drawerSource).toContain('window.setTimeout')
    expect(drawerSource).toContain('void loadSession()')
  })
})
