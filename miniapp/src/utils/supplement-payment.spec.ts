import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 补剂支付流程：发起支付 → 调起微信支付 → 同步结果 的分支覆盖。
 * 微信与后端都打桩，只验证编排逻辑。
 */

vi.mock('../api/supplements', () => ({
  paySupplementOrder: vi.fn(),
  syncSupplementPayment: vi.fn()
}))

let requestPaymentImpl: (options: any) => void = () => {}

;(globalThis as any).uni = {
  requestPayment: (options: any) => requestPaymentImpl(options)
}

import { paySupplementOrder, syncSupplementPayment } from '../api/supplements'
import { runSupplementPayment } from './supplement-payment'

const mockPay = paySupplementOrder as unknown as ReturnType<typeof vi.fn>
const mockSync = syncSupplementPayment as unknown as ReturnType<typeof vi.fn>

const payParams = {
  appId: 'wx-appid',
  timeStamp: '1700000000',
  nonceStr: 'nonce',
  package: 'prepay_id=prepay-1',
  signType: 'RSA',
  paySign: 'sign'
}

function paymentResult(overrides: Record<string, unknown> = {}) {
  return {
    code: 0,
    message: 'Success',
    data: {
      provider: 'WECHAT_PAY',
      mode: 'PRODUCTION',
      orderId: 'order-1',
      status: 'PENDING_PAYMENT',
      amountTotal: 31.6,
      paymentDeadline: null,
      paymentRemainingSeconds: null,
      paymentTimeoutMinutes: 30,
      autoCloseUnpaid: true,
      payParams,
      ...overrides
    }
  }
}

describe('补剂支付流程', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestPaymentImpl = () => {}
  })

  it('支付成功后会主动同步一次结果', async () => {
    mockPay.mockResolvedValue(paymentResult())
    mockSync.mockResolvedValue({ code: 0, data: { status: 'PAID', paid: true } })
    requestPaymentImpl = (options) => options.success()

    const outcome = await runSupplementPayment('order-1')

    expect(outcome).toBe('PAID')
    expect(mockSync).toHaveBeenCalledWith('order-1')
  })

  it('用户在支付面板取消时返回 CANCELLED', async () => {
    mockPay.mockResolvedValue(paymentResult())
    requestPaymentImpl = (options) =>
      options.fail({ errMsg: 'requestPayment:fail cancel' })

    const outcome = await runSupplementPayment('order-1')

    expect(outcome).toBe('CANCELLED')
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('支付失败时返回 FAILED', async () => {
    mockPay.mockResolvedValue(paymentResult())
    requestPaymentImpl = (options) =>
      options.fail({ errMsg: 'requestPayment:fail 系统错误' })

    expect(await runSupplementPayment('order-1')).toBe('FAILED')
  })

  it('支付通道不可用时降级为人工确认收款', async () => {
    mockPay.mockRejectedValue(new Error('支付配置未启用'))

    expect(await runSupplementPayment('order-1')).toBe('MANUAL')
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('已经付过款的订单直接返回 PAID，不再调起支付面板', async () => {
    mockPay.mockResolvedValue(paymentResult({ status: 'PAID', payParams: null }))
    let invoked = false
    requestPaymentImpl = () => {
      invoked = true
    }

    expect(await runSupplementPayment('order-1')).toBe('PAID')
    expect(invoked).toBe(false)
  })

  it('后端没返回支付参数时也降级为人工确认', async () => {
    mockPay.mockResolvedValue(paymentResult({ payParams: null }))

    expect(await runSupplementPayment('order-1')).toBe('MANUAL')
  })

  it('同步结果失败不影响「已支付」的判定', async () => {
    mockPay.mockResolvedValue(paymentResult())
    mockSync.mockRejectedValue(new Error('网络错误'))
    requestPaymentImpl = (options) => options.success()

    expect(await runSupplementPayment('order-1')).toBe('PAID')
  })
})
