import { RecipeService } from 'src/application/recipe/recipe.service';
import { RecipeStatus } from 'src/domain/recipe/enums';

describe('RecipeService', () => {
  const mockPrismaService = {
    recipe: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    recipeHealthTagAssignment: {
      createMany: jest.fn(),
    },
  };

  let service: RecipeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecipeService(mockPrismaService as any);
    mockPrismaService.recipeHealthTagAssignment.createMany.mockResolvedValue({
      count: 0,
    });
  });

  describe('duplicateRecipe', () => {
    it('copies exampleWeight for duplicated recipe items', async () => {
      const sourceRecipe = {
        id: 'recipe-source-id',
        recipeId: 'recipe-source',
        version: 3,
        name: '原始食谱',
        status: RecipeStatus.PUBLIC,
        energyDensityKcalPerKg: 1320,
        productionLossRate: 1.07,
        batchLaborHours: 2,
        coverImageUrl: null,
        coverTitle: null,
        detailImages: [],
        videoUrl: null,
        description: null,
        designSource: 'Animal Diet Formulator',
        nutritionStandard: 'FEDIAF_2021',
        nutritionDetailedData: null,
        applicableLifeStages: [],
        productionSteps: null,
        healthTagAssignments: [],
        items: [
          {
            ingredientId: 'ingredient-1',
            preparationMethod: 'prep-1',
            exampleWeight: 180.5,
            ratioPercent: 60,
            nutrientTargetKey: null,
            nutrientTargetValue: null,
            sortOrder: 0,
          },
        ],
      };

      const duplicatedRecipe = {
        id: 'recipe-duplicate-id',
        recipeId: 'recipe-duplicate',
        version: 1,
        name: '原始食谱 (副本)',
        status: RecipeStatus.DRAFT,
        energyDensityKcalPerKg: 1320,
        productionLossRate: 1.07,
        batchLaborHours: 2,
        coverImageUrl: null,
        coverTitle: null,
        detailImages: [],
        videoUrl: null,
        description: null,
        designSource: 'Animal Diet Formulator',
        nutritionStandard: 'FEDIAF_2021',
        nutritionDetailedData: null,
        applicableLifeStages: [],
        productionSteps: null,
        salesCount: 0,
        diyGenCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        createdAt: new Date('2026-04-09T10:00:00.000Z'),
        updatedAt: new Date('2026-04-09T10:00:00.000Z'),
        healthTagAssignments: [],
        items: [
          {
            id: 'item-duplicate-id',
            ingredientId: 'ingredient-1',
            preparationMethod: 'prep-1',
            exampleWeight: 180.5,
            ratioPercent: 60,
            nutrientTargetKey: null,
            nutrientTargetValue: null,
            sortOrder: 0,
            ingredient: {
              id: 'ingredient-1',
              name: '鸡胸',
              type: 'FOOD',
              properties: {},
            },
          },
        ],
      };

      mockPrismaService.recipe.findUnique
        .mockResolvedValueOnce(sourceRecipe)
        .mockResolvedValueOnce(duplicatedRecipe);
      mockPrismaService.recipe.create.mockResolvedValue({
        id: 'recipe-duplicate-id',
      });

      const result = await service.duplicateRecipe('recipe-source-id');

      expect(mockPrismaService.recipe.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            designSource: 'Animal Diet Formulator',
            items: {
              create: [
                expect.objectContaining({
                  ingredientId: 'ingredient-1',
                  exampleWeight: 180.5,
                  ratioPercent: 60,
                }),
              ],
            },
          }),
        }),
      );
      expect(result.designSource).toBe('Animal Diet Formulator');
      expect(result.items[0].exampleWeight).toBe(180.5);
    });
  });
});
