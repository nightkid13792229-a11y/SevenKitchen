import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipePricingService } from '../../../src/application/custom-recipe/custom-recipe-pricing.service';
import { DEFAULT_MULTI_RECIPE_DISCOUNTS } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import type {
  CustomRecipeConfigDto,
  MultiRecipeDiscountTier,
} from '../../../src/application/custom-recipe/custom-recipe-config.service';

function tier(
  quantity: number,
  discountRate: number,
  label = `${quantity} 份`,
): MultiRecipeDiscountTier {
  return { quantity, discountRate, label };
}

function defaultTiers(): MultiRecipeDiscountTier[] {
  return DEFAULT_MULTI_RECIPE_DISCOUNTS.map((item) => ({ ...item }));
}

/**
 * quote() 只需要定制费、最多份数、优惠档位三项；其余配置字段与报价无关，
 * 这里用断言补齐完整 DTO，避免每个用例都抄一遍 30 多个字段。
 */
function makeConfig(
  overrides: Partial<
    Pick<
      CustomRecipeConfigDto,
      'feeAmount' | 'maxRecipeQuantity' | 'multiRecipeDiscounts'
    >
  > = {},
): CustomRecipeConfigDto {
  return {
    feeAmount: 300,
    maxRecipeQuantity: 5,
    multiRecipeDiscounts: defaultTiers(),
    ...overrides,
  } as CustomRecipeConfigDto;
}

function configWithTiers(multiRecipeDiscounts: unknown): CustomRecipeConfigDto {
  return makeConfig({
    multiRecipeDiscounts: multiRecipeDiscounts as MultiRecipeDiscountTier[],
  });
}

