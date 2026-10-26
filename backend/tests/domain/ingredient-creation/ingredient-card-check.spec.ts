import type { IngredientDraft } from 'src/application/ingredient-creation/ingredient-creation.types';
import {
  INGREDIENT_CARD_RULES,
  runIngredientCardCheck,
} from 'src/domain/ingredient-creation/ingredient-card-check';
import { INGREDIENT_CARD_FIELDS } from 'src/domain/ingredient-creation/ingredient-card-fields';

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

/** 有必填校验的 4 项，不计入完整度提醒。 */
const REQUIRED_FIELD_KEYS: ReadonlySet<string> = new Set([
  'name',
  'type',
  'baseUnit',
  'unitDisplayLabel',
]);

/** 枚举字段给合法值，其余按类型给一个非空值：完整度只看「有没有值」。 */
function sampleValue(field: (typeof INGREDIENT_CARD_FIELDS)[number]): unknown {
  if (field.key === 'category') return 'MEAT_ORGAN';
  if (field.key === 'procurementStrategy') return 'DAILY_PURCHASE';
  if (field.key === 'addTiming') return 'BEFORE_MIXING';
  return field.valueType === 'NUMBER' || field.valueType === 'BOOLEAN'
    ? 1
    : 'x';
}

/** 从字段契约生成「所有 CREATABLE 非必填字段都有值」的草稿。 */
function filledDraft(): Record<string, unknown> {
  const draft: Record<string, unknown> = {
    name: '鹌鹑肉',
    type: 'FOOD',
    baseUnit: 'G',
    unitDisplayLabel: '克',
  };
  for (const field of INGREDIENT_CARD_FIELDS) {
    if (field.stage !== 'CREATABLE' || REQUIRED_FIELD_KEYS.has(field.key)) {
      continue;
    }
    draft[field.key] = sampleValue(field);
  }
  return draft;
}

const draftOf = (value: Record<string, unknown>): IngredientDraft =>
  value as unknown as IngredientDraft;

describe('runIngredientCardCheck', () => {
  it('干净草稿只有完整度提醒，没有阻断 / 例外', () => {
    const items = check(base);
    const levels = new Map(
      INGREDIENT_CARD_RULES.map((rule) => [rule.code, rule.level]),
    );

    expect(items.filter((item) => levels.get(item.code) !== 'warning')).toEqual(
      [],
    );
    expect(items.map((item) => item.code)).toEqual(['FIELDS_EMPTY']);
  });

  it('空字段给出唯一一条完整度提醒，不阻断、不可例外', () => {
    const warnings = check(base).filter((item) => item.code === 'FIELDS_EMPTY');

    expect(warnings).toHaveLength(1);
    // 无法定位到单格，所以不带 fieldPath。
    expect(warnings[0].fieldPath).toBeUndefined();
    expect(warnings[0].message).toMatch(/还有 \d+ 项没填/);
    expect(warnings[0].message).toBe(
      '还有 22 项没填：英文名、类别、备注、单块重量、最大容量、CFCT 分类、可食部、主要营养价值 等',
    );
    expect(warnings[0].suggestion).toBe('这些不是阻断项，补不补由你定');
    expect(
      INGREDIENT_CARD_RULES.find((rule) => rule.code === 'FIELDS_EMPTY')?.level,
    ).toBe('warning');
  });

  it('填满 CREATABLE 非必填字段后不再提示完整度', () => {
    expect(codes(draftOf(filledDraft()))).not.toContain('FIELDS_EMPTY');
  });

  it('AFTER_CREATE 字段留空不报完整度缺失', () => {
    const filled = filledDraft();
    for (const field of INGREDIENT_CARD_FIELDS) {
      if (field.stage === 'AFTER_CREATE') {
        filled[field.key] = null;
      }
    }

    expect(codes(draftOf(filled))).not.toContain('FIELDS_EMPTY');
  });

  it('数字 0 与布尔 false 算已填，不算完整度缺失', () => {
    const filled = filledDraft();
    for (const field of INGREDIENT_CARD_FIELDS) {
      if (field.stage !== 'CREATABLE' || REQUIRED_FIELD_KEYS.has(field.key)) {
        continue;
      }
      if (field.valueType === 'NUMBER') filled[field.key] = 0;
      if (field.valueType === 'BOOLEAN') filled[field.key] = false;
    }

    expect(codes(draftOf(filled))).not.toContain('FIELDS_EMPTY');
  });

  it('可食部按草稿里的比例 edibleYieldRate 判断，已填不算空', () => {
    const filled = filledDraft();
    delete filled.edibleYieldPercent;
    filled.edibleYieldRate = 0.75;

    expect(codes(draftOf(filled))).not.toContain('FIELDS_EMPTY');
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
      'FIELDS_EMPTY',
    ]);
  });

  it('每条都带中文说明与一句建议；能定位到单格的带 fieldPath', () => {
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
    expect(items.some((item) => item.code === 'FIELDS_EMPTY')).toBe(true);
    for (const item of items) {
      if (item.code === 'FIELDS_EMPTY') {
        expect(item.fieldPath).toBeUndefined();
      } else {
        expect(item.fieldPath).toMatch(/^ingredient\./);
      }
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
      'FIELDS_EMPTY',
    ]);
    expect(INGREDIENT_CARD_RULES).toEqual([
      { code: 'NAME_REQUIRED', level: 'blocking' },
      { code: 'NAME_DUPLICATE', level: 'blocking' },
      { code: 'BASE_UNIT_INVALID', level: 'blocking' },
      { code: 'UNIT_LABEL_REQUIRED', level: 'blocking' },
      { code: 'PURCHASE_RATIO_INVALID', level: 'blocking' },
      { code: 'PURCHASE_PRICE_NEGATIVE', level: 'blocking' },
      { code: 'EDIBLE_RANGE', level: 'exceptionable' },
      { code: 'SHELF_LIFE_RANGE', level: 'exceptionable' },
      { code: 'STORAGE_EMPTY', level: 'warning' },
      { code: 'FIELDS_EMPTY', level: 'warning' },
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
      INGREDIENT_CARD_RULES.find((rule) => rule.code === 'FIELDS_EMPTY')?.level,
    ).toBe('warning');
    expect(
      INGREDIENT_CARD_RULES.some((rule) => rule.code === 'PRICE_LOOKS_PROMO'),
    ).toBe(false);
  });
});
