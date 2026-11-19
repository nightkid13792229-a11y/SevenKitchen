import { PrismaRecipeRepository } from '../../../src/infrastructure/repositories/prisma-recipe.repository';

describe('PrismaRecipeRepository', () => {
  const publicSeriesVisibilityGuard = {
    OR: [
      { seriesId: null },
      {
        series: {
          is: {
            businessStatus: 'PUBLIC',
            status: 'ACTIVE',
            deletedAt: null,
          },
        },
      },
    ],
  };

  function expectPublicRecipeWhereGuard(where: unknown) {
    expect(where).toEqual(
      expect.objectContaining({
        status: 'PUBLIC',
        AND: expect.arrayContaining([publicSeriesVisibilityGuard]),
      }),
    );
  }

  function publicRecipe(overrides: Record<string, unknown> = {}) {
    return {
      id: 'row-1',
      recipeId: 'recipe-1',
      version: 1,
      name: 'Badge Recipe',
      status: 'PUBLIC',
      energyDensityKcalPerKg: 1200,
      productionLossRate: 1.07,
      batchLaborHours: null,
      coverImageUrl: 'https://img.sevenkitchen.cloud/recipes/cover.jpg',
      coverTitle: null,
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      targetHealthTags: [],
      designSource: null,
      nutritionStandard: 'FEDIAF_2021',
      nutritionDetailedData: null,
      description: null,
      viewCount: 0,
      favoriteCount: 0,
      diyGenCount: 0,
      seriesId: null,
      seriesLifeStage: null,
      createdAt: new Date('2026-04-26T08:00:00Z'),
      items: [],
      healthTagAssignments: [],
      ...overrides,
    };
  }

  it('queries paginated public showcase recipes only from standalone recipes or PUBLIC series', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);

    await repository.findPublicRecipesPaginated({
      page: 1,
      pageSize: 10,
    });

    expectPublicRecipeWhereGuard(prisma.recipe.findMany.mock.calls[0][0].where);
  });

  it('queries public showcase recipes only from standalone recipes or PUBLIC series', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);

    await repository.findPublicRecipes();

    expectPublicRecipeWhereGuard(prisma.recipe.findMany.mock.calls[0][0].where);
  });

  it('builds public filter options only from standalone recipes or PUBLIC series', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      recipeHealthTag: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ingredientTag: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ingredient: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);

    await repository.getFilterOptions();

    expectPublicRecipeWhereGuard(prisma.recipe.findMany.mock.calls[0][0].where);
    expectPublicRecipeWhereGuard(
      prisma.ingredient.findMany.mock.calls[0][0].where.recipeItems.some
        .recipe,
    );
  });

  it('preserves coverTitle when mapping paginated public recipes', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publicRecipe({
            coverTitle: '皮毛友好【成年犬】',
          }),
        ]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);

    const result = await repository.findPublicRecipesPaginated({
      page: 1,
      pageSize: 10,
    });

    expect(result.data[0].coverTitle).toBe('皮毛友好【成年犬】');
  });

  it('uses an adult series representative in the default public showcase instead of a newer under-14-week version', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publicRecipe({
            id: 'row-puppy',
            recipeId: 'recipe-puppy',
            name: '燕麦鳕鱼猪肉',
            seriesId: 'series-oat-cod-pork',
            seriesLifeStage: 'PUPPY_UNDER_14_WEEKS',
            applicableLifeStages: ['PUPPY_UNDER_14_WEEKS'],
            createdAt: new Date('2026-06-08T07:00:00Z'),
          }),
          publicRecipe({
            id: 'row-adult',
            recipeId: 'recipe-adult',
            name: '燕麦鳕鱼猪肉',
            seriesId: 'series-oat-cod-pork',
            seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
            applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
            createdAt: new Date('2026-05-01T07:00:00Z'),
          }),
        ]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);

    const result = await repository.findPublicRecipesPaginated({
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'recipe-adult',
        seriesId: 'series-oat-cod-pork',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      }),
    );
  });

  it('keeps a revised recipe in its original public showcase position', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publicRecipe({
            id: 'row-oat-v6',
            recipeId: 'recipe-oat',
            version: 6,
            name: '燕麦鳕鱼猪肉',
            seriesId: 'series-oat-cod-pork',
            createdAt: new Date('2026-06-08T07:00:00Z'),
          }),
          publicRecipe({
            id: 'row-beef-v1',
            recipeId: 'recipe-beef',
            version: 1,
            name: '牛肉南瓜鲜食',
            seriesId: 'series-beef-pumpkin',
            createdAt: new Date('2026-05-20T07:00:00Z'),
          }),
          publicRecipe({
            id: 'row-oat-v5',
            recipeId: 'recipe-oat',
            version: 5,
            name: '燕麦鳕鱼猪肉',
            seriesId: 'series-oat-cod-pork',
            createdAt: new Date('2026-05-01T07:00:00Z'),
          }),
        ]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);

    const result = await repository.findPublicRecipesPaginated({
      page: 1,
      pageSize: 10,
    });

    expect(result.data.map((recipe) => recipe.id)).toEqual([
      'recipe-beef',
      'recipe-oat',
    ]);
    expect(result.data[1]).toEqual(
      expect.objectContaining({
        id: 'recipe-oat',
        version: 6,
      }),
    );
  });

  it('uses the requested child life-stage representative when the public showcase is filtered to under-14-week puppies', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publicRecipe({
            id: 'row-puppy',
            recipeId: 'recipe-puppy',
            name: '燕麦鳕鱼猪肉',
            seriesId: 'series-oat-cod-pork',
            seriesLifeStage: 'PUPPY_UNDER_14_WEEKS',
            applicableLifeStages: ['PUPPY_UNDER_14_WEEKS'],
            createdAt: new Date('2026-06-08T07:00:00Z'),
          }),
          publicRecipe({
            id: 'row-adult',
            recipeId: 'recipe-adult',
            name: '燕麦鳕鱼猪肉',
            seriesId: 'series-oat-cod-pork',
            seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
            applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
            createdAt: new Date('2026-05-01T07:00:00Z'),
          }),
        ]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);

    const result = await repository.findPublicRecipesPaginated({
      lifeStages: ['PUPPY_UNDER_14_WEEKS'],
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'recipe-puppy',
        seriesId: 'series-oat-cod-pork',
        seriesLifeStage: 'PUPPY_UNDER_14_WEEKS',
        applicableLifeStages: ['PUPPY_UNDER_14_WEEKS'],
      }),
    );
  });

  it('filter-options 只返回「可筛选」的健康标签：排除分组标签与 0 关联标签', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          {
            applicableLifeStages: ['ADULT', 'SENIOR'],
            healthTagAssignments: [
              { healthTagId: 'leaf-cod' },
              { healthTagId: 'leaf-sweet-potato' },
              { healthTagId: 'root-low-fat' },
            ],
          },
          {
            applicableLifeStages: ['ADULT'],
            healthTagAssignments: [
              { healthTagId: 'leaf-cod' },
              { healthTagId: 'root-low-fat' },
            ],
          },
          {
            applicableLifeStages: ['ADULT'],
            healthTagAssignments: [{ healthTagId: 'root-low-fat' }],
          },
        ]),
      },
      recipeHealthTag: {
        findMany: jest.fn().mockResolvedValue([
          // 分组标签：有子标签，不应作为筛选项
          { id: 'group-ingredient', name: '原料事实', parentId: null },
          // 叶子标签：有食谱关联，应返回
          { id: 'leaf-cod', name: '含鳕鱼', parentId: 'group-ingredient' },
          { id: 'leaf-sweet-potato', name: '含红薯', parentId: 'group-ingredient' },
          // 叶子标签：0 关联，应排除（避免"点了没结果"）
          { id: 'leaf-venison', name: '含鹿肉', parentId: 'group-ingredient' },
          // 顶层标签且有食谱关联：必须保留（词表 seed 之前的线上状态就是这种）
          { id: 'root-low-fat', name: '低脂', parentId: null },
          // 顶层标签但 0 关联：排除
          { id: 'root-empty', name: '体重管理', parentId: null },
        ]),
      },
      ingredientTag: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const repository = new PrismaRecipeRepository(prisma as any);
    (repository as any).buildIngredientGroups = jest.fn().mockResolvedValue([]);

    const options = await repository.getFilterOptions();

    expect(options.healthTags).toEqual([
      { value: 'leaf-cod', label: '含鳕鱼', count: 2 },
      { value: 'leaf-sweet-potato', label: '含红薯', count: 1 },
      { value: 'root-low-fat', label: '低脂', count: 3 },
    ]);
    // 生命阶段筛选不受影响
    expect(options.lifeStages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'ADULT', count: 3 }),
        expect.objectContaining({ value: 'SENIOR', count: 1 }),
      ]),
    );
  });

  it('counts main protein by series and hides disabled/zero nodes', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publicRecipe({ seriesId: 'series-pork' }),
          publicRecipe({
            id: 'row-pork-2',
            seriesId: 'series-pork',
            version: 2,
          }),
          publicRecipe({
            id: 'row-pork-b',
            seriesId: 'series-pork-b',
            version: 1,
          }),
          publicRecipe({ id: 'row-beef', seriesId: 'series-beef', version: 1 }),
        ]),
      },
      recipeHealthTag: { findMany: jest.fn().mockResolvedValue([]) },
      ingredientTag: { findMany: jest.fn().mockResolvedValue([]) },
      recipeTaxonomyKind: {
        findUnique: jest.fn().mockResolvedValue({ id: 'kind-main' }),
      },
      recipeSeriesTaxonomy: {
        findMany: jest.fn().mockResolvedValue([
          {
            seriesId: 'series-pork',
            node: { id: 'n-pork', name: '猪', status: 'ACTIVE' },
          },
          {
            seriesId: 'series-pork-b',
            node: { id: 'n-pork', name: '猪', status: 'ACTIVE' },
          },
          {
            seriesId: 'series-beef',
            node: { id: 'n-beef', name: '牛', status: 'ACTIVE' },
          },
          {
            seriesId: 'series-old',
            node: { id: 'n-old', name: '羊', status: 'DISABLED' },
          },
        ]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);
    (repository as any).buildIngredientGroups = jest
      .fn()
      .mockResolvedValue([]);

    const options = await repository.getFilterOptions();

    // 同一系列的多条阶段版本只算一次；停用节点不返回；0 道不返回
    expect(options.mainProtein).toEqual([
      { value: 'n-pork', label: '猪肉', count: 2 },
      { value: 'n-beef', label: '牛肉', count: 1 },
    ]);
    expect(
      prisma.recipeSeriesTaxonomy.findMany.mock.calls[0][0].where.seriesId.in,
    ).toEqual(
      expect.arrayContaining([
        'series-pork',
        'series-pork-b',
        'series-beef',
      ]),
    );
  });

  it('filters public recipes by main protein node', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publicRecipe({ id: 'row-pork', seriesId: 'series-pork' }),
          publicRecipe({ id: 'row-beef', seriesId: 'series-beef' }),
        ]),
      },
      recipeTaxonomyKind: {
        findUnique: jest.fn().mockResolvedValue({ id: 'kind-main' }),
      },
      recipeSeriesTaxonomy: {
        findMany: jest.fn().mockResolvedValue([{ seriesId: 'series-pork' }]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);

    const result = await repository.findPublicRecipesPaginated({
      mainProteinNodeIds: ['n-pork'],
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(1);
    expect(result.data[0].seriesId).toBe('series-pork');
    expect(prisma.recipeSeriesTaxonomy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kindId: 'kind-main', nodeId: { in: ['n-pork'] } },
      }),
    );
  });

  it('counts needs by series and hides zero-count tags', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publicRecipe({
            id: 'row-pork-1',
            seriesId: 'series-pork',
            healthTagAssignments: [{ healthTagId: 'tag-low-fat' }],
          }),
          publicRecipe({
            id: 'row-pork-2',
            seriesId: 'series-pork',
            version: 2,
            healthTagAssignments: [{ healthTagId: 'tag-easy' }],
          }),
          publicRecipe({
            id: 'row-beef',
            seriesId: 'series-beef',
            healthTagAssignments: [{ healthTagId: 'tag-low-fat' }],
          }),
        ]),
      },
      recipeHealthTag: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'tag-low-fat', name: '低脂', parentId: null },
          { id: 'tag-easy', name: '易消化', parentId: null },
          { id: 'tag-single', name: '单一动物蛋白', parentId: 'group-1' },
        ]),
      },
      ingredientTag: { findMany: jest.fn().mockResolvedValue([]) },
      recipeTaxonomyKind: { findUnique: jest.fn().mockResolvedValue(null) },
      recipeSeriesTaxonomy: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const repository = new PrismaRecipeRepository(prisma as any);
    (repository as any).buildIngredientGroups = jest
      .fn()
      .mockResolvedValue([]);

    const options = await repository.getFilterOptions();

    // 同一系列两个阶段版本各挂一个标签：按系列各算一次
    expect(options.needs).toEqual([
      { value: 'tag-low-fat', label: '低脂', count: 2 },
      { value: 'tag-easy', label: '易消化', count: 1 },
    ]);
  });

  it('filters public recipes by needs with AND semantics', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publicRecipe({
            id: 'row-pork',
            seriesId: 'series-pork',
            healthTagAssignments: [
              { healthTagId: 'tag-low-fat' },
              { healthTagId: 'tag-easy' },
            ],
          }),
          publicRecipe({
            id: 'row-beef',
            seriesId: 'series-beef',
            healthTagAssignments: [{ healthTagId: 'tag-low-fat' }],
          }),
          publicRecipe({
            id: 'row-rabbit',
            seriesId: 'series-rabbit',
            healthTagAssignments: [{ healthTagId: 'tag-easy' }],
          }),
        ]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);

    const result = await repository.findPublicRecipesPaginated({
      needTagIds: ['tag-low-fat', 'tag-easy'],
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(1);
    expect(result.data[0].seriesId).toBe('series-pork');
  });

  it('counts avoid tags by series and rolls up parent tags', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publicRecipe({
            id: 'row-chicken',
            seriesId: 'series-chicken',
            items: [
              { ingredient: { tags: [{ tagId: 'tag-chicken' }] } },
            ],
          }),
          publicRecipe({
            id: 'row-fish',
            seriesId: 'series-fish',
            items: [{ ingredient: { tags: [{ tagId: 'tag-fish' }] } }],
          }),
        ]),
      },
      recipeHealthTag: { findMany: jest.fn().mockResolvedValue([]) },
      ingredientTag: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'tag-meat', name: '肉类', parentId: null },
          { id: 'tag-chicken', name: '鸡肉', parentId: 'tag-meat' },
          { id: 'tag-aquatic', name: '水产', parentId: null },
          { id: 'tag-fish', name: '鱼', parentId: 'tag-aquatic' },
          { id: 'tag-egg', name: '蛋类', parentId: null },
        ]),
      },
      recipeTaxonomyKind: { findUnique: jest.fn().mockResolvedValue(null) },
      recipeSeriesTaxonomy: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const repository = new PrismaRecipeRepository(prisma as any);
    (repository as any).buildIngredientGroups = jest
      .fn()
      .mockResolvedValue([]);

    const options = await repository.getFilterOptions();

    const byLabel = new Map(options.avoid.map((o) => [o.label, o.count]));
    expect(byLabel.get('鸡肉')).toBe(1);
    expect(byLabel.get('肉类')).toBe(1); // 父标签汇总子标签
    expect(byLabel.get('鱼')).toBe(1);
    expect(byLabel.get('水产')).toBe(1);
    expect(byLabel.has('蛋类')).toBe(false); // 0 道不返回
  });

  it('excludes whole series when any version contains an avoided tag', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          publicRecipe({
            id: 'row-chicken',
            seriesId: 'series-chicken',
            items: [
              { ingredient: { tags: [{ tagId: 'tag-chicken' }] } },
            ],
          }),
          publicRecipe({
            id: 'row-fish',
            seriesId: 'series-fish',
            items: [{ ingredient: { tags: [{ tagId: 'tag-fish' }] } }],
          }),
        ]),
      },
      ingredientTag: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'tag-meat', parentId: null },
          { id: 'tag-chicken', parentId: 'tag-meat' },
        ]),
      },
    };
    const repository = new PrismaRecipeRepository(prisma as any);

    const result = await repository.findPublicRecipesPaginated({
      avoidTagIds: ['tag-meat'],
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBe(1);
    expect(result.data[0].seriesId).toBe('series-fish');
  });
});
