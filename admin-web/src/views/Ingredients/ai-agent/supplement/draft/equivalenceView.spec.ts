import { describe, expect, it } from 'vitest'
import {
  concentrationStatusLabel,
  sortGroupMembers
} from './equivalenceView'
import type { EquivalenceGroupMember } from '@/api/supplementEquivalence'

function member(
  name: string,
  priority: number,
  status: EquivalenceGroupMember['concentrationStatus'] = 'OK'
): EquivalenceGroupMember {
  return {
    id: name,
    name,
    brand: null,
    productModel: null,
    physicalForm: null,
    baseUnit: 'PCS',
    unitDisplayLabel: null,
    purchaseUnit: '瓶',
    purchaseToBaseRatio: 1,
    currentPricePerPurchaseUnit: 1,
    supplementRetailEnabled: false,
    diyEnabled: false,
    procurementEnabled: false,
    equivalencePriority: priority,
    concentration: null,
    concentrationStatus: status,
    actualUnit: null
  }
}

describe('等价组成员展示', () => {
  it('按优先级从 0 往后排，同优先级按名称排', () => {
    const rows = sortGroupMembers([
      member('B', 2),
      member('A', 0),
      member('C', 1)
    ])
    expect(rows.map((item) => item.name)).toEqual(['A', 'C', 'B'])
  })

  it('浓度状态翻成人话', () => {
    expect(concentrationStatusLabel('OK')).toBe('可用')
    expect(concentrationStatusLabel('MISSING')).toBe('缺浓度')
    expect(concentrationStatusLabel('UNIT_MISMATCH')).toBe('单位不一致')
  })
})
