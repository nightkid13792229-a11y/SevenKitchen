import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SupplementOrderService,
  addMonths,
  resolvePackedExpiryDate,
} from '../../../src/application/supplement-shop/supplement-order.service';
import { SupplementPricingService } from '../../../src/application/supplement-shop/supplement-pricing.service';
import { SupplementShopConfigService } from '../../../src/application/supplement-shop/supplement-shop-config.service';
import { ShippingService } from '../../../src/application/shipping/shipping.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import type { SupplementShopConfigDto } from '../../../src/application/supplement-shop/supplement-shop-config.service';

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

/** 用内存对象模拟一张已付款的补剂订单 */
function buildOrder() {
  return {
    id: 'order-1',
    orderNo: 'SP20260918-001',
    userId: 'user-1',
    status: 'PAID',
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
    recipeId: null,
    recipeName: null,
    dogId: null,
    dogName: null,
    cycleDays: null,
    remark: null,
    paymentMethod: 'WECHAT_PAY',
    paymentStatus: 'SUCCESS',
    transactionId: null,
    paidAt: new Date('2026-09-18T10:00:00Z'),
    aftersaleType: null,
    aftersaleReason: null,
    aftersaleAt: null,
    trackingNumber: null,
    carrierCode: null,
    shippedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date('2026-09-18T09:00:00Z'),
    items: [
      {
        id: 'item-kelp',
        ingredientId: 'kelp-id',
        name: '海藻粉',
        brand: 'NOW FOODS',
        productModel: '227g/瓶',
        physicalForm: 'POWDER',
        unit: '平勺',
        storageCondition: '避光、密封、阴凉干燥处保存',
        requestedAmount: 22.7,
        packedAmount: 23,
        unitCost: 0.035452,
        cost: 0.82,
        price: 1.7,
        bags: 1,
        shelfLifeMonths: 6,
        batchNo: null,
        sourceExpiryDate: null,
        packedExpiryDate: null,
        packedAt: null,
        createdAt: new Date('2026-09-18T09:00:00Z'),
      },
      {
        id: 'item-choline',
        ingredientId: 'choline-id',
        name: '胆碱片',
        brand: "NATURE'S WAY",
        productModel: '500mg胆碱/片',
        physicalForm: 'TABLET',
        unit: '片',
        requestedAmount: 5.48,
        packedAmount: 6,
        unitCost: 0.996,
        cost: 5.98,
        price: 12,
        bags: 1,
        shelfLifeMonths: 9,
        batchNo: null,
        sourceExpiryDate: null,
        packedExpiryDate: null,
        packedAt: null,
        createdAt: new Date('2026-09-18T09:00:00Z'),
      },
    ],
  };
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

describe('补剂订单 · 分装发货售后', () => {
  let service: SupplementOrderService;
  // 测试用的内存订单，字段会被逐条改写，因此不强类型
  let store: any;

  const mockPrismaService = {
    supplementOrder: {
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    supplementOrderItem: { update: jest.fn() },
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
        { provide: ShippingService, useValue: { calculateShippingFeePreview: jest.fn() } },
      ],
    }).compile();

    service = module.get(SupplementOrderService);
    jest.clearAllMocks();

    store = buildOrder();
    mockConfigService.getConfig.mockResolvedValue(config());

    mockPrismaService.supplementOrder.findUnique.mockImplementation(
      async ({ where }: any) => (where.id === store.id ? { ...store } : null),
    );
    mockPrismaService.supplementOrder.update.mockImplementation(
      async ({ data }: any) => {
        Object.assign(store, data);
        return { ...store };
      },
    );
    mockPrismaService.supplementOrderItem.update.mockImplementation(
      async ({ where, data }: any) => {
        const item = store.items.find((row: any) => row.id === where.id);
        if (item) Object.assign(item, data);
        return item;
      },
    );
    mockPrismaService.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrismaService),
    );
  });

  describe('标签效期算法', () => {
    it('取「原瓶到期日」与「分装日 + 效期系数」的较小值', () => {
      const packedAt = new Date('2026-09-18T10:00:00Z');

      // 原瓶更近 → 用原瓶到期日
      const nearSource = new Date('2027-01-31T00:00:00Z');
      expect(
        resolvePackedExpiryDate(packedAt, 9, nearSource).toISOString(),
      ).toBe(nearSource.toISOString());

      // 按规则算出来的更近 → 用规则值（2026-09-18 + 6 个月 = 2027-03-18）
      const farSource = new Date('2029-01-01T00:00:00Z');
      expect(
        resolvePackedExpiryDate(packedAt, 6, farSource)
          .toISOString()
          .slice(0, 10),
      ).toBe('2027-03-18');
    });

    it('月末加月份会收敛到当月最后一天，不会溢出到下个月', () => {
      // 8 月 31 日 + 6 个月 → 2 月 28 日，而不是 3 月 3 日
      const result = addMonths(new Date('2026-08-31T00:00:00Z'), 6);
      expect(result.toISOString().slice(0, 10)).toBe('2027-02-28');
    });
  });

  describe('人工确认收款', () => {
    it('待付款订单可以确认收款', async () => {
      store.status = 'PENDING_PAYMENT';

      const result = await service.confirmPayment('order-1', {
        transactionId: 'MANUAL-20260918-001',
      });

      expect(result.status).toBe('PAID');
      expect(result.paymentStatus).toBe('SUCCESS');
      expect(store.paymentMethod).toBe('MANUAL');
      expect(store.transactionId).toBe('MANUAL-20260918-001');
      // 不该覆盖用户自己写的备注
      expect(store.remark).toBeNull();
    });

    it('已付款的订单不能重复确认', async () => {
      await expect(
        service.confirmPayment('order-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('订单不存在时报 404', async () => {
      await expect(
        service.confirmPayment('nope', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('分装', () => {
    it('填完全部袋子后写入标签效期并进入待发货', async () => {
      const result = await service.packOrder('order-1', {
        items: [
          {
            itemId: 'item-kelp',
            batchNo: 'KELP-2609',
            sourceExpiryDate: daysFromNow(400),
          },
          { itemId: 'item-choline', sourceExpiryDate: daysFromNow(500) },
        ],
      });

      expect(result.status).toBe('PACKED');

      const kelp = result.items.find((item) => item.id === 'item-kelp')!;
      expect(kelp.batchNo).toBe('KELP-2609');
      expect(kelp.packedAt).not.toBeNull();
      // 粉剂 6 个月，原瓶还有 400 天，取规则值（约 6 个月后）
      const kelpExpiry = new Date(kelp.packedExpiryDate!);
      expect(kelpExpiry.getTime()).toBeLessThan(new Date(daysFromNow(400)).getTime());

      const choline = result.items.find((item) => item.id === 'item-choline')!;
      // 片剂 9 个月 < 原瓶 500 天，取规则值
      expect(choline.packedExpiryDate).not.toBeNull();
    });

    it('漏填袋子会被拒绝，避免发出没有效期的货', async () => {
      await expect(
        service.packOrder('order-1', {
          items: [{ itemId: 'item-kelp', sourceExpiryDate: daysFromNow(400) }],
        }),
      ).rejects.toThrow(/还有 1 袋没填/);
    });

    it('原瓶剩余保质期低于下限时拒绝分装', async () => {
      await expect(
        service.packOrder('order-1', {
          items: [
            { itemId: 'item-kelp', sourceExpiryDate: daysFromNow(30) },
            { itemId: 'item-choline', sourceExpiryDate: daysFromNow(500) },
          ],
        }),
      ).rejects.toThrow(/不允许分装发货/);
    });

    it('分装行不属于本订单时拒绝', async () => {
      await expect(
        service.packOrder('order-1', {
          items: [
            { itemId: 'item-kelp', sourceExpiryDate: daysFromNow(400) },
            { itemId: 'item-choline', sourceExpiryDate: daysFromNow(500) },
            {
              itemId: '11111111-1111-4111-8111-111111111111',
              sourceExpiryDate: daysFromNow(400),
            },
          ],
        }),
      ).rejects.toThrow(/不属于这张订单/);
    });

    it('未付款的订单不能分装', async () => {
      store.status = 'PENDING_PAYMENT';

      await expect(
        service.packOrder('order-1', {
          items: [
            { itemId: 'item-kelp', sourceExpiryDate: daysFromNow(400) },
            { itemId: 'item-choline', sourceExpiryDate: daysFromNow(500) },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('发货', () => {
    it('已分装的订单填单号后发出', async () => {
      store.status = 'PACKED';

      const result = await service.shipOrder('order-1', {
        trackingNumber: 'YT1234567890',
        carrierCode: 'YTO',
      });

      expect(result.status).toBe('SHIPPED');
      expect(result.trackingNumber).toBe('YT1234567890');
      expect(result.carrierCode).toBe('YTO');
      expect(result.shippedAt).not.toBeNull();
    });

    it('没分装就不能发货', async () => {
      await expect(
        service.shipOrder('order-1', { trackingNumber: 'X' }),
      ).rejects.toThrow(/不能发货/);
    });

    it('单号为空时拒绝', async () => {
      store.status = 'PACKED';

      await expect(
        service.shipOrder('order-1', { trackingNumber: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('取消与售后', () => {
    it('待付款订单可以取消', async () => {
      store.status = 'PENDING_PAYMENT';

      const result = await service.cancelOrder('order-1', {
        reason: '用户改需求',
      });

      expect(result.status).toBe('CANCELLED');
      expect(store.cancellationReason).toBe('用户改需求');
    });

    it('已发货的订单不能直接取消，要走售后', async () => {
      store.status = 'SHIPPED';

      await expect(
        service.cancelOrder('order-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('登记售后会记录类型与原因', async () => {
      store.status = 'SHIPPED';

      const result = await service.markAftersale('order-1', {
        type: 'REFUND',
        reason: '破损',
      });

      expect(result.status).toBe('AFTERSALE');
      expect(result.aftersaleType).toBe('REFUND');
      expect(result.aftersaleReason).toBe('破损');
    });

    it('售后原因是必填的', async () => {
      store.status = 'SHIPPED';

      await expect(
        service.markAftersale('order-1', { type: 'RESHIP', reason: '  ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('分装标签', () => {
    it('未分装时不允许打印标签', async () => {
      await expect(service.getOrderLabels('order-1')).rejects.toThrow(
        /请先完成分装/,
      );
    });

    it('分装后每个补剂出标签，含效期、批号与储存条件', async () => {
      store.status = 'PACKED';
      const packedAt = new Date('2026-09-18T02:00:00Z');
      store.items[0].packedAt = packedAt;
      store.items[0].packedExpiryDate = new Date('2027-03-18T00:00:00Z');
      store.items[0].batchNo = 'B2609-01';
      store.items[1].packedAt = packedAt;
      store.items[1].packedExpiryDate = new Date('2027-06-18T00:00:00Z');

      const result = await service.getOrderLabels('order-1');

      expect(result.orderNo).toBe('SP20260918-001');
      expect(result.brandName).toBe('赛文的食堂');
      expect(result.receiverName).toBe('赵晨');
      expect(result.labels).toHaveLength(2);

      const kelp = result.labels[0];
      expect(kelp.productName).toBe('海藻粉');
      expect(kelp.amountText).toBe('23平勺');
      expect(kelp.packedDate).toBe('2026-09-18');
      expect(kelp.expiryDate).toBe('2027-03-18');
      expect(kelp.batchNo).toBe('B2609-01');
      expect(kelp.storageCondition).toBe('避光、密封、阴凉干燥处保存');
      expect(kelp.sourceProduct).toContain('NOW FOODS');
      expect(kelp.disclaimer).toContain('非直接食用');
      expect(kelp.disclaimer).toContain('干燥剂');
    });

    it('加量后按袋展开：买 3 份就出 3 张，并带「第几袋 / 共几袋」', async () => {
      // 「加量」= 同一个补剂多做几袋**同样规格**的小袋，每袋都要贴一张标签。
      // 之前每个补剂只出一条记录，买 3 份的订单会有 2 袋没标签可贴 ——
      // 分装现场会直接卡住。
      store.status = 'PACKED';
      const packedAt = new Date('2026-09-18T02:00:00Z');
      store.items[0].packedAt = packedAt;
      store.items[0].packedExpiryDate = new Date('2027-03-18T00:00:00Z');
      store.items[0].bags = 3;
      store.items[1].packedAt = packedAt;
      store.items[1].packedExpiryDate = new Date('2027-06-18T00:00:00Z');
      store.items[1].bags = 1;

      const result = await service.getOrderLabels('order-1');

      // 3 袋 + 1 袋
      expect(result.labels).toHaveLength(4);
      // 列表 key 用它，必须唯一
      expect(new Set(result.labels.map((l) => l.labelId)).size).toBe(4);

      const kelp = result.labels.filter((l) => l.productName === '海藻粉');
      expect(kelp.map((l) => l.bagIndex)).toEqual([1, 2, 3]);
      expect(kelp.every((l) => l.bagTotal === 3)).toBe(true);
      // 每袋用量是同一个数：加量乘的是成本，不是量，袋子规格不变
      expect(new Set(kelp.map((l) => l.amountText)).size).toBe(1);
      expect(kelp[0].amountText).toBe('23平勺');

      const choline = result.labels.filter((l) => l.productName === '胆碱片');
      expect(choline).toHaveLength(1);
      expect(choline[0].bagIndex).toBe(1);
      expect(choline[0].bagTotal).toBe(1);
    });

    it('订单行没存储存条件时用默认值兜底', async () => {
      store.status = 'PACKED';
      store.items.forEach((item: any) => {
        item.packedAt = new Date('2026-09-18T02:00:00Z');
        item.packedExpiryDate = new Date('2027-03-18T00:00:00Z');
        (item as any).storageCondition = null;
      });

      const result = await service.getOrderLabels('order-1');

      expect(result.labels[0].storageCondition).toBe('避光、密封、阴凉干燥处保存');
    });

    it('订单不存在时报 404', async () => {
      await expect(service.getOrderLabels('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('工作台角标', () => {
    it('按状态汇总数量', async () => {
      mockPrismaService.supplementOrder.groupBy.mockResolvedValue([
        { status: 'PENDING_PAYMENT', _count: { _all: 3 } },
        { status: 'PAID', _count: { _all: 2 } },
        { status: 'PACKED', _count: { _all: 1 } },
      ]);

      const counts = await service.getStatusCounts();

      expect(counts).toEqual({ PENDING_PAYMENT: 3, PAID: 2, PACKED: 1 });
    });
  });
});
