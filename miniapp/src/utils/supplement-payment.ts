/**
 * 补剂订单支付流程
 *
 * 统一处理：发起支付 → 调起微信支付 → 同步支付结果。
 * 支付未配置（或用户没有微信身份）时返回 MANUAL，由页面降级为「待人工确认收款」。
 */

import { paySupplementOrder, syncSupplementPayment } from '../api/supplements'

export type SupplementPayOutcome =
  /** 已支付成功 */
  | 'PAID'
  /** 支付通道不可用，已转为人工确认收款 */
  | 'MANUAL'
  /** 用户在微信支付面板取消了 */
  | 'CANCELLED'
  /** 其它失败（网络等） */
  | 'FAILED'

export async function runSupplementPayment(
  orderId: string
): Promise<SupplementPayOutcome> {
  let payParams = null

  try {
    const payRes = await paySupplementOrder(orderId)
    if (payRes.code !== 0 || !payRes.data) {
      return 'MANUAL'
    }
    if (payRes.data.status === 'PAID') {
      return 'PAID'
    }
    payParams = payRes.data.payParams
  } catch (error) {
    // 支付未启用、配置不全、缺少微信身份等：走人工确认收款，不影响订单成立
    console.warn('[SupplementPayment] 发起微信支付失败，降级为人工确认:', error)
    return 'MANUAL'
  }

  if (!payParams) {
    return 'MANUAL'
  }

  const payResult = await new Promise<SupplementPayOutcome>((resolve) => {
    uni.requestPayment({
      provider: 'wxpay',
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType as any,
      paySign: payParams.paySign,
      success: () => resolve('PAID'),
      fail: (err: any) => {
        const message = String(err && err.errMsg ? err.errMsg : '')
        resolve(message.includes('cancel') ? 'CANCELLED' : 'FAILED')
      }
    } as any)
  })

  if (payResult !== 'PAID') {
    return payResult
  }

  // 微信回调可能延迟，主动同步一次做兜底
  try {
    await syncSupplementPayment(orderId)
  } catch (error) {
    console.warn('[SupplementPayment] 支付结果同步失败，等待回调:', error)
  }

  return 'PAID'
}
