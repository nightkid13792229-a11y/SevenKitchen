import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SupplementPricingService,
  roundPrice,
  roundUpPackAmount,
  resolvePackShelfLifeMonths,
  resolveMaxPortionMultiplier,
} from '../../../src/application/supplement-shop/supplement-pricing.service';
import { SupplementShopConfigService } from '../../../src/application/supplement-shop/supplement-shop-config.service';
import { ShippingService } from '../../../src/application/shipping/shipping.service';
import type { SupplementShopConfigDto } from '../../../src/application/supplement-shop/supplement-shop-config.service';

function buildConfig(
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

describe('SupplementPricingService', () => {
  let service: SupplementPricingService;
  const mockConfigService = { getConfig: jest.fn() };
  const mockShippingService = { calculateShippingFeePreview: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplementPricingService,
        { provide: SupplementShopConfigService, useValue: mockConfigService },
        { provide: ShippingService, useValue: mockShippingService },
      ],
    }).compile();

    service = module.get(SupplementPricingService);
    jest.clearAllMocks();
  });

  describe('用量取整规则', () => {
    it('片剂/胶囊/平勺这类"数个数"的，向上取整到整数', () => {
      expect(roundUpPackAmount(5.48, '片', true)).toBe(6);
      expect(roundUpPackAmount(6.76, '粒', true)).toBe(7);
      expect(roundUpPackAmount(22.7, '平勺', true)).toBe(23);
      expect(roundUpPackAmount(16.3, '平勺', true)).toBe(17);
    });

    it('粉剂按克称重的，向上取到 0.1', () => {
      expect(roundUpPackAmount(34.6, 'g', true)).toBe(34.6);
      expect(roundUpPackAmount(34.61, 'g', true)).toBe(34.7);
      // 0.1 * 3 在 IEEE754 下是 0.30000000000000004，不能因此多进位成 0.4
      expect(roundUpPackAmount(0.1 * 3, 'g', true)).toBe(0.3);
    });

    it('关掉取整开关时保持原值', () => {
      expect(roundUpPackAmount(5.48, '片', false)).toBe(5.48);
    });
  });

  describe('价格圆整规则', () => {
    it('CEIL_TO_0_1 向上取到 1 角', () => {
      expect(roundPrice(13.5636, 'CEIL_TO_0_1')).toBe(13.6);
      expect(roundPrice(13.5, 'CEIL_TO_0_1')).toBe(13.5);
    });

    it('CEIL_TO_0_5 向上取到 5 角', () => {
      expect(roundPrice(13.5636, 'CEIL_TO_0_5')).toBe(14);
    });

    it('CEIL_TO_1 向上取到整元', () => {
      expect(roundPrice(13.01, 'CEIL_TO_1')).toBe(14);
    });

    it('NONE 只保留两位小数', () => {
      expect(roundPrice(13.5636, 'NONE')).toBe(13.56);
    });

    it('不产生浮点误差', () => {
      // 0.1 * 3 在 IEEE754 下是 0.30000000000000004
      expect(roundPrice(0.30000000000000004, 'CEIL_TO_0_1')).toBe(0.3);
    });
  });

  describe('分装有效期系数', () => {
    it('粉剂取粉剂系数，片剂/胶囊取固体系数', () => {
      const config = buildConfig({
        powderShelfLifeMonths: 6,
        solidShelfLifeMonths: 9,
        oilShelfLifeMonths: 6,
      });
      expect(resolvePackShelfLifeMonths('POWDER', config)).toBe(6);
      expect(resolvePackShelfLifeMonths('TABLET', config)).toBe(9);
      expect(resolvePackShelfLifeMonths('CAPSULE', config)).toBe(9);
    });

    it('油性内容物优先取油性系数，不受形态影响', () => {
      const config = buildConfig({
        powderShelfLifeMonths: 6,
        solidShelfLifeMonths: 9,
        oilShelfLifeMonths: 4,
      });
      // 鱼油/鱼肝油这类软胶囊
      expect(resolvePackShelfLifeMonths('CAPSULE', config, true)).toBe(4);
      // 油性液体（未来形态）同样适用
      expect(resolvePackShelfLifeMonths('LIQUID', config, true)).toBe(4);
      // 不标油性的胶囊仍走固体系数
      expect(resolvePackShelfLifeMonths('CAPSULE', config, false)).toBe(9);
    });

    it('报价时会把油性补剂的效期收得更保守', () => {
      const quote = service.calculateQuote(
        buildConfig({ solidShelfLifeMonths: 9, oilShelfLifeMonths: 6 }),
        [
          {
            ingredientId: 'fish-oil',
            name: '鱼油胶囊',
            unit: '粒',
            amount: 10,
            unitCost: 0.7,
            physicalForm: 'CAPSULE',
            isOilBased: true,
          },
          {
            ingredientId: 'taurine',
            name: '牛磺酸胶囊',
            unit: '粒',
            amount: 10,
            unitCost: 1.08,
            physicalForm: 'CAPSULE',
          },
        ],
        { fee: 0, description: '无运费' },
      );

      expect(quote.lines[0].shelfLifeMonths).toBe(6);
      expect(quote.lines[1].shelfLifeMonths).toBe(9);
    });
  });

  describe('整单报价', () => {
    const lines = [
      {
        ingredientId: 'kelp',
        name: '海藻粉',
        unit: '平勺',
        amount: 22.7,
        unitCost: 89.41 / 2522,
        physicalForm: 'POWDER' as const,
      },
      {
        ingredientId: 'choline',
        name: '胆碱片',
        unit: '片',
        amount: 5.48,
        unitCost: 0.996,
        physicalForm: 'TABLET' as const,
      },
      {
        ingredientId: 'taurine',
        name: '牛磺酸胶囊',
        unit: '粒',
        amount: 6.76,
        unitCost: 1.08,
        physicalForm: 'CAPSULE' as const,
      },
    ];

    it('按制作单用量算出成本、售价、服务费与合计', () => {
      const quote = service.calculateQuote(buildConfig(), lines, {
        fee: 8,
        description: '补剂一口价运费 8.00 元',
      });

      // 海藻粉：23 平勺 × 0.0354520 = 0.8154 元成本 → ×2 → 1.63 元
      expect(quote.lines[0].packedAmount).toBe(23);
      expect(quote.lines[0].cost).toBeCloseTo(0.8154, 3);
      expect(quote.lines[0].price).toBe(1.7);
      expect(quote.lines[0].shelfLifeMonths).toBe(6);

      // 胆碱片：6 片 × 0.996 = 5.976 → ×2 = 11.952 → 取到 1 角 = 12
      expect(quote.lines[1].packedAmount).toBe(6);
      expect(quote.lines[1].price).toBe(12);

      // 牛磺酸：7 粒 × 1.08 = 7.56 → ×2 = 15.12 → 15.2
      expect(quote.lines[2].packedAmount).toBe(7);
      expect(quote.lines[2].price).toBe(15.2);

      expect(quote.bagCount).toBe(3);
      expect(quote.serviceFee).toBe(9.9);
      expect(quote.goodsSubtotal).toBeCloseTo(1.7 + 12 + 15.2 + 9.9, 2);
      // 2026-09-24：运费照收并展示。默认 buildConfig 没设包邮门槛 → 收运费
      expect(quote.freeShipping).toBe(false);
      expect(quote.shippingFee).toBe(8);
      expect(quote.total).toBeCloseTo(38.8 + 8, 2);
      expect(quote.warnings).toEqual([]);
    });

    it('按袋计费时服务费乘以袋数', () => {
      const quote = service.calculateQuote(
        buildConfig({ serviceFeeMode: 'PER_BAG', serviceFeeAmount: 3 }),
        lines,
        { fee: 8, description: '一口价' },
      );

      expect(quote.bagCount).toBe(3);
      expect(quote.serviceFee).toBe(9);
    });

    /**
     * 2026-09-24：**翻转** 2026-09-22 的"运费由加价吸收、不向客户收取"。
     * 现在运费照收并逐项展示，让用户能亲眼看到"服务费和运费不随份数变"，
     * 从而自己算出加量更划算。
     */
    it('未达包邮门槛时按配置收取运费，并计入合计', () => {
      const quote = service.calculateQuote(
        buildConfig({ freeShippingThreshold: 999 }),
        lines,
        { fee: 8, description: '补剂一口价运费 8.00 元' },
      );

      expect(quote.freeShipping).toBe(false);
      expect(quote.shippingFee).toBe(8);
      expect(quote.total).toBeCloseTo(quote.goodsSubtotal + 8, 2);
      expect(quote.shippingDescription).toContain('一口价');
    });

    it('达到包邮门槛时免运费，合计不再加运费', () => {
      const quote = service.calculateQuote(
        buildConfig({ freeShippingThreshold: 30 }),
        lines,
        { fee: 8, description: '补剂一口价运费 8.00 元' },
      );

      expect(quote.freeShipping).toBe(true);
      expect(quote.shippingFee).toBe(0);
      expect(quote.total).toBeCloseTo(quote.goodsSubtotal, 2);
      expect(quote.shippingDescription).toContain('包邮');
    });

    it('门槛比对的是含服务费的订单金额（与界面口径一致）', () => {
      // lines 的补剂售价合计约 28.9，加服务费 9.9 后约 38.8。
      // 门槛设 38 → 已达标包邮；设 40 → 未达标要收运费。
      const justMet = service.calculateQuote(
        buildConfig({ freeShippingThreshold: 38 }),
        lines,
        { fee: 8, description: '一口价' },
      );
      const notMet = service.calculateQuote(
        buildConfig({ freeShippingThreshold: 40 }),
        lines,
        { fee: 8, description: '一口价' },
      );

      expect(justMet.goodsSubtotal).toBeGreaterThanOrEqual(38);
      expect(justMet.freeShipping).toBe(true);
      expect(notMet.goodsSubtotal).toBeLessThan(40);
      expect(notMet.freeShipping).toBe(false);
    });

    it('没设包邮门槛时一律收运费', () => {
      const quote = service.calculateQuote(
        buildConfig({ freeShippingThreshold: null }),
        lines,
        { fee: 8, description: '一口价' },
      );

      expect(quote.freeShipping).toBe(false);
      expect(quote.shippingFee).toBe(8);
    });

    it('低于最低起送金额时给出警告', () => {
      const quote = service.calculateQuote(
        buildConfig({ minOrderAmount: 1000 }),
        lines,
        { fee: 8, description: '一口价' },
      );

      expect(quote.warnings.some((w) => w.includes('最低起送'))).toBe(true);
    });

    it('包材费按袋累加', () => {
      const quote = service.calculateQuote(
        buildConfig({ packagingFeePerBag: 1 }),
        lines,
        { fee: 0, description: '无运费' },
      );

      expect(quote.packagingFee).toBe(3);
    });

    it('用量或单位成本不合法时直接拒绝', () => {
      expect(() =>
        service.calculateQuote(
          buildConfig(),
          [{ ...lines[0], amount: 0 }],
          { fee: 0, description: '' },
        ),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateQuote(
          buildConfig(),
          [{ ...lines[0], unitCost: -1 }],
          { fee: 0, description: '' },
        ),
      ).toThrow(BadRequestException);
    });

    it('空清单直接拒绝', () => {
      expect(() =>
        service.calculateQuote(buildConfig(), [], { fee: 0, description: '' }),
      ).toThrow(BadRequestException);
    });

    it('液体补剂给出不支持分装的警告', () => {
      const quote = service.calculateQuote(
        buildConfig(),
        [{ ...lines[0], physicalForm: 'LIQUID' }],
        { fee: 0, description: '' },
      );

      expect(quote.warnings.some((w) => w.includes('液体'))).toBe(true);
    });
  });

  describe('后台调参预览（previewQuote）', () => {
    it('一口价模式直接用配置里的运费', async () => {
      mockConfigService.getConfig.mockResolvedValue(
        buildConfig({ shippingMode: 'FLAT_RATE', flatShippingFee: 6 }),
      );

      const quote = await service.previewQuote({
        lines: [
          {
            ingredientId: 'kelp',
            name: '海藻粉',
            unit: '平勺',
            amount: 22.7,
            unitCost: 89.41 / 2522,
            physicalForm: 'POWDER',
          },
        ],
      });

      // 2026-09-24 起运费向客户收取（唯一补剂仅 1.7 元货款，远不到包邮门槛）
      expect(quote.shippingFee).toBe(6);
      expect(quote.total).toBeCloseTo(quote.goodsSubtotal + 6, 2);
      expect(mockShippingService.calculateShippingFeePreview).not.toHaveBeenCalled();
    });

    it('按重量模式走现有运费模板', async () => {
      mockConfigService.getConfig.mockResolvedValue(
        buildConfig({ shippingMode: 'TEMPLATE', shippingTemplateId: 'tpl-1' }),
      );
      mockShippingService.calculateShippingFeePreview.mockResolvedValue({
        amountShipping: 12,
        templateId: 'tpl-1',
        ruleAppliedDescription: '首重 1kg 内 12 元',
      });

      const quote = await service.previewQuote({
        lines: [
          {
            ingredientId: 'kelp',
            name: '海藻粉',
            unit: '平勺',
            amount: 22.7,
            unitCost: 89.41 / 2522,
            physicalForm: 'POWDER',
          },
        ],
        totalWeightG: 300,
      });

      expect(quote.shippingFee).toBe(12);
      expect(
        mockShippingService.calculateShippingFeePreview,
      ).toHaveBeenCalledWith({
        totalWeightG: 300,
        shippingTemplateId: 'tpl-1',
      });
    });
  });
  /**
   * 加量（2026-09-24）
   *
   * 业务背景：补剂订单的固定成本（分装服务费）按单收，跟买多少无关。
   * 让用户一次多买几份，能把固定成本摊薄 —— 用户每天成本下降，我们单笔利润上升。
   */
  describe('加量（份数）', () => {
    const lines = [
      {
        ingredientId: 'kelp',
        name: '海藻粉',
        unit: '平勺',
        amount: 22.7,
        unitCost: 0.035452,
        physicalForm: 'POWDER' as const,
      },
      {
        ingredientId: 'choline',
        name: '胆碱片',
        unit: '片',
        amount: 10,
        unitCost: 1,
        physicalForm: 'TABLET' as const,
      },
    ];
    const shipping = { fee: 8, description: '一口价' };

    describe('份数上限规则', () => {
      const cfg = buildConfig({ maxPortionMultiplier: 3, maxTotalDays: 90 });

      it('短周期制作单受份数上限约束', () => {
        // 7 天 × 3 = 21 天，远没到 90 天，所以是份数上限说了算
        expect(resolveMaxPortionMultiplier(cfg, 7)).toBe(3);
      });

      it('长周期制作单受总天数上限约束', () => {
        // 40 天：90 ÷ 40 = 2.25 → 只能买 2 份（3 份就是 120 天，贴到效期红线）
        expect(resolveMaxPortionMultiplier(cfg, 40)).toBe(2);
      });

      it('正好整除时取整（90 天制作单只能买 1 份）', () => {
        expect(resolveMaxPortionMultiplier(cfg, 90)).toBe(1);
        expect(resolveMaxPortionMultiplier(cfg, 45)).toBe(2);
        expect(resolveMaxPortionMultiplier(cfg, 30)).toBe(3);
      });

      it('制作单本身超过天数上限时，至少还能按原量买 1 份', () => {
        // 不能因为"超标"就把用户卡死买不了 —— 兜底 1 份
        expect(resolveMaxPortionMultiplier(cfg, 200)).toBe(1);
      });

      it('没有制作单天数时只受份数上限约束', () => {
        expect(resolveMaxPortionMultiplier(cfg, null)).toBe(3);
        expect(resolveMaxPortionMultiplier(cfg, undefined)).toBe(3);
      });
    });

    describe('份数计价', () => {
      it('成本与售价按份数翻倍', () => {
        const one = service.calculateQuote(buildConfig(), lines, shipping, {
          portionMultiplier: 1,
          cycleDays: 30,
        });
        const three = service.calculateQuote(buildConfig(), lines, shipping, {
          portionMultiplier: 3,
          cycleDays: 30,
        });

        // 第一行（海藻粉 23 平勺 × 0.035452）单份成本 0.8154
        expect(one.lines[0].cost).toBeCloseTo(0.8154, 3);
        expect(three.lines[0].cost).toBeCloseTo(0.8154 * 3, 3);
        // 整单成本 = 两行之和，按份数线性放大
        expect(three.supplementCost).toBeCloseTo(one.supplementCost * 3, 3);
        // 售价是"整行成本翻倍后"再圆整，不是把单份售价直接乘 3
        expect(three.supplementPrice).toBeGreaterThan(one.supplementPrice * 2.9);
      });

      it('袋数 = 补剂种数 × 份数', () => {
        const q = service.calculateQuote(buildConfig(), lines, shipping, {
          portionMultiplier: 3,
          cycleDays: 30,
        });
        expect(q.lines[0].bags).toBe(3);
        expect(q.lines[1].bags).toBe(3);
        expect(q.bagCount).toBe(6);
      });

      it('服务费不随份数变 —— 这正是加量的全部意义', () => {
        const one = service.calculateQuote(buildConfig(), lines, shipping, {
          portionMultiplier: 1,
          cycleDays: 30,
        });
        const three = service.calculateQuote(buildConfig(), lines, shipping, {
          portionMultiplier: 3,
          cycleDays: 30,
        });
        expect(one.serviceFee).toBe(9.9);
        expect(three.serviceFee).toBe(9.9);
      });

      it('⚠️ 每袋分装量不随份数变：加量是多做几袋，不是一袋装更多', () => {
        // 袋子规格是按一个制作周期的用量选的（碳酸钙粉 10x15 袋本来就装 114g），
        // 把 packedAmount 乘上份数会直接撑爆袋子。这条一旦被改坏，
        // 分装工单会印出物理上装不下的用量。
        const one = service.calculateQuote(buildConfig(), lines, shipping, {
          portionMultiplier: 1,
          cycleDays: 30,
        });
        const three = service.calculateQuote(buildConfig(), lines, shipping, {
          portionMultiplier: 3,
          cycleDays: 30,
        });
        expect(three.lines[0].packedAmount).toBe(one.lines[0].packedAmount);
        expect(three.lines[1].packedAmount).toBe(one.lines[1].packedAmount);
      });

      it('每天成本随份数下降（界面靠它讲"多买更划算"）', () => {
        const one = service.calculateQuote(buildConfig(), lines, shipping, {
          portionMultiplier: 1,
          cycleDays: 30,
        });
        const three = service.calculateQuote(buildConfig(), lines, shipping, {
          portionMultiplier: 3,
          cycleDays: 30,
        });

        expect(one.totalDays).toBe(30);
        expect(three.totalDays).toBe(90);
        expect(one.perDayCost).not.toBeNull();
        expect(three.perDayCost).not.toBeNull();
        expect(three.perDayCost!).toBeLessThan(one.perDayCost!);
      });

      it('没有 cycleDays 时不算每天成本', () => {
        const q = service.calculateQuote(buildConfig(), lines, shipping, {
          portionMultiplier: 2,
        });
        expect(q.totalDays).toBeNull();
        expect(q.perDayCost).toBeNull();
      });

      it('超上限时收敛到上限并给出警告（纯函数兜底，界面侧由 order service 直接拒绝）', () => {
        const q = service.calculateQuote(
          buildConfig({ maxPortionMultiplier: 3, maxTotalDays: 90 }),
          lines,
          shipping,
          { portionMultiplier: 9, cycleDays: 30 },
        );
        expect(q.portionMultiplier).toBe(3);
        expect(q.warnings.some((w) => w.includes('超出上限'))).toBe(true);
      });

      it('份数非法（0 / 负数 / 小数）时退回 1 份，不会算出 0 元订单', () => {
        for (const bad of [0, -2, 1.7, Number.NaN]) {
          const q = service.calculateQuote(buildConfig(), lines, shipping, {
            portionMultiplier: bad,
            cycleDays: 30,
          });
          expect(q.portionMultiplier).toBe(1);
        }
      });

      it('每个可选份数都返回一条选项结果（界面据此渲染卡片）', () => {
        const q = service.calculateQuote(
          buildConfig({ maxPortionMultiplier: 3, maxTotalDays: 90 }),
          lines,
          shipping,
          { portionMultiplier: 1, cycleDays: 30 },
        );

        expect(q.portionOptions.map((o) => o.multiplier)).toEqual([1, 2, 3]);
        expect(q.portionOptions.map((o) => o.totalDays)).toEqual([30, 60, 90]);
      });

      it('选项里的金额与真正下单时一致（同源同逻辑）', () => {
        // 这是这次重构的关键：选项卡片不能自己算，必须与主报价走同一个函数
        const cfg = buildConfig({ maxPortionMultiplier: 3, maxTotalDays: 90 });
        const asTwo = service.calculateQuote(cfg, lines, shipping, {
          portionMultiplier: 2,
          cycleDays: 30,
        });
        const asOne = service.calculateQuote(cfg, lines, shipping, {
          portionMultiplier: 1,
          cycleDays: 30,
        });

        const option2 = asOne.portionOptions.find((o) => o.multiplier === 2)!;
        expect(option2.total).toBe(asTwo.total);
        expect(option2.goodsSubtotal).toBe(asTwo.goodsSubtotal);
        expect(option2.freeShipping).toBe(asTwo.freeShipping);
        expect(option2.perDayCost).toBe(asTwo.perDayCost);
      });

      it('选项会标出哪一档开始包邮，顾客零点击就能看到', () => {
        // 让 3 份恰好跨过门槛：先算出 3 份的订单金额，再把门槛设为它
        const probe = service.calculateQuote(
          buildConfig({ maxPortionMultiplier: 3, maxTotalDays: 90, freeShippingThreshold: null }),
          lines,
          shipping,
          { portionMultiplier: 3, cycleDays: 30 },
        );
        const q = service.calculateQuote(
          buildConfig({
            maxPortionMultiplier: 3,
            maxTotalDays: 90,
            freeShippingThreshold: probe.goodsSubtotal,
          }),
          lines,
          shipping,
          { portionMultiplier: 1, cycleDays: 30 },
        );

        expect(q.portionOptions[0].freeShipping).toBe(false);
        expect(q.portionOptions[1].freeShipping).toBe(false);
        expect(q.portionOptions[2].freeShipping).toBe(true);
        // 包邮那一档的运费必须是 0，否则选项上会显示"包邮"却仍加钱
        expect(q.portionOptions[2].shippingFee).toBe(0);
        expect(q.portionOptions[2].total).toBeCloseTo(q.portionOptions[2].goodsSubtotal, 2);
      });

      it('只有一档可选时也返回一条选项，界面据此决定是否展示控件', () => {
        // 90 天制作单只能买 1 份
        const q = service.calculateQuote(
          buildConfig({ maxPortionMultiplier: 3, maxTotalDays: 90 }),
          lines,
          shipping,
          { portionMultiplier: 1, cycleDays: 90 },
        );
        expect(q.portionOptions.map((o) => o.multiplier)).toEqual([1]);
      });

      it('把当前上限回传给客户端，界面据此渲染选项', () => {
        const q = service.calculateQuote(
          buildConfig({ maxPortionMultiplier: 3, maxTotalDays: 90 }),
          lines,
          shipping,
          { portionMultiplier: 1, cycleDays: 40 },
        );
        expect(q.maxPortionMultiplier).toBe(2);
      });
    });
  });
});
