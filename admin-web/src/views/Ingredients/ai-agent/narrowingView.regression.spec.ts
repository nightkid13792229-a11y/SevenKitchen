import { describe, expect, it } from 'vitest'
import pageSource from './index.vue?raw'

/**
 * 「候选太多先收窄」的页面渲染回归。
 *
 * 纯函数测试覆盖数据映射（stepView / agentStream）；这里只锁住模板
 * 真的把分组概览、收窄选项与兜底选项画出来，避免数据对了但页面没接。
 */
function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('AI 添加原料 · 候选收窄页面', () => {
  const page = clean(pageSource)

  it('匹配依据里渲染分组概览：组名 + 条数，可选生熟', () => {
    expect(page).toContain('v-if="step.search.groups.length"')
    expect(page).toContain('v-for="group in step.search.groups"')
    expect(page).toContain('{{ group.labelWithCount }}')
    expect(page).toContain('{{ group.stateLabel }}')
    expect(page).toContain('分组概览')
  })

  it('分组概览是横向可换行的标签行，长组名不会撑破面板', () => {
    const css = page.match(/\.agent-step__groups\s*\{([^}]*)\}/s)?.[1] ?? ''
    expect(css).toMatch(/display:\s*flex/)
    expect(css).toMatch(/flex-wrap:\s*wrap/)
    expect(page).toMatch(/\.agent-step__group\s*\{[^}]*max-width:\s*100%/s)
  })

  it('收窄问题沿用同一条选项卡片，分组 / 生熟 / 兜底选项不显示错误小标', () => {
    expect(page).toContain('v-for="(option, index) in askOptionViews"')
    expect(page).toContain('option.displayLabel')
    expect(page).toContain('option.badge')
    // pendingOptionBadge 已按 kind 区分；模板不能绕过它直接写「未收录」。
    expect(page).not.toContain('未收录，选了会去线上找')
  })

  it('点「都不对，我直接说」是自由输入：收起问题卡片、聚焦输入框，不发送这句', () => {
    expect(page).toContain("check?.kind === 'FREE'")
    expect(page).toContain('composerRef.value?.focus?.()')
    expect(page).toContain('直接输入你要用的名称即可')
    // 不能让兜底文案走 handleRun 变成新一轮的答案。
    const freeBlock =
      page.match(/if \(check\?\.kind === 'FREE'\) \{([\s\S]*?)\n  \}/)?.[1] ??
      ''
    expect(freeBlock).not.toContain('handleRun')
    expect(freeBlock).toContain('return')
  })

  it('输入框挂了 ref，自由输入时才能聚焦', () => {
    expect(page).toContain('ref="composerRef"')
    expect(page).toContain('const composerRef = ref<')
  })
  it('匹配依据里显示 AI 分类标签（状态 / 加工方式 / 部位）与依据词', () => {
    expect(page).toContain('v-if="match.classification"')
    expect(page).toContain('AI 分类：{{ match.classification.label }}')
    expect(page).toContain('依据词「{{ match.classification.evidence }}」')
  })

})
