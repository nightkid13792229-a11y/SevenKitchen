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

describe('RecipeDraftPort.findFoods', () => {
  it('hides supplements whose production/procurement switch is off', async () => {
    const designer = {
      listIngredientOptions: jest.fn().mockResolvedValue({
        data: [
          row({ id: 'food', name: '鸡胸肉', type: 'FOOD' }),
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
      }),
    };
    const port = new RecipeDraftPort(designer as any, {} as any, 'draft');
    const result = await port.findFoods({});
    expect(result.map((item) => item.name)).toEqual(['鸡胸肉', '开启补剂']);
  });
});
