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

  it('可选类按固定顺序输出，不受输入顺序影响', () => {
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
