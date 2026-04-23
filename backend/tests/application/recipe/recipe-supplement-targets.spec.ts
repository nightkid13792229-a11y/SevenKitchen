import { RecipeService } from 'src/application/recipe/recipe.service';
import { RecipeStatus } from 'src/domain/recipe/enums';

describe('recipe supplement targets', () => {
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
    mockPrismaService.recipe.create.mockResolvedValue({ id: 'recipe-row-id' });
    mockPrismaService.recipeHealthTagAssignment.createMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.recipeHealthTagAssignment.deleteMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.recipeItem.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaService.preparationMethod.findMany.mockResolvedValue([]);
    mockPrismaService.ingredient.findMany.mockResolvedValue([
      { id: 'supp-1', type: 'SUPPLEMENT' },
    ]);
  });

  it('persists supplementTargets when creating a supplement recipe item', async () => {
    mockPrismaService.recipe.findUnique.mockResolvedValue({
      id: 'recipe-row-id',
      recipeId: 'recipe-1',
      version: 1,
      name: '新版补剂目标测试食谱',
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
      createdAt: new Date('2026-04-17T10:00:00.000Z'),
      updatedAt: new Date('2026-04-17T10:00:00.000Z'),
      healthTagAssignments: [],
      items: [
        {
          id: 'recipe-item-1',
          ingredientId: 'supp-1',
          preparationMethod: null,
          exampleWeight: null,
          ratioPercent: null,
          nutrientTargetKey: null,
          nutrientTargetValue: null,
          supplementTargets: [
            {
              fieldPath: 'minerals.iodine',
              label: '碘',
              targetValuePerKg: 660,
              unit: 'μg',
            },
          ],
          sortOrder: 0,
          ingredient: {
            id: 'supp-1',
            name: '海带片',
            type: 'SUPPLEMENT',
            properties: {},
          },
          supplementAlternatives: [],
        },
      ],
    });

    const result = await service.createRecipe({
      name: '新版补剂目标测试食谱',
      nutritionStandard: 'FEDIAF_2021',
      energyDensityKcalPerKg: 1500,
      items: [
        {
          ingredientId: 'supp-1',
          supplementTargets: [
            {
              fieldPath: 'minerals.iodine',
              label: '碘',
              targetValuePerKg: 660,
              unit: 'μg',
            },
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
                ingredientId: 'supp-1',
                supplementTargets: [
                  {
                    fieldPath: 'minerals.iodine',
                    label: '碘',
                    targetValuePerKg: 660,
                    unit: 'μg',
                  },
                ],
              }),
            ],
          },
        }),
      }),
    );
    expect(result.items[0].supplementTargets).toEqual([
      {
        fieldPath: 'minerals.iodine',
        label: '碘',
        targetValuePerKg: 660,
        unit: 'μg',
      },
    ]);
  });
});
