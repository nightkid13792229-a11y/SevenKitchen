import { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';

/**
 * replace 必须走事务版 replaceItem：
 *   · 失败时旧原料还在；
 *   · 排序、是否计入评估、预处理、补剂目标都不会被 addItem 的默认值改掉。
 */
describe('RecipeDraftPort replace', () => {
  function createPort(replaceItem: jest.Mock) {
    const designer = {
      replaceItem,
      removeItem: jest.fn(),
      addItem: jest.fn(),
    };
    const access = { userId: 'u1', role: 'ADMIN' } as any;
    return {
      port: new RecipeDraftPort(designer as any, access, 'draft-1'),
      designer,
      access,
    };
  }

  it('调用 replaceItem，不再先删后加', async () => {
    const replaceItem = jest.fn().mockResolvedValue({ id: 'new-item' });
    const { port, designer, access } = createPort(replaceItem);

    const results = await port.editRecipe([
      {
        op: 'replace',
        itemId: 'item-1',
        nutritionFoodId: 'food-1',
        ingredientId: 'ing-1',
      },
    ]);

    expect(results).toEqual([{ op: 'replace', ok: true, message: '已替换' }]);
    expect(replaceItem).toHaveBeenCalledWith(
      'item-1',
      { nutritionFoodId: 'food-1', ingredientId: 'ing-1' },
      access,
    );
    expect(designer.removeItem).not.toHaveBeenCalled();
    expect(designer.addItem).not.toHaveBeenCalled();
  });

  it('replaceItem 失败时旧原料不会被删除', async () => {
    const replaceItem = jest
      .fn()
      .mockRejectedValue(new Error('这个原料已经在配方里'));
    const { port, designer } = createPort(replaceItem);

    const results = await port.editRecipe([
      {
        op: 'replace',
        itemId: 'item-1',
        nutritionFoodId: 'food-1',
      },
    ]);

    expect(results).toEqual([
      { op: 'replace', ok: false, message: '这个原料已经在配方里' },
    ]);
    expect(designer.removeItem).not.toHaveBeenCalled();
    expect(designer.addItem).not.toHaveBeenCalled();
  });
});
