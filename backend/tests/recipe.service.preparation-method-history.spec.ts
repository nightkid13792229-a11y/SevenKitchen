import { RecipeService } from '../src/application/recipe/recipe.service';
import { NutritionStandard, RecipeStatus } from '../src/domain/recipe/enums';

describe('RecipeService preparation method behavior', () => {
  const peelId = '11111111-1111-1111-1111-111111111111';
  const steamId = '22222222-2222-2222-2222-222222222222';
  const missingId = '33333333-3333-3333-3333-333333333333';

  const prisma = {
    recipe: { findUnique: jest.fn() },
    recipeItem: { findMany: jest.fn() },
    preparationMethod: { findMany: jest.fn() },
  } as any;

  const history = {
    getHistory: jest.fn(),
  };

  let service: RecipeService;

  beforeEach(() => {
    jest.resetAllMocks();
    history.getHistory.mockResolvedValue([]);
    service = new RecipeService(prisma, undefined, history as any);
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

  it('preserves unresolved legacy preparation methods in admin recipe detail', async () => {
    prisma.recipe.findUnique.mockResolvedValue({
      id: 'recipe-row-2',
      recipeId: 'recipe-2',
      version: 1,
      name: '保留旧值',
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
          id: 'item-2',
          ingredientId: 'ingredient-2',
          preparationMethod: missingId,
          exampleWeight: 50,
          ratioPercent: 5,
          nutrientTargetKey: null,
          nutrientTargetValue: null,
          ingredient: {
            id: 'ingredient-2',
            name: '胡萝卜',
            type: 'FOOD',
            properties: {},
          },
        },
      ],
    });
    prisma.preparationMethod.findMany.mockResolvedValue([]);

    const result = await service.getRecipeById('recipe-row-2');

    expect(result.items[0].preparationMethod).toBe(missingId);
  });

  it('preserves partially unresolved uuid-only preparation methods in admin recipe detail', async () => {
    prisma.recipe.findUnique.mockResolvedValue({
      id: 'recipe-row-3',
      recipeId: 'recipe-3',
      version: 1,
      name: '部分旧值',
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
          id: 'item-3',
          ingredientId: 'ingredient-3',
          preparationMethod: `${steamId}, ${peelId}`,
          exampleWeight: 80,
          ratioPercent: 8,
          nutrientTargetKey: null,
          nutrientTargetValue: null,
          ingredient: {
            id: 'ingredient-3',
            name: '土豆',
            type: 'FOOD',
            properties: {},
          },
        },
      ],
    });
    prisma.preparationMethod.findMany.mockResolvedValue([
      { id: peelId, name: '去皮' },
    ]);

    const result = await service.getRecipeById('recipe-row-3');

    expect(result.items[0].preparationMethod).toBe(`${steamId}, ${peelId}`);
  });

  it('delegates ingredient history and maps lastUsedAt to ISO', async () => {
    history.getHistory.mockResolvedValue([
      {
        text: '去皮、蒸熟',
        usageCount: 2,
        lastUsedAt: new Date('2026-04-10T00:00:00.000Z'),
      },
    ]);

    const result = await service.getIngredientPreparationMethodHistory(
      'ingredient-1',
      3,
    );

    expect(history.getHistory).toHaveBeenCalledWith('ingredient-1', 3);
    expect(result).toEqual([
      {
        text: '去皮、蒸熟',
        usageCount: 2,
        lastUsedAt: '2026-04-10T00:00:00.000Z',
      },
    ]);
  });

  it('passes no limit through when the caller does not ask for one', async () => {
    await service.getIngredientPreparationMethodHistory('ingredient-1');

    expect(history.getHistory).toHaveBeenCalledWith('ingredient-1', undefined);
  });

  it('returns empty when the history service is unavailable', async () => {
    const withoutHistory = new RecipeService(prisma);

    await expect(
      withoutHistory.getIngredientPreparationMethodHistory('ingredient-1'),
    ).resolves.toEqual([]);
  });
});
