import { describe, expect, it } from 'vitest';
import {
  MAX_RECIPE_QUANTITY,
  PROTEIN_OPTIONS,
  formatDiscountRate,
  getProteinSelectionError,
  perRecipeAverage,
  resolveMaxRecipeQuantity,
  resolveRequestedProteinCodes,
  toggleProteinCode,
  trimProteinCodesForQuantity,
} from './custom-recipe-pricing';

describe('多份定制报价展示', () => {
  it('主蛋白只有六种，编码和中文一一对应，不含鱼', () => {
    expect(PROTEIN_OPTIONS.map((option) => option.code)).toEqual([
      'CHICKEN',
      'DUCK',
      'PORK',
      'BEEF',
      'TURKEY',
      'RABBIT',
    ]);
    expect(PROTEIN_OPTIONS.map((option) => option.label)).toEqual([
      '鸡',
      '鸭',
      '猪',
      '牛',
      '火鸡',
      '兔',
    ]);
    expect(PROTEIN_OPTIONS.map((option) => option.code)).not.toContain('FISH');
  });

  it('最多份数收在 1–5：坏配置不放大可买份数', () => {
    expect(MAX_RECIPE_QUANTITY).toBe(5);
    expect(resolveMaxRecipeQuantity(3)).toBe(3);
    expect(resolveMaxRecipeQuantity(0)).toBe(1);
    expect(resolveMaxRecipeQuantity(9)).toBe(5);
    expect(resolveMaxRecipeQuantity(4.9)).toBe(4);
    expect(resolveMaxRecipeQuantity(undefined)).toBe(5);
    expect(resolveMaxRecipeQuantity('abc')).toBe(5);
  });

  it('折扣率按百分比展示，0 不说成 0%', () => {
    expect(formatDiscountRate(0.05)).toBe('5%');
    expect(formatDiscountRate(0.08)).toBe('8%');
    expect(formatDiscountRate(0.1)).toBe('10%');
    expect(formatDiscountRate(0.125)).toBe('12.5%');
    expect(formatDiscountRate(0)).toBe('无优惠');
    expect(formatDiscountRate(undefined)).toBe('无优惠');
  });

  it('每份均价取后端应付金额除以份数，保留到分', () => {
    expect(
      perRecipeAverage({
        quantity: 3,
        unitAmount: 300,
        originalAmount: 900,
        discountRate: 0.08,
        discountAmount: 72,
        payableAmount: 828,
      }),
    ).toBe(276);
    expect(
      perRecipeAverage({
        quantity: 3,
        unitAmount: 300,
        originalAmount: 900,
        discountRate: 0.08,
        discountAmount: 72,
        payableAmount: 100,
      }),
    ).toBe(33.33);
    expect(perRecipeAverage(null)).toBe(0);
  });
});

describe('配方份数与主蛋白规则', () => {
  it('份数减少时裁掉多出来的肉，并告诉页面裁了几种', () => {
    expect(
      trimProteinCodesForQuantity(['CHICKEN', 'DUCK', 'PORK'], 2),
    ).toEqual({ codes: ['CHICKEN', 'DUCK'], dropped: 1 });
    expect(trimProteinCodesForQuantity(['CHICKEN', 'DUCK'], 4)).toEqual({
      codes: ['CHICKEN', 'DUCK'],
      dropped: 0,
    });
    // 非法编码、重复项不算有效选择
    expect(
      trimProteinCodesForQuantity(
        ['CHICKEN', 'CHICKEN', 'FISH', 'DUCK', 'PORK'],
        2,
      ),
    ).toEqual({ codes: ['CHICKEN', 'DUCK'], dropped: 1 });
  });

  it('同一种肉不能重复选，选满后不能再加', () => {
    expect(toggleProteinCode(['CHICKEN'], 'DUCK', 2)).toEqual({
      codes: ['CHICKEN', 'DUCK'],
      limitReached: false,
    });
    expect(toggleProteinCode(['CHICKEN', 'DUCK'], 'CHICKEN', 2)).toEqual({
      codes: ['DUCK'],
      limitReached: false,
    });
    expect(toggleProteinCode(['CHICKEN', 'DUCK'], 'PORK', 2)).toEqual({
      codes: ['CHICKEN', 'DUCK'],
      limitReached: true,
    });
    expect(toggleProteinCode([], 'FISH', 2)).toEqual({
      codes: [],
      limitReached: false,
    });
  });

  it('自己选时必须恰好等于份数，营养师配不校验', () => {
    expect(getProteinSelectionError('DIETITIAN', [], 3)).toBe('');
    expect(getProteinSelectionError('SELF', ['CHICKEN', 'DUCK'], 3)).toBe(
      '请选择 3 种不同主蛋白，还差 1 种',
    );
    expect(
      getProteinSelectionError('SELF', ['CHICKEN', 'DUCK', 'PORK'], 3),
    ).toBe('');
    expect(
      getProteinSelectionError(
        'SELF',
        ['CHICKEN', 'DUCK', 'PORK', 'BEEF'],
        3,
      ),
    ).toBe('最多选择 3 种不同主蛋白');
    expect(getProteinSelectionError('SELF', ['CHICKEN', 'FISH'], 2)).toBe(
      '主蛋白选项不正确，请重新选择',
    );
    expect(
      getProteinSelectionError('SELF', ['CHICKEN', 'CHICKEN'], 2),
    ).toBe('主蛋白选项不正确，请重新选择');
  });

  it('营养师配提交空数组；自己选提交裁到份数的编码', () => {
    expect(
      resolveRequestedProteinCodes(
        'DIETITIAN',
        ['CHICKEN', 'DUCK', 'PORK'],
        3,
      ),
    ).toEqual([]);
    expect(
      resolveRequestedProteinCodes('SELF', ['CHICKEN', 'DUCK', 'PORK'], 2),
    ).toEqual(['CHICKEN', 'DUCK']);
  });
});
