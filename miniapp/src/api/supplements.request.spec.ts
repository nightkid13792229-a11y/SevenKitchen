import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/api', () => ({
  request: vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: {} })
}))

import { request } from '../utils/api'
import { createSupplementOrder, quoteSupplements } from './supplements'

const requestMock = vi.mocked(request)

describe('补剂接口的错误提示归属', () => {
  beforeEach(() => {
    requestMock.mockClear()
  })

  it('报价与下单都不让网络层自己弹 toast（错误由页面行内展示）', async () => {
    await quoteSupplements([{ ingredientId: 'x', amount: 10 }])
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/supplements/quote',
        suppressErrorToast: true
      })
    )

    await createSupplementOrder({
      addressId: 'addr',
      lines: [{ ingredientId: 'x', amount: 10 }]
    })
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/supplement-orders',
        suppressErrorToast: true
      })
    )
  })
})
