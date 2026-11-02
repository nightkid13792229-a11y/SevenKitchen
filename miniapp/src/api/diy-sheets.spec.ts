import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/api', () => ({
  request: vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: [] })
}))

import { request } from '../utils/api'
import { fetchMyDiySheets, updateDiySheetPlan } from './diy-sheets'

const requestMock = vi.mocked(request)

describe('制作单接口（补剂下单页快速改分装）', () => {
  beforeEach(() => requestMock.mockClear())

  it('改分装走 PATCH /user/diy-sheets/:id/plan，错误交给页面展示', async () => {
    await updateDiySheetPlan('sheet-1', [{ packageSpecG: 120, packageCount: 10 }])

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/user/diy-sheets/sheet-1/plan',
        method: 'PATCH',
        data: { packagePlan: [{ packageSpecG: 120, packageCount: 10 }] },
        suppressErrorToast: true
      })
    )
  })

  it('拉我的制作单列表，用于读出当前分装', async () => {
    await fetchMyDiySheets()

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/user/diy-sheets',
        method: 'GET',
        suppressErrorToast: true
      })
    )
  })
})
