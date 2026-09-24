import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupplementOrderService } from '../../../src/application/supplement-shop/supplement-order.service';
import { SupplementPricingService } from '../../../src/application/supplement-shop/supplement-pricing.service';
import { SupplementShopConfigService } from '../../../src/application/supplement-shop/supplement-shop-config.service';
import { ShippingService } from '../../../src/application/shipping/shipping.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import type { SupplementShopConfigDto } from '../../../src/application/supplement-shop/supplement-shop-config.service';
import { TimezoneUtil } from '../../../src/utils/timezone.util';

const KELP_ID = 'b5cf5421-69a7-47fc-a926-8722d9b7bcc2';
const CHOLINE_ID = 'a086e0d6-2765-4376-afac-b05483ba9ae9';
const OFFLINE_ID = 'ffffffff-1111-2222-3333-444444444444';

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

function kelpIngredient(overrides: Record<string, unknown> = {}) {
  return {
    id: KELP_ID,
    name: '海藻粉',
    brand: 'NOW FOODS',
    productModel: '227g/瓶，450mcg碘/平勺，2522平勺/瓶',
    type: 'SUPPLEMENT',
    baseUnit: 'PCS',
    unitDisplayLabel: '平勺',
    purchaseUnit: '瓶',
    purchaseToBaseRatio: 2522,
    currentPricePerPurchaseUnit: 89.41,
    physicalForm: 'POWDER',
    supplementRetailEnabled: true,
    properties: { display_unit: '平勺' },
    ...overrides,
  };
}

