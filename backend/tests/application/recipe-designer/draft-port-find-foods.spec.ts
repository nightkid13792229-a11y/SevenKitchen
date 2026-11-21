import { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';

function row(overrides: Record<string, any>) {
  return {
    id: 'id',
    name: 'name',
    type: 'FOOD',
    procurementEnabled: false,
    nutritionProfiles: [
      {
        nutritionFoodId: 'nf',
        isPrimary: true,
        displayNameZh: null,
        category: '蔬菜类及制品',
        preparationStateLabel: null,
      },
    ],
    ...overrides,
  };
}

describe('RecipeDraftPort.findFoods / findFoodGroups', () => {
  it('findFoods 只匹配食材，不再把补剂混进选材', async () => {
    const designer = {
      listIngredientOptions: jest.fn(async (input: any) =>
        input.type === 'FOOD'
          ? { data: [row({ id: 'food', name: '鸡胸肉', type: 'FOOD' })], total: 1 }
          : {
              data: [
                row({
                  id: 'on',
                  name: '开启补剂',
                  type: 'SUPPLEMENT',
                  procurementEnabled: true,
                }),
              ],
              total: 1,
            },
      ),
    };
    const port = new RecipeDraftPort(designer as any, {} as any, 'draft');
    const result = await port.findFoods({});

    expect(result.map((item) => item.name)).toEqual(['鸡胸肉']);
    expect(designer.listIngredientOptions).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FOOD' }),
    );
  });

  it('findFoodGroups 食材一组、补剂一组，关闭采购的补剂不出现', async () => {
    const designer = {
      listIngredientOptions: jest.fn(async (input: any) =>
        input.type === 'FOOD'
          ? {
              data: [
                row({ id: 'food', name: '鸡胸肉', type: 'FOOD' }),
                row({ id: 'food-2', name: '南瓜', type: 'FOOD' }),
              ],
              total: 2,
            }
          : {
              data: [
                row({
                  id: 'off',
                  name: '关闭补剂',
                  type: 'SUPPLEMENT',
                  procurementEnabled: false,
                }),
                row({
                  id: 'on',
                  name: '开启补剂',
                  type: 'SUPPLEMENT',
                  procurementEnabled: true,
                }),
              ],
              total: 2,
            },
      ),
    };
    const port = new RecipeDraftPort(designer as any, {} as any, 'draft');
    const groups = await port.findFoodGroups({});

    expect(groups.foods.map((item) => item.name)).toEqual(['鸡胸肉', '南瓜']);
    expect(groups.supplements.map((item) => item.name)).toEqual(['开启补剂']);
    expect(groups.foodTotal).toBe(2);
    expect(groups.supplementTotal).toBe(1);
  });
});
