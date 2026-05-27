import { PrismaRecipeRepository } from '../../../src/infrastructure/repositories/prisma-recipe.repository';

describe('PrismaRecipeRepository', () => {
  it('preserves coverTitle when mapping paginated public recipes', async () => {
    const prisma = {
      recipe: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'row-1',
            recipeId: 'recipe-1',
            version: 1,
            name: 'Badge Recipe',
            status: 'PUBLIC',
            energyDensityKcalPerKg: 1200,
            productionLossRate: 1.07,
            batchLaborHours: null,
            coverImageUrl: 'https://img.sevenkitchen.cloud/recipes/cover.jpg',
            coverTitle: '皮毛友好【成年犬】',
            applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
            designSource: null,
            nutritionStandard: 'FEDIAF_2021',
            nutritionDetailedData: null,
            description: null,
            viewCount: 0,
            favoriteCount: 0,
            diyGenCount: 0,
            createdAt: new Date('2026-04-26T08:00:00Z'),
            items: [],
            healthTagAssignments: [],
          },
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
});
