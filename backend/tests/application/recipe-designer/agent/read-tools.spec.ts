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

  it('search_ingredients 支持按 nutrientKey 搜营养素', async () => {
    const port = createFakeRecipeAgentPort({ searchResults: [] });
    const tools = createReadTools(port, 'draft-1');
    const result = await tools.search_ingredients({
      nutrientKey: 'zinc',
      type: 'FOOD',
    });
    expect(port.searchIngredients).toHaveBeenCalledWith({
      nutrientKey: 'zinc',
      type: 'FOOD',
      limit: 20,
    });
    expect(result.ok).toBe(true);
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

  it('get_catalog_usage 没有命中时摘要从结果说没有重合记录', async () => {
    const port = createFakeRecipeAgentPort({
      catalogUsage: {
        totalPublishedRecipes: 26,
        mainProteinCount: 0,
        recipes: [],
      },
    });
    const tools = createReadTools(port, 'draft-1');
    const result = await tools.get_catalog_usage({
      ingredientNames: ['鸭腿肉', '燕麦'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toContain('没有重合记录');
    expect(result.summary).not.toContain('2 个原料有重合记录');
    expect(result.summary).not.toContain('命中 0 道菜');
  });

  it('get_catalog_usage 去重并裁剪原料名，摘要按结果说命中几道菜', async () => {
    const port = createFakeRecipeAgentPort();
    const tools = createReadTools(port, 'draft-1');
    const result = await tools.get_catalog_usage({
      ingredientNames: ['香菇', ' 香菇 ', '', '   ', '燕麦'],
    });
    expect(port.getCatalogUsage).toHaveBeenCalledWith({
      ingredientNames: ['香菇', '燕麦'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toContain('按 2 个原料查询，命中 2 道菜');
  });

  it('search_ingredients 拒绝非字符串 search', async () => {
    const tools = createReadTools(createFakeRecipeAgentPort(), 'draft-1');
    const result = await tools.search_ingredients({ search: 123 } as never);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
  });

  it('读工具拒绝 null 参数而不是抛 TypeError', async () => {
    const tools = createReadTools(createFakeRecipeAgentPort(), 'draft-1');
    const results = [
      await tools.search_ingredients(null),
      await tools.get_catalog_usage(null),
      await tools.get_ingredient(null),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe('INVALID_ARGUMENT');
    }
  });

  it('get_catalog_usage 拒绝非数组 ingredientNames', async () => {
    const tools = createReadTools(createFakeRecipeAgentPort(), 'draft-1');
    const result = await tools.get_catalog_usage({
      ingredientNames: '香菇',
    } as never);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
  });

  it('假端口 addItem 缺省预处理为 生，并让内容版本 +1', async () => {
    const port = createFakeRecipeAgentPort();
    const item = await port.addItem('draft-1', {
      nutritionFoodId: 'nf-8',
      weightG: 40,
    });
    expect(item.preparationMethod).toBe('生');
    const draft = await port.getDraft('draft-1');
    expect(draft.items).toHaveLength(8);
    expect(draft.contentRevision).toBe(5);
  });

  it('假端口 setCopy 真的改草稿并让内容版本 +1', async () => {
    const port = createFakeRecipeAgentPort();
    await port.setCopy('draft-1', {
      name: '鸭肉南瓜新餐',
      sellingPoint: '新卖点',
    });
    const draft = await port.getDraft('draft-1');
    expect(draft.name).toBe('鸭肉南瓜新餐');
    expect(draft.copy.sellingPoint).toBe('新卖点');
    expect(draft.contentRevision).toBe(5);
  });
});
