import { BadRequestException } from '@nestjs/common';
import { RecipeService } from 'src/application/recipe/recipe.service';
import { RecipeStatus } from 'src/domain/recipe/enums';

describe('recipe nutrition state selection', () => {
  const mockPrismaService = {
    recipe: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    recipeItem: {
      deleteMany: jest.fn(),
    },
    nutritionFoodMapping: {
      findMany: jest.fn(),
    },
    recipeHealthTagAssignment: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    preparationMethod: {
      findMany: jest.fn(),
    },
  };

  let service: RecipeService;

  const createdRecipe = {
    id: 'recipe-row-id',
    recipeId: 'recipe-1',
    version: 1,
    name: '糙米熟重测试食谱',
    status: RecipeStatus.DRAFT,
    energyDensityKcalPerKg: 1500,
    productionLossRate: 1.07,
    batchLaborHours: 2,
    coverImageUrl: null,
    coverTitle: null,
    detailImages: [],
    videoUrl: null,
    description: null,
    designSource: null,
    nutritionStandard: 'FEDIAF_2021',
    nutritionDetailedData: null,
    applicableLifeStages: [],
    productionSteps: null,
    salesCount: 0,
    diyGenCount: 0,
    likeCount: 0,
    favoriteCount: 0,
    createdAt: new Date('2026-05-12T10:00:00.000Z'),
    updatedAt: new Date('2026-05-12T10:00:00.000Z'),
    healthTagAssignments: [],
    items: [
      {
        id: 'recipe-item-1',
        ingredientId: 'ingredient-rice',
        nutritionFoodId: 'nutrition-food-cooked-rice',
        preparationMethod: '煮熟后压散',
        exampleWeight: 80,
        ratioPercent: 20,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        supplementTargets: null,
        sortOrder: 0,
        ingredient: {
          id: 'ingredient-rice',
          name: '糙米',
          type: 'FOOD',
          properties: {},
        },
        nutritionFood: {
          id: 'nutrition-food-cooked-rice',
          name: 'Rice, brown, cooked',
          nameEn: 'Rice, brown, cooked',
          preparationState: 'COOKED',
          preparationStateLabel: '熟重',
        },
        supplementAlternatives: [],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecipeService(mockPrismaService as any);
    mockPrismaService.recipe.findFirst.mockResolvedValue(null);
    mockPrismaService.recipe.create.mockResolvedValue({ id: 'recipe-row-id' });
    mockPrismaService.recipe.findUnique.mockResolvedValue(createdRecipe);
    mockPrismaService.recipeHealthTagAssignment.createMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.recipeHealthTagAssignment.deleteMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.recipeItem.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaService.preparationMethod.findMany.mockResolvedValue([]);
  });

  it('defaults a food recipe item to the primary mapped nutrition food', async () => {
    mockPrismaService.nutritionFoodMapping.findMany.mockResolvedValue([
      {
        ingredientId: 'ingredient-rice',
        nutritionFoodId: 'nutrition-food-cooked-rice',
        isPrimary: true,
        nutritionFood: createdRecipe.items[0].nutritionFood,
      },
    ]);

    const result = await service.createRecipe({
      name: '糙米熟重测试食谱',
      nutritionStandard: 'FEDIAF_2021',
      energyDensityKcalPerKg: 1500,
      items: [
        {
          ingredientId: 'ingredient-rice',
          preparationMethod: '煮熟后压散',
          exampleWeight: 80,
          ratioPercent: 20,
        },
      ],
    });

    expect(mockPrismaService.recipe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                ingredientId: 'ingredient-rice',
                nutritionFoodId: 'nutrition-food-cooked-rice',
              }),
            ],
          },
        }),
      }),
    );
    expect(result.items[0].nutritionFoodId).toBe('nutrition-food-cooked-rice');
    expect(result.items[0].nutritionStateLabel).toBe('熟重');
  });

  it('persists an explicitly selected mapped nutrition food', async () => {
    mockPrismaService.nutritionFoodMapping.findMany.mockResolvedValue([
      {
        ingredientId: 'ingredient-rice',
        nutritionFoodId: 'nutrition-food-cooked-rice',
        isPrimary: false,
        nutritionFood: createdRecipe.items[0].nutritionFood,
      },
    ]);

    await service.createRecipe({
      name: '糙米熟重测试食谱',
      nutritionStandard: 'FEDIAF_2021',
      energyDensityKcalPerKg: 1500,
      items: [
        {
          ingredientId: 'ingredient-rice',
          nutritionFoodId: 'nutrition-food-cooked-rice',
          exampleWeight: 80,
          ratioPercent: 20,
        },
      ],
    });

    expect(mockPrismaService.recipe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                nutritionFoodId: 'nutrition-food-cooked-rice',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('rejects a selected nutrition food that is not mapped to the ingredient', async () => {
    mockPrismaService.nutritionFoodMapping.findMany.mockResolvedValue([]);

    await expect(
      service.createRecipe({
        name: '错误映射测试食谱',
        nutritionStandard: 'FEDIAF_2021',
        energyDensityKcalPerKg: 1500,
        items: [
          {
            ingredientId: 'ingredient-rice',
            nutritionFoodId: 'nutrition-food-other',
            exampleWeight: 80,
            ratioPercent: 20,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