describe('SupplementOrderService', () => {
  let service: SupplementOrderService;
  let createdOrders: any[];

  const mockPrismaService = {
    ingredient: { findMany: jest.fn() },
    address: { findUnique: jest.fn() },
    supplementOrder: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    orderSequence: { upsert: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  const mockConfigService = { getConfig: jest.fn() };
  const mockShippingService = { calculateShippingFeePreview: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplementOrderService,
        SupplementPricingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SupplementShopConfigService, useValue: mockConfigService },
        { provide: ShippingService, useValue: mockShippingService },
      ],
    }).compile();

    service = module.get(SupplementOrderService);
    jest.clearAllMocks();

    createdOrders = [];

    mockConfigService.getConfig.mockResolvedValue(config());
    mockPrismaService.ingredient.findMany.mockResolvedValue([
      kelpIngredient(),
      kelpIngredient({
        id: CHOLINE_ID,
        name: '胆碱片',
        brand: "NATURE'S WAY",
        productModel: '500mg胆碱/片 100 片/瓶',
        baseUnit: 'PCS',
        unitDisplayLabel: '片',
        purchaseToBaseRatio: 100,
        currentPricePerPurchaseUnit: 99.6,
        physicalForm: 'TABLET',
      }),
      kelpIngredient({
        id: OFFLINE_ID,
        name: '海带片',
        supplementRetailEnabled: false,
      }),
    ]);
    mockPrismaService.address.findUnique.mockResolvedValue({
      id: 'addr-1',
      userId: 'user-1',
      recipientName: '张三',
      phone: '13800000000',
      region: { province: '广东省', city: '深圳市', district: '南山区' },
      detail: '科技园 1 号',
    });
    mockPrismaService.orderSequence.upsert.mockResolvedValue({
      dateKey: '20260918',
      lastSeq: 7,
    });
    mockPrismaService.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrismaService),
    );
    mockPrismaService.supplementOrder.create.mockImplementation(
      async ({ data }: any) => {
        const itemsCreate = data.items?.create || [];
        const row = {
          id: 'order-uuid-1',
          createdAt: new Date('2026-09-18T10:00:00Z'),
          ...data,
          itemsCreate,
          items: itemsCreate.map((item: any, index: number) => ({
            id: `item-${index}`,
            createdAt: new Date('2026-09-18T10:00:00Z'),
            batchNo: null,
            sourceExpiryDate: null,
            packedExpiryDate: null,
            packedAt: null,
            ...item,
          })),
        };
        createdOrders.push(row);
        return { id: row.id };
      },
    );
    mockPrismaService.supplementOrder.findFirst.mockImplementation(
      async ({ where }: any) => {
        const found = createdOrders.find(
          (row) => row.id === where.id && row.userId === where.userId,
        );
        return found ?? null;
      },
    );
    mockPrismaService.supplementOrder.findUnique.mockImplementation(
      async ({ where }: any) =>
        createdOrders.find((row) => row.id === where.id) ?? null,
    );
    mockPrismaService.supplementOrder.findMany.mockResolvedValue([]);
    mockPrismaService.supplementOrder.count.mockResolvedValue(0);
    mockShippingService.calculateShippingFeePreview.mockResolvedValue({
      amountShipping: 8,
      templateId: 'tpl',
      ruleAppliedDescription: '一口价',
    });
  });

  describe('报价', () => {
    it('用服务端档案现算价格，客户端只需给 id 和用量', async () => {
      const result = await service.quote({
        lines: [{ ingredientId: KELP_ID, amount: 22.7 }],
      });

      expect(result.enabled).toBe(true);
      expect(result.unavailable).toEqual([]);
      expect(result.quote.lines).toHaveLength(1);
      expect(result.quote.lines[0].name).toBe('海藻粉');
      expect(result.quote.lines[0].unit).toBe('平勺');
      expect(result.quote.lines[0].packedAmount).toBe(23);
      expect(result.quote.lines[0].price).toBe(1.7);
      // 2026-09-24：运费向客户收取并逐项展示。fixture 没设包邮门槛 → 收一口价 8 元
      expect(result.quote.freeShipping).toBe(false);
      expect(result.quote.shippingFee).toBe(8);
      expect(result.quote.total).toBeCloseTo(1.7 + 9.9 + 8, 2);
    });

    it('加量：份数翻倍，服务费不变，袋数翻倍', async () => {
      const result = await service.quote({
        lines: [{ ingredientId: KELP_ID, amount: 22.7 }],
        portionMultiplier: 3,
        cycleDays: 30,
      });

      expect(result.quote.portionMultiplier).toBe(3);
      expect(result.quote.totalDays).toBe(90);
      // 服务费按单收，加量后仍是 9.9 —— 这正是加量的意义所在
      expect(result.quote.serviceFee).toBe(9.9);
      expect(result.quote.bagCount).toBe(3);
      expect(result.quote.perDayCost).not.toBeNull();
    });

    it('加量：份数超过天数上限时直接拒绝并说明原因', async () => {
      // 40 天量 × 3 份 = 120 天，超过 90 天效期安全线
      await expect(
        service.quote({
          lines: [{ ingredientId: KELP_ID, amount: 22.7 }],
          portionMultiplier: 3,
          cycleDays: 40,
        }),
      ).rejects.toThrow(/最多只能买 2 份/);
    });

    it('加量：份数超过配置上限时直接拒绝', async () => {
      await expect(
        service.quote({
          lines: [{ ingredientId: KELP_ID, amount: 22.7 }],
          portionMultiplier: 5,
          cycleDays: 7,
        }),
      ).rejects.toThrow(/最多只能买 3 份/);
    });

    it('加量：份数必须是正整数，0 和负数直接拒绝', async () => {
      for (const bad of [0, -1]) {
        await expect(
          service.quote({
            lines: [{ ingredientId: KELP_ID, amount: 22.7 }],
            portionMultiplier: bad,
            cycleDays: 30,
          }),
        ).rejects.toThrow(/不小于 1 的整数/);
      }
    });

    it('未上架的补剂进入 unavailable，但其余仍可报价', async () => {
      const result = await service.quote({
        lines: [
          { ingredientId: KELP_ID, amount: 10 },
          { ingredientId: OFFLINE_ID, amount: 5 },
        ],
      });

      expect(result.quote.lines).toHaveLength(1);
      expect(result.unavailable).toHaveLength(1);
      expect(result.unavailable[0].reason).toBe('暂未开放购买');
    });

    it('完全不存在的补剂会被标记为不存在', async () => {
      const result = await service.quote({
        lines: [
          { ingredientId: KELP_ID, amount: 10 },
          { ingredientId: '00000000-0000-0000-0000-000000000000', amount: 5 },
        ],
      });

      expect(result.unavailable[0].reason).toBe('补剂不存在');
    });

    it('同一补剂多行会被合并，避免重复分装', async () => {
      const result = await service.quote({
        lines: [
          { ingredientId: KELP_ID, amount: 10 },
          { ingredientId: KELP_ID, amount: 12.7 },
        ],
      });

      expect(result.quote.lines).toHaveLength(1);
      expect(result.quote.lines[0].requestedAmount).toBeCloseTo(22.7, 6);
      expect(result.quote.lines[0].packedAmount).toBe(23);
    });

    it('完全没有可买补剂时直接拒绝', async () => {
      await expect(
        service.quote({ lines: [{ ingredientId: OFFLINE_ID, amount: 5 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('用量不合法时拒绝', async () => {
      await expect(
        service.quote({ lines: [{ ingredientId: KELP_ID, amount: 0 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.quote({ lines: [{ ingredientId: KELP_ID, amount: Number.NaN }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('空清单拒绝', async () => {
      await expect(service.quote({ lines: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  /**
   * 自动关单的查询（2026-09-24 补的缺口）
   *
   * 背景：补剂订单原先**完全不在自动关单的覆盖范围内** —— 定时任务只查鲜食订单。
   * 用户提交补剂单不付款、又不再打开，就会永远挂在「待付款」。
   */
  describe('超时未付款订单查询', () => {
    it('按超时分钟过滤，只取待付款的', async () => {
      mockPrismaService.supplementOrder.findMany.mockResolvedValue([]);

      await service.findExpiredUnpaidOrders(30);

      const args = mockPrismaService.supplementOrder.findMany.mock.calls[0][0];
      expect(args.where.status).toBe('PENDING_PAYMENT');
      expect(args.where.createdAt.lt).toBeInstanceOf(Date);
      // 截止时间应该约等于「现在 - 30 分钟」
      const cutoff = args.where.createdAt.lt.getTime();
      expect(Math.abs(cutoff - (Date.now() - 30 * 60 * 1000))).toBeLessThan(5000);
    });

    it('超时配成 0（不自动关单）时不查库，直接返回空', async () => {
      mockPrismaService.supplementOrder.findMany.mockClear();

      expect(await service.findExpiredUnpaidOrders(0)).toEqual([]);
      expect(mockPrismaService.supplementOrder.findMany).not.toHaveBeenCalled();
    });

    it('超时是负数或非法值时不查库', async () => {
      mockPrismaService.supplementOrder.findMany.mockClear();
      expect(await service.findExpiredUnpaidOrders(-5)).toEqual([]);
      expect(await service.findExpiredUnpaidOrders(Number.NaN)).toEqual([]);
      expect(mockPrismaService.supplementOrder.findMany).not.toHaveBeenCalled();
    });
  });

  describe('下单', () => {
    const baseRequest = {
      addressId: 'addr-1',
      lines: [
        { ingredientId: KELP_ID, amount: 22.7 },
        { ingredientId: CHOLINE_ID, amount: 5.48 },
      ],
      recipeId: 'recipe-1',
      recipeName: '萝卜绿豆鸭胸猪里脊',
      dogId: 'dog-1',
      dogName: '拿铁',
      cycleDays: 7,
    };

    it('加量：订单落库记录份数与总天数（总天数是下单时快照，不做派生）', async () => {
      await service.createOrder('user-1', {
        ...baseRequest,
        portionMultiplier: 3,
      });

      // 7 天量 × 3 份 = 21 天，袋数 = 2 种 × 3 份 = 6
      expect(createdOrders[0].portionMultiplier).toBe(3);
      expect(createdOrders[0].totalDays).toBe(21);
      expect(createdOrders[0].bagCount).toBe(6);
    });

    it('加量：不加量时份数为 1，总天数等于制作单天数', async () => {
      await service.createOrder('user-1', baseRequest);

      expect(createdOrders[0].portionMultiplier).toBe(1);
      expect(createdOrders[0].totalDays).toBe(7);
    });

    it('生成 SP 前缀订单号并写入订单行快照', async () => {
      const order = await service.createOrder('user-1', baseRequest);

      expect(mockPrismaService.orderSequence.upsert).toHaveBeenCalled();
      // 订单号里的日期取自"当天"（上海时区），不能写死某一天，
      // 否则这个断言只在写测试的那一天成立、之后每天都失败。
      const todayKey = TimezoneUtil.toShanghaiDateString(new Date()).replace(/-/g, '');
      expect(createdOrders[0].orderNo).toBe(`SP${todayKey}-007`);
      expect(createdOrders[0].status).toBe('PENDING_PAYMENT');
      expect(createdOrders[0].itemsCreate).toHaveLength(2);

      // 海藻粉 23 平勺 × 0.03545 ≈ 0.82 成本 → 售价 1.70
      const kelpItem = createdOrders[0].itemsCreate[0];
      expect(kelpItem.name).toBe('海藻粉');
      expect(kelpItem.brand).toBe('NOW FOODS');
      expect(kelpItem.packedAmount).toBe(23);
      expect(kelpItem.price).toBe(1.7);
      expect(kelpItem.shelfLifeMonths).toBe(6);

      // 胆碱片 6 片 × 0.996 = 5.976 → ×2 → 12.00，效期取固体系数
      const cholineItem = createdOrders[0].itemsCreate[1];
      expect(cholineItem.packedAmount).toBe(6);
      expect(cholineItem.price).toBe(12);
      expect(cholineItem.shelfLifeMonths).toBe(9);

      expect(order.orderNo).toBe(`SP${todayKey}-007`);
      expect(order.receiverName).toBe('张三');
      expect(order.receiverRegion).toBe('广东省 深圳市 南山区');
      expect(order.items).toHaveLength(2);
    });

    it('把下单时的定价配置写进快照', async () => {
      await service.createOrder('user-1', baseRequest);

      const snapshot = createdOrders[0].pricingSnapshot;
      expect(snapshot.markupMultiplier).toBe(2);
      expect(snapshot.serviceFeeMode).toBe('PER_ORDER');
      expect(snapshot.flatShippingFee).toBe(8);
    });

    it('商城关闭时不能下单', async () => {
      mockConfigService.getConfig.mockResolvedValue(config({ enabled: false }));

      await expect(
        service.createOrder('user-1', baseRequest),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createdOrders).toHaveLength(0);
    });

    it('低于最低起送金额时不能下单', async () => {
      mockConfigService.getConfig.mockResolvedValue(
        config({ minOrderAmount: 999 }),
      );

      await expect(
        service.createOrder('user-1', baseRequest),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createdOrders).toHaveLength(0);
    });

    it('清单里有不可购买补剂时拒绝下单并说明原因', async () => {
      await expect(
        service.createOrder('user-1', {
          ...baseRequest,
          lines: [...baseRequest.lines, { ingredientId: OFFLINE_ID, amount: 3 }],
        }),
      ).rejects.toThrow(/暂未开放购买/);
      expect(createdOrders).toHaveLength(0);
    });

    it('收货地址不属于当前用户时拒绝', async () => {
      mockPrismaService.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'someone-else',
        recipientName: '李四',
        phone: '13900000000',
        region: {},
        detail: '',
      });

      await expect(
        service.createOrder('user-1', baseRequest),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createdOrders).toHaveLength(0);
    });
  });

  describe('查询', () => {
    it('别人的订单查不到', async () => {
      await service.createOrder('user-1', {
        addressId: 'addr-1',
        lines: [{ ingredientId: KELP_ID, amount: 10 }],
      });

      await expect(
        service.getOrder('user-2', 'order-uuid-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('列表分页参数被收敛到合法范围', async () => {
      await service.listOrders('user-1', { page: -5, pageSize: 9999 });

      expect(mockPrismaService.supplementOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );
    });
  });
});
