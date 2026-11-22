import { describe, expect, it } from 'vitest'
import type { SupplementDraftPayload } from '@/api/supplementDrafts'
import { hasFieldValue, stillMissingPaths } from './draftMissing'

function payload(patch: Record<string, unknown> = {}): SupplementDraftPayload {
  return {
    basic: { name: '', brand: '' },
    nutrition: { servingNutrients: {}, defaultTargetFields: [], labelText: '' },
    retail: { shelfLifeMonths: null, storageCondition: '', enabled: false },
    evidence: { productUrl: '' },
    ...patch
  } as unknown as SupplementDraftPayload
}

const MISSING = [
  { fieldPath: 'retail.shelfLifeMonths', reason: '只有 Best By' },
  { fieldPath: 'retail.storageCondition', reason: '没写储存条件' },
  { fieldPath: 'evidence.productUrl', reason: '没给链接' }
]

describe('stillMissingPaths', () => {
  it('人已经把值填上的缺项不再算缺', () => {
    const result = stillMissingPaths(
      payload({ retail: { shelfLifeMonths: 12, storageCondition: '' } }),
      MISSING
    )

    expect(result).toEqual(['retail.storageCondition', 'evidence.productUrl'])
  })

  it('全部补上时角标归零', () => {
    const result = stillMissingPaths(
      payload({
        retail: { shelfLifeMonths: 12, storageCondition: '阴凉干燥' },
        evidence: { productUrl: 'https://cn.iherb.com/pr/x/1' }
      }),
      MISSING
    )

    expect(result).toEqual([])
  })

  it('没有 AI 记录时不算缺', () => {
    expect(stillMissingPaths(payload(), null)).toEqual([])
    expect(stillMissingPaths(payload(), undefined)).toEqual([])
  })
})

describe('hasFieldValue', () => {
  it('空白字符串、空数组、null 都算没值', () => {
    const data = payload({
      basic: { name: '   ', tagNames: [] },
      retail: { shelfLifeMonths: null }
    })

    expect(hasFieldValue(data, 'basic.name')).toBe(false)
    expect(hasFieldValue(data, 'retail.shelfLifeMonths')).toBe(false)
  })

  it('数字 0 和 false 也算有值（不能当空）', () => {
    const data = payload({
      retail: { enabled: false, shelfLifeMonths: 0 }
    })

    expect(hasFieldValue(data, 'retail.enabled')).toBe(true)
    expect(hasFieldValue(data, 'retail.shelfLifeMonths')).toBe(true)
  })
})
