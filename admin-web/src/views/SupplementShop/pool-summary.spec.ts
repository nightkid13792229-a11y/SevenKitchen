import { describe, expect, it } from 'vitest'
import { summarizePools } from './pool-summary'

describe('summarizePools', () => {
  it('按开关分出生产池与预分装池', () => {
    expect(
      summarizePools([
        { name: '海藻粉', procurementEnabled: true, supplementRetailEnabled: false },
        { name: '海带粉胶囊', procurementEnabled: false, supplementRetailEnabled: true },
      ]),
    ).toEqual({ production: ['海藻粉'], repack: ['海带粉胶囊'] })
  })

  it('两个开关都开的成员同时进两个池子', () => {
    expect(
      summarizePools([
        { name: '碳酸钙粉', procurementEnabled: true, supplementRetailEnabled: true },
      ]),
    ).toEqual({ production: ['碳酸钙粉'], repack: ['碳酸钙粉'] })
  })

  it('空成员给两个空池', () => {
    expect(summarizePools([])).toEqual({ production: [], repack: [] })
  })
})
