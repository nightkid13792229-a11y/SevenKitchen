import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PdfGeneratorService } from '../../../src/infrastructure/services/pdf-generator.service';

describe('production task PDF layout guardrails', () => {
  const source = readFileSync(
    resolve(
      __dirname,
      '../../../src/infrastructure/services/pdf-generator.service.ts',
    ),
    'utf8',
  );

  it('uses the approved one-line SKU source ingredient table fields', () => {
    expect(source).toContain('formatIngredientSkuSourceLine');
    expect(source).toContain('SKU / 品牌 / 渠道 / 规格');
    expect(source).not.toContain('formatIngredientNameLine');
    expect(source).not.toContain('formatIngredientSourceLine');
    expect(source).not.toContain('原料 / SKU / 来源');
    expect(source).not.toContain('来源：');
    expect(source).not.toContain("{ key: 'type'");
    expect(source).not.toContain("{ key: 'purchase'");
    expect(source).toContain('truncateText');
    expect(source).toContain('getPrintableIngredientCount');
  });

  it('formats SKU source copy inline without showing the standard ingredient name', () => {
    const service = new PdfGeneratorService();
    const format = (service as any).formatIngredientSkuSourceLine.bind(service);

    const fullLine = format({
      name: '牛霖',
      standardIngredientName: '牛霖',
      procurementSkuName: 'MM澳洲谷饲牛霖',
      procurementSkuBrand: '山姆自营',
      procurementSkuPurchaseChannel: '山姆会员店',
      procurementSkuProductModel: '1.2kg/盒',
      amount: '535.66',
      unit: 'g',
      typeLabel: '食材',
      typeClass: 'food',
    });
    expect(fullLine).toBe('食材 MM澳洲谷饲牛霖 / 山姆自营 / 山姆会员店 / 1.2kg/盒');
    expect(fullLine).not.toContain('牛霖 / MM澳洲谷饲牛霖');

    expect(
      format({
        name: '海藻粉',
        standardIngredientName: '海藻粉',
        procurementSkuName: '有机海藻粉',
        procurementSkuBrand: '无',
        procurementSkuPurchaseChannel: '暂无',
        procurementSkuProductModel: '-',
        amount: '1.76',
        unit: '平勺',
        typeLabel: '补剂',
        typeClass: 'supplement',
      }),
    ).toBe('补剂 有机海藻粉');
  });

  it('keeps ingredient table text readable with a larger base font', () => {
    expect(source).toContain('INGREDIENT_TABLE_FONT_SIZE = 8.5');
    expect(source).not.toContain('Math.floor(7 * scaleFactor)');
  });

  it('keeps dense ingredient lists at full scale instead of shrinking the table text', () => {
    const service = new PdfGeneratorService();
    const denseIngredients = Array.from({ length: 20 }, (_, index) => ({
      name: `原料${index}`,
      standardIngredientName: `标准原料${index}`,
      procurementSkuName: `高品质长名称采购SKU${index}`,
      procurementSkuBrand: '山姆自营',
      procurementSkuPurchaseChannel: '山姆会员店',
      procurementSkuProductModel: '1.2kg/盒',
      amount: '123.45',
      unit: 'g',
      typeLabel: '食材',
      typeClass: 'food',
      method: '去皮、去骨、生重、打碎、充分搅拌',
    }));

    const scaleFactor = (service as any).calculateScaleFactor({
      recipeName: '测试食谱',
      recipeVersion: '1',
      currentPotNumber: 1,
      totalPots: 1,
      status: 'PENDING',
      totalProductionG: 1800,
      createdAt: '2026-06-12T08:09:00.000Z',
      orderItems: [
        {
          packageSpecG: 60,
          packageCount: 30,
          dogName: '乖乖',
          recipientName: '莫',
          recipientCity: '湖州市',
        },
      ],
      parsedIngredients: denseIngredients,
    });

    expect(scaleFactor).toBe(1);
    expect(source).toContain('drawIngredientTableHeader');
    expect(source).toContain('doc.addPage()');
  });

  it('keeps order cards compact without adding an empty odd-order row', () => {
    expect(source).toContain('isSingleOrder');
    expect(source).toContain('const cardWidth = isSingleOrder');
    expect(source).not.toContain('if (data.orderItems.length % 2 !== 0)');
  });

  it('filters placeholder text from purchase summaries', () => {
    expect(source).toContain('getPrintablePurchaseSummaryParts');
    expect(source).toContain('shouldSkipPurchaseSummaryPart');
    expect(source).toContain("'无'");
    expect(source).toContain("'暂无'");
  });

  it('prints full custom package plans in order cards instead of hard truncating them', () => {
    expect(source).toContain('getOrderPackagePlanSummary');
    expect(source).toContain('calculateOrderCardHeight');
    expect(source).toContain('drawWrappedOrderText');
    expect(source).not.toContain('truncateText(packagePlanSummary');
  });

  it('wraps inline SKU source rows instead of hard truncating them', () => {
    expect(source).toContain('calculateIngredientRowHeight');
    expect(source).toContain('drawWrappedTableText');
    expect(source).not.toContain(
      'truncateText(this.formatIngredientSkuSourceLine(ing)',
    );
  });

  it('places the one-line SKU source column before preparation', () => {
    const methodColumnIndex = source.indexOf("{ key: 'method', label: '制备'");
    const sourceColumnIndex = source.indexOf(
      "{ key: 'source', label: 'SKU / 品牌 / 渠道 / 规格'",
    );

    expect(methodColumnIndex).toBeGreaterThan(-1);
    expect(sourceColumnIndex).toBeGreaterThan(-1);
    expect(sourceColumnIndex).toBeLessThan(methodColumnIndex);
  });

  it('wraps SKU source names and preparation methods instead of hard truncating them', () => {
    expect(source).toContain(
      'const sourceHeight = this.getWrappedTableTextHeight',
    );
    expect(source).toContain(
      'const methodHeight = this.getWrappedTableTextHeight',
    );
    expect(source).not.toContain(
      'truncateText(this.formatIngredientSkuSourceLine(ing)',
    );
    expect(source).not.toContain("truncateText(ing.method || '-'");
  });

  it('uses a condensed one-page layout without nonessential print chrome', () => {
    expect(source).toContain('buildTaskTitleLine');
    expect(source).not.toContain('分装订单（${data.orderItems.length}个）');
    expect(source).not.toContain('注：用量已包含生产损耗');
    expect(source).not.toContain('SevenKitchen 专业鲜食套餐定制');
    expect(source).not.toContain('第 1 / 1 页');
    expect(source).not.toContain('drawFooter');
  });
});
