import type { WechatPaymentResult } from '../api/orders'

export function requestWechatOrderPayment(payment: WechatPaymentResult): Promise<void> {
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
