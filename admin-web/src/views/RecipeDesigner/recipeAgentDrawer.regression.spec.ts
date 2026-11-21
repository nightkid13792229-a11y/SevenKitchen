import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/RecipeAgentDrawer.vue?raw'

/**
 * 方案修订后的确认入口（2026-11-21）。
 *
 * 后端已经允许在 SELECT / DESIGN 阶段重新确认方案；前端不能只把确认按钮
 * 限在 PLAN 阶段，否则用户改完方案后找不到“重新确认方案”。
 */
describe('AI 设计对话 · 方案重新确认', () => {
  it('方案未确认时始终显示确认按钮，不只在 PLAN 阶段', () => {
    expect(drawerSource).toContain('v-if="!session.planConfirmedAt"')
    expect(drawerSource).not.toContain(
      "session.phase === 'PLAN' && !session.planConfirmedAt"
    )
  })

  it('在选材/配方阶段显示“重新确认方案”', () => {
    expect(drawerSource).toContain('重新确认方案')
    expect(drawerSource).toContain('方案已修订，待重新确认')
  })

  it('选材确认后不再显示“正在进入配方编辑阶段”的假状态', () => {
    expect(drawerSource).toContain('选材已确认；可在对话里继续调整配方。')
    expect(drawerSource).not.toContain('选材已确认，正在进入配方编辑阶段…')
  })
})

describe('AI 设计对话 · 预处理写法比对', () => {
  it('AI 改了预处理时显示旧/新，并提供用新的/用旧的', () => {
    expect(drawerSource).toContain('preparationChange')
    expect(drawerSource).toContain('visiblePreparationChanges')
    expect(drawerSource).toContain('用新的')
    expect(drawerSource).toContain('用旧的')
    expect(drawerSource).toContain('preparationMethod: change.before')
  })
})

describe('AI 设计对话 · 完成交接', () => {
  it('完成态显示完成卡和上线检查入口', () => {
    expect(drawerSource).toContain('设计完成')
    expect(drawerSource).toContain('打开上线检查')
    expect(drawerSource).toContain('finishReadiness')
    expect(drawerSource).toContain("session?.status === 'COMPLETED'")
  })

  it('把运行状态通知编辑器，并在卸载时清掉自己的定时器', () => {
    expect(drawerSource).toContain('running-changed')
    expect(drawerSource).toContain('onBeforeUnmount')
  })
})
