import { loadImage } from 'canvas';
import { createCanvas } from 'canvas';
import { LabelService } from '../../src/label/label.service';
import { LabelDataDto } from '../../src/label/dto/label-data.dto';

describe('LabelService 70x100 food label rendering', () => {
  const testDpi = 203;
  const mmToExpectedPx = (mm: number): number =>
    Math.round((mm * testDpi) / 25.4);
  const extractFontPx = (font: string): number => {
    const match = font.match(/(\d+)px/);
    return match ? Number(match[1]) : 0;
  };

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

  it('renders basic package facts as value-only top cards', () => {
    const service = new LabelService();

    const items = (service as any).buildMetaItems(createLabelData());

    expect(items).toEqual(['setar', '2026-04-22', '208g×60袋', '12480g']);
    expect(items.join('')).not.toContain('狗狗');
    expect(items.join('')).not.toContain('制作');
    expect(items.join('')).not.toContain('分装');
    expect(items.join('')).not.toContain('净重');
  });

  it('keeps the basic facts line close to the title without extra rule lines', () => {
    const service = new LabelService();

    expect((service as any).getMetaLineLayout()).toMatchObject({
      drawRules: false,
      topGapMm: expect.any(Number),
      heightMm: expect.any(Number),
    });
    expect((service as any).getMetaLineLayout().topGapMm).toBeLessThanOrEqual(
      0.4,
    );
    expect((service as any).getMetaLineLayout().heightMm).toBeLessThan(4);
  });

  it('uses a print-readable font size for the compact dog/date/package line', () => {
    const service = new LabelService();
    const ctx = createCanvas(559, 799).getContext('2d');

    (service as any).drawMetaLine(ctx, createLabelData(), 0, 0, 487);

    expect(extractFontPx(ctx.font)).toBeGreaterThanOrEqual(
      mmToExpectedPx(2.35),
    );
  });

  it('formats production timestamp as date-only top-card text', () => {
    const service = new LabelService();
    const ctx = createCanvas(559, 799).getContext('2d');
    const data = {
      ...createLabelData(),
      productionTime: '2026-04-26 20:35',
    };

    const items = (service as any).buildMetaItems(data);
    (service as any).drawMetaLine(ctx, data, 0, 0, 487);
    const cards = (service as any).resolveMetaCardLayout(ctx, data, 487);
    const dateCard = cards.find((card: { text: string }) =>
      card.text.startsWith('2026-04-26'),
    );

    expect(items[1]).toBe('2026-04-26');
    expect(items.join('')).not.toContain('20:35');
    expect(dateCard.text).toBe('2026-04-26');
    expect(dateCard.textWidth).toBeLessThanOrEqual(dateCard.maxTextWidth);
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

  it('wraps long ingredient names without dropping ratio or amount text', () => {
    const service = new LabelService();
    const ctx = createCanvas(559, 799).getContext('2d');
    const contentWidth = 487;

    const layout = (service as any).buildIngredientGridLayout(
      ctx,
      ['有机散养去皮去骨鸡胸肉25.51%', '超长品牌复合维生素矿物质营养粉119.40g'],
      contentWidth,
      'regular',
      2,
    );

    expect(layout.rows[0].cells[0].nameLines.join('')).toBe(
      '有机散养去皮去骨鸡胸肉',
    );
    expect(layout.rows[0].cells[0].detailText).toBe('25.5%');
    expect(layout.rows[0].cells[0].nameLines.join('')).not.toContain('...');

    expect(layout.rows[0].cells[1].nameLines.join('')).toBe(
      '超长品牌复合维生素矿物质营养粉',
    );
    expect(layout.rows[0].cells[1].detailText).toBe('119.40g');
    expect(layout.rows[0].cells[1].nameLines.join('')).not.toContain('...');
  });

  it('blocks label generation when complete ingredient text cannot fit the 70x100 label', () => {
    const service = new LabelService();
    const longIngredients = Array.from(
      { length: 42 },
      (_, index) =>
        `第${index + 1}种超长完整显示有机散养去皮去骨精选原料${(index + 1).toFixed(2)}%`,
    ).join('、');

    expect(() =>
      service.generateLabelImage({
        ...createLabelData(),
        foodIngredients: longIngredients,
        supplementIngredients: '',
      }),
    ).toThrow('标签内容超出');
  });

  it('uses two-column ingredient tables before falling back to one column', () => {
    const service = new LabelService();

    expect((service as any).getIngredientGridColumnCandidates()).toEqual([
      2, 1,
    ]);
    expect(
      (service as any).getIngredientGridConfig('compact').fontSize,
    ).toBeGreaterThanOrEqual(2);
  });

  it('uses print-readable ingredient fonts in both regular and compact layouts', () => {
    const service = new LabelService();

    expect(
      (service as any).getIngredientGridConfig('regular').fontSize,
    ).toBeGreaterThanOrEqual(2.45);
    expect(
      (service as any).getIngredientGridConfig('compact').fontSize,
    ).toBeGreaterThanOrEqual(2.25);
  });

  it('keeps nutrition and storage inside the 70x100 label with dense real-world ingredients', () => {
    const service = new LabelService();
    const ctx = createCanvas(559, 799).getContext('2d');
    const data = createLabelData();
    const labelWidthPx = Math.round((70 * testDpi) / 25.4);
    const labelHeightPx = Math.round((100 * testDpi) / 25.4);
    const contentLeft = Math.round((4.5 * testDpi) / 25.4);
    const contentWidth = labelWidthPx - contentLeft * 2;
    const bottomLimit = labelHeightPx - Math.round((4 * testDpi) / 25.4);
    const ingredientStartY = Math.round((19.7 * testDpi) / 25.4);
    const ingredientItems = (service as any).buildIngredientItems(data);
    const mode = (service as any).resolveLabelRenderMode(ingredientItems);
    const layout = (service as any).resolveIngredientGridLayout(
      ctx,
      data,
      ingredientItems,
      ingredientStartY,
      contentWidth,
      mode,
      bottomLimit,
    );

    expect(layout.columns).toBe(2);
    expect(
      (service as any).measureLabelFinalY(data, ingredientStartY, layout, mode),
    ).toBeLessThanOrEqual(bottomLimit);
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

  it('uses three columns for the basic nutrition grid', () => {
    const service = new LabelService();

    expect((service as any).getNutritionGridColumnCount()).toBe(3);
  });

  it('draws energy density without clipping it to a three-column cell', () => {
    const service = new LabelService();
    const ctx = createCanvas(559, 799).getContext('2d');
    const drawnText: string[] = [];
    const clippingWidths = new Map<string, number>();
    const originalFillText = ctx.fillText.bind(ctx);
    const originalClipText = (service as any).clipText.bind(service);

    (ctx as any).fillText = (
      text: string,
      x: number,
      y: number,
      maxWidth?: number,
    ) => {
      drawnText.push(String(text));
      return originalFillText(text, x, y, maxWidth);
    };
    jest.spyOn(service as any, 'clipText').mockImplementation(
      (
        canvasContext: CanvasRenderingContext2D,
        text: string,
        maxWidth: number,
      ) => {
        if (text.startsWith('能量 ') || text.startsWith('钙磷比 ')) {
          clippingWidths.set(text, maxWidth);
        }
        return originalClipText(canvasContext, text, maxWidth);
      },
    );

    (service as any).drawCompleteNutritionSection(
      ctx,
      createLabelData().nutritionAnalysis,
      0,
      0,
      487,
      'regular',
    );

    expect(drawnText).toContain('能量 1487kcal/kg');
    expect(drawnText).toContain('钙磷比 1.35');
    expect(clippingWidths.get('能量 1487kcal/kg')).toBeGreaterThan(220);
    expect(clippingWidths.get('钙磷比 1.35')).toBeGreaterThan(220);
    expect(
      drawnText.some((text) => text.startsWith('能量 ') && text.includes('...')),
    ).toBe(false);
  });

  it('uses print-readable body fonts for nutrition and storage sections', () => {
    const service = new LabelService();
    const ctx = createCanvas(559, 799).getContext('2d');
    const data = createLabelData();

    (service as any).drawCompleteNutritionSection(
      ctx,
      data.nutritionAnalysis,
      0,
      0,
      487,
      'regular',
    );
    expect(extractFontPx(ctx.font)).toBeGreaterThanOrEqual(
      mmToExpectedPx(2.35),
    );

    (service as any).drawStorageSection(ctx, 0, 0, 487);
    expect(extractFontPx(ctx.font)).toBeGreaterThanOrEqual(mmToExpectedPx(2.2));
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
