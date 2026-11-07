import { resolveIngredientCostSource } from '../../../src/domain/ingredient/cost-source';

/**
 * 成本来源（2026-11-07 成本口径归位 · Task 9）。
 *
 * 原料页只展示一个来源，它必须来自「成本流水」本身，
 * 而不是以前那套「有没有采购记录」的推测 —— 那套把建档初始化也算成手填。
 */
describe('resolveIngredientCostSource', () => {
  it('按最新一条流水给出四个来源之一', () => {
    expect(resolveIngredientCostSource({ source: 'INIT_FROM_SKU' })).toBe(
      'INIT_FROM_SKU',
    );
    expect(resolveIngredientCostSource({ source: 'REIMBURSEMENT' })).toBe(
      'REIMBURSEMENT',
    );
    expect(resolveIngredientCostSource({ source: 'MANUAL' })).toBe('MANUAL');
    expect(resolveIngredientCostSource({ source: 'MIGRATION' })).toBe(
      'MIGRATION',
    );
  });

  it('没有流水时是 NONE（不是「建档手填」）', () => {
    expect(resolveIngredientCostSource(null)).toBe('NONE');
    expect(resolveIngredientCostSource(undefined)).toBe('NONE');
  });

  it('认不出的来源当 NONE，不往上抛脏值', () => {
    expect(resolveIngredientCostSource({ source: 'LATEST_PURCHASE' })).toBe(
      'NONE',
    );
  });
});
