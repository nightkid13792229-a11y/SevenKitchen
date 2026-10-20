import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CustomRecipeConfigService,
  CUSTOM_RECIPE_CONFIG_ID,
  DEFAULT_MULTI_RECIPE_DISCOUNTS,
} from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CUSTOM_RECIPE_CONFIG_ID,
    feeAmount: 300,
    deliveryWorkDays: 3,
    dailyCapacity: 4,
    paymentTimeoutMinutes: 30,
    // ===== 批次 1.4 新增 =====
    dailyDeliveryCapacity: 4,
    aftersaleWindowDays: 7,
    // 2026-10-18 新增的三个（配置页「5 加」里缺的）
    aftersaleOverdueHours: 48,
    allowRefundBeforeDelivery: true,
    messageCenterEnabled: true,
    freeRevisionCount: 2,
    freeRevisionWindowDays: 7,
    autoCompleteDays: 3,
    requireCustomerConfirm: true,
    deliveryItemCodes: ['RECIPE', 'SHOPPING_SOP', 'NUTRITION_REPORT'],
    attachmentMaxCount: 9,
    attachmentMaxSizeMb: 10,
    defaultNutritionStandard: 'FEDIAF_2025',
    defaultEnergyDensityKcalPerKg: 3200,
    productionLossRate: 1.07,
    defaultLaborHours: 2,
    scheduleLookaheadDays: 45,
    slotRetryTimes: 5,
    orderNoPrefix: 'CR',
    // ===== 2026-10-20 多份购买 =====
    multiRecipeEnabled: false,
    maxRecipeQuantity: 5,
    multiRecipeDiscounts: DEFAULT_MULTI_RECIPE_DISCOUNTS,
    dailyDesignMinutes: 480,
    minutesPerRecipe: 96,
    createdAt: new Date('2026-09-25T00:00:00Z'),
    updatedAt: new Date('2026-09-25T00:00:00Z'),
    ...overrides,
  };
}

