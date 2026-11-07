import { RecipesController } from '../../../src/interfaces/controllers/recipes.controller';

/**
 * 参考价接口的版本选择与批量行为。
 *
 * 为什么必须有这层测试：`computeRecipeReferencePrice` 的单测只能证明
 * "传了版本就按版本取"，证明不了**接口有没有把版本传下去**。
 * 少了这层，把 version 参数删掉，草稿取价的 bug 会悄悄回来。
 */
describe('RecipesController · 参考价版本与批量', () => {
  const buildController = (compute: jest.Mock) => {
    // 只测接口编排：不跑构造函数，直接把依赖与方法挂到原型实例上
    const controller: any = Object.create(RecipesController.prototype);
    controller.orderService = { computeRecipeReferencePrice: compute };
    return controller;
  };

  it('把已发布版本号传给算价', async () => {
    const compute = jest.fn(async (recipeId: string, version?: number) => ({
      recipeId,
      pricePer100g: 20 + (version ?? 0),
    }));
    const controller: any = buildController(compute);
    controller.resolveReferencePriceLifeStageVersions = jest.fn(async () => [
      { recipeId: 'rid', version: 2, lifeStage: 'HIGH_ACTIVITY_ADULT' },
    ]);

    const res: any = await controller.getReferencePrice('rid');

    expect(compute).toHaveBeenCalledWith('rid', 2);
    expect(res.data.minPricePer100g).toBe(22);
    expect(res.data.lifeStagePrices).toEqual([
      { recipeId: 'rid', lifeStage: 'HIGH_ACTIVITY_ADULT', pricePer100g: 22 },
    ]);
  });

  it('批量算价：保持请求顺序，单个失败只丢它自己', async () => {
    const compute = jest.fn(async (recipeId: string) => {
      if (recipeId === 'b') {
        throw new Error('boom');
      }
      return { recipeId, pricePer100g: 10 };
    });
    const controller: any = buildController(compute);
    controller.resolveReferencePriceLifeStageVersions = jest.fn(
      async (id: string) => [{ recipeId: id, version: 1, lifeStage: null }],
    );

    const res: any = await controller.getReferencePrices('c,b,a');

    expect(res.data.items.map((item: any) => item.recipeId)).toEqual([
      'c',
      'a',
    ]);
    expect(res.data.items[0].minPricePer100g).toBe(10);
  });

  it('独立食谱取同 recipeId 的最新已发布版本，不跨到别的菜', async () => {
    const controller = buildController(jest.fn());
    controller.loadPublicSeriesRecipes = jest.fn(async () => [
      { recipeId: 'rid', version: 2, seriesLifeStage: null },
      { recipeId: 'other', version: 9, seriesLifeStage: null },
    ]);

    const versions = await controller.resolveReferencePriceLifeStageVersions(
      'rid',
    );

    expect(versions).toEqual([{ recipeId: 'rid', version: 2, lifeStage: null }]);
  });
});
