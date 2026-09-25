import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { loadImage } from 'canvas';
import { AdminSupplementShopController } from '../../../src/interfaces/controllers/admin-supplement-shop.controller';
import { SupplementCatalogService } from '../../../src/application/supplement-shop/supplement-catalog.service';
import { SupplementOrderService } from '../../../src/application/supplement-shop/supplement-order.service';
import { SupplementPricingService } from '../../../src/application/supplement-shop/supplement-pricing.service';
import {
  SupplementShopConfigService,
  type SupplementShopConfigDto,
} from '../../../src/application/supplement-shop/supplement-shop-config.service';
import { WechatPaymentService } from '../../../src/application/payment/wechat-payment.service';
import { ShippingService } from '../../../src/application/shipping/shipping.service';
import { SupplementLabelService } from '../../../src/label/supplement-label.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../../src/interfaces/auth/jwt.service';
import { StaffGuard } from '../../../src/interfaces/guards/role.guard';
import { Reflector } from '@nestjs/core';

function config(
  overrides: Partial<SupplementShopConfigDto> = {},
): SupplementShopConfigDto {
  return {
    enabled: true,
    markupMultiplier: 2,
    serviceFeeMode: 'PER_ORDER',
    serviceFeeAmount: 9.9,
    packagingFeePerBag: 0,
    priceRoundingMode: 'CEIL_TO_0_1',
    minOrderAmount: 0,
    roundUpUsage: true,
    maxPortionMultiplier: 3,
    maxTotalDays: 90,
    paymentTimeoutMinutes: 30,
    shippingMode: 'FLAT_RATE',
    flatShippingFee: 8,
    shippingTemplateId: null,
    freeShippingThreshold: null,
    powderShelfLifeMonths: 6,
    solidShelfLifeMonths: 9,
    oilShelfLifeMonths: 6,
    minRemainingShelfLifeDays: 90,
    aftersalePolicy: null,
    labelBrandName: '赛文的食堂',
    labelIncludeDesiccantNotice: true,
    updatedAt: null,
    ...overrides,
  };
}

/** 内存里的已付款补剂订单：两个补剂，默认都还没分装 */
function buildOrder() {
  const packedBase = {
    storageCondition: '避光、密封、阴凉干燥处保存',
    batchNo: null as string | null,
    sourceExpiryDate: null as Date | null,
    packedExpiryDate: null as Date | null,
    packedAt: null as Date | null,
  };

  return {
    id: 'order-1',
    orderNo: 'SP20260918-004',
    status: 'PAID',
    shippingAddressSnapshot: { recipientName: '赵晨' },
    items: [
      {
        ...packedBase,
        id: 'item-kelp',
        name: '海藻粉',
        brand: 'NOW FOODS',
        productModel: '227g/瓶',
        unit: '平勺',
        packedAmount: 23,
        bags: 1,
      },
      {
        ...packedBase,
        id: 'item-choline',
        name: '胆碱片',
        brand: "NATURE'S WAY",
        productModel: '500mg胆碱/片',
        unit: '片',
        packedAmount: 6,
        bags: 1,
      },
    ],
  };
}

describe('AdminSupplementShopController · 分装标签图片', () => {
  let controller: AdminSupplementShopController;
  let store: ReturnType<typeof buildOrder>;

  const mockPrismaService = {
    supplementOrder: { findUnique: jest.fn() },
  } as any;
  const mockConfigService = { getConfig: jest.fn() };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminSupplementShopController],
      providers: [
        SupplementOrderService,
        SupplementPricingService,
        // 用真实渲染服务：这组用例要验证的就是「真的画出了一张 PNG」
        SupplementLabelService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SupplementShopConfigService, useValue: mockConfigService },
        { provide: SupplementCatalogService, useValue: {} },
        { provide: WechatPaymentService, useValue: {} },
        { provide: ShippingService, useValue: {} },
        // @UseGuards 上的守卫也要能实例化，否则连模块都编译不过
        AuthGuard,
        StaffGuard,
        Reflector,
        { provide: JwtAuthService, useValue: { validateToken: jest.fn() } },
      ],
    }).compile();

    controller = moduleRef.get(AdminSupplementShopController);
    jest.clearAllMocks();

    store = buildOrder();
    mockConfigService.getConfig.mockResolvedValue(config());
    mockPrismaService.supplementOrder.findUnique.mockImplementation(
      async ({ where }: any) => (where.id === store.id ? { ...store } : null),
    );
  });

  /** 把两个补剂都标成已分装 */
  const packAll = (packedAt: Date) => {
    store.items.forEach((item) => {
      item.packedAt = packedAt;
      item.packedExpiryDate = new Date('2027-03-18T00:00:00Z');
    });
  };

  it('未分装时沿用标签数据接口的报错，不给图片', async () => {
    await expect(controller.getOrderLabelImages('order-1')).rejects.toThrow(
      '请先完成分装，再打印标签',
    );
    await expect(
      controller.getOrderLabelImages('order-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('多袋时逐个生成：一个补剂 3 袋就出 3 张图，labelId 各不相同', async () => {
    packAll(new Date('2026-09-18T02:00:00Z'));
    store.items[0].bags = 3;
    store.items[0].batchNo = 'B2609-01';

    const response = await controller.getOrderLabelImages('order-1');

    expect(response.code).toBe(0);
    expect(response.message).toBe('Success');
    expect(response.data?.orderNo).toBe('SP20260918-004');
    expect(response.data?.brandName).toBe('赛文的食堂');
    expect(response.data?.receiverName).toBe('赵晨');

    const images = response.data?.labels ?? [];
    // 3 袋海藻粉 + 1 袋胆碱片
    expect(images).toHaveLength(4);
    expect(new Set(images.map((item) => item.labelId)).size).toBe(4);
    expect(images.map((item) => item.labelId)).toEqual([
      'item-kelp#1',
      'item-kelp#2',
      'item-kelp#3',
      'item-choline#1',
    ]);

    images.forEach((item) => {
      expect(item.imageBase64.length).toBeGreaterThan(0);
      expect(
        Buffer.from(item.imageBase64, 'base64')
          .subarray(0, 8)
          .toString('hex'),
      ).toBe('89504e470d0a1a0a');
    });
  });

  it('图片是 60×40mm（203dpi 下 480×320px）的 PNG', async () => {
    packAll(new Date('2026-09-18T02:00:00Z'));

    const response = await controller.getOrderLabelImages('order-1');
    const imageBase64 = response.data?.labels[0].imageBase64 ?? '';
    const image = await loadImage(Buffer.from(imageBase64, 'base64'));

    expect(image.width).toBe(480);
    expect(image.height).toBe(320);
  });
});
