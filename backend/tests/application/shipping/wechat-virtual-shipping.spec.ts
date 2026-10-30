import { WechatShippingUploadService } from '../../../src/application/shipping/wechat-shipping-upload.service';

describe('WechatShippingUploadService · 定制食谱虚拟发货', () => {
  function createService(order: Record<string, any> | null) {
    const prisma = {
      customRecipeOrder: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentConfig: {
        upsert: jest
          .fn()
          .mockResolvedValue({ appId: 'wx-app-id', mchId: 'mch-1' }),
      },
      userWechatIdentity: {
        findFirst: jest.fn().mockResolvedValue({ openid: 'openid-from-identity' }),
      },
    };
    const wechat = {
      uploadShippingInfo: jest.fn().mockResolvedValue({
        errcode: 0,
        errmsg: 'ok',
      }),
    };
    const service = new WechatShippingUploadService(
      prisma as any,
      wechat as any,
    );
    return { service, prisma, wechat };
  }

  function buildOrder(overrides: Record<string, any> = {}) {
    return {
      id: 'custom-order-1',
      orderId: 'CR202610302340',
      customerId: 'customer-1',
      status: 'DELIVERED',
      paymentChannel: 'WECHAT_ONLINE',
      paymentTransactionId: 'transaction-1',
      wechatShippingUploadedAt: null,
      customer: { wechatOpenid: 'openid-1' },
      ...overrides,
    };
  }

  it('交付后按虚拟商品上报：logistics_type=3、无快递单号、带交易号/openid', async () => {
    const { service, prisma, wechat } = createService(buildOrder());

    const result = await service.uploadVirtualForCustomRecipeOrder(
      'custom-order-1',
    );

    expect(result.success).toBe(true);
    expect(wechat.uploadShippingInfo).toHaveBeenCalledTimes(1);
    const payload = wechat.uploadShippingInfo.mock.calls[0][0];
    expect(payload).toMatchObject({
      order_key: {
        order_number_type: 2,
        mchid: 'mch-1',
        transaction_id: 'transaction-1',
      },
      logistics_type: 3,
      delivery_mode: 1,
      is_all_delivered: true,
      shipping_list: [{ item_desc: '定制食谱' }],
      payer: { openid: 'openid-from-identity' },
    });
    expect(payload.shipping_list[0].tracking_no).toBeUndefined();
    expect(prisma.customRecipeOrder.update).toHaveBeenCalledWith({
      where: { id: 'custom-order-1' },
      data: { wechatShippingUploadedAt: expect.any(Date) },
    });
  });

  it('线下收款订单不上报', async () => {
    const { service, wechat } = createService(
      buildOrder({ paymentChannel: 'OFFLINE_WECHAT', paymentTransactionId: null }),
    );

    const result = await service.uploadVirtualForCustomRecipeOrder(
      'custom-order-1',
    );

    expect(result.skipped).toBe(true);
    expect(wechat.uploadShippingInfo).not.toHaveBeenCalled();
  });

  it('已经上报过的订单不重复上报（幂等）', async () => {
    const { service, wechat, prisma } = createService(
      buildOrder({ wechatShippingUploadedAt: new Date('2026-10-30T02:00:00Z') }),
    );

    const result = await service.uploadVirtualForCustomRecipeOrder(
      'custom-order-1',
    );

    expect(result.skipped).toBe(true);
    expect(wechat.uploadShippingInfo).not.toHaveBeenCalled();
    expect(prisma.customRecipeOrder.update).not.toHaveBeenCalled();
  });

  it('订单尚未交付时不上报', async () => {
    const { service, wechat } = createService(
      buildOrder({ status: 'IN_PROGRESS' }),
    );

    const result = await service.uploadVirtualForCustomRecipeOrder(
      'custom-order-1',
    );

    expect(result.skipped).toBe(true);
    expect(wechat.uploadShippingInfo).not.toHaveBeenCalled();
  });
});