describe('CustomRecipeConfigService', () => {
  let service: CustomRecipeConfigService;

  const mockPrismaService = {
    customRecipeConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeConfigService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get(CustomRecipeConfigService);
    jest.clearAllMocks();
  });

  describe('getConfig', () => {
    it('creates the singleton with defaults on first access', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(null);
      mockPrismaService.customRecipeConfig.create.mockResolvedValue(
        buildRow(),
      );

      const config = await service.getConfig();

      expect(mockPrismaService.customRecipeConfig.create).toHaveBeenCalledWith({
        data: { id: CUSTOM_RECIPE_CONFIG_ID },
      });
      expect(config.feeAmount).toBe(300);
      // 2026-10-20：可抵扣金额整体删除，配置里不得再出现
      expect(config).not.toHaveProperty('creditAmount');
      expect(config.deliveryWorkDays).toBe(3);
      expect(config.dailyCapacity).toBe(4);
      expect(config.paymentTimeoutMinutes).toBe(30);
    });

    it('coerces Prisma Decimal values to numbers', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({ feeAmount: '300.5' }),
      );

      const config = await service.getConfig();

      expect(config.feeAmount).toBe(300.5);
    });
  });

  describe('getPublicConfig', () => {
    it('only exposes the fields the mini program needs', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({ feeAmount: 300, dailyCapacity: 7 }),
      );

      const config = await service.getPublicConfig();

      expect(config).toEqual({
        feeAmount: 300,
        deliveryWorkDays: 3,
        /**
         * 2026-10-04：支付时限改为**对外公开**。
         * 订单超时会被自动取消，但此前这个值只存在于后台，
         * 小程序无法提示"请在 X 分钟内支付"，顾客被关单时一头雾水。
         */
        paymentTimeoutMinutes: 30,
        // 订阅消息模板 ID：未配置环境变量时为 null，小程序据此跳过订阅申请
        orderNotifyTemplateId: null,

        /**
         * 2026-10-18 新增的三个 —— 它们是**给顾客看的政策**，所以公开：
         *   · 售后超时小时数 = 我们对顾客的响应承诺
         *   · 交付前可无理由退 = 下单页要说清楚
         *   · 消息中心开关 = 关了就藏入口
         */
        aftersaleOverdueHours: 48,
        allowRefundBeforeDelivery: true,
        messageCenterEnabled: true,

        /**
         * 2026-10-16（批次 1.4）：顾客确实需要知道的几个。
         * 每一个都写明了"为什么要给顾客"，没有理由的不进这份白名单。
         */
        attachmentMaxCount: 9, // 小程序要据此限制上传张数
        autoCompleteDays: 3, // 顾客要知道"几天内确认"
        requireCustomerConfirm: true, // 决定是否显示「确认收到」
        aftersaleWindowDays: 7, // 顾客要知道还能不能提售后（2026-10-18：30→7）
        freeRevisionCount: 2, // 售后页要写明免费改几次（2026-10-18：1→2）
        freeRevisionWindowDays: 7, // 以及几天内有效

        /**
         * 2026-10-20 多份购买：小程序确认页要据此决定是否显示份数选择器、
         * 最多能选几份、以及展示哪几档优惠文案。
         */
        multiRecipeEnabled: false,
        maxRecipeQuantity: 5,
        multiRecipeDiscounts: [
          { quantity: 2, discountRate: 0.05, label: '2 份享 95 折' },
          { quantity: 3, discountRate: 0.08, label: '3 份享 92 折' },
          { quantity: 4, discountRate: 0.1, label: '4 份享 9 折' },
          { quantity: 5, discountRate: 0.12, label: '5 份享 88 折' },
        ],
      });

      /**
       * 内部参数**一律不得外泄**。这条断言是这张白名单的意义所在：
       * 用 `toEqual` 锁死整个形状，将来谁往公开接口里加字段都会在这里红掉，
       * 而不是悄悄把产能/成本参数发出去。
       */
      for (const internal of [
        // 2026-10-20：定制费抵扣已取消，公开配置里也不该再有
        'creditAmount',
        'dailyCapacity',
        'dailyDeliveryCapacity',
        'productionLossRate',
        'defaultEnergyDensityKcalPerKg',
        'defaultLaborHours',
        'defaultNutritionStandard',
        'scheduleLookaheadDays',
        'slotRetryTimes',
        'orderNoPrefix',
        // 设计工时是内部产能参数，顾客不需要知道
        'dailyDesignMinutes',
        'minutesPerRecipe',
      ]) {
        expect(config).not.toHaveProperty(internal);
      }
    });
  });

  describe('updateConfig', () => {
    it('rejects a negative fee', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );

      await expect(
        service.updateConfig({ feeAmount: -1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an out-of-range delivery work days value', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );

      await expect(
        service.updateConfig({ deliveryWorkDays: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateConfig({ deliveryWorkDays: 61 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an out-of-range daily capacity', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );

      await expect(
        service.updateConfig({ dailyCapacity: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts payment timeout 0 as "do not auto close"', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );
      mockPrismaService.customRecipeConfig.upsert.mockResolvedValue(
        buildRow({ paymentTimeoutMinutes: 0 }),
      );

      const config = await service.updateConfig({ paymentTimeoutMinutes: 0 });

      expect(config.paymentTimeoutMinutes).toBe(0);
    });

    it('rejects a payment timeout beyond 24 hours', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );

      await expect(
        service.updateConfig({ paymentTimeoutMinutes: 1441 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
  /**
   * 批次 1.4 新增参数的校验（2026-10-16）。
   *
   * 这些参数原先写死在代码里，加校验的意义是：
   * **后台能改的东西变多了，配错的机会也变多了** ——
   * 填一个 0.5 的损耗率，生产就要按"做出来比投料还多"去算料。
   */
  describe('updateConfig · 批次 1.4 新增参数', () => {
    beforeEach(() => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );
    });

    it('接受一组合法的完整参数并原样写回', async () => {
      mockPrismaService.customRecipeConfig.upsert.mockImplementation(
        async ({ update }: { update: Record<string, unknown> }) => ({
          ...buildRow(),
          ...update,
        }),
      );

      const result = await service.updateConfig({
        dailyDeliveryCapacity: 3,
        aftersaleWindowDays: 45,
        freeRevisionCount: 2,
        freeRevisionWindowDays: 10,
        autoCompleteDays: 5,
        requireCustomerConfirm: false,
        deliveryItemCodes: ['RECIPE'],
        attachmentMaxCount: 6,
        attachmentMaxSizeMb: 20,
        defaultNutritionStandard: 'AAFCO_2022',
        defaultEnergyDensityKcalPerKg: 3500,
        productionLossRate: 1.1,
        defaultLaborHours: 3,
        scheduleLookaheadDays: 60,
        slotRetryTimes: 8,
        orderNoPrefix: 'SK',
      });

      expect(result.dailyDeliveryCapacity).toBe(3);
      expect(result.autoCompleteDays).toBe(5);
      expect(result.requireCustomerConfirm).toBe(false);
      expect(result.productionLossRate).toBeCloseTo(1.1);
      expect(result.orderNoPrefix).toBe('SK');
    });

    describe('★ 跨字段规则：免费调整窗口不能超过售后窗口', () => {
      it('超出时报错，并把两个数都写出来（客服照着就能改对）', async () => {
        await expect(
          service.updateConfig({
            aftersaleWindowDays: 10,
            freeRevisionWindowDays: 30,
          }),
        ).rejects.toThrow(/免费调整窗口（30 天）不能超过售后窗口（10 天）/);
      });

      it('和**库里已有的**售后窗口比，而不只是比同一次请求里的值', async () => {
        // 库里售后窗口是 30 天，这次只想把免费窗口改成 60 —— 也必须被拦住
        mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
          buildRow({ aftersaleWindowDays: 30 }),
        );

        await expect(
          service.updateConfig({ freeRevisionWindowDays: 60 }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('相等是允许的（免费期 = 整个售后期）', async () => {
        mockPrismaService.customRecipeConfig.upsert.mockImplementation(
          async ({ update }: { update: Record<string, unknown> }) => ({
            ...buildRow(),
            ...update,
          }),
        );

        await expect(
          service.updateConfig({
            aftersaleWindowDays: 20,
            freeRevisionWindowDays: 20,
          }),
        ).resolves.toBeDefined();
      });
    });

    it('交付物一样都不留会被拒绝（顾客收到的是空的，后台却显示已交付）', async () => {
      await expect(
        service.updateConfig({ deliveryItemCodes: [] }),
      ).rejects.toThrow(/至少要留一样/);
    });

    it('交付物不是字符串数组会被拒绝', async () => {
      await expect(
        service.updateConfig({
          deliveryItemCodes: [1, 2] as unknown as string[],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    describe('损耗率必须是 ≥1 的系数', () => {
      it('小于 1 被拒（"做出来比投料还多"物理上不成立）', async () => {
        await expect(
          service.updateConfig({ productionLossRate: 0.9 }),
        ).rejects.toThrow(/1\.07 表示损耗 7%/);
      });

      it('大于 2 被拒（超过 100% 的损耗只可能是填错了）', async () => {
        await expect(
          service.updateConfig({ productionLossRate: 2.5 }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('1 是允许的（没有损耗）', async () => {
        mockPrismaService.customRecipeConfig.upsert.mockImplementation(
          async ({ update }: { update: Record<string, unknown> }) => ({
            ...buildRow(),
            ...update,
          }),
        );
        await expect(
          service.updateConfig({ productionLossRate: 1 }),
        ).resolves.toBeDefined();
      });
    });

    describe('业务编号前缀', () => {
      it('必须是大写字母（顾客要照着念、客服要照着查）', async () => {
        for (const bad of ['cr', 'C R', 'CR-', '', 'ABCDEFGHI', '1C']) {
          await expect(
            service.updateConfig({ orderNoPrefix: bad }),
          ).rejects.toBeInstanceOf(BadRequestException);
        }
      });

      it('CR / SK 这类正常值可以', async () => {
        mockPrismaService.customRecipeConfig.upsert.mockImplementation(
          async ({ update }: { update: Record<string, unknown> }) => ({
            ...buildRow(),
            ...update,
          }),
        );
        await expect(
          service.updateConfig({ orderNoPrefix: 'SK' }),
        ).resolves.toBeDefined();
      });
    });

    it('几个数值参数的上下界', async () => {
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ dailyDeliveryCapacity: 0 }, '每日交付上限'],
        [{ dailyDeliveryCapacity: 201 }, '每日交付上限'],
        [{ autoCompleteDays: 0 }, '自动完成天数'],
        [{ autoCompleteDays: 91 }, '自动完成天数'],
        [{ attachmentMaxCount: 0 }, '附件张数上限'],
        [{ attachmentMaxSizeMb: 51 }, '附件大小上限'],
        [{ scheduleLookaheadDays: 3 }, '排期往前找'],
        [{ slotRetryTimes: 0 }, '占位重试次数'],
        [{ defaultEnergyDensityKcalPerKg: 100 }, '默认能量密度'],
        [{ freeRevisionCount: 21 }, '免费调整次数'],
      ];

      for (const [payload, keyword] of cases) {
        await expect(
          service.updateConfig(payload as never),
        ).rejects.toThrow(new RegExp(keyword));
      }
    });

    it('默认营养标准不能是空白', async () => {
      await expect(
        service.updateConfig({ defaultNutritionStandard: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  /**
   * 2026-10-20 多份购买（第一阶段：价格与配置）。
   *
   * 这一层只负责**把配置读对、写对、挡掉坏值**；折扣金额的计算在
   * `CustomRecipePricingService`（Task 2）里。所以这里只断言默认值、
   * 兜底值和保存校验，不涉及任何金额。
   */
  describe('多份购买与设计工时（2026-10-20）', () => {
    beforeEach(() => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow(),
      );
      mockPrismaService.customRecipeConfig.upsert.mockImplementation(
        async ({ update }: { update: Record<string, unknown> }) => ({
          ...buildRow(),
          ...update,
        }),
      );
    });

    it('多份配置默认关闭，最多 5 份，默认优惠档位可读', async () => {
      const config = await service.getConfig();
      expect(config.multiRecipeEnabled).toBe(false);
      expect(config.maxRecipeQuantity).toBe(5);
      expect(config.multiRecipeDiscounts).toEqual([
        { quantity: 2, discountRate: 0.05, label: '2 份享 95 折' },
        { quantity: 3, discountRate: 0.08, label: '3 份享 92 折' },
        { quantity: 4, discountRate: 0.1, label: '4 份享 9 折' },
        { quantity: 5, discountRate: 0.12, label: '5 份享 88 折' },
      ]);
      expect(config.dailyDesignMinutes).toBe(480);
      expect(config.minutesPerRecipe).toBe(96);
    });

    it('老配置行缺少新字段时退兜底值，不返回 undefined/NaN', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({
          multiRecipeEnabled: undefined,
          maxRecipeQuantity: undefined,
          multiRecipeDiscounts: undefined,
          dailyDesignMinutes: undefined,
          minutesPerRecipe: undefined,
        }),
      );

      const config = await service.getConfig();

      expect(config.multiRecipeEnabled).toBe(false);
      expect(config.maxRecipeQuantity).toBe(5);
      expect(config.multiRecipeDiscounts).toEqual(
        DEFAULT_MULTI_RECIPE_DISCOUNTS,
      );
      expect(config.dailyDesignMinutes).toBe(480);
      expect(config.minutesPerRecipe).toBe(96);
    });

    it('库里 maxRecipeQuantity 是坏值时退 5，合法值原样读出', async () => {
      for (const bad of [0, 6, 99, 2.5, Number.NaN, 'abc', null]) {
        mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
          buildRow({ maxRecipeQuantity: bad }),
        );
        await expect(service.getConfig()).resolves.toMatchObject({
          maxRecipeQuantity: 5,
        });
      }

      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({ maxRecipeQuantity: 3 }),
      );
      await expect(service.getConfig()).resolves.toMatchObject({
        maxRecipeQuantity: 3,
      });
    });

    it('库里优惠档位损坏或为空时退默认档位（坏配置不能进报价）', async () => {
      const brokenValues: unknown[] = [
        'not-json',
        { quantity: 2 },
        [{ quantity: 1, discountRate: 0.05, label: '1 份' }],
        [{ quantity: 2, discountRate: 0.5, label: '2 份' }],
        [{ quantity: 2, discountRate: -0.05, label: '2 份' }],
        [],
      ];

      for (const broken of brokenValues) {
        mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
          buildRow({ multiRecipeDiscounts: broken }),
        );
        await expect(service.getConfig()).resolves.toMatchObject({
          multiRecipeDiscounts: DEFAULT_MULTI_RECIPE_DISCOUNTS,
        });
      }
    });

    it('优惠档位读出时按份数升序排列', async () => {
      mockPrismaService.customRecipeConfig.findUnique.mockResolvedValue(
        buildRow({
          multiRecipeDiscounts: [tier(4, 0.1), tier(2, 0.05)],
        }),
      );

      const config = await service.getConfig();

      expect(config.multiRecipeDiscounts.map((item) => item.quantity)).toEqual([
        2, 4,
      ]);
    });

    it('maxRecipeQuantity 只接受 1~5 的整数', async () => {
      for (const bad of [0, 6, -1, 1.5, 5.0001]) {
        await expect(
          service.updateConfig({ maxRecipeQuantity: bad }),
        ).rejects.toThrow(/最多份数/);
      }

      await expect(
        service.updateConfig({ maxRecipeQuantity: 3 }),
      ).resolves.toMatchObject({ maxRecipeQuantity: 3 });
    });

    it('多份开关只接受布尔值', async () => {
      await expect(
        service.updateConfig({
          multiRecipeEnabled: 'yes' as unknown as boolean,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('保存时五个多份/设计工时字段都写回数据库', async () => {
      const tiers = [
        tier(2, 0.04, '2 份享 96 折'),
        tier(3, 0.06, '3 份享 94 折'),
        tier(4, 0.08, '4 份享 92 折'),
        tier(5, 0.1, '5 份享 9 折'),
      ];

      const saved = await service.updateConfig({
        multiRecipeEnabled: true,
        maxRecipeQuantity: 4,
        multiRecipeDiscounts: tiers,
        dailyDesignMinutes: 360,
        minutesPerRecipe: 90,
      });

      expect(
        mockPrismaService.customRecipeConfig.upsert,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            multiRecipeEnabled: true,
            maxRecipeQuantity: 4,
            multiRecipeDiscounts: tiers,
            dailyDesignMinutes: 360,
            minutesPerRecipe: 90,
          }),
        }),
      );
      expect(saved).toMatchObject({
        multiRecipeEnabled: true,
        maxRecipeQuantity: 4,
        multiRecipeDiscounts: tiers,
        dailyDesignMinutes: 360,
        minutesPerRecipe: 90,
      });
    });

    it('非法优惠档位一律拒绝（重复份数 / 折扣下降 / 超 20% / 0 折 / 1 份）', async () => {
      const cases: Array<[string, unknown]> = [
        ['重复份数', [tier(2, 0.05), tier(2, 0.08)]],
        ['折扣下降', [tier(2, 0.12), tier(3, 0.05)]],
        ['超过 20%', [tier(2, 0.21)]],
        ['折扣为 0', [tier(2, 0)]],
        ['1 份不允许折扣', [tier(1, 0.05)]],
        ['6 份超过硬上限', [tier(6, 0.05)]],
        ['份数必须是整数', [tier(2.5, 0.05)]],
        [
          '折扣率必须是数字',
          [{ quantity: 2, discountRate: '0.05', label: '2 份' }],
        ],
      ];

      for (const [reason, discounts] of cases) {
        await expect(
          service.updateConfig({
            multiRecipeDiscounts: discounts as never,
          }),
        ).rejects.toThrow(/优惠配置不合法/);
      }
    });

    it('档位不必四档齐全，但份数必须升序、折扣不能降低（可以持平）', async () => {
      await expect(
        service.updateConfig({
          multiRecipeDiscounts: [tier(2, 0.05), tier(4, 0.1)],
        }),
      ).resolves.toBeDefined();

      await expect(
        service.updateConfig({
          multiRecipeDiscounts: [tier(2, 0.05), tier(3, 0.05)],
        }),
      ).resolves.toBeDefined();
    });

    it('设计工时必须是正整数', async () => {
      for (const bad of [0, -1, 1.5, Number.NaN]) {
        await expect(
          service.updateConfig({ dailyDesignMinutes: bad }),
        ).rejects.toThrow(/每日设计工时/);
        await expect(
          service.updateConfig({ minutesPerRecipe: bad }),
        ).rejects.toThrow(/每份设计工时/);
      }
    });
  });
});

function tier(quantity: number, discountRate: number, label = `${quantity} 份`) {
  return { quantity, discountRate, label };
}

