import { describe, expect, it } from 'vitest'
import {
  compareCandidates,
  costPer1000Mg,
  type CandidateFacts
} from './compareCandidates'

/**
 * 选品比较的三层。
 *
 * 这些用例盯的是"淘汰的顺序不能倒"：形态差的不能因为便宜就留下，
 * 饲料级的不能混进性价比里去比，算不出价钱的不能硬推荐。
 */
const base: CandidateFacts = {
  key: 'a',
  name: '甲',
  formGrade: 'BEST',
  usage: 'HUMAN',
  pricePerPurchaseUnit: 100,
  unitsPerPurchaseUnit: 100,
  activeMgPerServing: 1000,
  servingUnitsPerDose: 1,
  catalogDogAllowed: true
}

const candidate = (over: Partial<CandidateFacts>): CandidateFacts => ({ ...base, ...over })

describe('每 1000mg 多少钱', () => {
  it('¥100 买 100 粒、每粒 1000mg → ¥1.00 / 1000mg', () => {
    expect(costPer1000Mg(base)).toBe(1)
  })

  it('每份 2 粒时按份算，不会把单价算成一半', () => {
    const twoPerDose = candidate({ servingUnitsPerDose: 2 })
    // 100 粒 = 50 份，每份 1000mg，共 50000mg；¥100 / 50000mg × 1000 = ¥2
    expect(costPer1000Mg(twoPerDose)).toBe(2)
  })

  it('价格或规格没填全时返回 null，不猜', () => {
    expect(costPer1000Mg(candidate({ pricePerPurchaseUnit: null }))).toBeNull()
    expect(costPer1000Mg(candidate({ unitsPerPurchaseUnit: 0 }))).toBeNull()
    expect(costPer1000Mg(candidate({ activeMgPerServing: null }))).toBeNull()
  })
})

describe('逐层淘汰', () => {
  it('饲料级在第二层就出局，哪怕它最便宜', () => {
    const result = compareCandidates([
      candidate({ key: 'human', pricePerPurchaseUnit: 400 }),
      candidate({ key: 'feed', usage: 'FEED_GRADE', pricePerPurchaseUnit: 1 })
    ])
    const feed = result.verdicts.find((item) => item.key === 'feed')!
    expect(feed.eliminatedBy).toBe('FEED_GRADE')
    expect(result.recommendedKey).toBe('human')
  })

  it('形态差一档的出局，哪怕它更便宜', () => {
    const result = compareCandidates([
      candidate({ key: 'best', formGrade: 'BEST', pricePerPurchaseUnit: 200 }),
      candidate({ key: 'fair', formGrade: 'FAIR', pricePerPurchaseUnit: 1 })
    ])
    expect(result.verdicts.find((item) => item.key === 'fair')?.eliminatedBy).toBe('LOWER_FORM')
    expect(result.recommendedKey).toBe('best')
  })

  it('形态打平才比价，选每 1000mg 最便宜的', () => {
    const result = compareCandidates([
      candidate({ key: 'pricy', pricePerPurchaseUnit: 200 }),
      candidate({ key: 'cheap', pricePerPurchaseUnit: 50 })
    ])
    expect(result.recommendedKey).toBe('cheap')
    expect(result.reason).toContain('最便宜')
  })

  it('都过关但都没填价格时不给推荐，直接说比不出', () => {
    const result = compareCandidates([
      candidate({ key: 'x', pricePerPurchaseUnit: null }),
      candidate({ key: 'y', pricePerPurchaseUnit: null })
    ])
    expect(result.recommendedKey).toBeNull()
    expect(result.reason).toContain('比不出性价比')
  })

  it('只剩一个过关时推荐它，并说明是因为别的被淘汰了', () => {
    const result = compareCandidates([
      candidate({ key: 'only' }),
      candidate({ key: 'blocked', usage: 'FEED_GRADE' })
    ])
    expect(result.recommendedKey).toBe('only')
    expect(result.reason).toContain('只有它过了前两层')
  })

  it('目录查不到或范围不含犬，只作提示，不参与淘汰', () => {
    const result = compareCandidates([
      candidate({ key: 'notInCatalog', catalogDogAllowed: false, pricePerPurchaseUnit: 10 }),
      candidate({ key: 'inCatalog', catalogDogAllowed: true, pricePerPurchaseUnit: 90 })
    ])
    expect(result.verdicts.every((item) => item.eliminatedBy === null)).toBe(true)
    expect(result.recommendedKey).toBe('notInCatalog')
  })

  it('一个候选都没有时不硬凑', () => {
    const result = compareCandidates([])
    expect(result.recommendedKey).toBeNull()
    expect(result.verdicts).toEqual([])
  })
})
