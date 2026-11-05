import {
  AI_WRITABLE_INGREDIENT_FIELDS,
  EDIBLE_YIELD_RATE_PROPERTY_KEY,
  INGREDIENT_CARD_FIELDS,
  INGREDIENT_CARD_FIELD_KEYS,
  INGREDIENT_PROPERTY_KEY_BY_FIELD,
  isIngredientCardFieldKey,
} from 'src/domain/ingredient-creation/ingredient-card-fields';

/** 展示顺序：按组排列，组内顺序与设计稿一致。 */
const EXPECTED_KEYS_IN_ORDER = [
  // BASIC
  'name',
  'type',
  'notes',
  'tags',
  // MEASURE
  'baseUnit',
  'unitDisplayLabel',
  'weightG',
  'densityGPerMl',
  // NUTRITION
  'cfctClass',
  'edibleYieldPercent',
  'mainNutrientsDesc',
  // PURCHASE
  'procurementStrategy',
  // LABEL
  'labelCategory',
  'labelNames',
  'labelNameSource',
];

/** 组边界：把「组」也钉死，页面的分区不会因为改字段而错位。 */
const EXPECTED_GROUPS_IN_ORDER = [
  ...Array<'BASIC'>(4).fill('BASIC'),
  ...Array<'MEASURE'>(4).fill('MEASURE'),
  ...Array<'NUTRITION'>(3).fill('NUTRITION'),
  ...Array<'PURCHASE'>(1).fill('PURCHASE'),
  ...Array<'LABEL'>(3).fill('LABEL'),
];

describe('食材原料卡字段契约', () => {
  it('恰好 15 项且键不重复', () => {
    expect(INGREDIENT_CARD_FIELDS).toHaveLength(15);
    expect(new Set(INGREDIENT_CARD_FIELD_KEYS).size).toBe(15);
  });

  it('每组顺序与设计一致', () => {
    expect(INGREDIENT_CARD_FIELD_KEYS).toEqual(EXPECTED_KEYS_IN_ORDER);
    expect(INGREDIENT_CARD_FIELDS.map((field) => field.group)).toEqual(
      EXPECTED_GROUPS_IN_ORDER,
    );
  });

  it('标签分类也可在建原料时填，没有 AFTER_CREATE 字段', () => {
    expect(AI_WRITABLE_INGREDIENT_FIELDS).toContain('labelCategory');
    expect(AI_WRITABLE_INGREDIENT_FIELDS).toContain('labelNames');
    expect(AI_WRITABLE_INGREDIENT_FIELDS).toContain('tags');
    expect(AI_WRITABLE_INGREDIENT_FIELDS).toHaveLength(15);
    expect(
      INGREDIENT_CARD_FIELDS.filter(
        (field) => field.stage === 'AFTER_CREATE',
      ).map((field) => field.key),
    ).toEqual([]);
  });

  it('落 properties 的字段包含标签/密度，可食部单列', () => {
    expect(Object.keys(INGREDIENT_PROPERTY_KEY_BY_FIELD).sort()).toEqual([
      'addTiming',
      'category',
      'cfctClass',
      'densityGPerMl',
      'labelCategory',
      'labelNameSource',
      'labelNames',
      'mainNutrientsDesc',
      'nameEn',
      'productionLossRate',
    ]);
    expect(EDIBLE_YIELD_RATE_PROPERTY_KEY).toBe('edible_yield_rate');
    // 可食部不能混进通用映射表，否则 10–100 与 0.1–1 两套口径会被悄悄串用。
    expect(INGREDIENT_PROPERTY_KEY_BY_FIELD).not.toHaveProperty(
      'edibleYieldPercent',
    );
  });

  it('类型守卫只认契约内的键', () => {
    expect(isIngredientCardFieldKey('edibleYieldPercent')).toBe(true);
    expect(isIngredientCardFieldKey('labelNames')).toBe(true);
    expect(isIngredientCardFieldKey('edibleYieldRate')).toBe(false);
    expect(isIngredientCardFieldKey('brand')).toBe(false);
    expect(isIngredientCardFieldKey('nope')).toBe(false);
    expect(isIngredientCardFieldKey(undefined)).toBe(false);
    expect(isIngredientCardFieldKey(42)).toBe(false);
  });
});
