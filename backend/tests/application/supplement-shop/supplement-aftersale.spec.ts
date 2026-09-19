import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupplementOrderService } from '../../../src/application/supplement-shop/supplement-order.service';
import { SupplementPricingService } from '../../../src/application/supplement-shop/supplement-pricing.service';
import { SupplementShopConfigService } from '../../../src/application/supplement-shop/supplement-shop-config.service';
import { ShippingService } from '../../../src/application/shipping/shipping.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNo: 'SP20260918-001',
    userId: 'user-1',
    status: 'SHIPPED',
    bagCount: 2,
    amountSupplement: 13.7,
    amountServiceFee: 9.9,
    amountPackaging: 0,
    amountGoods: 23.6,
    amountShipping: 8,
    amountTotal: 31.6,
    supplementCost: 6.79,
    shippingDescription: '补剂一口价运费 8.00 元',
    shippingAddressSnapshot: {
      recipientName: '赵晨',
      phone: '18628258025',
      region: { province: '四川省', city: '成都市', district: '锦江区' },
      detail: '龙湖天璞',
    },
    pricingSnapshot: { markupMultiplier: 2 },
    recipeId: null,
    recipeName: null,
    dogId: null,
    dogName: null,
    cycleDays: null,
    remark: null,
    paymentMethod: 'WECHAT_PAY',
    paymentStatus: 'SUCCESS',
    paidAt: new Date('2026-09-18T09:00:00Z'),
    aftersaleType: null,
    aftersaleReason: null,
    aftersaleAt: null,
    refundStatus: null,
    refundAmount: null,
    refundOutNo: null,
    refundId: null,
    refundReason: null,
    refundRequestedAt: null,
    refundedAt: null,
    reshipFromOrderNo: null,
    trackingNumber: 'YT123',
    carrierCode: 'YTO',
    shippedAt: new Date('2026-09-18T10:00:00Z'),
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date('2026-09-18T08:00:00Z'),
    items: [
      {
        id: 'item-kelp',
        ingredientId: 'kelp-id',
        name: '海藻粉',
        brand: 'NOW FOODS',
        productModel: '227g/瓶',
        physicalForm: 'POWDER',
        unit: '平勺',
        requestedAmount: 22.7,
        packedAmount: 23,
        unitCost: 0.035452,
        cost: 0.82,
        price: 1.7,
        bags: 1,
        shelfLifeMonths: 6,
        storageCondition: '避光、密封、阴凉干燥处保存',
        batchNo: 'B2609-01',
        sourceExpiryDate: new Date('2028-06-30T00:00:00Z'),
        packedExpiryDate: new Date('2027-03-18T00:00:00Z'),
        packedAt: new Date('2026-09-18T09:30:00Z'),
        createdAt: new Date('2026-09-18T08:00:00Z'),
      },
    ],
    ...overrides,
  };
}

