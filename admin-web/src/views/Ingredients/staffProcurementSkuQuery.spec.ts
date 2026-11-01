import { describe, expect, it } from 'vitest'
import { buildStaffSkuQueryParams } from './staffProcurementSkuQuery'

describe('buildStaffSkuQueryParams', () => {
  it('空的筛选条件不发给后端', () => {
    expect(
      buildStaffSkuQueryParams({
        ingredientId: undefined,
        createdById: undefined,
        createdFrom: '',
        createdTo: null,
        keyword: '   ',
        page: 1,
        pageSize: 20
      })
    ).toEqual({ page: 1, pageSize: 20 })
  })

  it('有值的条件原样带上，去掉首尾空格', () => {
    expect(
      buildStaffSkuQueryParams({
        ingredientId: 'ing-1',
        createdById: 'user-1',
        createdFrom: '2026-10-01',
        createdTo: '2026-11-01',
        keyword: ' 糙米 ',
        page: 2,
        pageSize: 50
      })
    ).toEqual({
      ingredientId: 'ing-1',
      createdById: 'user-1',
      createdFrom: '2026-10-01',
      createdTo: '2026-11-01',
      keyword: '糙米',
      page: 2,
      pageSize: 50
    })
  })

  it('日期范围清空后不带任何日期参数', () => {
    const params = buildStaffSkuQueryParams({
      createdFrom: '',
      createdTo: '',
      page: 1,
      pageSize: 20
    })

    expect(params.createdFrom).toBeUndefined()
    expect(params.createdTo).toBeUndefined()
  })
})
