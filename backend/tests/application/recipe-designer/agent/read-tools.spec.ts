import { createReadTools } from 'src/application/recipe-designer/agent/read-tools';
import {
  RecipeAgentWebError,
  type RecipeAgentWebPort,
} from 'src/application/recipe-designer/agent/deepseek-web-tools';
import type {
  AgentRecipeDetail,
  AgentRecipeSearchPage,
  AgentRecipeSummary,
} from 'src/application/recipe-designer/agent/agent-types';
import {
  createFakeRecipeAgentPort,
  fakeDraftSnapshot,
} from '../../../helpers/fake-recipe-agent-port';

function createFakeWebTools(
  overrides: Partial<RecipeAgentWebPort> = {},
): RecipeAgentWebPort & {
  search: jest.Mock;
  fetch: jest.Mock;
} {
  return {
    search: jest.fn().mockResolvedValue({
      query: '鸭肉 时令',
      results: [
        {
          title: '鸭肉时令',
          url: 'https://a.test/1',
          summary: '秋季适合',
          publishedAt: '2026-10-01',
        },
        {
          title: '补剂替代',
          url: 'https://b.test/2',
          summary: '库外来源',
          publishedAt: null,
        },
      ],
    }),
    fetch: jest.fn().mockResolvedValue({
      url: 'https://a.test/1',
      title: '鸭肉季',
      content: '正文内容',
    }),
    ...overrides,
  } as RecipeAgentWebPort & { search: jest.Mock; fetch: jest.Mock };
}

const RECIPE_SUMMARY_BASE: Omit<AgentRecipeSummary, 'source' | 'id'> = {
  recipeId: 'recipe-1',
  version: 3,
  name: '鲜鸭南瓜餐',
  status: 'PUBLIC',
  applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
  coverTitle: '鲜鸭南瓜',
  sellingPoint: '鲜鸭配南瓜',
  targetHealthTags: ['低脂'],
  ingredientNames: ['鸭腿肉', '南瓜'],
  mainProteinName: '鸭腿肉',
  updatedAt: new Date('2026-10-20T08:00:00.000Z'),
};

function recipeSummary(
  overrides: Partial<AgentRecipeSummary> = {},
): AgentRecipeSummary {
  return {
    ...RECIPE_SUMMARY_BASE,
    source: 'PUBLISHED',
    id: 'row-recipe-1-v3',
    ...overrides,
  };
}

function recipeDetail(
  overrides: Partial<AgentRecipeDetail> = {},
): AgentRecipeDetail {
  return {
    ...recipeSummary(),
    description: '鲜鸭配南瓜，低温慢煮。',
    coverImageUrl: null,
    detailImages: [],
    videoUrl: null,
    energyDensityKcalPerKg: 1500,
    nutritionStandard: 'FEDIAF_2025',
    nutritionDetailedData: { report: {} },
    productionSteps: [
      {
        sortOrder: 1,
        instruction: '低温慢煮',
        duration: '30 分钟',
        temperature: '90℃',
        equipment: '炖锅',
      },
    ],
    items: [
      {
        ingredientId: 'ing-duck',
        nutritionFoodId: 'nf-duck',
        name: '鸭腿肉',
        nutritionProfileName: '鸭腿肉（生）',
        ingredientType: 'FOOD',
        weightG: 400,
        preparationMethod: '切块',
          category: 'PROTEIN',
      },
    ],
    seriesId: 'series-1',
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    designSource: 'MANUAL',
    createdAt: new Date('2026-09-20T08:00:00.000Z'),
    ...overrides,
  };
}

function recipeSearchPage(
  overrides: Partial<AgentRecipeSearchPage> = {},
): AgentRecipeSearchPage {
  return {
    data: [recipeSummary()],
    page: 1,
    pageSize: 20,
    total: 1,
    hasMore: false,
    ...overrides,
  };
}

