import { describe, expect, it } from 'vitest'
import { citationText, citationsOf, verdictMeta } from './formAdviceView'

describe('verdictMeta', () => {
  it('只有读过原文的结论才可选', () => {
    expect(verdictMeta('RECOMMENDED').pickable).toBe(true)
    expect(verdictMeta('ACCEPTABLE').pickable).toBe(true)
    expect(verdictMeta('AVOID').pickable).toBe(false)
    expect(verdictMeta('NO_EVIDENCE').pickable).toBe(false)
  })

  it('证据不足不是「推荐」的样子', () => {
    const meta = verdictMeta('NO_EVIDENCE')
    expect(meta.label).toContain('证据不足')
    expect(meta.type).not.toBe('success')
  })
})

describe('citationText / citationsOf', () => {
  it('出处写成《文档名》第 N 页', () => {
    expect(
      citationText({ documentId: 'd', documentName: 'FEDIAF 2025', page: 42, quote: 'q' })
    ).toBe('《FEDIAF 2025》第 42 页')
  })

  it('没有文档名就退回 id，不留空引号', () => {
    expect(citationText({ documentId: 'nrc-2006', documentName: '', page: 7, quote: 'q' })).toBe(
      '《nrc-2006》第 7 页'
    )
  })

  it('空白引文不算引用', () => {
    expect(
      citationsOf({ citations: [{ documentId: 'd', documentName: 'x', page: 1, quote: '  ' }] })
    ).toHaveLength(0)
  })
})
