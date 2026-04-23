import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('production task PDF layout guardrails', () => {
  const source = readFileSync(
    resolve(
      __dirname,
      '../../../src/infrastructure/services/pdf-generator.service.ts',
    ),
    'utf8',
  );

  it('uses the approved compact A4 ingredient table fields', () => {
    expect(source).toContain('formatIngredientNameLine');
    expect(source).toContain('formatPurchaseSummary');
    expect(source).toContain('品牌 / 渠道 / 规格');
    expect(source).toContain('truncateText');
    expect(source).toContain('getPrintableIngredientCount');
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

  it('wraps purchase summaries in ingredient rows instead of hard truncating them', () => {
    expect(source).toContain('calculateIngredientRowHeight');
    expect(source).toContain('drawWrappedTableText');
    expect(source).not.toContain('truncateText(this.formatPurchaseSummary(ing)');
  });

  it('wraps standard ingredient sku names and preparation methods instead of hard truncating them', () => {
    expect(source).toContain('const nameHeight = this.getWrappedTableTextHeight');
    expect(source).toContain('const methodHeight = this.getWrappedTableTextHeight');
    expect(source).not.toContain('truncateText(this.formatIngredientNameLine(ing)');
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
