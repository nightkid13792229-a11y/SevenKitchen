import type { IngredientDraft } from 'src/application/ingredient-creation/ingredient-creation.types';
import {
  INGREDIENT_CARD_RULES,
  runIngredientCardCheck,
} from 'src/domain/ingredient-creation/ingredient-card-check';

/** 干净草稿：只填 4 个必填项，采购、贮存等其余字段都留空。 */
const base: IngredientDraft = {
  name: '冷冻三文鱼',
  type: 'FOOD',
  baseUnit: 'G',
  unitDisplayLabel: '克',
};

const check = (
  ingredient: IngredientDraft | null,
  existingNames: readonly string[] = [],
) => runIngredientCardCheck({ ingredient, existingNames });

const codes = (
  ingredient: IngredientDraft | null,
  existingNames: readonly string[] = [],
) => check(ingredient, existingNames).map((item) => item.code);

describe('runIngredientCardCheck', () => {
  it('干净草稿零问题', () => {
    expect(check(base)).toEqual([]);
  });

  it('草稿为 null 时只报名称必填', () => {
    const items = check(null);

    expect(items).toHaveLength(1);
    expect(items[0].code).toBe('NAME_REQUIRED');
    expect(items[0].fieldPath).toBe('ingredient.name');
  });

  it('名称只有空白（含全角空格）时算必填缺失', () => {
    expect(codes({ ...base, name: '   ' })).toContain('NAME_REQUIRED');
    expect(codes({ ...base, name: '\u3000\u3000' })).toContain('NAME_REQUIRED');
  });

  it('全角空格与半角空格归一后仍算重名', () => {
    expect(codes({ ...base, name: '冷冻　三文鱼' }, ['冷冻 三文鱼'])).toContain(
      'NAME_DUPLICATE',
    );
  });

  it('比较重名时忽略大小写、首尾空白与连续空白', () => {
    expect(
      codes({ ...base, name: '  FROZEN   Salmon ' }, ['frozen salmon']),
    ).toContain('NAME_DUPLICATE');
    expect(
      codes({ ...base, name: '冷冻 三文鱼' }, ['  冷冻　三文鱼  ']),
    ).toContain('NAME_DUPLICATE');
  });

  it('名字不同不报重名', () => {
    expect(codes(base, ['冷冻鳕鱼'])).not.toContain('NAME_DUPLICATE');
  });

  it('基本单位只能是 G / ML / PCS', () => {
    for (const unit of ['G', 'ML', 'PCS'] as const) {
      expect(codes({ ...base, baseUnit: unit })).not.toContain(
        'BASE_UNIT_INVALID',
      );
    }

    const items = check({ ...base, baseUnit: 'KG' as never });
    expect(items.map((item) => item.code)).toContain('BASE_UNIT_INVALID');
    expect(
      items.find((item) => item.code === 'BASE_UNIT_INVALID')?.fieldPath,
    ).toBe('ingredient.baseUnit');
  });

  it('单位展示名称不能为空', () => {
    const items = check({ ...base, unitDisplayLabel: '  ' });

    expect(items.map((item) => item.code)).toContain('UNIT_LABEL_REQUIRED');
    expect(
      items.find((item) => item.code === 'UNIT_LABEL_REQUIRED')?.fieldPath,
    ).toBe('ingredient.unitDisplayLabel');
  });

  it('采购换算比例为空时不报错，0 与负数报错', () => {
    expect(codes(base)).not.toContain('PURCHASE_RATIO_INVALID');
    expect(codes({ ...base, purchaseToBaseRatio: null })).not.toContain(
      'PURCHASE_RATIO_INVALID',
    );
    expect(codes({ ...base, purchaseToBaseRatio: 0.5 })).not.toContain(
      'PURCHASE_RATIO_INVALID',
    );

    const zero = check({ ...base, purchaseToBaseRatio: 0 });
    expect(zero.map((item) => item.code)).toContain('PURCHASE_RATIO_INVALID');
    expect(
      zero.find((item) => item.code === 'PURCHASE_RATIO_INVALID')?.fieldPath,
    ).toBe('ingredient.purchaseToBaseRatio');
    expect(codes({ ...base, purchaseToBaseRatio: -1 })).toContain(
      'PURCHASE_RATIO_INVALID',
    );
  });

  it('采购价 0 不报负价，负数才报', () => {
    expect(codes(base)).not.toContain('PURCHASE_PRICE_NEGATIVE');
    expect(codes({ ...base, currentPricePerPurchaseUnit: 0 })).not.toContain(
      'PURCHASE_PRICE_NEGATIVE',
    );
    expect(codes({ ...base, currentPricePerPurchaseUnit: 12.5 })).not.toContain(
      'PURCHASE_PRICE_NEGATIVE',
    );

    const items = check({ ...base, currentPricePerPurchaseUnit: -0.01 });
    expect(items.map((item) => item.code)).toContain('PURCHASE_PRICE_NEGATIVE');
    expect(
      items.find((item) => item.code === 'PURCHASE_PRICE_NEGATIVE')?.fieldPath,
    ).toBe('ingredient.currentPricePerPurchaseUnit');
  });

  it('可食部 0 与 1.5 都不合格，1 合法', () => {
    expect(codes({ ...base, edibleYieldRate: 0 })).toContain('EDIBLE_RANGE');
    expect(codes({ ...base, edibleYieldRate: 1.5 })).toContain('EDIBLE_RANGE');
    expect(codes({ ...base, edibleYieldRate: 1 })).not.toContain(
      'EDIBLE_RANGE',
    );
    expect(codes({ ...base, edibleYieldRate: 0.75 })).not.toContain(
      'EDIBLE_RANGE',
    );
    expect(codes({ ...base, edibleYieldRate: null })).not.toContain(
      'EDIBLE_RANGE',
    );
  });

  it('可食部的 fieldPath 用公共名 edibleYieldPercent，而不是存储名 edibleYieldRate', () => {
    const item = check({ ...base, edibleYieldRate: 0 }).find(
      (candidate) => candidate.code === 'EDIBLE_RANGE',
    );

    expect(item?.fieldPath).toBe('ingredient.edibleYieldPercent');
    expect(item?.fieldPath).not.toContain('edibleYieldRate');
  });

  it('保质期必须是 1–120 的整数月', () => {
    for (const shelfLifeMonths of [0, 1.5, 121]) {
      expect(codes({ ...base, shelfLifeMonths })).toContain('SHELF_LIFE_RANGE');
    }

    for (const shelfLifeMonths of [1, 12, 120]) {
      expect(codes({ ...base, shelfLifeMonths })).not.toContain(
        'SHELF_LIFE_RANGE',
      );
    }

    expect(codes({ ...base, shelfLifeMonths: null })).not.toContain(
      'SHELF_LIFE_RANGE',
    );

    const items = check({ ...base, shelfLifeMonths: 0 });
    expect(
      items.find((item) => item.code === 'SHELF_LIFE_RANGE')?.fieldPath,
    ).toBe('ingredient.shelfLifeMonths');
  });

  it('填了采购单位或采购价、却没填贮存条件时提醒', () => {
    const byUnit = check({ ...base, purchaseUnit: '袋' });
    expect(byUnit.map((item) => item.code)).toContain('STORAGE_EMPTY');
    expect(
      byUnit.find((item) => item.code === 'STORAGE_EMPTY')?.fieldPath,
    ).toBe('ingredient.storageCondition');

    expect(codes({ ...base, currentPricePerPurchaseUnit: 0 })).toContain(
      'STORAGE_EMPTY',
    );

    expect(
      codes({ ...base, purchaseUnit: '袋', storageCondition: '-18℃ 冷冻' }),
    ).not.toContain('STORAGE_EMPTY');
    expect(
      codes({ ...base, purchaseUnit: '  ', storageCondition: '常温避光' }),
    ).not.toContain('STORAGE_EMPTY');
    expect(codes(base)).not.toContain('STORAGE_EMPTY');
  });

  it('多个问题按规则表的固定顺序返回', () => {
    const messy: IngredientDraft = {
      name: '  ',
      type: 'FOOD',
      baseUnit: 'KG' as never,
      unitDisplayLabel: '',
      purchaseToBaseRatio: 0,
      currentPricePerPurchaseUnit: -1,
      edibleYieldRate: 0,
      shelfLifeMonths: 0,
      purchaseUnit: '袋',
      storageCondition: ' ',
    };

    expect(codes(messy)).toEqual([
      'NAME_REQUIRED',
      'BASE_UNIT_INVALID',
      'UNIT_LABEL_REQUIRED',
      'PURCHASE_RATIO_INVALID',
      'PURCHASE_PRICE_NEGATIVE',
      'EDIBLE_RANGE',
      'SHELF_LIFE_RANGE',
      'STORAGE_EMPTY',
    ]);
  });

  it('每条都带能定位的 fieldPath、中文说明与一句建议', () => {
    const items = check({
      name: '  ',
      type: 'FOOD',
      baseUnit: 'KG' as never,
      unitDisplayLabel: '',
      purchaseToBaseRatio: 0,
      currentPricePerPurchaseUnit: -1,
      edibleYieldRate: 0,
      shelfLifeMonths: 0,
      purchaseUnit: '袋',
      storageCondition: '',
    });

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.fieldPath).toMatch(/^ingredient\./);
      expect(item.message).toMatch(/[\u4e00-\u9fff]/);
      expect(item.suggestion?.trim()).toBeTruthy();
    }
  });

  it('规则表按固定顺序列全本任务实现的规则，且不含 PRICE_LOOKS_PROMO', () => {
    expect(INGREDIENT_CARD_RULES.map((rule) => rule.code)).toEqual([
      'NAME_REQUIRED',
      'NAME_DUPLICATE',
      'BASE_UNIT_INVALID',
      'UNIT_LABEL_REQUIRED',
      'PURCHASE_RATIO_INVALID',
      'PURCHASE_PRICE_NEGATIVE',
      'EDIBLE_RANGE',
      'SHELF_LIFE_RANGE',
      'STORAGE_EMPTY',
    ]);
    expect(
      INGREDIENT_CARD_RULES.find((rule) => rule.code === 'NAME_REQUIRED')
        ?.level,
    ).toBe('blocking');
    expect(
      INGREDIENT_CARD_RULES.find((rule) => rule.code === 'EDIBLE_RANGE')?.level,
    ).toBe('exceptionable');
    expect(
      INGREDIENT_CARD_RULES.find((rule) => rule.code === 'STORAGE_EMPTY')
        ?.level,
    ).toBe('warning');
    expect(
      INGREDIENT_CARD_RULES.some((rule) => rule.code === 'PRICE_LOOKS_PROMO'),
    ).toBe(false);
  });
});