describe('CustomRecipePricingService（多份权威报价）', () => {
  let service: CustomRecipePricingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomRecipePricingService],
    }).compile();

    service = module.get(CustomRecipePricingService);
  });

  describe('1–5 份的精确金额', () => {
    it.each([
      {
        quantity: 1,
        unitAmount: 300,
        originalAmount: 300,
        discountRate: 0,
        discountAmount: 0,
        payableAmount: 300,
      },
      {
        quantity: 2,
        unitAmount: 300,
        originalAmount: 600,
        discountRate: 0.05,
        discountAmount: 30,
        payableAmount: 570,
      },
      {
        quantity: 3,
        unitAmount: 300,
        originalAmount: 900,
        discountRate: 0.08,
        discountAmount: 72,
        payableAmount: 828,
      },
      {
        quantity: 4,
        unitAmount: 300,
        originalAmount: 1200,
        discountRate: 0.1,
        discountAmount: 120,
        payableAmount: 1080,
      },
      {
        quantity: 5,
        unitAmount: 300,
        originalAmount: 1500,
        discountRate: 0.12,
        discountAmount: 180,
        payableAmount: 1320,
      },
    ])(
      '$quantity 份：原价 $originalAmount，优惠 $discountAmount，应付 $payableAmount',
      ({
        quantity,
        unitAmount,
        originalAmount,
        discountRate,
        discountAmount,
        payableAmount,
      }) => {
        // toEqual 同时锁死字段集合：报价里不能多出 credit/deduction 字段
        expect(service.quote(quantity, makeConfig())).toEqual({
          quantity,
          unitAmount,
          originalAmount,
          discountRate,
          discountAmount,
          payableAmount,
        });
      },
    );

    it('1 份永远不打折，即使其它档位折扣很高', () => {
      const quote = service.quote(
        1,
        configWithTiers([
          tier(2, 0.2),
          tier(3, 0.2),
          tier(4, 0.2),
          tier(5, 0.2),
        ]),
      );

      expect(quote.discountRate).toBe(0);
      expect(quote.discountAmount).toBe(0);
      expect(quote.payableAmount).toBe(300);
    });

    it('档位顺序打乱时仍取「达到的最高档」', () => {
      const quote = service.quote(
        4,
        configWithTiers([
          tier(5, 0.12),
          tier(2, 0.05),
          tier(4, 0.1),
          tier(3, 0.08),
        ]),
      );

      expect(quote.discountRate).toBe(0.1);
      expect(quote.discountAmount).toBe(120);
    });
  });

  describe('份数校验', () => {
    it.each([
      { quantity: 0, reason: '0 份' },
      { quantity: -1, reason: '负数' },
      { quantity: 6, reason: '超过业务硬上限' },
      { quantity: 1.5, reason: '非整数' },
      { quantity: Number.NaN, reason: 'NaN' },
      { quantity: Number.POSITIVE_INFINITY, reason: 'Infinity' },
    ])('拒绝 $reason（$quantity）', ({ quantity }) => {
      expect(() => service.quote(quantity, makeConfig())).toThrow('份数');
    });

    it('按 config.maxRecipeQuantity 收口，而不是只看硬上限 5', () => {
      const config = makeConfig({ maxRecipeQuantity: 3 });

      expect(service.quote(3, config).payableAmount).toBe(828);
      expect(() => service.quote(4, config)).toThrow('份数必须是 1~3 的整数');
    });

    it('maxRecipeQuantity 为 1 时只允许 1 份', () => {
      const config = makeConfig({ maxRecipeQuantity: 1 });

      expect(service.quote(1, config).payableAmount).toBe(300);
      expect(() => service.quote(2, config)).toThrow('份数必须是 1~1 的整数');
    });

    it.each([0, 6, 2.5, Number.NaN])(
      '配置里的最多份数 %s 非法时拒绝报价',
      (maxRecipeQuantity) => {
        expect(() =>
          service.quote(1, makeConfig({ maxRecipeQuantity })),
        ).toThrow('优惠配置不合法');
      },
    );

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
      '配置里的定制费 %s 非法时拒绝报价',
      (feeAmount) => {
        expect(() => service.quote(1, makeConfig({ feeAmount }))).toThrow(
          '优惠配置不合法',
        );
      },
    );
  });

  describe('坏优惠档位：拒绝而不是静默报价', () => {
    const validTiers = defaultTiers();

    const cases: Array<{ name: string; tiers: unknown }> = [
      { name: '不是数组', tiers: 'not-an-array' },
      { name: '空数组', tiers: [] },
      { name: '缺少 5 份档位', tiers: validTiers.slice(0, 3) },
      { name: '缺少 2 份档位', tiers: validTiers.slice(1) },
      { name: '份数重复', tiers: [...validTiers, tier(2, 0.06)] },
      {
        name: '折扣随份数下降',
        tiers: [tier(2, 0.12), tier(3, 0.05), tier(4, 0.1), tier(5, 0.12)],
      },
      {
        name: '折扣超过 20%',
        tiers: [tier(2, 0.21), tier(3, 0.08), tier(4, 0.1), tier(5, 0.12)],
      },
      {
        name: '折扣为 0',
        tiers: validTiers.map((item) =>
          item.quantity === 2 ? tier(2, 0) : item,
        ),
      },
      {
        name: '折扣为负数',
        tiers: validTiers.map((item) =>
          item.quantity === 2 ? tier(2, -0.05) : item,
        ),
      },
      {
        name: '折扣率是 NaN',
        tiers: validTiers.map((item) =>
          item.quantity === 2 ? tier(2, Number.NaN) : item,
        ),
      },
      {
        name: '折扣率不是数字',
        tiers: [
          { quantity: 2, discountRate: '0.05', label: '2 份' },
          ...validTiers.slice(1),
        ],
      },
      {
        name: '出现 1 份档位（1 份不允许折扣）',
        tiers: [tier(1, 0.05), ...validTiers],
      },
      {
        name: '出现 6 份档位（超过硬上限）',
        tiers: [...validTiers, tier(6, 0.12)],
      },
      {
        name: '份数不是整数',
        tiers: [tier(2.5, 0.05), ...validTiers.slice(1)],
      },
      {
        name: '档位不是对象',
        tiers: [null, ...validTiers.slice(1)],
      },
      {
        name: '展示文案缺失',
        tiers: [{ quantity: 2, discountRate: 0.05 }, ...validTiers.slice(1)],
      },
    ];

    it.each(cases)('拒绝：$name', ({ tiers }) => {
      expect(() => service.quote(3, configWithTiers(tiers))).toThrow(
        '优惠配置不合法',
      );
    });

    it('即使只买 1 份，坏档位也不能带进报价链路', () => {
      expect(() =>
        service.quote(
          1,
          configWithTiers([
            tier(2, 0.12),
            tier(3, 0.05),
            tier(4, 0.1),
            tier(5, 0.12),
          ]),
        ),
      ).toThrow('优惠配置不合法');
    });

    it('折扣持平是允许的（份数越高不能降低，但可以相同）', () => {
      const quote = service.quote(
        5,
        configWithTiers([
          tier(2, 0.05),
          tier(3, 0.05),
          tier(4, 0.05),
          tier(5, 0.05),
        ]),
      );

      expect(quote.discountRate).toBe(0.05);
      expect(quote.discountAmount).toBe(75);
      expect(quote.payableAmount).toBe(1425);
    });
  });

  describe('金额舍入', () => {
    it('900 × 8% 先把优惠舍入到 72，再相减得到 828', () => {
      const quote = service.quote(3, makeConfig());

      expect(quote.originalAmount).toBe(900);
      expect(quote.discountAmount).toBe(72);
      expect(quote.payableAmount).toBe(828);
    });

    it('小数定制费按分舍入，不出现 827.99 / 828.01 之类的漂移', () => {
      expect(service.quote(3, makeConfig({ feeAmount: 299.99 }))).toEqual({
        quantity: 3,
        unitAmount: 299.99,
        originalAmount: 899.97,
        discountRate: 0.08,
        discountAmount: 72,
        payableAmount: 827.97,
      });
    });

    it('所有对外金额都只保留两位小数', () => {
      for (const quantity of [1, 2, 3, 4, 5]) {
        const quote = service.quote(quantity, makeConfig({ feeAmount: 19.99 }));

        for (const amount of [
          quote.unitAmount,
          quote.originalAmount,
          quote.discountAmount,
          quote.payableAmount,
        ]) {
          expect(Number.isFinite(amount)).toBe(true);
          expect(Math.round(amount * 100) / 100).toBe(amount);
        }
      }
    });

    it('应付 + 优惠始终等于原价（精确到分）', () => {
      for (const quantity of [1, 2, 3, 4, 5]) {
        const quote = service.quote(quantity, makeConfig({ feeAmount: 19.99 }));

        expect(quote.payableAmount + quote.discountAmount).toBeCloseTo(
          quote.originalAmount,
          2,
        );
      }
    });
  });

  it('报价只含份数与金额字段，不含任何抵扣字段', () => {
    const quote = service.quote(3, makeConfig());

    expect(Object.keys(quote).sort()).toEqual([
      'discountAmount',
      'discountRate',
      'originalAmount',
      'payableAmount',
      'quantity',
      'unitAmount',
    ]);
    expect(quote).not.toHaveProperty('creditAmount');
    expect(quote).not.toHaveProperty('deductionAmount');
    expect(quote).not.toHaveProperty('deductibleAmount');
  });
});
