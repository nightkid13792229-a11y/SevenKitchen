import { describe, expect, it } from 'vitest'
import { createRequestId, toCents } from './supplement-order-submit'

describe('补剂下单辅助', () => {
  it('金额转整数分，不产生浮点误差', () => {
    expect(toCents(41.5)).toBe(4150)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(99.99)).toBe(9999)
    expect(toCents(0)).toBe(0)
  })

  it('非有限数按 0 处理，不会把 NaN 传给服务端', () => {
    expect(toCents(Number.NaN)).toBe(0)
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('每次生成的请求 id 都不同，且长度可控', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createRequestId()))
    expect(ids.size).toBe(200)
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(64)
      expect(id.length).toBeGreaterThan(8)
    }
  })
})
