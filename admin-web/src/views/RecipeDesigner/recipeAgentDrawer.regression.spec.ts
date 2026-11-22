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
    expect(drawerSource).toContain('collectPreparationChanges(messages.value)')
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

describe('AI 设计对话 · 第三阶段', () => {
  it('选材卡可以逐条勾选并保存', () => {
    expect(drawerSource).toContain('selectionChecked')
    expect(drawerSource).toContain('保存选中清单')
    expect(drawerSource).toContain('updateAgentSelectionItems')
    expect(drawerSource).toContain('selectionDirty')
  })

  it('补剂先提案，人工点加入才写入', () => {
    expect(drawerSource).toContain('补剂提案（待确认）')
    expect(drawerSource).toContain('decideAgentSupplement')
    expect(drawerSource).toContain('加入配方')
    expect(drawerSource).toContain('不加')
  })

  it('引用未核验有提示', () => {
    expect(drawerSource).toContain('unverifiedCitations')
    expect(drawerSource).toContain('未核验')
  })

  it('支持撤销本次 AI 运行', () => {
    expect(drawerSource).toContain('撤销本次 AI 运行')
    expect(drawerSource).toContain('revertAgentRun')
  })

  it('ask 选项变成按钮，发送失败不丢输入', () => {
    expect(drawerSource).toContain('pendingAsk')
    expect(drawerSource).toContain('sendAskOption')
    expect(drawerSource).toContain('optimisticId')
    expect(drawerSource).toContain('input.value = text')
  })

  it('NEEDS_PROFILE 有补档案入口，CFCT 类别会归一化', () => {
    expect(drawerSource).toContain('去补档案')
    expect(drawerSource).toContain('openIngredientProfile')
    expect(drawerSource).toContain('normalizeCfctCategory')
  })
})

describe('AI 设计对话 · 营养方案排版', () => {
  it('数值约束和非数值约束分开列，非数值约束在理由前面', () => {
    expect(drawerSource).toContain('数值约束（')
    expect(drawerSource).toContain('非数值约束（')
    expect(drawerSource).toContain('agent-plan__section-title')
    expect(drawerSource.indexOf('非数值约束（')).toBeLessThan(
      drawerSource.indexOf('agent-plan__rationale'),
    )
  })

  it('理由按段落排版，不再是一坨文本', () => {
    expect(drawerSource).toContain('agent-plan__rationale-text')
    expect(drawerSource).toContain('white-space: pre-wrap')
    expect(drawerSource).toContain('line-height: 1.8')
  })
})

describe('AI 设计对话 · 长理由折叠', () => {
  it('理由超过 600 字可展开/收起', () => {
    expect(drawerSource).toContain('rationaleExpanded')
    expect(drawerSource).toContain('展开全文')
    expect(drawerSource).toContain('is-collapsed')
  })
})

describe('AI 设计对话 · 选材硬边界与手动添加', () => {
  it('未匹配/档案不全时不能保存或确认，并提示先解决', () => {
    expect(drawerSource).toContain('unavailableSelectionItems')
    expect(drawerSource).toContain('unavailableCheckedSelectionItems')
    expect(drawerSource).toContain('不能保存')
    expect(drawerSource).toContain('不能进入配方编辑')
  })

  it('可以手动输入食材，让模型判断同物异名后再加入', () => {
    expect(drawerSource).toContain('manualSelectionName')
    expect(drawerSource).toContain('addSelectionByName')
    expect(drawerSource).toContain('match_food_name')
    expect(drawerSource).toContain('让 AI 判断并加入')
  })
})

describe('AI 设计对话 · 滚动与执行记录', () => {
  it('运行中轮询不强行拉到底部，用户在看上面时保持位置', () => {
    expect(drawerSource).toContain('@scroll="handleScroll"')
    expect(drawerSource).toContain('stickToBottom')
    expect(drawerSource).toContain('isNearBottom')
    expect(drawerSource).toContain('previousScrollTop')
    expect(drawerSource).toContain('scrollToBottom(true)')
  })

  it('工具调用收进一个可展开的执行记录，不再每个占一行', () => {
    expect(drawerSource).toContain('const toolMessages = computed')
    expect(drawerSource).toContain('agent-tool-log')
    expect(drawerSource).toContain('执行记录 ·')
    expect(drawerSource).not.toContain('<details class="agent-tool">')
  })
})
