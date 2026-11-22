import { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';

describe('RecipeDraftPort editRecipe · update_item / 补剂目标', () => {
  function createPort(overrides: Record<string, jest.Mock> = {}) {
    const designer = {
      getDraft: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'item-1',
            ingredientId: 'ing-1',
            preparationMethod: '牛霖/生/去油',
            ingredient: { name: '牛霖' },
          },
        ],
      }),
      getLatestPreparationMethodText: jest
        .fn()
        .mockResolvedValue('牛霖/生/去油'),
      updateItem: jest.fn().mockResolvedValue({
        id: 'item-1',
        ingredientId: 'ing-1',
        preparationMethod: '生/去筋膜切块',
        ingredient: { name: '牛霖' },
      }),
      addItem: jest.fn().mockResolvedValue({
        id: 'item-2',
        ingredientId: 'ing-2',
        preparationMethod: '生/去筋膜切块',
        ingredient: { name: '牛肉' },
      }),
      removeItem: jest.fn(),
      ...overrides,
    };
    const access = { userId: 'u1', role: 'ADMIN' } as any;
    return {
      port: new RecipeDraftPort(designer as any, access, 'draft-1'),
      designer,
      access,
    };
  }

  it('update_item 写预处理并返回旧 → 新记录', async () => {
    const { port, designer, access } = createPort();

    const results = await port.editRecipe([
      {
        op: 'update_item',
        itemId: 'item-1',
        preparationMethod: '生/去筋膜切块',
      },
    ]);

    expect(designer.updateItem).toHaveBeenCalledWith(
      'item-1',
      { preparationMethod: '生/去筋膜切块' },
      access,
    );
    expect(results[0]).toMatchObject({
      op: 'update_item',
      ok: true,
      preparationChange: {
        itemId: 'item-1',
        itemName: '牛霖',
        before: '牛霖/生/去油',
        after: '生/去筋膜切块',
        source: 'DRAFT',
      },
    });
  });

  it('add 补剂目标只传 fieldPath，不传计算值', async () => {
    const { port, designer, access } = createPort();

    await port.editRecipe([
      {
        op: 'add',
        nutritionFoodId: 'nf-1',
        ingredientId: 'ing-2',
        weightG: 1,
        supplementTargets: [{ fieldPath: 'minerals.zinc' }],
      },
    ]);

    expect(designer.addItem).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        nutritionFoodId: 'nf-1',
        supplementTargets: [{ fieldPath: 'minerals.zinc' }],
      }),
      access,
    );
  });

  it('预处理没变时不产生变更提示', async () => {
    const { port } = createPort({
      updateItem: jest.fn().mockResolvedValue({
        id: 'item-1',
        ingredientId: 'ing-1',
        preparationMethod: '牛霖/生/去油',
        ingredient: { name: '牛霖' },
      }),
    });

    const results = await port.editRecipe([
      {
        op: 'update_item',
        itemId: 'item-1',
        preparationMethod: '牛霖/生/去油',
      },
    ]);

    expect(results[0]?.preparationChange).toBeUndefined();
  });

  it('update_item 可以切换营养档案，不用删除重加', async () => {
    const { port, designer, access } = createPort();

    const results = await port.editRecipe([
      {
        op: 'update_item',
        itemId: 'item-1',
        nutritionFoodId: 'nf-cooked',
      },
    ]);

    expect(designer.updateItem).toHaveBeenCalledWith(
      'item-1',
      { nutritionFoodId: 'nf-cooked' },
      access,
    );
    expect(results[0]).toMatchObject({ op: 'update_item', ok: true });
  });
});
