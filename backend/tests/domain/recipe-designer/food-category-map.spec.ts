import {
  BASE_FOOD_CATEGORIES,
  CHECKLIST_FOOD_CATEGORIES,
  RECIPE_ITEM_CATEGORY_DISPLAY_ORDER,
  SUGGESTED_FOOD_CATEGORIES,
  classifyFoodCategory,
  sortRecipeItemsByDisplayOrder,
  summarizeFoodCategoryCoverage,
  type FoodCategoryInput,
} from 'src/domain/recipe-designer/food-category-map';

function food(
  name: string,
  cfctClass: string,
  nutritionCategory = 'OTHER',
): FoodCategoryInput {
  return { name, cfctClass, nutritionCategory, ingredientType: 'FOOD' };
}

describe('classifyFoodCategory', () => {
  it('南瓜按 CFCT 归蔬菜', () => {
    expect(
      classifyFoodCategory(food('南瓜', '蔬菜类及制品', 'VEGETABLE')),
    ).toBe('VEGETABLE');
  });

  it('鸭胗按业务口径归内脏', () => {
    expect(classifyFoodCategory(food('鸭胗', '禽肉类及制品', 'MEAT'))).toBe(
      'ORGAN',
    );
  });

  it('心里美萝卜不被“心”误判成内脏', () => {
    expect(
      classifyFoodCategory(food('心里美萝卜', '蔬菜类及制品', 'VEGETABLE')),
    ).toBe('VEGETABLE');
  });

  it('猪肚菇不被“肚”误判成内脏', () => {
    expect(classifyFoodCategory(food('猪肚菇', '菌藻类', 'OTHER'))).toBe(
      'MUSHROOM',
    );
  });

  it('香肠不被“肠”误判成内脏', () => {
    expect(classifyFoodCategory(food('香肠', '畜肉类及制品', 'MEAT'))).toBe(
      'PROTEIN',
    );
  });

  it.each(['火腿肠', '红肠'])('加工肠类 %s 归蛋白，不归内脏', (name) => {
    expect(classifyFoodCategory(food(name, '畜肉类及制品', 'MEAT'))).toBe(
      'PROTEIN',
    );
  });

  it('牛肝按营养库 ORGAN 分类归内脏（CFCT 为空）', () => {
    expect(
      classifyFoodCategory({
        name: '牛肝',
        cfctClass: null,
        nutritionCategory: 'ORGAN',
        ingredientType: 'FOOD',
      }),
    ).toBe('ORGAN');
  });

  it('腰果的“腰”不被当成内脏', () => {
    expect(classifyFoodCategory(food('腰果', '坚果种子类', 'OTHER'))).toBe(
      'NUTS',
    );
  });

  it('三文鱼按 CFCT 水产类归水产，不归蛋白', () => {
    expect(classifyFoodCategory(food('三文鱼', '水产类', 'SEAFOOD'))).toBe(
      'AQUATIC',
    );
  });

  it('水产内脏仍按业务口径归内脏', () => {
    expect(classifyFoodCategory(food('鱼肝', '水产类', 'SEAFOOD'))).toBe(
      'ORGAN',
    );
  });

  it('鱼肠是加工水产，归水产而不是内脏', () => {
    expect(classifyFoodCategory(food('鱼肠', '水产类', 'SEAFOOD'))).toBe(
      'AQUATIC',
    );
  });

  it('鱼油归油脂，不归水产', () => {
    expect(classifyFoodCategory(food('鱼油', '油脂类', 'OIL'))).toBe('OIL');
  });

  it('鸡蛋归蛋，不归主蛋白', () => {
    expect(classifyFoodCategory(food('鸡蛋', '蛋类及制品', 'EGG'))).toBe('EGG');
  });

  it('补剂优先归补剂', () => {
    expect(
      classifyFoodCategory({
        name: '肝精粉',
        cfctClass: '畜肉类及制品',
        nutritionCategory: 'ORGAN',
        ingredientType: 'SUPPLEMENT',
      }),
    ).toBe('SUPPLEMENT');
  });

  it('未知分类归未归类', () => {
    expect(
      classifyFoodCategory({
        name: '神秘粉',
        cfctClass: null,
        nutritionCategory: null,
        ingredientType: 'FOOD',
      }),
    ).toBe('UNCLASSIFIED');
  });

  it('CFCT 非空但未映射时归未归类', () => {
    expect(classifyFoodCategory(food('神秘粉', '其他', 'OTHER'))).toBe(
      'UNCLASSIFIED',
    );
  });

  it.each(['toString', '__proto__'])(
    'CFCT 原型键 %s 不被查表命中',
    (cfctClass) => {
      expect(classifyFoodCategory(food('神秘粉', cfctClass, 'OTHER'))).toBe(
        'UNCLASSIFIED',
      );
    },
  );
});

describe('food category checklist constants', () => {
  it('基础 8 类 + 建议 3 类 = 11 类检查清单', () => {
    expect(BASE_FOOD_CATEGORIES).toEqual([
      'PROTEIN',
      'ORGAN',
      'AQUATIC',
      'CARB',
      'VEGETABLE',
      'MUSHROOM',
      'NUTS',
      'OIL',
    ]);
    expect(SUGGESTED_FOOD_CATEGORIES).toEqual(['EGG', 'LEGUME', 'FRUIT']);
    expect(CHECKLIST_FOOD_CATEGORIES).toEqual([
      ...BASE_FOOD_CATEGORIES,
      ...SUGGESTED_FOOD_CATEGORIES,
    ]);
    expect(CHECKLIST_FOOD_CATEGORIES).toHaveLength(11);
  });
});

