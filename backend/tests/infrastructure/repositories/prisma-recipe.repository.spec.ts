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
});
