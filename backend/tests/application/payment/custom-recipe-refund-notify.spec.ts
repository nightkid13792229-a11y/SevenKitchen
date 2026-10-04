import { WechatPaymentService } from '../../../src/application/payment/wechat-payment.service';

/**
 * 定制单退款结果回调 + "订单已关闭却收到付款"兜底（2026-10-04）
 *
 * 这一批堵的是两个"钱悬在空中"的缺口：
 *
 *   ① 退款回调此前只认 RFSP（补剂）与鲜食两条路，CRR（定制）没有分支 →
 *      回调被当成陌生退款单忽略，`refund_status` 永远停在 PROCESSING，
 *      顾客和员工都看不到退款到底成没成。
 *   ② 定时关单与支付回调抢跑时，可能出现"钱收了、单却是已取消"。
 *      此前这种回调会被静默丢弃（条件更新失败即视为重复回调），
 *      现在改为自动原路退回，并留下明确日志。
 */
describe('WechatPaymentService · 定制单退款结果与迟到付款', () => {
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
      order: { findUnique: jest.fn() },
      orderRefundRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      orderSettlementAdjustment: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      customRecipeOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const orderService = { processPayment: jest.fn() };
    const wechatShippingUploadService = {
      reportSpecialOrderForOrder: jest.fn(),
    };
    const customRecipeService = {
      confirmPaymentFromWechat: jest
        .fn()
        .mockResolvedValue({ order: { status: 'PAID' } }),
    };

    const service = new WechatPaymentService(
      prisma as any,
      orderService as any,
      wechatShippingUploadService as any,
      {} as any,
      {} as any,
      customRecipeService as any,
      {} as any,
    );

    return { service, prisma, customRecipeService };
  }

  const payload = {
    resource: {
      ciphertext: 'ciphertext',
      nonce: 'nonce',
      associated_data: 'associated-data',
    },
  };

  describe('退款结果回调（CRR 前缀）', () => {
    it('退款成功：把定制单的退款状态从"处理中"改成成功并记到账时间', async () => {
      const { service, prisma } = createService();

      jest.spyOn(service as any, 'decryptResource').mockReturnValue({
        out_trade_no: 'CR202610040001',
        out_refund_no: 'CRR1759000000000123',
        refund_status: 'SUCCESS',
        refund_id: 'wx-refund-1',
        success_time: '2026-10-04T12:00:00+08:00',
      });
      prisma.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'cr-uuid-1',
        orderId: 'CR202610040001',
        refundOutNo: 'CRR1759000000000123',
        refundId: null,
        refundedAt: null,
      });

      const result = await service.handleWechatRefundNotify(payload);

      expect(result).toEqual({ handled: true, refundStatus: 'SUCCESS' });
      expect(prisma.customRecipeOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cr-uuid-1' },
          data: expect.objectContaining({
            refundStatus: 'SUCCESS',
            refundId: 'wx-refund-1',
          }),
        }),
      );
      // 到账时间必须写，否则顾客看到"已退款"却没有任何时间依据
      const updateData = prisma.customRecipeOrder.update.mock.calls[0][0].data;
      expect(updateData.refundedAt).toBeInstanceOf(Date);
    });

    it('退款失败：写入失败状态，但不写"已到账时间"（便于后台人工跟进）', async () => {
      const { service, prisma } = createService();

      jest.spyOn(service as any, 'decryptResource').mockReturnValue({
        out_trade_no: 'CR202610040002',
        out_refund_no: 'CRR1759000000000124',
        refund_status: 'ABNORMAL',
        refund_id: 'wx-refund-2',
      });
      prisma.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'cr-uuid-2',
        orderId: 'CR202610040002',
        refundOutNo: 'CRR1759000000000124',
        refundId: null,
        refundedAt: null,
      });

      const result = await service.handleWechatRefundNotify(payload);

      expect(result).toEqual({ handled: true, refundStatus: 'ABNORMAL' });
      const updateData = prisma.customRecipeOrder.update.mock.calls[0][0].data;
      expect(updateData.refundStatus).toBe('ABNORMAL');
      expect(updateData.refundedAt).toBeNull();
    });

    it('找不到对应退款单时如实返回未处理，不误伤别的单据', async () => {
      const { service, prisma } = createService();

      jest.spyOn(service as any, 'decryptResource').mockReturnValue({
        out_trade_no: 'CR202610040003',
        out_refund_no: 'CRR1759000000000125',
        refund_status: 'SUCCESS',
      });
      prisma.customRecipeOrder.findFirst.mockResolvedValue(null);

      const result = await service.handleWechatRefundNotify(payload);

      expect(result).toEqual({ handled: false, refundStatus: 'SUCCESS' });
      expect(prisma.customRecipeOrder.update).not.toHaveBeenCalled();
    });
  });

  describe('订单已关闭却收到付款', () => {
    it('⚠️ 自动原路退回，不让顾客的钱悬在空中', async () => {
      const { service, prisma } = createService();

      jest.spyOn(service as any, 'decryptResource').mockReturnValue({
        out_trade_no: 'CR202610040004',
        trade_state: 'SUCCESS',
        transaction_id: 'wx-tx-9',
        amount: { total: 30000 },
      });
      prisma.customRecipeOrder.findUnique.mockResolvedValue({
        id: 'cr-uuid-4',
        orderId: 'CR202610040004',
        status: 'CANCELLED',
        amount: 300,
        paymentTransactionId: null,
        paymentConfirmedAt: null,
      });

      const refund = jest
        .spyOn(service, 'createCustomRecipeRefund')
        .mockResolvedValue({
          outRefundNo: 'CRR-auto',
          refundId: 'wx-refund-auto',
          status: 'PROCESSING',
          amount: 300,
          reused: false,
        } as any);

      const result: any = await service.handleWechatNotify(payload);

      // 先补记支付流水，否则退款会以"该订单尚未支付"被拒
      expect(prisma.customRecipeOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentTransactionId: 'wx-tx-9' }),
        }),
      );
      expect(refund).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'CR202610040004' }),
      );
      expect(result.latePayment).toBe(true);
      expect(result.refundStatus).toBe('PROCESSING');
    });

    it('正常待付款订单仍然只做确认收款，不触发退款', async () => {
      const { service, prisma, customRecipeService } = createService();

      jest.spyOn(service as any, 'decryptResource').mockReturnValue({
        out_trade_no: 'CR202610040005',
        trade_state: 'SUCCESS',
        transaction_id: 'wx-tx-10',
        amount: { total: 30000 },
      });
      prisma.customRecipeOrder.findUnique.mockResolvedValue({
        id: 'cr-uuid-5',
        orderId: 'CR202610040005',
        status: 'PENDING_PAYMENT',
        amount: 300,
      });

      const refund = jest.spyOn(service, 'createCustomRecipeRefund');

      const result = await service.handleWechatNotify(payload);

      expect(result).toEqual({ handled: true, tradeState: 'SUCCESS' });
      expect(customRecipeService.confirmPaymentFromWechat).toHaveBeenCalledWith(
        'CR202610040005',
        'wx-tx-10',
      );
      expect(refund).not.toHaveBeenCalled();
    });
  });
});
