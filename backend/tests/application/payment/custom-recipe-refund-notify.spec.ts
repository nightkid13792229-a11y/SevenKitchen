import { WechatPaymentService } from '../../../src/application/payment/wechat-payment.service';

/**
 * 微信退款结果回调（2026-10-26）。
 *
 * 退款申请审核时微信常返回 PROCESSING；真正成功在回调里。
 * 这条路径必须同时：① 更新申请为已退款；② 制作中订单自动停单取消。
 */
describe('WechatPaymentService · 定制退款回调', () => {
  function createService() {
    const prisma = {
      customRecipeOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'order-pk-1',
          orderId: 'CR202610260001',
          refundId: null,
          refundStatus: 'PROCESSING',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      customRecipeRefundRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const customRecipeService = {
      cancelOrderAfterRefund: jest.fn().mockResolvedValue({ cancelled: true }),
    };
    const service = new WechatPaymentService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      customRecipeService as any,
      {} as any,
    );
    return { service, prisma, customRecipeService };
  }

  it('★ 退款成功回调：申请标已退款，并自动停单取消', async () => {
    const { service, prisma, customRecipeService } = createService();

    await (service as any).handleCustomRecipeRefundNotify(
      {
        refund_status: 'SUCCESS',
        refund_id: 'wx-refund-1',
      },
      'CRR1',
    );

    expect(customRecipeService.cancelOrderAfterRefund).toHaveBeenCalledWith(
      'order-pk-1',
      expect.objectContaining({
        outRefundNo: 'CRR1',
        refundId: 'wx-refund-1',
      }),
    );
    expect(
      prisma.customRecipeRefundRequest.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'order-pk-1', refundOutNo: 'CRR1' },
        data: expect.objectContaining({ status: 'REFUNDED' }),
      }),
    );
  });

  it('退款失败回调：申请标失败，不取消订单', async () => {
    const { service, prisma, customRecipeService } = createService();

    await (service as any).handleCustomRecipeRefundNotify(
      { refund_status: 'CLOSED' },
      'CRR1',
    );

    expect(customRecipeService.cancelOrderAfterRefund).not.toHaveBeenCalled();
    expect(
      prisma.customRecipeRefundRequest.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});
