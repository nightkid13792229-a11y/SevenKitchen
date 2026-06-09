import { PrismaRecipeRepository } from '../../../src/infrastructure/repositories/prisma-recipe.repository';

describe('PrismaRecipeRepository', () => {
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
});
