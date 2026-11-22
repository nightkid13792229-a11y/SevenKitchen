import { executeTool } from '../../../src/application/recipe-designer/agent/tools';

describe('edit_recipe · update_item 换营养档案', () => {
  it('把 nutritionFoodId 透传给端口，不丢字段', async () => {
    const port = {
      editRecipe: jest.fn().mockResolvedValue([
        { op: 'update_item', ok: true, message: '已更新' },
      ]),
      getLastTargetOverrides: jest.fn().mockReturnValue(undefined),
    };
    const context = {
      port: port as any,
      catalog: {} as any,
      knowledge: {} as any,
      onAsk: jest.fn(),
    };

    const outcome = (await executeTool(
      'edit_recipe',
      {
        ops: [
          {
            op: 'update_item',
            itemId: 'item-1',
            nutritionFoodId: 'nf-raw',
          },
        ],
      },
      context,
    )) as any;

    expect(outcome.ok).toBe(true);
    expect(port.editRecipe).toHaveBeenCalledWith([
      {
        op: 'update_item',
        itemId: 'item-1',
        nutritionFoodId: 'nf-raw',
      },
    ]);
  });
});
