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
  'nameEn',
  'type',
  'category',
  'notes',
  // MEASURE
  'baseUnit',
  'unitDisplayLabel',
  'weightG',
  'maxCapacityG',
  // NUTRITION
  'cfctClass',
  'edibleYieldPercent',
  'mainNutrientsDesc',
  // PURCHASE
  'procurementStrategy',
  'purchaseUnit',
  'purchaseToBaseRatio',
  'currentPricePerPurchaseUnit',
  'brand',
  'productModel',
  'purchaseChannel',
  // STOCK
  'safetyStock',
  'reorderPoint',
  'targetStock',
  // USAGE
  'diyEnabled',
  'addTiming',
  'productionLossRate',
  'tags',
  // STORAGE
  'shelfLifeMonths',
  'storageCondition',
  'openedShelfLifeDays',
  'isOilBased',
];

/** 组边界：把「组」也钉死，页面的分区不会因为改字段而错位。 */
const EXPECTED_GROUPS_IN_ORDER = [
  ...Array<'BASIC'>(5).fill('BASIC'),
  ...Array<'MEASURE'>(4).fill('MEASURE'),
  ...Array<'NUTRITION'>(3).fill('NUTRITION'),
  ...Array<'PURCHASE'>(7).fill('PURCHASE'),
  ...Array<'STOCK'>(3).fill('STOCK'),
  ...Array<'USAGE'>(4).fill('USAGE'),
  ...Array<'STORAGE'>(4).fill('STORAGE'),
];

describe('原料卡字段契约', () => {
  it('恰好 30 项且键不重复', () => {
    expect(INGREDIENT_CARD_FIELDS).toHaveLength(30);
    expect(new Set(INGREDIENT_CARD_FIELD_KEYS).size).toBe(30);
  });

  it('每组顺序与设计一致', () => {
    expect(INGREDIENT_CARD_FIELD_KEYS).toEqual(EXPECTED_KEYS_IN_ORDER);
    expect(INGREDIENT_CARD_FIELDS.map((field) => field.group)).toEqual(
      EXPECTED_GROUPS_IN_ORDER,
    );
  });

  it('库存三项与标签在建完之后补，AI 本阶段不写', () => {
    expect(AI_WRITABLE_INGREDIENT_FIELDS).not.toContain('safetyStock');
    expect(AI_WRITABLE_INGREDIENT_FIELDS).not.toContain('tags');
    expect(AI_WRITABLE_INGREDIENT_FIELDS).toHaveLength(26);
    expect(
      INGREDIENT_CARD_FIELDS.filter(
        (field) => field.stage === 'AFTER_CREATE',
      ).map((field) => field.key),
    ).toEqual(['safetyStock', 'reorderPoint', 'targetStock', 'tags']);
  });

  it('只有 6 个字段直接落 properties，可食部单列', () => {
    expect(Object.keys(INGREDIENT_PROPERTY_KEY_BY_FIELD).sort()).toEqual([
      'addTiming',
      'category',
      'cfctClass',
      'mainNutrientsDesc',
      'nameEn',
      'productionLossRate',
    ]);
    expect(EDIBLE_YIELD_RATE_PROPERTY_KEY).toBe('edible_yield_rate');
    // 可食部不能混进通用映射表，否则 0–100 与 0–1 两套口径会被悄悄串用。
    expect(INGREDIENT_PROPERTY_KEY_BY_FIELD).not.toHaveProperty(
      'edibleYieldPercent',
    );
  });

  it('类型守卫只认契约内的键', () => {
    expect(isIngredientCardFieldKey('edibleYieldPercent')).toBe(true);
    expect(isIngredientCardFieldKey('edibleYieldRate')).toBe(false);
    expect(isIngredientCardFieldKey('nope')).toBe(false);
    expect(isIngredientCardFieldKey(undefined)).toBe(false);
    expect(isIngredientCardFieldKey(42)).toBe(false);
  });
});
