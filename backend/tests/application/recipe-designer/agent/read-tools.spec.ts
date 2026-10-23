import { createReadTools } from 'src/application/recipe-designer/agent/read-tools';
import { createFakeRecipeAgentPort } from '../../../helpers/fake-recipe-agent-port';

describe('read tools', () => {
  it('get_draft 返回草稿并带人话摘要', async () => {
    const port = createFakeRecipeAgentPort();
    const tools = createReadTools(port, 'draft-1');
    const result = await tools.get_draft();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.totalWeightG).toBe(900);
    expect(result.data.items).toHaveLength(7);
    expect(result.summary).toContain('7 种原料');
  });

  it('search_ingredients 把条件传给端口，无结果也返回 ok', async () => {
    const port = createFakeRecipeAgentPort({ searchResults: [] });
    const tools = createReadTools(port, 'draft-1');
    const result = await tools.search_ingredients({
      category: 'MUSHROOM',
      limit: 10,
    });
    expect(port.searchIngredients).toHaveBeenCalledWith({
      category: 'MUSHROOM',
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);
    expect(result.summary).toContain('没有找到');
  });

  it('search_ingredients 拒绝空条件', async () => {
    const tools = createReadTools(createFakeRecipeAgentPort(), 'draft-1');
    const result = await tools.search_ingredients({});
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('至少给一个条件'),
      },
    });
  });

  it('get_ingredient 找不到返回 INGREDIENT_NOT_FOUND', async () => {
    const tools = createReadTools(
      createFakeRecipeAgentPort({ ingredientDetail: null }),
      'draft-1',
    );
    const result = await tools.get_ingredient({ nutritionFoodId: 'missing' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INGREDIENT_NOT_FOUND');
  });

  it('get_catalog_usage 至少要有主蛋白或原料名', async () => {
    const tools = createReadTools(createFakeRecipeAgentPort(), 'draft-1');
    const result = await tools.get_catalog_usage({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
  });
});