describe('read tools', () => {
  it('get_draft 返回草稿并带人话摘要', async () => {
    const port = createFakeRecipeAgentPort();
    const tools = createReadTools(port, 'draft-1');
    const result = await tools.get_draft();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.totalWeightG).toBe(940);
    expect(result.data.items).toHaveLength(8);
    expect(result.summary).toContain('8 种原料');
  });

  it('get_draft 摘要把订单背景/不在范围标出来', async () => {
    const orderPort = createFakeRecipeAgentPort({
      draft: fakeDraftSnapshot({
        context: {
          kind: 'ORDER',
          order: {
            orderNo: 'CR202610270001',
            quantity: 1,
          } as any,
          dog: {
            name: 'ID',
            allergyRecords: [{ allergen: '鸡肉' }, { allergen: '牛肉' }],
          } as any,
          unavailableReason: null,
        },
      }),
    });
    const orderResult = await createReadTools(orderPort, 'draft-1').get_draft();
    expect(orderResult.ok).toBe(true);
    if (!orderResult.ok) return;
    expect(orderResult.summary).toContain('订单定制');
    expect(orderResult.summary).toContain('CR202610270001');
    expect(orderResult.summary).toContain('ID');
    expect(orderResult.summary).toContain('2 条过敏');

    const outOfScopePort = createFakeRecipeAgentPort({
      draft: fakeDraftSnapshot({
        context: {
          kind: 'OUT_OF_SCOPE',
          reason: '顾客自助食谱不在 AI 设计范围。',
        },
      }),
    });
    const outOfScopeResult = await createReadTools(
      outOfScopePort,
      'draft-1',
    ).get_draft();
    expect(outOfScopeResult.ok).toBe(true);
    if (!outOfScopeResult.ok) return;
    expect(outOfScopeResult.summary).toContain('不在 AI 设计范围');
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

  it('search_ingredients 摘要说明每条候选都有全部营养档案（含生/熟）', async () => {
    const tools = createReadTools(createFakeRecipeAgentPort(), 'draft-1');
    const result = await tools.search_ingredients({ category: 'MUSHROOM' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toContain('nutritionProfiles');
    expect(result.summary).toContain('生/熟');
  });

  it('get_ingredient 支持只用 ingredientId，并摘要全部营养档案', async () => {
    const port = createFakeRecipeAgentPort();
    const tools = createReadTools(port, 'draft-1');
    const result = await tools.get_ingredient({ ingredientId: 'ing-8' });

    expect(port.getIngredient).toHaveBeenCalledWith({ ingredientId: 'ing-8' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as any).nutritionProfiles).toHaveLength(2);
    expect(result.summary).toContain('2 个营养档案');
    expect(result.summary).toContain('水煮');
  });

  it('get_ingredient 支持只用 nutritionFoodId，并原样传给端口', async () => {
    const port = createFakeRecipeAgentPort();
    const tools = createReadTools(port, 'draft-1');
    const result = await tools.get_ingredient({ nutritionFoodId: 'nf-8' });

    expect(port.getIngredient).toHaveBeenCalledWith({
      nutritionFoodId: 'nf-8',
    });
    expect(result.ok).toBe(true);
  });

  it('get_ingredient 至少需要 nutritionFoodId 或 ingredientId', async () => {
    const port = createFakeRecipeAgentPort();
    const tools = createReadTools(port, 'draft-1');

    for (const args of [
      {},
      { nutritionFoodId: '' },
      { nutritionFoodId: '   ' },
      { ingredientId: '' },
      { ingredientId: '   ' },
      { nutritionFoodId: 123 },
      { ingredientId: 123 },
    ]) {
      const result = await tools.get_ingredient(args as never);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe('INVALID_ARGUMENT');
      expect(result.error.message).toContain('nutritionFoodId');
      expect(result.error.message).toContain('ingredientId');
    }
    expect(port.getIngredient).not.toHaveBeenCalled();
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
    expect(draft.items).toHaveLength(9);
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

  describe('recipe catalog read tools', () => {
    it('search_recipes 校验并传递筛选/分页参数，摘要说明来源和命中数', async () => {
      const draftSummary = recipeSummary({
        source: 'CURRENT_DRAFT',
        id: 'draft-1',
        recipeId: null,
        version: null,
        name: '当前草稿鸭肉餐',
      });
      const port = createFakeRecipeAgentPort({
        recipeSearchPage: recipeSearchPage({
          data: [recipeSummary(), draftSummary],
          total: 2,
          page: 2,
          pageSize: 10,
          hasMore: true,
        }),
      });
      const tools = createReadTools(port, 'draft-1');

      const result = await tools.search_recipes({
        search: '  鸭肉 ',
        ingredientName: ' 南瓜 ',
        lifeStage: 'HIGH_ACTIVITY_ADULT',
        page: 2,
        limit: 10,
      });

      expect(port.searchRecipes).toHaveBeenCalledWith({
        search: '鸭肉',
        ingredientName: '南瓜',
        lifeStage: 'HIGH_ACTIVITY_ADULT',
        page: 2,
        limit: 10,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toMatchObject({
        page: 2,
        pageSize: 10,
        total: 2,
        hasMore: true,
      });
      expect(result.summary).toContain('找到 2 道');
      expect(result.summary).toContain('已发布');
      expect(result.summary).toContain('当前草稿');
      expect(result.summary).toContain('鲜鸭南瓜餐');
    });

    it('search_recipes 摘要区分定制与设计草稿来源', async () => {
      const port = createFakeRecipeAgentPort({
        recipeSearchPage: recipeSearchPage({
          data: [
            recipeSummary({ name: '已发布菜' }),
            recipeSummary({
              source: 'CUSTOM',
              id: 'row-custom',
              name: '定制菜',
            }),
            recipeSummary({
              source: 'DESIGN_DRAFT',
              id: 'draft-2',
              recipeId: null,
              version: 1,
              name: '草稿菜',
            }),
            recipeSummary({
              source: 'CURRENT_DRAFT',
              id: 'draft-1',
              recipeId: null,
              version: null,
              name: '当前菜',
            }),
          ],
          total: 4,
          hasMore: false,
        }),
      });
      const tools = createReadTools(port, 'draft-1');

      const result = await tools.search_recipes({});

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.summary).toContain('定制菜（定制食谱）');
      expect(result.summary).toContain('草稿菜（设计草稿）');
      expect(result.summary).toContain('当前菜（当前草稿）');
    });

    it('search_recipes 默认页码 1、每页 20，空条件也能查', async () => {
      const port = createFakeRecipeAgentPort();
      const tools = createReadTools(port, 'draft-1');

      const result = await tools.search_recipes({});

      expect(port.searchRecipes).toHaveBeenCalledWith({ page: 1, limit: 20 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.summary).toContain('没有找到');
    });

    it('search_recipes 拒绝非法参数且不调用端口', async () => {
      const port = createFakeRecipeAgentPort();
      const tools = createReadTools(port, 'draft-1');
      const invalidArgs: unknown[] = [
        null,
        { search: 123 },
        { ingredientName: 123 },
        { lifeStage: false },
        { page: 0 },
        { page: 1.5 },
        { page: '1' },
        { limit: 0 },
        { limit: 51 },
        { limit: 1.5 },
        { limit: '20' },
      ];

      for (const args of invalidArgs) {
        const result = await tools.search_recipes(args as never);
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.error.code).toBe('INVALID_ARGUMENT');
      }
      expect(port.searchRecipes).not.toHaveBeenCalled();
    });

    it('search_recipes 无结果时摘要说明可读全部食谱', async () => {
      const port = createFakeRecipeAgentPort({
        recipeSearchPage: recipeSearchPage({
          data: [],
          total: 0,
          hasMore: false,
        }),
      });
      const tools = createReadTools(port, 'draft-1');

      const result = await tools.search_recipes({ search: '不存在' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.summary).toContain('没有找到');
      expect(result.summary).toContain('全部食谱');
      expect(result.summary).toContain('顾客定制');
      expect(result.summary).toContain('未发布草稿');
    });

    it('get_recipe 已发布详情带人话摘要和只读数据', async () => {
      const port = createFakeRecipeAgentPort({
        recipeDetail: recipeDetail(),
      });
      const tools = createReadTools(port, 'draft-1');

      const result = await tools.get_recipe({ recipeId: 'row-recipe-1-v3' });

      expect(port.getRecipeDetail).toHaveBeenCalledWith({
        recipeId: 'row-recipe-1-v3',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.items).toHaveLength(1);
      expect(result.summary).toContain('已发布食谱「鲜鸭南瓜餐」v3');
      expect(result.summary).toContain('1 种原料');
      expect(result.summary).toContain('1 步制作步骤');
    });

    it('get_recipe 当前草稿详情摘要标明草稿', async () => {
      const port = createFakeRecipeAgentPort({
        recipeDetail: recipeDetail({
          source: 'CURRENT_DRAFT',
          id: 'draft-1',
          recipeId: null,
          version: null,
          name: '当前草稿鸭肉餐',
        }),
      });
      const tools = createReadTools(port, 'draft-1');

      const result = await tools.get_recipe({ draftId: 'draft-1' });

      expect(port.getRecipeDetail).toHaveBeenCalledWith({
        draftId: 'draft-1',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.summary).toContain('当前草稿「当前草稿鸭肉餐」');
    });

    it('get_recipe 至少需要一个 ID；找不到返回 RECIPE_NOT_FOUND', async () => {
      const port = createFakeRecipeAgentPort();
      const tools = createReadTools(port, 'draft-1');

      for (const args of [
        null,
        {},
        { recipeId: '' },
        { recipeId: '   ' },
        { draftId: '' },
        { recipeId: 123 },
        { draftId: 123 },
      ]) {
        const result = await tools.get_recipe(args as never);
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.error.code).toBe('INVALID_ARGUMENT');
        expect(result.error.message).toContain('recipeId');
        expect(result.error.message).toContain('draftId');
      }
      expect(port.getRecipeDetail).not.toHaveBeenCalled();

      const missing = await tools.get_recipe({ recipeId: 'missing' });
      expect(missing.ok).toBe(false);
      if (missing.ok) return;
      expect(missing.error.code).toBe('RECIPE_NOT_FOUND');
      expect(missing.error.message).toContain('missing');
    });
  });

  describe('web tools', () => {
    it('web_search 把查询传给联网端口，摘要列出来源', async () => {
      const webTools = createFakeWebTools();
      const tools = createReadTools(
        createFakeRecipeAgentPort(),
        'draft-1',
        webTools,
      );

      const result = await tools.web_search({
        query: '  鸭肉 时令  ',
        count: 5,
        need_content: true,
      });

      expect(webTools.search).toHaveBeenCalledWith({
        query: '鸭肉 时令',
        count: 5,
        needContent: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.results).toHaveLength(2);
      expect(result.summary).toContain('2 条');
      expect(result.summary).toContain('鸭肉时令');
      expect(result.summary).toContain('https://a.test/1');
      expect(result.summary).toContain('补剂替代');
    });

    it('web_search 无结果时摘要明确说没有找到', async () => {
      const webTools = createFakeWebTools({
        search: jest.fn().mockResolvedValue({
          query: '不存在',
          results: [],
        }),
      });
      const tools = createReadTools(
        createFakeRecipeAgentPort(),
        'draft-1',
        webTools,
      );

      const result = await tools.web_search({ query: '不存在' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.summary).toContain('没有找到');
    });

    it('web_search 校验参数，非法时不调用端口', async () => {
      const webTools = createFakeWebTools();
      const tools = createReadTools(
        createFakeRecipeAgentPort(),
        'draft-1',
        webTools,
      );
      const invalidArgs: unknown[] = [
        null,
        {},
        { query: '' },
        { query: '   ' },
        { query: 123 },
        { query: 'x'.repeat(129) },
        { query: '鸭肉', count: 0 },
        { query: '鸭肉', count: 51 },
        { query: '鸭肉', count: 1.5 },
        { query: '鸭肉', count: '5' },
        { query: '鸭肉', need_content: 'yes' },
      ];

      for (const args of invalidArgs) {
        const result = await tools.web_search(args as never);
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.error.code).toBe('INVALID_ARGUMENT');
      }
      expect(webTools.search).not.toHaveBeenCalled();
    });

    it('web_search 没有联网端口时返回 CONTROL_NOT_AVAILABLE', async () => {
      const tools = createReadTools(createFakeRecipeAgentPort(), 'draft-1');

      const result = await tools.web_search({ query: '鸭肉' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CONTROL_NOT_AVAILABLE');
      expect(result.error.message).toContain('联网搜索');
    });

    it('web_fetch 把 URL 传给联网端口并返回摘要', async () => {
      const webTools = createFakeWebTools();
      const tools = createReadTools(
        createFakeRecipeAgentPort(),
        'draft-1',
        webTools,
      );

      const result = await tools.web_fetch({
        url: '  https://a.test/1  ',
      });

      expect(webTools.fetch).toHaveBeenCalledWith({
        url: 'https://a.test/1',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.content).toBe('正文内容');
      expect(result.summary).toContain('鸭肉季');
      expect(result.summary).toContain('https://a.test/1');
    });

    it('web_fetch 校验参数，非法时不调用端口', async () => {
      const webTools = createFakeWebTools();
      const tools = createReadTools(
        createFakeRecipeAgentPort(),
        'draft-1',
        webTools,
      );

      for (const args of [
        null,
        {},
        { url: 123 },
        { url: '' },
        { url: '   ' },
      ]) {
        const result = await tools.web_fetch(args as never);
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.error.code).toBe('INVALID_ARGUMENT');
      }
      expect(webTools.fetch).not.toHaveBeenCalled();
    });

    it('web_fetch 没有联网端口时返回 CONTROL_NOT_AVAILABLE', async () => {
      const tools = createReadTools(createFakeRecipeAgentPort(), 'draft-1');

      const result = await tools.web_fetch({ url: 'https://a.test/1' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CONTROL_NOT_AVAILABLE');
      expect(result.error.message).toContain('联网抓取');
    });

    it('端口错误保留 WEB_SEARCH_FAILED / WEB_FETCH_FAILED / INVALID_ARGUMENT', async () => {
      const searchTools = createReadTools(
        createFakeRecipeAgentPort(),
        'draft-1',
        createFakeWebTools({
          search: jest
            .fn()
            .mockRejectedValue(
              new RecipeAgentWebError(
                'WEB_SEARCH_FAILED',
                '网页搜索失败（HTTP 500）',
              ),
            ),
        }),
      );
      const search = await searchTools.web_search({ query: '鸭肉' });
      expect(search.ok).toBe(false);
      if (!search.ok) {
        expect(search.error.code).toBe('WEB_SEARCH_FAILED');
        expect(search.error.message).toContain('HTTP 500');
      }

      const fetchTools = createReadTools(
        createFakeRecipeAgentPort(),
        'draft-1',
        createFakeWebTools({
          fetch: jest
            .fn()
            .mockRejectedValue(
              new RecipeAgentWebError(
                'WEB_FETCH_FAILED',
                '网页抓取失败：请求超时',
              ),
            ),
        }),
      );
      const fetched = await fetchTools.web_fetch({ url: 'https://a.test/1' });
      expect(fetched.ok).toBe(false);
      if (!fetched.ok) {
        expect(fetched.error.code).toBe('WEB_FETCH_FAILED');
      }

      const blocked = createReadTools(
        createFakeRecipeAgentPort(),
        'draft-1',
        createFakeWebTools({
          fetch: jest
            .fn()
            .mockRejectedValue(
              new RecipeAgentWebError(
                'INVALID_ARGUMENT',
                'url 指向私有或保留 IP，已拒绝。',
              ),
            ),
        }),
      );
      const blockedResult = await blocked.web_fetch({
        url: 'http://127.0.0.1/',
      });
      expect(blockedResult.ok).toBe(false);
      if (!blockedResult.ok) {
        expect(blockedResult.error.code).toBe('INVALID_ARGUMENT');
      }
    });

    it('联网端口的未知异常变成安全的失败码，不泄露原始 message', async () => {
      const tools = createReadTools(
        createFakeRecipeAgentPort(),
        'draft-1',
        createFakeWebTools({
          search: jest.fn().mockRejectedValue(new Error('secret-token')),
        }),
      );

      const result = await tools.web_search({ query: '鸭肉' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('WEB_SEARCH_FAILED');
      expect(result.error.message).not.toContain('secret-token');
    });
  });
});