describe('recipe item display order', () => {
  it('按固定展示顺序排序，水产在内脏之后、补剂与未归类在最后', () => {
    const shuffled = [...RECIPE_ITEM_CATEGORY_DISPLAY_ORDER]
      .reverse()
      .map((category, index) => ({ category, sortOrder: index }));
    const sorted = sortRecipeItemsByDisplayOrder(shuffled);

    expect(sorted.map((item) => item.category)).toEqual([
      ...RECIPE_ITEM_CATEGORY_DISPLAY_ORDER,
    ]);
    expect(RECIPE_ITEM_CATEGORY_DISPLAY_ORDER).toEqual([
      'PROTEIN',
      'ORGAN',
      'AQUATIC',
      'EGG',
      'DAIRY',
      'CARB',
      'LEGUME',
      'VEGETABLE',
      'MUSHROOM',
      'FRUIT',
      'NUTS',
      'OIL',
      'SEASONING',
      'SUPPLEMENT',
      'UNCLASSIFIED',
    ]);
  });

  it('同类内按 sortOrder 升序，且不修改输入数组', () => {
    const items = [
      { id: 'protein-late', category: 'PROTEIN' as const, sortOrder: 9 },
      { id: 'protein-early', category: 'PROTEIN' as const, sortOrder: 2 },
      { id: 'apple', category: 'FRUIT' as const, sortOrder: 0 },
    ];
    const snapshot = [...items];

    expect(
      sortRecipeItemsByDisplayOrder(items).map((item) => item.id),
    ).toEqual(['protein-early', 'protein-late', 'apple']);
    expect(items).toEqual(snapshot);
  });
});

describe('summarizeFoodCategoryCoverage', () => {
  it('11 类齐全，可选类与补剂单独计数', () => {
    const coverage = summarizeFoodCategoryCoverage([
      { category: 'PROTEIN' },
      { category: 'ORGAN' },
      { category: 'AQUATIC' },
      { category: 'CARB' },
      { category: 'VEGETABLE' },
      { category: 'MUSHROOM' },
      { category: 'NUTS' },
      { category: 'OIL' },
      { category: 'EGG' },
      { category: 'LEGUME' },
      { category: 'FRUIT' },
      { category: 'DAIRY' },
      { category: 'SEASONING' },
      { category: 'SUPPLEMENT' },
      { category: 'UNCLASSIFIED' },
    ]);
    expect(coverage.covered).toEqual([
      'PROTEIN',
      'ORGAN',
      'AQUATIC',
      'CARB',
      'VEGETABLE',
      'MUSHROOM',
      'NUTS',
      'OIL',
    ]);
    expect(coverage.missing).toEqual([]);
    expect(coverage.suggestedCovered).toEqual(['EGG', 'LEGUME', 'FRUIT']);
    expect(coverage.suggestedMissing).toEqual([]);
    expect(coverage.optionalPresent).toEqual(['DAIRY', 'SEASONING']);
    expect(coverage.supplementCount).toBe(1);
    expect(coverage.unclassifiedCount).toBe(1);
  });

  it('缺菌藻时 missing 只报菌藻，建议 3 类全未覆盖', () => {
    const coverage = summarizeFoodCategoryCoverage([
      { category: 'PROTEIN' },
      { category: 'ORGAN' },
      { category: 'AQUATIC' },
      { category: 'CARB' },
      { category: 'VEGETABLE' },
      { category: 'NUTS' },
      { category: 'OIL' },
    ]);
    expect(coverage.missing).toEqual(['MUSHROOM']);
    expect(coverage.suggestedMissing).toEqual(['EGG', 'LEGUME', 'FRUIT']);
  });

  it('水果属于建议类，不算可选类', () => {
    const coverage = summarizeFoodCategoryCoverage([{ category: 'FRUIT' }]);
    expect(coverage.suggestedCovered).toEqual(['FRUIT']);
    expect(coverage.suggestedMissing).toEqual(['EGG', 'LEGUME']);
    expect(coverage.optionalPresent).toEqual([]);
  });

  it('建议类按固定顺序输出，不受输入顺序影响', () => {
    const coverage = summarizeFoodCategoryCoverage([
      { category: 'FRUIT' },
      { category: 'EGG' },
    ]);
    expect(coverage.suggestedCovered).toEqual(['EGG', 'FRUIT']);
    expect(coverage.suggestedMissing).toEqual(['LEGUME']);
  });

  it('可选类只统计乳/调味，按固定顺序输出', () => {
    const coverage = summarizeFoodCategoryCoverage([
      { category: 'SEASONING' },
      { category: 'DAIRY' },
    ]);
    expect(coverage.optionalPresent).toEqual(['DAIRY', 'SEASONING']);
  });

  it('两个补剂按出现次数计数', () => {
    const coverage = summarizeFoodCategoryCoverage([
      { category: 'SUPPLEMENT' },
      { category: 'SUPPLEMENT' },
    ]);
    expect(coverage.supplementCount).toBe(2);
  });
});
