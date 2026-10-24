import { describe, expect, it } from 'vitest'
import pageSource from './index.vue?raw'
import { askOptionTitle } from './agentStream'

/**
 * 长选项的展示口径（源码回归）。
 *
 * `askUser` 现在允许 120 字选项，长文案不能把按钮撑破，也不能把完整词条名
 * 丢掉：按钮单行省略，悬停 title 显示全文；AI 判断标签与理由分两行。
 */
function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
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

  it('长选项单行省略：overflow hidden + text-overflow ellipsis + nowrap', () => {
    expect(page).toMatch(
      /\.agent-ask__option-text\s*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s,
    )
    expect(page).toMatch(
      /\.agent-ask__option-text\s*\{[^}]*max-width:\s*min\(/s,
    )
  })

  it('AI 判断标签与理由分开显示，不挤在一行', () => {
    expect(page).toMatch(
      /\.agent-ask__option-ai\s*\{[^}]*flex-direction:\s*column/s,
    )
    expect(page).toContain('class="agent-ask__option-reason"')
  })
})
