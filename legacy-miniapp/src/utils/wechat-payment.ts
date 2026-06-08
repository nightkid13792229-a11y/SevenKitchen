import type { WechatPaymentResult } from '../api/orders'
import { blockLegacyOrdering } from './legacy-migration'

export function requestWechatOrderPayment(payment: WechatPaymentResult): Promise<void> {
  blockLegacyOrdering('微信支付')
  return Promise.reject(new Error('旧版小程序不再支持微信支付'))

  if (!payment.payParams) {
    return Promise.resolve()
  }

  const payParams = payment.payParams
  const wxApi = (globalThis as any).wx

  if (payment.orderInfo && wxApi?.requestOrderPayment) {
    return new Promise((resolve, reject) => {
      wxApi.requestOrderPayment({
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        package: payParams.package,
        signType: payParams.signType,
        paySign: payParams.paySign,
        orderInfo: payment.orderInfo,
        success: () => resolve(),
        fail: (err: any) => reject(err),
      })
    })
  }

  return new Promise((resolve, reject) => {
    uni.requestPayment({
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType,
      paySign: payParams.paySign,
      success: () => resolve(),
      fail: (err: any) => reject(err),
    } as any)
  })
}
