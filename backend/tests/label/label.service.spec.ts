import { loadImage } from 'canvas';
import { LabelService } from '../../src/label/label.service';
import { LabelDataDto } from '../../src/label/dto/label-data.dto';

describe('LabelService 70x100 food label rendering', () => {
  const createLabelData = (): LabelDataDto => ({
    brandName: 'seven的厨房',
    recipeName: '糙米鸡蛋牛肉',
    nutritionStandard: 'FEDIAF_2021',
    lifeStages: [],
    healthTags: [],
    dogName: 'setar',
    foodIngredients: [
      '牛霖27.73%',
      '牛肝3.33%',
      '牛脾5.55%',
      '牛心5.55%',
      '鸡蛋16.64%',
      '生蚝8.32%',
      '青花鱼2.77%',
      '糙米11.09%',
      '红薯8.32%',
      '胡萝卜5.55%',
      '羽衣甘蓝2.77%',
      '生南瓜籽仁1.66%',
      '小麦胚芽油0.55%',
      '食用盐0.17%',
      '蓝莓0.15%',
      '菠菜0.14%',
      '亚麻籽0.13%',
      '南瓜0.12%',
      '牛肉汤0.11%',
    ].join('、'),
    supplementIngredients: '骨粉、海藻粉、牛磺酸、维E、锌',
    weightPerPack: 208,
    packageCount: 60,
    totalWeight: 12480,
    packagePlan: [{ packageSpecG: 208, packageCount: 60 }],
    nutritionAnalysis: {
      proteinPercent: 39.04,
      fatPercent: 17.13,
      ashPercent: 9.62,
      moisturePercent: 65.81,
      crudeFiberPercent: 3.08,
      carbohydratePercent: 31.3,
      energyDensityKcalPerKg: 1487,
      calciumPhosphorusRatio: '1.35',
    },
    shelfLife: '冷冻保存6个月，冷藏保存3天',
    cookingMethod: '',
    productionTime: '2026-04-22',
  });

  it('generates a 70mm by 100mm label image', async () => {
    const service = new LabelService();

    const imageBase64 = service.generateLabelImage(createLabelData());
    const image = await loadImage(Buffer.from(imageBase64, 'base64'));

    expect(image.width).toBe(559);
    expect(image.height).toBe(799);
  });

  it('keeps the complete nutrition set even when compact layout is needed', () => {
    const service = new LabelService();
    const rows = (service as any).buildCompleteNutritionRows(
      createLabelData().nutritionAnalysis,
    );

    const flattened = rows.flat().join(' ');

    expect(flattened).toContain('蛋白质 39.0%');
    expect(flattened).toContain('脂肪 17.1%');
    expect(flattened).toContain('灰分 9.6%');
    expect(flattened).toContain('水分 65.8%');
    expect(flattened).toContain('纤维 3.1%');
    expect(flattened).toContain('碳水 31.3%');
    expect(flattened).toContain('能量 1487kcal/kg');
    expect(flattened).toContain('钙磷比 1.35');
  });

  it('renders basic package facts as one compact customer-facing line', () => {
    const service = new LabelService();

    expect((service as any).buildMetaLine(createLabelData())).toBe(
      'setar｜2026-04-22｜208g×60袋｜净重12480g',
    );
  });

  it('keeps the basic facts line close to the title without extra rule lines', () => {
    const service = new LabelService();

    expect((service as any).getMetaLineLayout()).toMatchObject({
      drawRules: false,
      topGapMm: expect.any(Number),
      heightMm: expect.any(Number),
    });
    expect((service as any).getMetaLineLayout().topGapMm).toBeLessThanOrEqual(0.4);
    expect((service as any).getMetaLineLayout().heightMm).toBeLessThan(4);
  });

  it('keeps supplement actual total amount on the ingredient label', () => {
    const service = new LabelService();

    expect((service as any).formatIngredientLabel('骨粉119.40g')).toBe(
      '骨粉 119.40g',
    );
    expect((service as any).formatIngredientLabel('海藻粉8.94平勺')).toBe(
      '海藻粉 8.94平勺',
    );
  });

  it('uses three columns for compact ingredient layout after supplement amounts are short', () => {
    const service = new LabelService();

    expect((service as any).getIngredientGridConfig('compact')).toMatchObject({
      columns: 3,
      fontSize: expect.any(Number),
    });
    expect((service as any).getIngredientGridConfig('compact').fontSize).toBeGreaterThanOrEqual(2);
  });

  it('uses three nutrition columns while keeping energy and calcium phosphorus ratio together', () => {
    const service = new LabelService();

    const rows = (service as any).buildCompleteNutritionRows(
      createLabelData().nutritionAnalysis,
    );

    expect(rows[0]).toHaveLength(3);
    expect(rows[1]).toHaveLength(3);
    expect(rows[2]).toEqual(['能量 1487kcal/kg', '钙磷比 1.35']);
  });

  it('aligns the final nutrition row to the same three-column grid', () => {
    const service = new LabelService();

    expect((service as any).getNutritionGridColumnCount()).toBe(3);
  });

  it('uses a table-style title for storage instructions', () => {
    const service = new LabelService();

    expect((service as any).getStorageFooterTitle()).toBe('保存方式');
  });

  it('places storage instructions in the content flow instead of pinning them to the bottom', () => {
    const service = new LabelService();

    expect((service as any).getStorageSectionLayout()).toMatchObject({
      position: 'flow',
      title: '保存方式',
    });
  });
});
