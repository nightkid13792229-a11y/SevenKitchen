import {
  classifyFoodCategory,
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

  it('鱼油归油脂，不归蛋白', () => {
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
});

describe('summarizeFoodCategoryCoverage', () => {
  it('七类齐全，可选类与补剂单独计数', () => {
    const coverage = summarizeFoodCategoryCoverage([
      { category: 'PROTEIN' },
      { category: 'ORGAN' },
      { category: 'CARB' },
      { category: 'VEGETABLE' },
      { category: 'MUSHROOM' },
      { category: 'NUTS' },
      { category: 'OIL' },
      { category: 'FRUIT' },
      { category: 'SUPPLEMENT' },
      { category: 'UNCLASSIFIED' },
    ]);
    expect(coverage.covered).toEqual([
      'PROTEIN',
      'ORGAN',
      'CARB',
      'VEGETABLE',
      'MUSHROOM',
      'NUTS',
      'OIL',
    ]);
    expect(coverage.missing).toEqual([]);
    expect(coverage.optionalPresent).toEqual(['FRUIT']);
    expect(coverage.supplementCount).toBe(1);
    expect(coverage.unclassifiedCount).toBe(1);
  });

  it('缺菌藻时 missing 只报菌藻', () => {
    const coverage = summarizeFoodCategoryCoverage([
      { category: 'PROTEIN' },
      { category: 'ORGAN' },
      { category: 'CARB' },
      { category: 'VEGETABLE' },
      { category: 'NUTS' },
      { category: 'OIL' },
    ]);
    expect(coverage.missing).toEqual(['MUSHROOM']);
  });
});