describe('补剂订单 · 售后（退款 / 免费补发）', () => {
  let service: SupplementOrderService;
  let store: ReturnType<typeof buildOrder>[];
  let seq: number;

  const mockPrismaService = {
    supplementOrder: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    orderSequence: { upsert: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  const mockConfigService = { getConfig: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplementOrderService,
        SupplementPricingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SupplementShopConfigService, useValue: mockConfigService },
        {
          provide: ShippingService,
          useValue: { calculateShippingFeePreview: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(SupplementOrderService);
    jest.clearAllMocks();

    store = [buildOrder()];
    seq = 1;

    mockConfigService.getConfig.mockResolvedValue({
      enabled: true,
      markupMultiplier: 2,
      serviceFeeMode: 'PER_ORDER',
      serviceFeeAmount: 9.9,
      packagingFeePerBag: 0,
      priceRoundingMode: 'CEIL_TO_0_1',
      minOrderAmount: 0,
      roundUpUsage: true,
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
    });

    mockPrismaService.supplementOrder.findUnique.mockImplementation(
      async ({ where }: any) => {
        const found = store.find(
          (row) => row.id === where.id || row.orderNo === where.orderNo,
        );
        return found ? { ...found } : null;
      },
    );
    mockPrismaService.supplementOrder.findFirst.mockImplementation(
      async ({ where }: any) => {
        const found = store.find(
          (row) => row.reshipFromOrderNo === where.reshipFromOrderNo,
        );
        return found ? { ...found } : null;
      },
    );
    mockPrismaService.supplementOrder.update.mockImplementation(
      async ({ where, data }: any) => {
        const row = store.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
    );
    mockPrismaService.supplementOrder.create.mockImplementation(
      async ({ data }: any) => {
        const itemsCreate = data.items?.create || [];
        const row: any = {
          ...buildOrder(),
          id: `order-${++seq + 1}`,
          ...data,
          items: itemsCreate.map((item: any, index: number) => ({
            id: `${data.orderNo}-item-${index}`,
            batchNo: null,
            sourceExpiryDate: null,
            packedExpiryDate: null,
            packedAt: null,
            createdAt: new Date(),
            ...item,
          })),
        };
        delete row.items__;
        store.push(row);
        return { id: row.id };
      },
    );
    mockPrismaService.orderSequence.upsert.mockImplementation(async () => ({
      dateKey: '20260918',
      lastSeq: 40 + seq++,
    }));
    mockPrismaService.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrismaService),
    );
  });

  describe('免费补发', () => {
    it('生成 0 元补发单，直接进入待分装，并回指原单', async () => {
      const result = await service.reshipOrder('order-1', '发错货');

      const reship = result.reship;
      expect(reship.amountTotal).toBe(0);
      expect(reship.amountSupplement).toBe(0);
      expect(reship.amountShipping).toBe(0);
      expect(reship.status).toBe('PAID');
      expect(reship.reshipFromOrderNo).toBe('SP20260918-001');
      expect(reship.paymentMethod).toBe('RESHIP');
      expect(reship.remark).toContain('免费补发');
      expect(reship.remark).toContain('SP20260918-001');
      expect(reship.items).toHaveLength(1);
      // 补发不收费
      expect(reship.items[0].price).toBe(0);
      // 分装量与效期信息沿用原单
      expect(reship.items[0].packedAmount).toBe(23);
      expect(reship.items[0].shelfLifeMonths).toBe(6);
      expect(reship.items[0].storageCondition).toBe('避光、密封、阴凉干燥处保存');
    });

    it('原单被标记为售后中，类型为补发', async () => {
      const result = await service.reshipOrder('order-1', '发错货');

      expect(result.original.status).toBe('AFTERSALE');
      expect(result.original.aftersaleType).toBe('RESHIP');
      expect(result.original.aftersaleReason).toBe('发错货');
    });

    it('同一订单不能重复补发', async () => {
      await service.reshipOrder('order-1', '发错货');

      await expect(
        service.reshipOrder('order-1', '又坏了'),
      ).rejects.toThrow(/已经补发过/);
    });

    it('已取消的订单不能补发', async () => {
      store[0].status = 'CANCELLED';

      await expect(
        service.reshipOrder('order-1', '发错货'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('订单不存在时报 404', async () => {
      await expect(
        service.reshipOrder('nope', '发错货'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('不填原因时用默认文案', async () => {
      const result = await service.reshipOrder('order-1', '   ');

      expect(result.original.aftersaleReason).toBe('免费补发');
    });
  });

  describe('线上退款', () => {
    it('记录退款发起，并把订单置为售后中', async () => {
      const result = await service.recordRefundRequest('order-1', {
        outRefundNo: 'RFSP20260918-00120260918120000ABCD',
        amount: 31.6,
        reason: '破损',
        status: 'PROCESSING',
      });

      expect(result.status).toBe('AFTERSALE');
      expect(result.aftersaleType).toBe('REFUND');
      expect(result.refundStatus).toBe('PROCESSING');
      expect(result.refundAmount).toBe(31.6);
      expect(result.refundOutNo).toBe('RFSP20260918-00120260918120000ABCD');
      expect(result.refundReason).toBe('破损');
    });

    it('退款成功的回调会写入退款完成时间', async () => {
      const successTime = new Date('2026-09-19T02:00:00Z');

      const result = await service.applyRefundResult('order-1', {
        status: 'SUCCESS',
        refundId: 'wx-refund-1',
        successTime,
      });

      expect(result.refundStatus).toBe('SUCCESS');
      expect(result.refundId).toBe('wx-refund-1');
      expect(result.refundedAt).toBe(successTime.toISOString());
    });

    it('重复的成功回调是幂等的', async () => {
      await service.applyRefundResult('order-1', { status: 'SUCCESS' });
      const firstRefundedAt = store[0].refundedAt;

      await service.applyRefundResult('order-1', { status: 'SUCCESS' });

      expect(store[0].refundedAt).toBe(firstRefundedAt);
    });

    it('退款异常状态会如实记录，便于人工跟进', async () => {
      const result = await service.applyRefundResult('order-1', {
        status: 'ABNORMAL',
      });

      expect(result.refundStatus).toBe('ABNORMAL');
      expect(result.refundedAt).toBeNull();
    });
  });
});
