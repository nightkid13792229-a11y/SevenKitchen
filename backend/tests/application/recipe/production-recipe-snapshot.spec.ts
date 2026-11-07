import { buildProductionRecipeSnapshot } from '../../../src/application/recipe/production-recipe-snapshot';

const baseRecipe = {
  id: 'recipe-1',
  version: 3,
  name: '牛肉南瓜鲜食',
  productionLossRate: 1.07,
  energyDensityKcalPerKg: 1200,
  items: [],
};

describe('buildProductionRecipeSnapshot · 生命阶段版本', () => {
  it('写入版本枚举与中文名', () => {
    const snapshot = buildProductionRecipeSnapshot({
      recipe: { ...baseRecipe, seriesLifeStage: 'HIGH_ACTIVITY_ADULT' },
      ingredientMap: new Map(),
      prepMethodMap: new Map(),
    });

    expect(snapshot.series_life_stage).toBe('HIGH_ACTIVITY_ADULT');
    expect(snapshot.series_life_stage_label).toBe('成犬版');
  });

  it('原样保存设计器里写的「部位 / 状态 / 预处理」', () => {
    const ingredient = {
      id: 'ing-1',
      name: '猪里脊',
      type: 'FOOD',
      properties: {},
    } as any;

    const snapshot = buildProductionRecipeSnapshot({
      recipe: {
        ...baseRecipe,
        items: [
          {
            ingredientId: 'ing-1',
            ratioPercent: 100,
            preparationMethod: '去筋膜，切 2cm 丁；生重',
          },
        ],
      },
      ingredientMap: new Map([['ing-1', ingredient]]),
      prepMethodMap: new Map(),
    });

    // 制作单要原话：逗号、分号、顺序都不能被改成顿号
    expect(snapshot.items[0].preparation_method).toBe('去筋膜，切 2cm 丁；生重');
  });

  it('历史字典 ID 仍然解析成可读名字', () => {
    const ingredient = {
      id: 'ing-1',
      name: '猪里脊',
      type: 'FOOD',
      properties: {},
    } as any;
    const peelId = '11111111-1111-1111-1111-111111111111';
    const steamId = '22222222-2222-2222-2222-222222222222';

    const snapshot = buildProductionRecipeSnapshot({
      recipe: {
        ...baseRecipe,
        items: [
          {
            ingredientId: 'ing-1',
            ratioPercent: 100,
            preparationMethod: `${peelId}, ${steamId}`,
          },
        ],
      },
      ingredientMap: new Map([['ing-1', ingredient]]),
      prepMethodMap: new Map([
        [peelId, '去皮'],
        [steamId, '蒸熟'],
      ]),
    });

    expect(snapshot.items[0].preparation_method).toBe('去皮、蒸熟');
  });

  it('没有版本时不写这两个字段', () => {
    const snapshot = buildProductionRecipeSnapshot({
      recipe: { ...baseRecipe, seriesLifeStage: null },
      ingredientMap: new Map(),
      prepMethodMap: new Map(),
    });

    expect(snapshot).not.toHaveProperty('series_life_stage');
    expect(snapshot).not.toHaveProperty('series_life_stage_label');
  });
});
