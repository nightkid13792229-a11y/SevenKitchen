import { WechatPaymentService } from '../../../src/application/payment/wechat-payment.service';

describe('WechatPaymentService', () => {
  const paymentConfig = {
    enabled: true,
    provider: 'WECHAT_PAY',
    mode: 'PRODUCTION',
    appId: 'wx-test',
    mchId: 'mch-test',
    merchantSerialNumber: 'serial-test',
    apiV3Key: '12345678901234567890123456789012',
    privateKeyPem: 'private-key',
    notifyUrl: 'https://example.com/api/v1/payments/wechat/notify',
    refundNotifyUrl: null,
    paymentTimeoutMinutes: 30,
    autoCloseUnpaid: true,
    allowRefund: true,
  };

  function createService() {
    const prisma = {
      paymentConfig: {
        upsert: jest.fn().mockResolvedValue(paymentConfig),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: '748d36b6-4c84-4b47-b32c-7996c33a016c',
          amountTotal: 359,
        }),
      },
    };
    const orderService = {
      processPayment: jest.fn().mockResolvedValue(undefined),
    };
    const wechatShippingUploadService = {
      reportSpecialOrderForOrder: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WechatPaymentService(
      prisma as any,
      orderService as any,
      wechatShippingUploadService as any,
    );

    return { service, prisma, orderService, wechatShippingUploadService };
  }

  it('accepts a successful payment when WeChat coupons reduce payer_total but total matches the order amount', async () => {
    const { service, orderService, wechatShippingUploadService } =
      createService();

    jest.spyOn(service as any, 'decryptResource').mockReturnValue({
      out_trade_no: '748d36b64c844b47b32c7996c33a016c',
      trade_state: 'SUCCESS',
      transaction_id: '420000312620260607123456294303',
      amount: {
        total: 35900,
        payer_total: 35882,
        currency: 'CNY',
        payer_currency: 'CNY',
      },
      promotion_detail: [
        {
          name: '银行卡多笔立减',
          amount: 18,
          wechatpay_contribute: 18,
          merchant_contribute: 0,
        },
      ],
    });

    await expect(
      service.handleWechatNotify({
        resource: {
          ciphertext: 'ciphertext',
          nonce: 'nonce',
          associated_data: 'associated-data',
        },
      }),
    ).resolves.toEqual({ handled: true, tradeState: 'SUCCESS' });

    expect(orderService.processPayment).toHaveBeenCalledWith(
      '748d36b6-4c84-4b47-b32c-7996c33a016c',
      'WECHAT_PAY',
      'system',
      null,
      '420000312620260607123456294303',
    );
    expect(
      wechatShippingUploadService.reportSpecialOrderForOrder,
    ).toHaveBeenCalledWith(
      '748d36b6-4c84-4b47-b32c-7996c33a016c',
      'system',
      null,
    );
  });
});
