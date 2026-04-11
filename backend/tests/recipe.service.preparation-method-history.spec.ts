import { RecipeService } from '../src/application/recipe/recipe.service';
import { NutritionStandard, RecipeStatus } from '../src/domain/recipe/enums';

describe('RecipeService preparation method behavior', () => {
  const peelId = '11111111-1111-1111-1111-111111111111';
  const steamId = '22222222-2222-2222-2222-222222222222';

  const prisma = {
    recipe: { findUnique: jest.fn() },
    recipeItem: { findMany: jest.fn() },
    preparationMethod: { findMany: jest.fn() },
  } as any;

  let service: RecipeService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RecipeService(prisma);
  });

  it('translates legacy preparation methods in admin recipe detail', async () => {
    prisma.recipe.findUnique.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'recipe-1',
      version: 1,
      name: '测试食谱',
      status: RecipeStatus.DRAFT,
      energyDensityKcalPerKg: 1500,
      productionLossRate: 1.07,
      batchLaborHours: 2,
      nutritionStandard: NutritionStandard.FEDIAF_2021,
      detailImages: [],
      applicableLifeStages: [],
      healthTagAssignments: [],
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      items: [
        {
          id: 'item-1',
          ingredientId: 'ingredient-1',
          preparationMethod: `${peelId}, ${steamId}`,
          exampleWeight: 100,
          ratioPercent: 10,
          nutrientTargetKey: null,
          nutrientTargetValue: null,
          ingredient: {
            id: 'ingredient-1',
            name: '南瓜',
            type: 'FOOD',
            properties: {},
          },
        },
      ],
    });
    prisma.preparationMethod.findMany.mockResolvedValue([
      { id: peelId, name: '去皮' },
      { id: steamId, name: '蒸熟' },
    ]);

    const result = await service.getRecipeById('recipe-row-1');

    expect(result.items[0].preparationMethod).toBe('去皮、蒸熟');
  });

  it('aggregates normalized ingredient history from standard recipes only', async () => {
    prisma.recipeItem.findMany.mockResolvedValue([
      {
        preparationMethod: `${peelId}, ${steamId}`,
        recipe: { updatedAt: new Date('2026-04-10T00:00:00.000Z') },
      },
      {
        preparationMethod: '去皮，蒸熟',
        recipe: { updatedAt: new Date('2026-04-09T00:00:00.000Z') },
      },
      {
        preparationMethod: '切丁',
        recipe: { updatedAt: new Date('2026-04-08T00:00:00.000Z') },
      },
      {
        preparationMethod: null,
        recipe: { updatedAt: new Date('2026-04-07T00:00:00.000Z') },
      },
    ]);
    prisma.preparationMethod.findMany.mockResolvedValue([
      { id: peelId, name: '去皮' },
      { id: steamId, name: '蒸熟' },
    ]);

    const result =
      await service.getIngredientPreparationMethodHistory('ingredient-1');

    expect(result).toEqual([
      {
        text: '去皮、蒸熟',
        usageCount: 2,
        lastUsedAt: '2026-04-10T00:00:00.000Z',
      },
      {
        text: '切丁',
        usageCount: 1,
        lastUsedAt: '2026-04-08T00:00:00.000Z',
      },
    ]);
  });
});
