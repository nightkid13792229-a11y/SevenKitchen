/**
 * 补剂单的微信发货信息上报（2026-11-11）。
 *
 * 背景：鲜食单发货会上报微信，补剂单从来没有 —— 顾客付了钱，
 * 微信里那笔单一直停在「待发货」。这个用例把补剂的四条口径钉住：
 *   · 单号/快递公司缺一个就不报；
 *   · 非微信支付不报；
 *   · 商户单号用「订单号」（下单支付时用的就是它），不是 id 去横线；
 *   · 商品描述取补剂名，去重后拼一句。
 */

import { WechatShippingUploadService } from 'src/application/shipping/wechat-shipping-upload.service';

function buildService() {
  const prisma: any = {
    order: { findUnique: jest.fn().mockResolvedValue(null) },
    supplementOrder: { findUnique: jest.fn() },
    paymentConfig: {
      upsert: jest.fn().mockResolvedValue({ appId: 'wx-app', mchId: 'mch-1' }),
    },
    userWechatIdentity: { findFirst: jest.fn().mockResolvedValue(null) },
    orderShipmentPackage: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const wechat: any = {
    uploadShippingInfo: jest.fn().mockResolvedValue({ ok: true }),
  };
  const service = new WechatShippingUploadService(prisma, wechat);
  return { service, prisma, wechat };
}

function supplementRow(overrides: any = {}) {
  return {
    id: 'sup-1',
    orderNo: 'SUP20261111001',
    userId: 'u1',
    status: 'PACKED',
    paymentMethod: 'WECHAT_PAY',
    paymentStatus: 'SUCCESS',
    transactionId: '4200000001202611111234567890',
    trackingNumber: 'SF1234567890',
    carrierCode: 'SF',
    shippingAddressSnapshot: { phone: '13800001111', recipientName: '张三' },
    user: { id: 'u1', wechatOpenid: 'openid-legacy' },
    items: [
      { name: '鱼油' },
      { name: '钙粉' },
      { name: '鱼油' },
    ],
    ...overrides,
  };
}

describe('补剂单微信发货信息上报', () => {
  it('有 transactionId：按交易号上报，商品描述取补剂名（去重）', async () => {
    const { service, prisma, wechat } = buildService();
    prisma.supplementOrder.findUnique.mockResolvedValue(supplementRow());

    const result = await service.uploadForOrder('sup-1');

    expect(result.success).toBe(true);
    expect(wechat.uploadShippingInfo).toHaveBeenCalledTimes(1);
    const payload = wechat.uploadShippingInfo.mock.calls[0][0];
    expect(payload.order_key).toEqual({
      order_number_type: 2,
      mchid: 'mch-1',
      transaction_id: '4200000001202611111234567890',
    });
    expect(payload.shipping_list).toHaveLength(1);
    expect(payload.shipping_list[0].tracking_no).toBe('SF1234567890');
    expect(payload.shipping_list[0].express_company).toBe('SF');
    expect(payload.shipping_list[0].item_desc).toBe('补剂 · 鱼油、钙粉');
    expect(payload.shipping_list[0].contact).toEqual({
      receiver_contact: '13800001111',
    });
    expect(payload.delivery_mode).toBe(1);
    expect(payload.logistics_type).toBe(1);
    expect(payload.payer).toEqual({ openid: 'openid-legacy' });
  });

  it('★ 没有 transactionId：商户单号用订单号（与下单支付一致），不是 id', async () => {
    const { service, prisma, wechat } = buildService();
    prisma.supplementOrder.findUnique.mockResolvedValue(
      supplementRow({ transactionId: null }),
    );

    await service.uploadForOrder('sup-1');

    const payload = wechat.uploadShippingInfo.mock.calls[0][0];
    expect(payload.order_key).toEqual({
      order_number_type: 1,
      mchid: 'mch-1',
      out_trade_no: 'SUP20261111001',
    });
  });

  it('非微信支付：跳过，不调微信', async () => {
    const { service, prisma, wechat } = buildService();
    prisma.supplementOrder.findUnique.mockResolvedValue(
      supplementRow({ paymentMethod: 'CASH' }),
    );

    const result = await service.uploadForOrder('sup-1');

    expect(result.skipped).toBe(true);
    expect(result.success).toBe(true);
    expect(wechat.uploadShippingInfo).not.toHaveBeenCalled();
  });

  it('缺单号 / 快递公司：跳过并说明原因', async () => {
    const { service, prisma, wechat } = buildService();
    prisma.supplementOrder.findUnique.mockResolvedValue(
      supplementRow({ trackingNumber: null }),
    );

    const result = await service.uploadForOrder('sup-1');

    expect(result.skipped).toBe(true);
    expect(result.success).toBe(false);
    expect(result.message).toContain('缺少物流单号');
    expect(wechat.uploadShippingInfo).not.toHaveBeenCalled();
  });

  it('两张表都查不到：仍然是「订单不存在」', async () => {
    const { service, prisma } = buildService();
    prisma.supplementOrder.findUnique.mockResolvedValue(null);

    const result = await service.uploadForOrder('missing');

    expect(result.success).toBe(false);
    expect(result.message).toBe('订单不存在：missing');
  });

  it('用户没有任何 openid：跳过，不调微信', async () => {
    const { service, prisma, wechat } = buildService();
    prisma.supplementOrder.findUnique.mockResolvedValue(
      supplementRow({ user: { id: 'u1', wechatOpenid: null } }),
    );

    const result = await service.uploadForOrder('sup-1');

    expect(result.skipped).toBe(true);
    expect(result.message).toContain('openid');
    expect(wechat.uploadShippingInfo).not.toHaveBeenCalled();
  });
});
