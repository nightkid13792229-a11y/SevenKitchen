import { describe, expect, it } from 'vitest'
import pageSource from './index.vue?raw'

/**
 * 「执行步骤默认折叠」的页面回归。
 *
 * 纯函数测试覆盖步骤数据映射（stepView / agentStream）；这里锁住模板：
 * 步骤只在一条「已执行 N 步 · 展开」里，展开后才看到每步工具与结果；
 * 对话区只保留「你的话 / AI 的结论 / 提问与选项」。
 */
function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('AI 添加原料 · 执行步骤默认折叠', () => {
  const page = clean(pageSource)

  it('步骤容器是 details，默认折叠成一行「已执行 N 步 · 展开」', () => {
    expect(page).toContain('<details v-if="run.steps.length > 0" class="agent-steps">')
    expect(page).toContain('class="agent-steps__summary"')
    expect(page).toContain('已执行 {{ run.steps.length }} 步 · 展开')
    // 没有 open 属性 → 默认收起。
    const detailsTag = page.match(/<details[^>]*class="agent-steps"[^>]*>/)?.[0] ?? ''
    expect(detailsTag).not.toContain('open')
    expect(page).not.toContain(':open=')
  })

  it('展开后才显示每步工具与结果：步骤循环和 meta 都在 details 内部', () => {
    const start = page.indexOf('<details v-if="run.steps.length > 0"')
    const end = page.indexOf('</details>', start)
    const body = page.slice(start, end)

    expect(body).toContain('v-for="step in run.steps"')
    expect(body).toContain('{{ step.label }}')
    expect(body).toContain('{{ step.resultSummary }}')
    expect(body).toContain('{{ step.error')
    expect(body).toContain('agent-steps__body')
    expect(body).toContain('class="agent-run__meta"')
  })

  it('对话区只保留你的话 / AI 结论 / 提问与选项，不再有「没有调用工具」占位', () => {
    expect(page).toContain('class="agent-run__ask-text"')
    expect(page).toContain('class="agent-run__reply-text"')
    expect(page).toContain('state.pendingQuestion')
    expect(page).not.toContain('agent-run__no-tools')
    expect(page).not.toContain('这一轮没有调用工具')
  })

  it('右侧「原料卡 / 营养档案」标签仍然保留', () => {
    expect(page).toContain('原料卡')
    expect(page).toContain('营养档案')
    expect(page).toContain('review-panel__step')
  })

  it('折叠行有可点的样式与展开箭头，长步骤不会撑破面板', () => {
    const summary = page.match(/\.agent-steps__summary\s*\{([^}]*)\}/s)?.[1] ?? ''
    expect(summary).toMatch(/cursor:\s*pointer/)
    expect(summary).toMatch(/font-size:\s*12px/)
    const body = page.match(/\.agent-steps__body\s*\{([^}]*)\}/s)?.[1] ?? ''
    expect(body).toMatch(/display:\s*flex/)
    expect(body).toMatch(/flex-direction:\s*column/)
  })
})
