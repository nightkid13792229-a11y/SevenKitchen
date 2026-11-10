jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StaffShippingController } from '../../src/interfaces/controllers/staff-shipping.controller';
import { StaffGuard } from '../../src/interfaces/guards/role.guard';

const guardsOf = (handler: unknown): unknown[] =>
  (Reflect.getMetadata(GUARDS_METADATA, handler as any) as unknown[]) ?? [];

/**
 * 员工端的四个存根接口（2026-11-10）。
 *
 * 这些接口是打包间唯一会用到的入口，参数缺一个都应该当场 400，
 * 而不是让模型拿一个空地址去识别、最后报一个看不懂的错。
 */
describe('StaffShippingController · 存根接口', () => {
  const build = () => {
    const fulfilment = {} as any;
    const orderShipment = {} as any;
    const controller: any = new StaffShippingController(
      fulfilment,
      orderShipment,
    );
    controller.waybillReceiptService = {
      recognize: jest.fn().mockResolvedValue({ checkId: 'c1' }),
      createManualRecord: jest.fn().mockResolvedValue({ id: 'c1' }),
    };
    controller.supplementOrderService = {
      adminUpdateAddress: jest.fn().mockResolvedValue({ order: {}, needsReprint: false }),
    };
    controller.cosService = {
      uploadImage: jest.fn().mockResolvedValue({ url: 'https://cos/x.jpg', key: 'x.jpg' }),
    };
    return { controller };
  };

  it('★ 四个接口都要求员工身份', () => {
    const { controller } = build();

    for (const handler of [
      controller.uploadReceipt,
      controller.recognizeReceipt,
      controller.manualWaybill,
      controller.updateSupplementAddress,
    ]) {
      expect(guardsOf(handler)).toContain(StaffGuard);
    }
  });

  it('识别：缺图片 → 400', async () => {
    const { controller } = build();

    await expect(
      controller.recognizeReceipt({ orderIds: ['o1'] }, { user: { userId: 'u1' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('识别：缺订单 → 400', async () => {
    const { controller } = build();

    await expect(
      controller.recognizeReceipt(
        { imageUrl: 'https://cos/x.jpg', orderIds: [] },
        { user: { userId: 'u1' } },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('识别：把图片地址和订单交给服务层，并把结论原样返回', async () => {
    const { controller } = build();

    const result = await controller.recognizeReceipt(
      { imageUrl: ' https://cos/x.jpg ', orderIds: ['o1'] },
      { user: { userId: 'u1' } },
    );

    expect(controller.waybillReceiptService.recognize).toHaveBeenCalledWith({
      imageUrl: 'https://cos/x.jpg',
      orderIds: ['o1'],
      userId: 'u1',
    });
    expect(result.data).toEqual({ checkId: 'c1' });
  });

  it('★ 上传：存根图落在 shipping-waybill-receipts 目录下', async () => {
    const { controller } = build();

    const file = { originalname: 'receipt.jpg' } as any;
    await controller.uploadReceipt(file);

    expect(controller.cosService.uploadImage).toHaveBeenCalledWith(
      file,
      'receipt.jpg',
      'shipping-waybill-receipts',
    );
  });

  it('上传：没选文件 → 400', async () => {
    const { controller } = build();

    await expect(controller.uploadReceipt(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('手动填写：没写原因 → 400', async () => {
    const { controller } = build();

    await expect(
      controller.manualWaybill(
        { orderIds: ['o1'], trackingNumber: 'SF0204691009893', reason: '  ' },
        { user: { userId: 'u1' } },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('手动填写：正常 → 落一行并返回 id', async () => {
    const { controller } = build();

    const result = await controller.manualWaybill(
      {
        orderIds: ['o1'],
        trackingNumber: 'SF0204691009893',
        reason: '存根太糊',
      },
      { user: { userId: 'u1' } },
    );

    expect(controller.waybillReceiptService.createManualRecord).toHaveBeenCalledWith({
      orderIds: ['o1'],
      trackingNumber: 'SF0204691009893',
      reason: '存根太糊',
      userId: 'u1',
    });
    expect(result.data).toEqual({ id: 'c1' });
  });

  it('★ 补剂改地址：没写原因 → 400（改地址必须留痕）', async () => {
    const { controller } = build();

    await expect(
      controller.updateSupplementAddress(
        's1',
        {
          recipientName: '张赛珺',
          phone: '18612342107',
          province: '上海市',
          city: '上海市',
          district: '普陀区',
          detail: '礼泉路700弄55号703',
          reason: ' ',
        },
        { user: { userId: 'u1' } },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('补剂改地址：员工改的，审计要记成 STAFF（不是 ADMIN）', async () => {
    const { controller } = build();
    const dto = {
      recipientName: '张赛珺',
      phone: '18612342107',
      province: '上海市',
      city: '上海市',
      district: '普陀区',
      detail: '礼泉路700号',
      reason: '顾客微信说搬家了',
    };

    await controller.updateSupplementAddress('s1', dto, {
      user: { userId: 'u1', role: 'STAFF' },
    });

    expect(controller.supplementOrderService.adminUpdateAddress).toHaveBeenCalledWith(
      's1',
      dto,
      'u1',
      'STAFF',
    );
  });

  it('补剂改地址：管理员改的就记 ADMIN', async () => {
    const { controller } = build();
    const dto = {
      recipientName: '张赛珺',
      phone: '18612342107',
      province: '上海市',
      city: '上海市',
      district: '普陀区',
      detail: '礼泉路700号',
      reason: '顾客微信说搬家了',
    };

    await controller.updateSupplementAddress('s1', dto, {
      user: { userId: 'boss', role: 'ADMIN' },
    });

    expect(controller.supplementOrderService.adminUpdateAddress).toHaveBeenCalledWith(
      's1',
      dto,
      'boss',
      'ADMIN',
    );
  });
});
