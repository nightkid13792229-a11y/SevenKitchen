import { createCanvas } from 'canvas';
import { LabelV10Service } from '../../src/label/label-v10.service';
import { LabelDataDto } from '../../src/label/dto/label-data.dto';

/**
 * 70×100mm 鲜食标签 · 烹饪说明口径
 *
 * 2026-11-03 老板定的口径：生产标签的烹饪时间必须和顾客端
 * 鲜食订单详情页完全一致（miniapp/src/utils/cooking-time.ts）：
 *   ≤150g   蒸/炖 约10分钟，低温慢煮 30分钟
 *   151–250g   约15分钟，45分钟
 *   251–400g   约20分钟，60分钟
 *   401–600g   约25分钟，90分钟
 *   >600g   不给固定时间，只给判定标准
 * 多规格时只按第一档（与顾客端一致）。
 */
describe('LabelV10Service · 烹饪说明', () => {
  const service = new LabelV10Service();

  const data = (plan: Array<{ packageSpecG: number; packageCount: number }>): LabelDataDto =>
    ({
      brandName: 'seven的厨房',
      recipeName: '鸡肉南瓜鲜食',
      nutritionStandard: 'FEDIAF_2021',
      lifeStages: [],
      healthTags: [],
      dogName: '旺财',
      foodIngredients: '鸡胸肉 36%、牛后腿肉 28%、南瓜 14%、胡萝卜 12%、鸡蛋 10%',
      supplementIngredients: '',
      additiveIngredients: '碳酸钙、氯化钠、牛磺酸',
      weightPerPack: plan[0].packageSpecG,
      packageCount: plan.reduce((sum, row) => sum + row.packageCount, 0),
      totalWeight: plan.reduce((sum, row) => sum + row.packageSpecG * row.packageCount, 0),
      packagePlan: plan,
      nutritionAnalysis: {
        proteinPercent: 12.3,
        fatPercent: 6.1,
        ashPercent: 1.8,
        moisturePercent: 68.4,
        crudeFiberPercent: 0.9,
        carbohydratePercent: 10.5,
        energyDensityKcalPerKg: 1494,
        calciumPhosphorusRatio: '1.2',
      },
      shelfLife: '冷冻 6 个月',
      shelfLifeMonths: 6,
      cookingMethod: '',
      productionTime: '2026-11-03',
    }) as LabelDataDto;

  describe('按每袋克重取时间（顾客端口径）', () => {
    const cases: Array<[number, string, string, string]> = [
      [100, '约 10 分钟', '约 10 分钟', '30 分钟'],
      [150, '约 10 分钟', '约 10 分钟', '30 分钟'],
      [151, '约 15 分钟', '约 15 分钟', '45 分钟'],
      [250, '约 15 分钟', '约 15 分钟', '45 分钟'],
      [251, '约 20 分钟', '约 20 分钟', '60 分钟'],
      [400, '约 20 分钟', '约 20 分钟', '60 分钟'],
      [401, '约 25 分钟', '约 25 分钟', '90 分钟'],
      [600, '约 25 分钟', '约 25 分钟', '90 分钟'],
    ];

    it.each(cases)('%ig/袋 → %s / %s / %s', (weight, steam, stew, sousvide) => {
      expect((service as any).cookingTimesFor(weight)).toEqual({ steam, stew, sousvide });
    });

    it('超过 600g 不给固定时间', () => {
      expect((service as any).cookingTimesFor(601)).toBeNull();
    });
  });

  describe('标签上的文案', () => {
    it('蒸和炖时间相同时合并成一行，慢煮单独一行', () => {
      expect((service as any).cookingTokens({ packageSpecG: 200, packageCount: 1 })).toEqual([
        '200克/袋',
        '蒸/炖 约 15 分钟',
        '低温慢煮 45 分钟',
      ]);
    });

    it('超过 600g 只印一句判定指向，不再分三种做法', () => {
      expect((service as any).cookingTokens({ packageSpecG: 700, packageCount: 1 })).toEqual([
        '700克/袋',
        '超过600g，按判定标准',
      ]);
    });

    it('超过 600g 附一句判定标准（与顾客端同一套说法）', () => {
      const judgement = (service as any).cookingJudgement({ packageSpecG: 700, packageCount: 1 });
      expect(judgement).toContain('65℃');
      expect(judgement).toContain('无可见血水');
    });

    it('正常重量不额外加判定标准，省版面', () => {
      expect((service as any).cookingJudgement({ packageSpecG: 200, packageCount: 1 })).toBeNull();
    });
  });

  describe('多规格只按第一档（与顾客端一致）', () => {
    it('取第一档的克重和时间，后面几档不再单独出行', () => {
      const specs = (service as any).normalizeSpecs(
        data([
          { packageSpecG: 100, packageCount: 2 },
          { packageSpecG: 200, packageCount: 1 },
          { packageSpecG: 500, packageCount: 1 },
        ]),
      );
      expect((service as any).cookingTokens(specs[0])).toEqual([
        '100克/袋',
        '蒸/炖 约 10 分钟',
        '低温慢煮 30 分钟',
      ]);
    });

    it('多档时栏目标题旁注明是"第一档"，免得拿 500g 的袋子照 100g 的时间做', () => {
      expect(
        (service as any).cookingHint([
          { packageSpecG: 100, packageCount: 2 },
          { packageSpecG: 500, packageCount: 1 },
        ]),
      ).toBe('按第一档袋规格');
      expect(
        (service as any).cookingHint([{ packageSpecG: 200, packageCount: 1 }]),
      ).toBe('按袋规格');
    });
  });

  describe('标题与净含量不溢出（自动缩字号）', () => {
    const ctx = createCanvas(559, 799).getContext('2d');

    it('长食谱名缩字号后仍在一行内', () => {
      const fitted = (service as any).fitSingleLine(
        ctx,
        '深海鱼与禽肉全营养鲜食（大包装）',
        559 - 64,
        5.4,
        3.6,
        'Chinese-Bold',
      );
      ctx.font = `bold ${mm(fitted.sizeMm)}px "Chinese-Bold"`;
      expect(ctx.measureText(fitted.text).width).toBeLessThanOrEqual(559 - 64);
      expect(fitted.sizeMm).toBeLessThan(5.4);
    });

    it('长得离谱时缩到下限后用省略号收尾，绝不越界', () => {
      const long = '超长食谱名称用于验证极端的溢出情况不要画到纸外'.repeat(2);
      const fitted = (service as any).fitSingleLine(ctx, long, 559 - 64, 5.4, 3.6, 'Chinese-Bold');
      ctx.font = `bold ${mm(fitted.sizeMm)}px "Chinese-Bold"`;
      expect(ctx.measureText(fitted.text).width).toBeLessThanOrEqual(559 - 64);
      expect(fitted.text.endsWith('…')).toBe(true);
    });
  });

  describe('整张标签出图', () => {
    it('三档规格也能生成 70×100mm 的图', () => {
      const base64 = service.generate(
        data([
          { packageSpecG: 100, packageCount: 2 },
          { packageSpecG: 200, packageCount: 1 },
          { packageSpecG: 500, packageCount: 1 },
        ]),
      );
      expect(Buffer.from(base64, 'base64').subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    });

    it('含 700g 超重规格也能出图', () => {
      expect(() =>
        service.generate(
          data([
            { packageSpecG: 100, packageCount: 2 },
            { packageSpecG: 700, packageCount: 1 },
          ]),
        ),
      ).not.toThrow();
    });

    it('长食谱名 + 多规格不会因为内容超宽而打不出来', () => {
      const label = data([
        { packageSpecG: 80, packageCount: 1 },
        { packageSpecG: 500, packageCount: 1 },
      ]);
      label.recipeName = '深海鱼与禽肉全营养鲜食（大包装）';
      expect(() => service.generate(label)).not.toThrow();
    });
  });
});

const MM = 203 / 25.4;
const mm = (value: number): number => Math.round(value * MM);
