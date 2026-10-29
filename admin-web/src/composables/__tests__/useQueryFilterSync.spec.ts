import { describe, expect, it } from 'vitest'
import { buildFilterQuery, isSameQuery } from '../useQueryFilterSync'

const defaults = { mode: 'CATALOG', status: undefined, search: '' }

describe('buildFilterQuery', () => {
  it('默认值和空值不写进地址栏', () => {
    expect(
      buildFilterQuery(
        {},
        { mode: 'CATALOG', status: undefined, search: '' },
        defaults
      )
    ).toEqual({})
  })

  it('非默认值写进地址栏，并保留 orderId / dogId 等入口参数', () => {
    expect(
      buildFilterQuery(
        { orderId: 'order-1', dogId: 'dog-1' },
        { mode: 'ORDER', status: 'DRAFT', search: '鸡胸' },
        defaults
      )
    ).toEqual({
      orderId: 'order-1',
      dogId: 'dog-1',
      mode: 'ORDER',
      status: 'DRAFT',
      search: '鸡胸'
    })
  })

  it('切回默认值时删除旧参数，地址保持干净', () => {
    expect(
      buildFilterQuery(
        { mode: 'ORDER', status: 'PRIVATE_CUSTOM', search: '鸡' },
        { mode: 'CATALOG', status: undefined, search: '' },
        defaults
      )
    ).toEqual({})
  })

  it('新增筛选项不需要改函数：只要传进来就会同步', () => {
    expect(
      buildFilterQuery(
        {},
        { mode: 'ORDER', status: 'PUBLIC', search: '', category: '肉类' },
        { ...defaults, category: '' }
      )
    ).toEqual({ mode: 'ORDER', status: 'PUBLIC', category: '肉类' })
  })
})

describe('isSameQuery', () => {
  it('忽略 key 顺序', () => {
    expect(isSameQuery({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true)
  })

  it('任何一项不同就返回 false', () => {
    expect(isSameQuery({ a: '1' }, { a: '2' })).toBe(false)
    expect(isSameQuery({ a: '1' }, {})).toBe(false)
  })

  it('数组与拼接字符串等价', () => {
    expect(isSameQuery({ a: ['1', '2'] }, { a: '1|2' })).toBe(true)
  })
})
