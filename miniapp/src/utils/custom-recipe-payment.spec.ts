import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 定制食谱订单支付流程：发起支付 → 调起微信支付 → 同步结果 的分支覆盖。
 * 微信与后端都打桩，只验证编排逻辑。
 */

vi.mock('./api', () => ({
  request: vi.fn(),
}))

let requestPaymentImpl: (options: any) => void = () => {}

;(globalThis as any).uni = {
  requestPayment: (options: any) => requestPaymentImpl(options),
}

import { request } from './api'
import {
  payCustomRecipeOrder,
  runCustomRecipePayment,
  syncCustomRecipePayment,
} from './custom-recipe-payment'

const mockRequest = request as unknown as ReturnType<typeof vi.fn>

const payParams = {
  appId: 'wx-appid',
  timeStamp: '1700000000',
  nonceStr: 'nonce',
  package: 'prepay_id=prepay-1',
  signType: 'RSA',
  paySign: 'sign',
}

function paymentResponse(overrides: Record<string, unknown> = {}) {
  return {
    code: 0,
    message: 'Success',
    data: {
      status: 'PENDING_PAYMENT',
      amountTotal: 300,
      payParams,
      ...overrides,
    },
  }
}

describe('定制食谱订单支付流程', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestPaymentImpl = () => {}
  })

  it('支付成功后会主动同步一次结果', async () => {
    mockRequest
      .mockResolvedValueOnce(paymentResponse())
      .mockResolvedValueOnce({ code: 0, data: { status: 'PAID', paid: true } })
    requestPaymentImpl = (options) => options.success()

    const outcome = await runCustomRecipePayment('CR202609251234')

    expect(outcome).toBe('PAID')
    // 第一次发起支付，第二次同步结果
    expect(mockRequest).toHaveBeenCalledTimes(2)
    expect(mockRequest.mock.calls[0][0].url).toContain(
      '/custom-recipe/orders/CR202609251234/pay',
    )
    expect(mockRequest.mock.calls[1][0].url).toContain('/sync-payment')
  })

  it('用户在微信面板取消时返回 CANCELLED', async () => {
    mockRequest.mockResolvedValueOnce(paymentResponse())
    requestPaymentImpl = (options) =>
      options.fail({ errMsg: 'requestPayment:fail cancel' })

    const outcome = await runCustomRecipePayment('CR1')

    expect(outcome).toBe('CANCELLED')
  })

  it('支付通道未配置时降级为人工收款', async () => {
    mockRequest.mockRejectedValueOnce(new Error('支付未启用'))

    const outcome = await runCustomRecipePayment('CR1')

    expect(outcome).toBe('MANUAL')
  })

  it('后端没返回 payParams 时降级为人工收款', async () => {
    mockRequest.mockResolvedValueOnce(paymentResponse({ payParams: null }))

    const outcome = await runCustomRecipePayment('CR1')

    expect(outcome).toBe('MANUAL')
  })

  it('订单已关闭时返回 CLOSED，不再引导人工付款', async () => {
    mockRequest.mockRejectedValueOnce(
      new Error('定制订单已超过支付时间，已自动关闭'),
    )

    const outcome = await runCustomRecipePayment('CR1')

    expect(outcome).toBe('CLOSED')
  })

  it('订单已是 CANCELLED 状态时返回 CLOSED', async () => {
    mockRequest.mockResolvedValueOnce(paymentResponse({ status: 'CANCELLED' }))

    const outcome = await runCustomRecipePayment('CR1')

    expect(outcome).toBe('CLOSED')
  })

  it('订单已支付时直接返回 PAID，不重复调起支付', async () => {
    mockRequest.mockResolvedValueOnce(paymentResponse({ status: 'PAID' }))

    const outcome = await runCustomRecipePayment('CR1')

    expect(outcome).toBe('PAID')
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it('支付成功后同步失败不影响 PAID 结论', async () => {
    mockRequest
      .mockResolvedValueOnce(paymentResponse())
      .mockRejectedValueOnce(new Error('network'))
    requestPaymentImpl = (options) => options.success()

    const outcome = await runCustomRecipePayment('CR1')

    expect(outcome).toBe('PAID')
  })

  it('支付接口与同步接口走同一个订单号', () => {
    mockRequest.mockResolvedValue({ code: 0, data: {} })

    void payCustomRecipeOrder('CR-1')
    void syncCustomRecipePayment('CR-1')

    expect(mockRequest.mock.calls[0][0].url).toContain(
      encodeURIComponent('CR-1'),
    )
    expect(mockRequest.mock.calls[1][0].url).toContain(
      encodeURIComponent('CR-1'),
    )
  })
})
