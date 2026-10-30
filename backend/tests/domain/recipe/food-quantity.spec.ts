/**
 * 食材用量内核
 *
 * 钉住三件事：
 *   · 净需求 = 订单净重 × 归一配比
 *   · 毛需求 = 净需求 ÷ 出成率 × 损耗率（采购按这个买）
 *   · 配比合计为 0 时返回空表，不能除以 0
 */
import { buildFoodQuantityTable } from '../../../src/domain/recipe/food-quantity';

function buildTable(overrides: Record<string, any> = {}) {
  return buildFoodQuantityTable({
    items: [{ itemId: 'row-pork' }, { itemId: 'row-rice' }, { itemId: 'row-veg' }],
    totalNetWeightG: 1050,
    lossRate: 1.05,
    ratioPercentByItemId: new Map([
      ['row-pork', 22.07],
      ['row-rice', 23.36],
      ['row-veg', 34.64],
    ]),
    yieldRateByItemId: new Map([
      ['row-pork', 0.95],
      ['row-rice', 1],
      ['row-veg', 1],
    ]),
    ...overrides,
  });
}

describe('食材用量内核', () => {
  it('按食材配比合计归一后，算出净需求/毛需求/采购用量', () => {
    const table = buildTable();
    const pork = table.get('row-pork')!;

    // 配比合计 80.07 → 归一 27.5634%；1050g × 27.5634% = 289.4g
    expect(pork.normalizedRatioPercent).toBeCloseTo(27.5634, 3);
    expect(pork.netKg).toBeCloseTo(0.289415, 5);
    // ÷ 出成率 0.95 × 损耗 1.05 = 319.9g（采购单上的数）
    expect(pork.grossKg).toBeCloseTo(0.31988, 5);
    // 只含损耗 = 303.9g（制作单口径）
    expect(pork.purchaseKg).toBeCloseTo(0.303886, 5);
  });

  it('配比合计为 0 时返回空表，不除以 0', () => {
    const table = buildTable({
      ratioPercentByItemId: new Map([
        ['row-pork', 0],
        ['row-rice', null],
        ['row-veg', 0],
      ]),
    });
    expect(table.size).toBe(0);
  });

  it('没有出成率的食材按 1 处理，只乘损耗率', () => {
    const table = buildTable({
      yieldRateByItemId: new Map(),
    });
    const pork = table.get('row-pork')!;
    expect(pork.grossKg).toBeCloseTo(pork.netKg * 1.05, 8);
  });

  it('配比为负或缺失的行会被跳过，不污染合计', () => {
    const table = buildTable({
      items: [{ itemId: 'row-pork' }, { itemId: 'row-bad' }],
      ratioPercentByItemId: new Map([
        ['row-pork', 50],
        ['row-bad', -10],
      ]),
      yieldRateByItemId: new Map([['row-pork', 1]]),
    });
    expect(table.has('row-bad')).toBe(false);
    expect(table.get('row-pork')!.normalizedRatioPercent).toBeCloseTo(100, 8);
  });
});
