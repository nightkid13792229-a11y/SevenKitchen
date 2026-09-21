import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SupplementPricingService,
  roundPrice,
  roundUpPackAmount,
  resolvePackShelfLifeMonths,
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
      expect(quote.shippingFee).toBe(8);
      expect(quote.total).toBeCloseTo(46.8, 2);
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

    it('达到包邮门槛时免运费，并在说明里写清楚', () => {
      const quote = service.calculateQuote(
        buildConfig({ freeShippingThreshold: 30 }),
        lines,
        { fee: 8, description: '补剂一口价运费 8.00 元' },
      );

      expect(quote.goodsSubtotal).toBeGreaterThan(30);
      expect(quote.freeShipping).toBe(true);
      expect(quote.shippingFee).toBe(0);
      expect(quote.shippingDescription).toContain('包邮');
      expect(quote.total).toBeCloseTo(quote.goodsSubtotal, 2);
    });

    it('未达包邮门槛时照常收运费', () => {
      const quote = service.calculateQuote(
        buildConfig({ freeShippingThreshold: 999 }),
        lines,
        { fee: 8, description: '补剂一口价运费 8.00 元' },
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

      expect(quote.shippingFee).toBe(6);
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
});
