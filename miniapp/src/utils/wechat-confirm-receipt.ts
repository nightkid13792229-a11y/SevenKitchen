export interface WechatConfirmReceiptOrder {
  id: string;
  paymentMethod?: string | null;
  transactionId?: string | null;
}

export interface WechatConfirmReceiptResult {
  skipped: boolean;
  status: 'success';
}

declare const wx: any;

function isWechatOnlinePaymentMethod(paymentMethod?: string | null): boolean {
  return paymentMethod === 'WECHAT_PAY' || paymentMethod === 'WECHAT';
}

function createWechatConfirmReceiptError(message?: string): Error {
  return new Error(message || '微信确认收货失败');
}

export async function confirmWechatReceiptBeforeInternalComplete(
  order?: WechatConfirmReceiptOrder | null,
): Promise<WechatConfirmReceiptResult> {
  if (!order || !isWechatOnlinePaymentMethod(order.paymentMethod)) {
    return { skipped: true, status: 'success' };
  }

  if (!order.transactionId) {
    throw new Error('订单缺少微信支付单号，无法确认微信收货');
  }

  // #ifdef MP-WEIXIN
  if (typeof wx === 'undefined' || typeof wx.openBusinessView !== 'function') {
    throw new Error('当前微信版本不支持确认收货，请升级微信后重试');
  }

  return new Promise((resolve, reject) => {
    wx.openBusinessView({
      businessType: 'weappOrderConfirm',
      extraData: {
        transaction_id: order.transactionId,
      },
      success(response: any) {
        const status = response?.extraData?.status;

        if (status === 'success') {
          resolve({ skipped: false, status: 'success' });
          return;
        }

        if (status === 'cancel') {
          reject(new Error('已取消确认收货'));
          return;
        }

        reject(createWechatConfirmReceiptError(response?.errMsg));
      },
      fail(error: any) {
        reject(createWechatConfirmReceiptError(error?.errMsg));
      },
    });
  });
  // #endif

  // #ifndef MP-WEIXIN
  return { skipped: true, status: 'success' };
  // #endif
}
