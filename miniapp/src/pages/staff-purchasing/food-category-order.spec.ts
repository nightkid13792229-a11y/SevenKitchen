import { describe, expect, it } from 'vitest';
import {
  CFCT_DISPLAY_ORDER,
  groupPurchaseItemsForDisplay,
  resolveCfctClass,
  sortFoodItemsByCfctOrder,
  sortPurchaseItemsForDisplay,
} from './food-category-order';

const foodItem = (name: string, cfctClass?: string | null) => ({
  ingredientName: name,
  ingredient: cfctClass === undefined ? {} : { properties: { cfct_class: cfctClass } },
});

const purchaseItem = (name: string, type?: string, cfctClass?: string) => ({
  ingredientName: name,
  type,
  ingredient: cfctClass ? { properties: { cfct_class: cfctClass } } : {},
});

describe('CFCT 展示顺序', () => {
  it('按老板确认的 15 类固定顺序排列', () => {
    expect([...CFCT_DISPLAY_ORDER]).toEqual([
      '畜肉类及制品',
      '禽肉类及制品',
      '水产类',
      '蛋类及制品',
      '乳类及制品',
      '谷类及制品',
      '薯类及制品',
      '干豆类及制品',
      '蔬菜类及制品',
      '菌藻类',
      '水果类及制品',
      '坚果种子类',
      '油脂类',
      '调味品类',
      '其他',
    ]);
  });

  it('食材按分类顺序重排，而不是保持录入先后', () => {
    const items = [
      foodItem('生抽', '调味品类'),
      foodItem('西兰花', '蔬菜类及制品'),
      foodItem('牛肝', '畜肉类及制品'),
      foodItem('亚麻籽', '坚果种子类'),
      foodItem('小麦胚芽油', '油脂类'),
      foodItem('鸡胸肉', '禽肉类及制品'),
    ];

    expect(sortFoodItemsByCfctOrder(items).map((item) => item.ingredientName)).toEqual([
      '牛肝',
      '鸡胸肉',
      '西兰花',
      '亚麻籽',
      '小麦胚芽油',
      '生抽',
    ]);
  });

  it('谷薯豆排在蔬菜前面（老板 2026-11-05 定的顺序）', () => {
    const items = [
      foodItem('胡萝卜', '蔬菜类及制品'),
      foodItem('三色藜麦', '谷类及制品'),
      foodItem('红薯', '薯类及制品'),
      foodItem('鹰嘴豆', '干豆类及制品'),
    ];

    expect(sortFoodItemsByCfctOrder(items).map((item) => item.ingredientName)).toEqual([
      '三色藜麦',
      '红薯',
      '鹰嘴豆',
      '胡萝卜',
    ]);
  });

  it('老数据只写了「畜肉类 / 油脂类」这种去掉「及制品」的写法也能认', () => {
    expect(resolveCfctClass(foodItem('牛肉', '畜肉类'))).toBe('畜肉类及制品');
    expect(resolveCfctClass(foodItem('鱼油', '油脂类'))).toBe('油脂类');
    expect(resolveCfctClass(foodItem('海带', ' 菌藻类 '))).toBe('菌藻类');
  });

  it('没分类 / 其他 一律垫底，并保留它们彼此的原有先后', () => {
    const items = [
      foodItem('不明原料A'),
      foodItem('牛肝', '畜肉类及制品'),
      foodItem('不明原料B', '其他'),
      foodItem('西兰花', '蔬菜类及制品'),
    ];

    expect(sortFoodItemsByCfctOrder(items).map((item) => item.ingredientName)).toEqual([
      '牛肝',
      '西兰花',
      '不明原料A',
      '不明原料B',
    ]);
  });

  it('同一分类内保持原来的录入先后', () => {
    const items = [
      foodItem('牛心', '畜肉类及制品'),
      foodItem('兔里脊', '畜肉类及制品'),
      foodItem('牛肝', '畜肉类及制品'),
    ];

    expect(sortFoodItemsByCfctOrder(items).map((item) => item.ingredientName)).toEqual([
      '牛心',
      '兔里脊',
      '牛肝',
    ]);
  });

  it('不修改传入的数组', () => {
    const items = [foodItem('生抽', '调味品类'), foodItem('牛肝', '畜肉类及制品')];
    const snapshot = [...items];

    sortFoodItemsByCfctOrder(items);

    expect(items).toEqual(snapshot);
  });

  it('分类字段缺失、为空白或结构异常时都算未分类，不抛错', () => {
    expect(resolveCfctClass({})).toBeNull();
    expect(resolveCfctClass({ ingredient: { properties: null } })).toBeNull();
    expect(resolveCfctClass({ ingredient: { properties: { cfct_class: '   ' } } })).toBeNull();
    expect(resolveCfctClass({ ingredient: { properties: { cfct_class: 123 } } })).toBeNull();
    expect(resolveCfctClass({ ingredient: { properties: 'not-json' } })).toBeNull();
  });

  it('properties 是 JSON 字符串时也能读出分类', () => {
    const item = { ingredient: { properties: '{"cfct_class":"水产类"}' } };

    expect(resolveCfctClass(item)).toBe('水产类');
  });
});

describe('采购清单原料的整份排序（详情页 + 识别结果页共用）', () => {
  it('食材在前、补剂其次、包装材料最后', () => {
    const items = [
      purchaseItem('分装袋', 'PACKAGING'),
      purchaseItem('鱼油', 'SUPPLEMENT'),
      purchaseItem('牛肝', 'FOOD', '畜肉类及制品'),
    ];

    expect(sortPurchaseItemsForDisplay(items).map((item) => item.ingredientName)).toEqual([
      '牛肝',
      '鱼油',
      '分装袋',
    ]);
  });

  it('食材内部按 CFCT 顺序，补剂之间保持原有先后', () => {
    const items = [
      purchaseItem('鱼油A', 'SUPPLEMENT'),
      purchaseItem('小麦胚芽油', 'FOOD', '油脂类'),
      purchaseItem('维生素C', 'SUPPLEMENT'),
      purchaseItem('牛肝', 'FOOD', '畜肉类及制品'),
    ];

    expect(sortPurchaseItemsForDisplay(items).map((item) => item.ingredientName)).toEqual([
      '牛肝',
      '小麦胚芽油',
      '鱼油A',
      '维生素C',
    ]);
  });

  it('类型缺失或写了未知值时归到食材，不会从列表里消失', () => {
    const items = [
      purchaseItem('分装袋', 'PACKAGING'),
      purchaseItem('自制骨粉', 'OTHER', '其他'),
      purchaseItem('牛肝', 'FOOD', '畜肉类及制品'),
    ];

    const groups = groupPurchaseItemsForDisplay(items);

    expect(groups.map((group) => group.type)).toEqual(['FOOD', 'PACKAGING']);
    expect(groups[0].items.map((item) => item.ingredientName)).toEqual(['牛肝', '自制骨粉']);
    expect(groups[1].items.map((item) => item.ingredientName)).toEqual(['分装袋']);
  });

  it('空清单返回空分组', () => {
    expect(groupPurchaseItemsForDisplay([])).toEqual([]);
    expect(sortPurchaseItemsForDisplay([])).toEqual([]);
  });

  it('不修改传入的数组', () => {
    const items = [
      purchaseItem('分装袋', 'PACKAGING'),
      purchaseItem('牛肝', 'FOOD', '畜肉类及制品'),
    ];
    const snapshot = [...items];

    sortPurchaseItemsForDisplay(items);

    expect(items).toEqual(snapshot);
  });
});
