import { RecipeService } from 'src/application/recipe/recipe.service';
import { BadRequestException } from '@nestjs/common';
import { RecipeStatus } from 'src/domain/recipe/enums';

describe('RecipeService supplement alternatives', () => {
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
    ingredient: {
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

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecipeService(mockPrismaService as any);
    mockPrismaService.recipe.findFirst.mockResolvedValue(null);
    mockPrismaService.recipeHealthTagAssignment.createMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.recipeHealthTagAssignment.deleteMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.recipeItem.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaService.preparationMethod.findMany.mockResolvedValue([]);
    mockPrismaService.ingredient.findMany.mockResolvedValue([
      { id: 'supplement-main', type: 'SUPPLEMENT' },
      { id: 'supplement-alt-1', type: 'SUPPLEMENT' },
      { id: 'supplement-alt-2', type: 'SUPPLEMENT' },
    ]);
  });

  it('persists and returns supplement alternatives when creating a recipe', async () => {
    mockPrismaService.recipe.create.mockResolvedValue({ id: 'recipe-row-id' });
    mockPrismaService.recipe.findUnique.mockResolvedValue({
      id: 'recipe-row-id',
      recipeId: 'recipe-1',
      version: 1,
      name: '补剂替代项测试食谱',
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
      createdAt: new Date('2026-04-14T10:00:00.000Z'),
      updatedAt: new Date('2026-04-14T10:00:00.000Z'),
      healthTagAssignments: [],
      items: [
        {
          id: 'recipe-item-1',
          ingredientId: 'supplement-main',
          preparationMethod: null,
          exampleWeight: null,
          ratioPercent: null,
          nutrientTargetKey: '维生素E',
          nutrientTargetValue: 1250,
          sortOrder: 0,
          ingredient: {
            id: 'supplement-main',
            name: '维生素E-200',
            type: 'SUPPLEMENT',
            properties: {},
          },
          supplementAlternatives: [
            {
              id: 'alt-1',
              alternativeIngredientId: 'supplement-alt-1',
              sortOrder: 0,
              isActive: true,
              alternativeIngredient: {
                id: 'supplement-alt-1',
                name: '维生素E-400',
                type: 'SUPPLEMENT',
              },
            },
            {
              id: 'alt-2',
              alternativeIngredientId: 'supplement-alt-2',
              sortOrder: 1,
              isActive: true,
              alternativeIngredient: {
                id: 'supplement-alt-2',
                name: '天然维生素E',
                type: 'SUPPLEMENT',
              },
            },
          ],
        },
      ],
    });

    const result = await service.createRecipe({
      name: '补剂替代项测试食谱',
      nutritionStandard: 'FEDIAF_2021',
      energyDensityKcalPerKg: 1500,
      items: [
        {
          ingredientId: 'supplement-main',
          nutrientTargetKey: '维生素E',
          nutrientTargetValue: 1250,
          supplementAlternativeIngredientIds: [
            'supplement-alt-1',
            'supplement-alt-2',
          ],
        },
      ],
    });

    expect(mockPrismaService.recipe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                ingredientId: 'supplement-main',
                supplementAlternatives: {
                  create: [
                    expect.objectContaining({
                      alternativeIngredientId: 'supplement-alt-1',
                      sortOrder: 0,
                    }),
                    expect.objectContaining({
                      alternativeIngredientId: 'supplement-alt-2',
                      sortOrder: 1,
                    }),
                  ],
                },
              }),
            ],
          },
        }),
      }),
    );

    expect(result.items[0].supplementAlternativeIngredientIds).toEqual([
      'supplement-alt-1',
      'supplement-alt-2',
    ]);
    expect(result.items[0].supplementAlternatives).toEqual([
      { ingredientId: 'supplement-alt-1', ingredientName: '维生素E-400' },
      { ingredientId: 'supplement-alt-2', ingredientName: '天然维生素E' },
    ]);
  });

  it('rejects non-supplement alternatives for supplement replacement groups', async () => {
    mockPrismaService.ingredient.findMany.mockResolvedValue([
      { id: 'supplement-main', type: 'SUPPLEMENT' },
      { id: 'food-alt', type: 'FOOD' },
    ]);

    await expect(
      service.createRecipe({
        name: '非法替代项食谱',
        nutritionStandard: 'FEDIAF_2021',
        energyDensityKcalPerKg: 1500,
        items: [
          {
            ingredientId: 'supplement-main',
            nutrientTargetKey: '维生素E',
            nutrientTargetValue: 1250,
            supplementAlternativeIngredientIds: ['food-alt'],
          },
        ],
      }),
    ).rejects.toThrow(
      new BadRequestException('补剂替代项必须引用补剂原料'),
    );
  });
});
