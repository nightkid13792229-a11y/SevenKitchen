import { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';
import { executeTool } from '../../../src/application/recipe-designer/agent/tools';

function candidate(name: string, id: string) {
  return {
    ingredientId: id,
    nutritionFoodId: `nf-${id}`,
    name,
    type: 'FOOD',
    category: 'SEAFOOD',
    preparationState: 'RAW',
    isPrimary: true,
  };
}

describe('match_food_name', () => {
  it('端口按模型给的多个名字查库，只返回名字/档案信息', async () => {
    const findFoods = jest.fn(async (input: any) =>
      input.search === '青花鱼' ? [candidate('青花鱼', 'fish')] : [],
    );
    const port = new RecipeDraftPort(
      { listIngredientOptions: jest.fn() } as any,
      {} as any,
      'draft-1',
    );
    (port as any).findFoods = findFoods;

    const matches = await port.matchFoodNames(['鲭鱼', '青花鱼']);

    expect(findFoods).toHaveBeenCalledWith({ search: '鲭鱼', limit: 8 });
    expect(findFoods).toHaveBeenCalledWith({ search: '青花鱼', limit: 8 });
    expect(matches).toEqual([
      expect.objectContaining({
        query: '青花鱼',
        ingredientId: 'fish',
        name: '青花鱼',
      }),
    ]);
    expect(matches[0]).not.toHaveProperty('nutrientMatch');
  });

  it('工具把候选返回给模型，不替代模型判断', async () => {
    const context = {
      port: {
        matchFoodNames: jest.fn().mockResolvedValue([
          {
            query: '青花鱼',
            ingredientId: 'fish',
            nutritionFoodId: 'nf-fish',
            name: '青花鱼',
            type: 'FOOD',
            category: 'SEAFOOD',
            preparationState: 'RAW',
            isPrimary: true,
          },
        ]),
      } as any,
      catalog: {} as any,
      knowledge: {} as any,
      onAsk: jest.fn(),
    };

    const outcome = (await executeTool(
      'match_food_name',
      { names: ['鲭鱼', '青花鱼'] },
      context,
    )) as any;

    expect(outcome.ok).toBe(true);
    expect(outcome.data[0].name).toBe('青花鱼');
    expect(outcome.summary).toContain('找到 1 条候选');
  });
});
