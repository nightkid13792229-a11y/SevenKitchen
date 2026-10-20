import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CustomRecipeConfigService,
  CUSTOM_RECIPE_CONFIG_ID,
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
});
