import { describe, expect, it } from 'vitest'
import {
  canPick,
  citationsOf,
  citationText,
  isEmptyAdvice,
  recommendationText,
  statusMeta,
  verdictMeta
} from './formAdviceView'
import type { SupplementDimensionsAdviceDto } from '@/types/ingredientCreation'

function advice(
  overrides: Partial<SupplementDimensionsAdviceDto> = {}
): SupplementDimensionsAdviceDto {
  return {
    nutrientKey: 'vitamins.vitaminB12',
    nutrientLabel: '维生素 B12',
    dimensions: [
      {
        key: 'FORM',
        label: '形态',
        candidates: [
          {
            key: 'methylcobalamin',
            labelZh: '甲钴胺',
            dimension: 'FORM',
            status: 'EVIDENCED',
            citations: [
              { documentId: 'd', documentName: 'SACN5', page: 31, quote: 'very unstable' }
            ],
            verdict: 'NO_EVIDENCE',
            reason: '注意点，不是否决',
            market: { count: 12, samples: ['甲钴胺 1000mcg'] }
          },
          {
            key: 'cyanocobalamin',
            labelZh: '氰钴胺',
            dimension: 'FORM',
            status: 'MARKET_ONLY',
            citations: [],
            verdict: 'NO_EVIDENCE',
            reason: '知识库没查到依据',
            market: { count: 31, samples: [] }
          }
        ]
      }
    ],
    recommendation: { dimensionKey: 'FORM', candidateKey: 'methylcobalamin' },
    gaps: [],
    ...overrides
  }
}

describe('statusMeta', () => {
  it('只有有原文的候选才可推荐', () => {
    expect(statusMeta('EVIDENCED').recommendable).toBe(true)
    expect(statusMeta('MARKET_ONLY').recommendable).toBe(false)
  })

  it('市场独有的标签说清楚"无依据"', () => {
    expect(statusMeta('MARKET_ONLY').label).toContain('无依据')
  })

  it('认不出的状态按最保守的算', () => {
    expect(statusMeta('SOMETHING').recommendable).toBe(false)
  })
})

describe('canPick', () => {
  it('有原文且结论是推荐/可用，才给主按钮', () => {
    expect(canPick({ status: 'EVIDENCED', verdict: 'RECOMMENDED' })).toBe(true)
    expect(canPick({ status: 'EVIDENCED', verdict: 'ACCEPTABLE' })).toBe(true)
  })

  it('有原文但判为不推荐/无结论，走"仍用这一档"', () => {
    expect(canPick({ status: 'EVIDENCED', verdict: 'AVOID' })).toBe(false)
    expect(canPick({ status: 'EVIDENCED', verdict: 'NO_EVIDENCE' })).toBe(false)
  })

  it('市场独有的永远不给主按钮', () => {
    expect(canPick({ status: 'MARKET_ONLY', verdict: 'NO_EVIDENCE' })).toBe(false)
  })
})

describe('verdictMeta', () => {
  it('无结论不是"推荐"的样子', () => {
    expect(verdictMeta('NO_EVIDENCE').label).toBe('无结论')
    expect(verdictMeta('NO_EVIDENCE').type).not.toBe('success')
  })
})

describe('recommendationText', () => {
  it('有推荐时给名字', () => {
    expect(recommendationText(advice())).toBe('建议用：甲钴胺')
  })

  it('来源维度的推荐要标出"（来源）"', () => {
    const sourceAdvice: SupplementDimensionsAdviceDto = {
      ...advice(),
      dimensions: [
        {
          key: 'SOURCE',
          label: '来源',
          candidates: [
            {
              key: 'fishoil',
              labelZh: '鱼油',
              dimension: 'SOURCE',
              status: 'EVIDENCED',
              citations: [],
              verdict: 'ACCEPTABLE',
              reason: 'x',
              market: null
            }
          ]
        }
      ],
      recommendation: { dimensionKey: 'SOURCE', candidateKey: 'fishoil' }
    }
    expect(recommendationText(sourceAdvice)).toBe('建议用：鱼油（来源）')
  })

  it('没有推荐时给空串（页面据此显示"请你判断"）', () => {
    expect(recommendationText(advice({ recommendation: null }))).toBe('')
    expect(recommendationText(null)).toBe('')
  })
})

describe('isEmptyAdvice', () => {
  it('没有维度分组 = 这一类不按形态判断', () => {
    expect(isEmptyAdvice(advice({ dimensions: [] }))).toBe(true)
    expect(isEmptyAdvice(advice())).toBe(false)
    expect(isEmptyAdvice(null)).toBe(false)
  })
})

describe('citationText / citationsOf', () => {
  it('出处写成《文档名》第 N 页', () => {
    expect(
      citationText({ documentId: 'd', documentName: 'SACN5', page: 31, quote: 'q' })
    ).toBe('《SACN5》第 31 页')
  })

  it('空白引文不算引用', () => {
    expect(
      citationsOf({ citations: [{ documentId: 'd', documentName: 'x', page: 1, quote: '  ' }] })
    ).toHaveLength(0)
  })
})
