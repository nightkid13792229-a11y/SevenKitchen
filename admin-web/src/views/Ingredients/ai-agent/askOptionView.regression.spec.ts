import { describe, expect, it } from 'vitest'
import pageSource from './index.vue?raw'
import { askOptionTitle } from './agentStream'

/**
 * 长选项的展示口径（源码回归）。
 *
 * `askUser` 现在允许 120 字选项。选项必须是「一行一个」的整行卡片：
 * 名字单行省略、完整文案挂在 title 上；AI 判断 / 核实标签在右侧不收缩；
 * 理由独占第二行自动换行。历史上用 el-button + 固定高度承载多行内容，
 * 结果 24px 的小按钮装不下三行字，直接压到下一个选项上。
 */
function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function rule(page: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? ''
}

describe('AI 提问选项 · 长文案展示', () => {
  const page = clean(pageSource)

  it('悬停标题保留完整文案：长选项不会被单行省略带走全称', () => {
    const longOption = `候选名${'很长的说明'.repeat(30)}`
    expect(askOptionTitle(longOption, null)).toBe(longOption)
    expect(askOptionTitle('铁棍山药', 'Yam, raw')).toBe(
      '铁棍山药\n库里词条：Yam, raw',
    )
    // 词条名与展示文案相同就不重复追加；空白标题不硬造内容。
    expect(askOptionTitle('Yam, raw', 'Yam, raw')).toBe('Yam, raw')
    expect(askOptionTitle('  ', null)).toBe('')
  })

  it('选项按钮把完整文案挂到 title 上', () => {
    expect(page).toContain('askOptionTitle(')
    expect(page).toContain(':title="option.title || undefined"')
  })

  it('选项容器纵向排列，一行一个卡片', () => {
    const buttons = rule(page, '.agent-ask__buttons')
    expect(buttons).toMatch(/display:\s*flex/)
    expect(buttons).toMatch(/flex-direction:\s*column/)
    expect(buttons).toMatch(/gap:\s*8px/)
    expect(buttons).toMatch(/width:\s*100%/)
  })

  it('每个选项是自适应高度的整行卡片，hover / focus 都有反馈', () => {
    const option = rule(page, '.agent-ask__option')
    expect(option).toMatch(/cursor:\s*pointer/)
    expect(option).toMatch(/height:\s*auto/)
    // 固定高度正是上一次重叠的根因，不能再回来。
    expect(option).not.toMatch(/height:\s*\d+px/)
    expect(page).toContain('.agent-ask__option:hover')
    expect(page).toContain('.agent-ask__option:focus-visible')
  })

  it('名字单行省略：flex 1 + min-width 0 + ellipsis', () => {
    const text = rule(page, '.agent-ask__option-text')
    expect(text).toMatch(/flex:\s*1\b/)
    expect(text).toMatch(/min-width:\s*0/)
    expect(text).toMatch(/overflow:\s*hidden/)
    expect(text).toMatch(/text-overflow:\s*ellipsis/)
    expect(text).toMatch(/white-space:\s*nowrap/)
  })

  it('标签在名字右侧不收缩，理由独占第二行自动换行', () => {
    const head = rule(page, '.agent-ask__option-head')
    expect(head).toMatch(/display:\s*flex/)
    expect(rule(page, '.agent-ask__option-meta')).toMatch(
      /flex-shrink:\s*0/,
    )
    const reason = rule(page, '.agent-ask__option-reason')
    expect(reason).toMatch(/white-space:\s*normal/)
    expect(reason).toMatch(/word-break:\s*break-word/)
    expect(page).toContain('class="agent-ask__option-meta"')
    expect(page).toContain('class="agent-ask__option-reason"')
  })

  it('窄屏时标签换到下一行，名字仍然省略', () => {
    expect(page).toMatch(
      /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.agent-ask__option-head\s*\{[^}]*flex-wrap:\s*wrap/s,
    )
    expect(page).toMatch(
      /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.agent-ask__option-text\s*\{[^}]*flex:\s*1\s+1\s+100%/s,
    )
  })

  it('选项区没有 absolute / 负 margin 这类会叠版的老写法', () => {
    const askRules = page.match(/\.agent-ask[^{}]*\{[^}]*\}/g) ?? []
    expect(askRules.length).toBeGreaterThan(0)
    for (const block of askRules) {
      expect(block).not.toMatch(/position:\s*(absolute|fixed)/)
      expect(block).not.toMatch(/margin[a-z-]*:\s*-/)
    }
  })
})
