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
