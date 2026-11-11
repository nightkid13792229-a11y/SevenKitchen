/**
 * 补剂发货 → 微信发货信息上报 的接线验收（2026-11-11）。
 *
 * 为什么单独一条：光让「上报服务」支持补剂单没用 ——
 * 补剂发货走的是 supplementOrderService.shipOrder，它原来完全不碰微信。
 * 这个用例盯的就是「发完货真的会去上报，并且结果能回到小程序」。
 */

import { AdminSupplementShopController } from 'src/interfaces/controllers/admin-supplement-shop.controller';

function buildController(overrides: any = {}) {
  const orderService: any = {
    shipOrder: jest.fn().mockResolvedValue({ id: 'sup-1', status: 'SHIPPED' }),
    ...overrides.orderService,
  };
  const upload: any = {
    uploadForOrder: jest
      .fn()
      .mockResolvedValue({ success: true, message: '微信发货信息已上传' }),
    ...overrides.upload,
  };

  const controller = new AdminSupplementShopController(
    {} as any, // catalog
    {} as any, // config
    {} as any, // pricing
    orderService as any,
    {} as any, // wechat payment
    {} as any, // label
    undefined, // scheduling
    undefined, // aftersale
    undefined, // packaging
    undefined, // notification
    upload as any,
  );

  // 脱敏是另一件事，这里直接放行，只验接线
  jest
    .spyOn(controller as any, 'redactForStaff')
    .mockImplementation(async (view: any) => view);

  return { controller, orderService, upload };
}

describe('补剂发货后上报微信发货信息', () => {
  it('★ 正常发货：会调用上报，并把结果带回给调用方', async () => {
    const { controller, upload } = buildController();

    const response: any = await controller.shipOrder(
      'sup-1',
      { shippingType: 'NORMAL', trackingNumber: 'SF1234567890', actualShippingFee: 12.5 },
      { user: { role: 'STAFF', userId: 'u-staff' } },
    );

    expect(upload.uploadForOrder).toHaveBeenCalledWith('sup-1');
    expect(response.code).toBe(0);
    expect(response.data.wechatShippingUpload).toEqual({
      success: true,
      skipped: undefined,
      message: '微信发货信息已上传',
    });
  });

  it('无需发货（自用单）：不调用上报', async () => {
    const { controller, upload } = buildController();

    const response: any = await controller.shipOrder(
      'sup-1',
      { shippingType: 'NOT_REQUIRED' },
      { user: { role: 'STAFF' } },
    );

    expect(upload.uploadForOrder).not.toHaveBeenCalled();
    expect(response.data.wechatShippingUpload.skipped).toBe(true);
  });

  it('上报抛错：发货照样成功返回，只是把失败原因带回去', async () => {
    const { controller } = buildController({
      upload: {
        uploadForOrder: jest.fn().mockRejectedValue(new Error('微信超时')),
      },
    });

    const response: any = await controller.shipOrder(
      'sup-1',
      { shippingType: 'NORMAL', trackingNumber: 'SF1234567890', actualShippingFee: 12.5 },
      { user: { role: 'STAFF' } },
    );

    expect(response.code).toBe(0);
    expect(response.data.id).toBe('sup-1');
    expect(response.data.wechatShippingUpload).toEqual({
      success: false,
      message: '微信超时',
    });
  });

  it('没注入上报服务（单测/降级环境）：不报错，返回未启用', async () => {
    const orderService: any = {
      shipOrder: jest.fn().mockResolvedValue({ id: 'sup-1' }),
    };
    const controller = new AdminSupplementShopController(
      {} as any,
      {} as any,
      {} as any,
      orderService,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    jest
      .spyOn(controller as any, 'redactForStaff')
      .mockImplementation(async (view: any) => view);

    const response: any = await controller.shipOrder(
      'sup-1',
      { shippingType: 'NORMAL', trackingNumber: 'SF1234567890', actualShippingFee: 12.5 },
      { user: { role: 'STAFF' } },
    );

    expect(response.code).toBe(0);
    expect(response.data.wechatShippingUpload.message).toBe('微信发货同步未启用');
  });
});
