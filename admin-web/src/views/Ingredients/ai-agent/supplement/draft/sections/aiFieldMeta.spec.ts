import { describe, expect, it } from 'vitest'
import type { SupplementDraftAiSnapshot } from '@/api/supplementDrafts'
import { aiFieldTag } from './aiFieldMeta'

const SNAPSHOT = {
  status: 'OK',
  fields: {
    'procurement.enabled': {
      value: true,
      source: 'INFERENCE',
      confidence: 'LOW',
      reason: '按品类猜的'
    },
    'basic.name': {
      value: '维生素E',
      source: 'LABEL',
      confidence: 'HIGH',
      reason: '标签正面'
    }
  },
  decisions: {},
  proposedDecisions: {},
  missing: [],
  warnings: []
} as unknown as SupplementDraftAiSnapshot

describe('aiFieldTag', () => {
  it('推断 + 低置信要如实标出来', () => {
    const tag = aiFieldTag(SNAPSHOT, 'procurement.enabled')

    expect(tag?.text).toBe('AI 推断 · 低置信')
    expect(tag?.low).toBe(true)
  })

  it('人改过的字段不再显示 AI 置信度', () => {
    expect(aiFieldTag(SNAPSHOT, 'procurement.enabled', ['procurement.enabled'])).toBeNull()
  })

  it('父路径被标成人改时，子路径也不显示', () => {
    expect(aiFieldTag(SNAPSHOT, 'procurement.enabled', ['procurement'])).toBeNull()
  })

  it('没改过的字段照常显示来源', () => {
    expect(aiFieldTag(SNAPSHOT, 'basic.name')?.text).toBe('AI 读标签')
  })
})
