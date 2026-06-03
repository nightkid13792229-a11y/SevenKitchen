import { RecipeService } from 'src/application/recipe/recipe.service';
import { RecipeStatus } from 'src/domain/recipe/enums';
import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  SERIES_LIFE_STAGE_LABELS,
} from 'src/domain/recipe/recipe-series';

describe('RecipeService', () => {
  const mockPrismaService = {
    recipe: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
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

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RecipeService(mockPrismaService as any);
    mockPrismaService.recipeHealthTagAssignment.createMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.recipeHealthTagAssignment.deleteMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.recipeItem.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaService.nutritionFoodMapping.findMany.mockResolvedValue([]);
    mockPrismaService.preparationMethod.findMany.mockResolvedValue([]);
  });

  describe('getAllRecipes', () => {
    it('selects the latest same-status series representative and stage by recipe version, not updatedAt', async () => {
      const baseRecipe = {
        recipeId: 'adult-recipe-id',
        name: '成犬配方',
        status: RecipeStatus.PUBLIC,
        energyDensityKcalPerKg: 1373,
        coverImageUrl: null,
        coverTitle: null,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
        salesCount: 0,
        diyGenCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        healthTagAssignments: [],
        seriesId: 'series-version-order',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        series: { id: 'series-version-order', name: '版本选择系列' },
        createdAt: new Date('2026-05-27T08:58:00.000Z'),
      };
      const touchedOlderVersion = {
        ...baseRecipe,
        id: 'adult-public-v1-row',
        version: 1,
        updatedAt: new Date('2026-05-29T08:58:00.000Z'),
      };
      const latestVersion = {
        ...baseRecipe,
        id: 'adult-public-v2-row',
        version: 2,
        updatedAt: new Date('2026-05-28T08:58:00.000Z'),
      };
      mockPrismaService.recipe.findMany.mockResolvedValue([
        touchedOlderVersion,
        latestVersion,
      ]);

      const result = await service.getAllRecipes({ page: 1, pageSize: 20 });

      const seriesRow = result.data[0];
      expect(seriesRow).toEqual(
        expect.objectContaining({
          id: 'adult-public-v2-row',
          version: 2,
          currentPublicVersion: expect.objectContaining({
            id: 'adult-public-v2-row',
            version: 2,
          }),
        }),
      );
      expect(
        seriesRow.seriesStages?.find(
          (stage) => stage.lifeStage === 'HIGH_ACTIVITY_ADULT',
        ),
      ).toEqual(
        expect.objectContaining({
          status: 'PUBLIC',
          recipeId: 'adult-recipe-id',
          version: 2,
          updatedAt: '2026-05-28T08:58:00.000Z',
        }),
      );
    });

    it('uses filtered rows only to choose visible series and builds series summaries from complete series members', async () => {
      const baseRecipe = {
        version: 1,
        energyDensityKcalPerKg: 1373,
        coverImageUrl: null,
        coverTitle: null,
        salesCount: 0,
        diyGenCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        healthTagAssignments: [],
        seriesId: 'series-filtered',
        series: { id: 'series-filtered', name: '筛选完整系列' },
        createdAt: new Date('2026-05-27T08:58:00.000Z'),
        updatedAt: new Date('2026-05-27T08:58:00.000Z'),
      };
      const puppyDraft = {
        ...baseRecipe,
        id: 'puppy-draft-row',
        recipeId: 'puppy-recipe-id',
        name: '幼犬草稿配方',
        status: RecipeStatus.DRAFT,
        applicableLifeStages: ['PUPPY_14_WEEKS_PLUS'],
        seriesLifeStage: 'PUPPY_14_WEEKS_PLUS',
        updatedAt: new Date('2026-05-29T08:58:00.000Z'),
      };
      const adultPublic = {
        ...baseRecipe,
        id: 'adult-public-row',
        recipeId: 'adult-recipe-id',
        name: '成犬公开配方',
        status: RecipeStatus.PUBLIC,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        updatedAt: new Date('2026-05-28T08:58:00.000Z'),
      };
      mockPrismaService.recipe.findMany
        .mockResolvedValueOnce([puppyDraft])
        .mockResolvedValueOnce([puppyDraft, adultPublic]);

      const result = await service.getAllRecipes({
        status: RecipeStatus.DRAFT,
        page: 1,
        pageSize: 20,
      });

      expect(result.total).toBe(1);
      expect(mockPrismaService.recipe.findMany).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.recipe.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            seriesId: {
              in: ['series-filtered'],
            },
          },
        }),
      );
      const seriesRow = result.data[0];
      expect(seriesRow.currentPublicVersion).toEqual(
        expect.objectContaining({
          id: 'adult-public-row',
          version: 1,
        }),
      );
      expect(
        seriesRow.seriesStages?.find(
          (stage) => stage.lifeStage === 'HIGH_ACTIVITY_ADULT',
        ),
      ).toEqual(
        expect.objectContaining({
          status: 'PUBLIC',
          recipeId: 'adult-recipe-id',
          version: 1,
        }),
      );
    });

    it('groups admin recipes by series with five life-stage status summaries while preserving legacy recipe version rows', async () => {
      const baseRecipe = {
        version: 1,
        status: RecipeStatus.PUBLIC,
        energyDensityKcalPerKg: 1373,
        coverImageUrl: null,
        coverTitle: null,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
        salesCount: 0,
        diyGenCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        healthTagAssignments: [],
        createdAt: new Date('2026-05-27T08:58:00.000Z'),
        updatedAt: new Date('2026-05-27T08:58:00.000Z'),
      };
      const publicAdult = {
        ...baseRecipe,
        id: 'adult-public-row',
        recipeId: 'adult-recipe-id',
        name: '成犬配方',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        series: { id: 'series-1', name: '鸡肉全阶段系列' },
      };
      const puppyDraft = {
        ...baseRecipe,
        id: 'puppy-draft-row',
        recipeId: 'puppy-recipe-id',
        name: '幼犬配方',
        status: RecipeStatus.DRAFT,
        applicableLifeStages: ['PUPPY_14_WEEKS_PLUS'],
        seriesId: 'series-1',
        seriesLifeStage: 'PUPPY_14_WEEKS_PLUS',
        series: { id: 'series-1', name: '鸡肉全阶段系列' },
        createdAt: new Date('2026-05-28T08:58:00.000Z'),
        updatedAt: new Date('2026-05-28T09:00:00.000Z'),
      };
      const legacyPublic = {
        ...baseRecipe,
        id: 'legacy-public-row',
        recipeId: 'legacy-recipe-id',
        name: '经典配方',
        seriesId: null,
        seriesLifeStage: null,
        series: null,
        createdAt: new Date('2026-05-26T08:58:00.000Z'),
        updatedAt: new Date('2026-05-26T08:58:00.000Z'),
      };
      const legacyDraft = {
        ...legacyPublic,
        id: 'legacy-draft-row',
        version: 2,
        status: RecipeStatus.DRAFT,
        createdAt: new Date('2026-05-29T08:58:00.000Z'),
        updatedAt: new Date('2026-05-29T08:58:00.000Z'),
      };
      mockPrismaService.recipe.findMany.mockResolvedValue([
        legacyDraft,
        puppyDraft,
        publicAdult,
        legacyPublic,
      ]);

      const result = await service.getAllRecipes({ page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      const seriesRow = result.data.find((row) => row.seriesId === 'series-1');
      const legacyRow = result.data.find(
        (row) => row.recipeId === 'legacy-recipe-id',
      );

      expect(seriesRow).toEqual(
        expect.objectContaining({
          id: 'puppy-draft-row',
          recipeId: 'puppy-recipe-id',
          seriesId: 'series-1',
          seriesName: '鸡肉全阶段系列',
          name: '幼犬配方',
          status: RecipeStatus.DRAFT,
        }),
      );
      expect(seriesRow?.seriesStages).toEqual(
        ORDERED_RECIPE_SERIES_LIFE_STAGES.map((lifeStage) => {
          if (lifeStage === 'PUPPY_14_WEEKS_PLUS') {
            return {
              lifeStage,
              label: SERIES_LIFE_STAGE_LABELS[lifeStage],
              status: 'DRAFT',
              recipeVersionId: 'puppy-draft-row',
              recipeId: 'puppy-recipe-id',
              version: 1,
              updatedAt: '2026-05-28T09:00:00.000Z',
            };
          }
          if (lifeStage === 'HIGH_ACTIVITY_ADULT') {
            return {
              lifeStage,
              label: SERIES_LIFE_STAGE_LABELS[lifeStage],
              status: 'PUBLIC',
              recipeVersionId: 'adult-public-row',
              recipeId: 'adult-recipe-id',
              version: 1,
              updatedAt: '2026-05-27T08:58:00.000Z',
            };
          }
          return {
            lifeStage,
            label: SERIES_LIFE_STAGE_LABELS[lifeStage],
            status: 'NOT_DESIGNED',
          };
        }),
      );
      expect(legacyRow).toEqual(
        expect.objectContaining({
          id: 'legacy-draft-row',
          recipeId: 'legacy-recipe-id',
          seriesId: undefined,
          currentPublicVersion: expect.objectContaining({
            id: 'legacy-public-row',
            version: 1,
          }),
          pendingDraftVersion: expect.objectContaining({
            id: 'legacy-draft-row',
            version: 2,
          }),
        }),
      );
      expect(legacyRow?.seriesStages).toBeUndefined();
    });

    it('groups recipe versions into one admin list row with current public and pending draft summaries', async () => {
      const publicVersion = {
        id: 'recipe-row-v1',
        recipeId: 'recipe-series-1',
        version: 1,
        name: '萝卜绿豆鸭胸猪里脊',
        status: RecipeStatus.PUBLIC,
        energyDensityKcalPerKg: 1373,
        coverImageUrl: null,
        coverTitle: null,
        applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        salesCount: 0,
        diyGenCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        healthTagAssignments: [],
        createdAt: new Date('2026-05-27T08:58:00.000Z'),
        updatedAt: new Date('2026-05-27T08:58:00.000Z'),
      };
      const firstDraftVersion = {
        ...publicVersion,
        id: 'recipe-row-v2',
        version: 2,
        name: '萝卜绿豆鸭胸猪里脊 修订',
        status: RecipeStatus.DRAFT,
        energyDensityKcalPerKg: 1374,
        createdAt: new Date('2026-05-27T10:30:00.000Z'),
        updatedAt: new Date('2026-05-27T10:30:00.000Z'),
      };
      const latestDraftVersion = {
        ...publicVersion,
        id: 'recipe-row-v3',
        version: 3,
        name: '萝卜绿豆鸭胸猪里脊 修订 修订',
        status: RecipeStatus.DRAFT,
        createdAt: new Date('2026-05-27T10:48:00.000Z'),
        updatedAt: new Date('2026-05-27T10:48:00.000Z'),
      };
      const otherRecipe = {
        ...publicVersion,
        id: 'recipe-row-other',
        recipeId: 'recipe-series-2',
        version: 1,
        name: '燕麦鳕鱼猪肉',
        status: RecipeStatus.PUBLIC,
        createdAt: new Date('2026-01-23T15:26:00.000Z'),
        updatedAt: new Date('2026-01-23T15:26:00.000Z'),
      };
      mockPrismaService.recipe.findMany.mockResolvedValue([
        latestDraftVersion,
        firstDraftVersion,
        publicVersion,
        otherRecipe,
      ]);

      const result = await service.getAllRecipes({ page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      expect(result.data).toEqual([
        expect.objectContaining({
          id: 'recipe-row-v3',
          name: '萝卜绿豆鸭胸猪里脊 修订 修订',
          version: 3,
          status: RecipeStatus.DRAFT,
          currentPublicVersion: expect.objectContaining({
            id: 'recipe-row-v1',
            version: 1,
            status: RecipeStatus.PUBLIC,
          }),
          pendingDraftVersion: expect.objectContaining({
            id: 'recipe-row-v3',
            version: 3,
            status: RecipeStatus.DRAFT,
          }),
          versionHistory: [
            expect.objectContaining({ id: 'recipe-row-v3', version: 3 }),
            expect.objectContaining({ id: 'recipe-row-v2', version: 2 }),
            expect.objectContaining({ id: 'recipe-row-v1', version: 1 }),
          ],
        }),
        expect.objectContaining({
          id: 'recipe-row-other',
          version: 1,
          currentPublicVersion: expect.objectContaining({
            id: 'recipe-row-other',
            version: 1,
          }),
          pendingDraftVersion: undefined,
        }),
      ]);
    });
  });

  describe('getRecipeById', () => {
    it('returns series context and switchable life-stage recipe versions for series recipes', async () => {
      const baseRecipe = {
        version: 1,
        energyDensityKcalPerKg: 1373,
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
        salesCount: 0,
        diyGenCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        healthTagAssignments: [],
        items: [],
        seriesId: 'series-1',
        series: { id: 'series-1', name: '鸡肉全阶段系列' },
        createdAt: new Date('2026-05-27T08:58:00.000Z'),
        updatedAt: new Date('2026-05-27T08:58:00.000Z'),
      };
      const adultPublic = {
        ...baseRecipe,
        id: 'adult-public-row',
        recipeId: 'adult-recipe-id',
        name: '成犬配方',
        status: RecipeStatus.PUBLIC,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      };
      const puppyDraft = {
        ...baseRecipe,
        id: 'puppy-draft-row',
        recipeId: 'puppy-recipe-id',
        name: '幼犬配方',
        status: RecipeStatus.DRAFT,
        applicableLifeStages: ['PUPPY_14_WEEKS_PLUS'],
        seriesLifeStage: 'PUPPY_14_WEEKS_PLUS',
        updatedAt: new Date('2026-05-28T09:00:00.000Z'),
      };

      mockPrismaService.recipe.findUnique.mockResolvedValue(adultPublic);
      mockPrismaService.recipe.findMany.mockResolvedValue([
        adultPublic,
        puppyDraft,
      ]);

      const result = await service.getRecipeById('adult-public-row');

      expect(mockPrismaService.recipe.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { seriesId: 'series-1' },
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'adult-public-row',
          seriesId: 'series-1',
          seriesName: '鸡肉全阶段系列',
          seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
          seriesLifeStageLabel: SERIES_LIFE_STAGE_LABELS.HIGH_ACTIVITY_ADULT,
        }),
      );
      expect(result.seriesStages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            lifeStage: 'HIGH_ACTIVITY_ADULT',
            status: 'PUBLIC',
            recipeVersionId: 'adult-public-row',
            recipeId: 'adult-recipe-id',
          }),
          expect.objectContaining({
            lifeStage: 'PUPPY_14_WEEKS_PLUS',
            status: 'DRAFT',
            recipeVersionId: 'puppy-draft-row',
            recipeId: 'puppy-recipe-id',
          }),
        ]),
      );
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
            supplementAlternatives: [
              {
                id: 'alt-1',
                alternativeIngredientId: 'ingredient-2',
                sortOrder: 0,
                isActive: true,
                alternativeIngredient: {
                  id: 'ingredient-2',
                  name: '鸡腿肉',
                  type: 'SUPPLEMENT',
                },
              },
            ],
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
                  supplementAlternatives: {
                    create: [
                      expect.objectContaining({
                        alternativeIngredientId: 'ingredient-2',
                        sortOrder: 0,
                      }),
                    ],
                  },
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

  describe('createRecipe', () => {
    it('does not persist legacy nutrition report PDF urls on recipe records', async () => {
      const createdRecipe = {
        id: 'recipe-created-id',
        recipeId: 'recipe-created',
        version: 1,
        name: '营养报告食谱',
        status: RecipeStatus.DRAFT,
        energyDensityKcalPerKg: 1320,
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
        createdAt: new Date('2026-04-20T10:00:00.000Z'),
        updatedAt: new Date('2026-04-20T10:00:00.000Z'),
        healthTagAssignments: [],
        items: [],
      };

      mockPrismaService.recipe.findFirst.mockResolvedValue(null);
      mockPrismaService.recipe.create.mockResolvedValue({
        id: 'recipe-created-id',
      });
      mockPrismaService.recipe.findUnique.mockResolvedValue(createdRecipe);

      const result = await service.createRecipe({
        name: '营养报告食谱',
        nutritionStandard: 'FEDIAF_2021',
        energyDensityKcalPerKg: 1320,
        nutritionReportUrl:
          'https://cdn.example.com/recipe-nutrition-reports/report.pdf',
      });

      expect(mockPrismaService.recipe.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            nutritionReportUrl: expect.anything(),
          }),
        }),
      );
      expect(result).not.toHaveProperty('nutritionReportUrl');
    });
  });

  describe('updateRecipe', () => {
    it('does not create a new version when food supplement targets normalize from null to empty', async () => {
      const existingRecipe = {
        id: 'recipe-row-id',
        recipeId: 'recipe-series-id',
        version: 2,
        name: '后台食谱',
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
        items: [
          {
            id: 'recipe-item-1',
            ingredientId: 'food-1',
            nutritionFoodId: 'nutrition-food-1',
            preparationMethod: null,
            exampleWeight: 15,
            ratioPercent: 5.01,
            nutrientTargetKey: null,
            nutrientTargetValue: null,
            supplementTargets: null,
            sortOrder: 0,
            supplementAlternatives: [],
          },
        ],
      };
      const updatedRecipe = {
        ...existingRecipe,
        salesCount: 0,
        diyGenCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        createdAt: new Date('2026-05-22T10:00:00.000Z'),
        updatedAt: new Date('2026-05-22T10:10:00.000Z'),
        healthTagAssignments: [],
        items: [
          {
            ...existingRecipe.items[0],
            ingredient: {
              id: 'food-1',
              name: '生蚝',
              type: 'FOOD',
              properties: {},
            },
            nutritionFood: {
              id: 'nutrition-food-1',
              name: 'Oyster, raw',
              nameEn: 'Oyster, raw',
              preparationState: 'RAW',
              preparationStateLabel: '生',
            },
            supplementAlternatives: [],
          },
        ],
      };

      mockPrismaService.recipe.findUnique
        .mockResolvedValueOnce(existingRecipe)
        .mockResolvedValueOnce(updatedRecipe);
      mockPrismaService.recipe.update.mockResolvedValue({
        id: 'recipe-row-id',
      });
      mockPrismaService.nutritionFoodMapping.findMany.mockResolvedValue([
        {
          ingredientId: 'food-1',
          nutritionFoodId: 'nutrition-food-1',
          isPrimary: true,
        },
      ]);

      await service.updateRecipe('recipe-row-id', {
        name: '后台食谱',
        status: RecipeStatus.DRAFT,
        energyDensityKcalPerKg: 1500,
        productionLossRate: 1.07,
        batchLaborHours: 2,
        detailImages: [],
        nutritionStandard: 'FEDIAF_2021',
        applicableLifeStages: [],
        items: [
          {
            ingredientId: 'food-1',
            nutritionFoodId: 'nutrition-food-1',
            exampleWeight: 15,
            ratioPercent: 5.01,
            supplementTargets: [],
          },
        ],
      });

      expect(mockPrismaService.recipe.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 2,
          }),
        }),
      );
    });

    it('preserves existing nutrition summary even when admin update payload includes nutrition data', async () => {
      const nutritionDetailedData = {
        protein_dm_pct: 58.2,
        fat_dm_pct: 38.2,
        energy_density_kcal_per_kg: 2080,
      };
      const existingRecipe = {
        id: 'recipe-row-id',
        recipeId: 'recipe-designer-id',
        version: 1,
        name: '设计器发布食谱',
        status: RecipeStatus.PUBLIC,
        energyDensityKcalPerKg: 2080,
        productionLossRate: 1,
        batchLaborHours: null,
        coverImageUrl: null,
        coverTitle: null,
        detailImages: [],
        videoUrl: null,
        description: null,
        designSource: 'Setar',
        nutritionStandard: 'FEDIAF_2025',
        nutritionDetailedData,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
        productionSteps: null,
        healthTagAssignments: [{ healthTagId: 'health-tag-1' }],
        items: [],
      };
      const updatedRecipe = {
        ...existingRecipe,
        coverImageUrl: 'https://static.example.com/cover.jpg',
        coverTitle: '封面标题',
        description: '后台补充描述',
        productionSteps: '1. 处理原料',
        salesCount: 0,
        diyGenCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        createdAt: new Date('2026-05-22T10:00:00.000Z'),
        updatedAt: new Date('2026-05-22T10:10:00.000Z'),
      };

      mockPrismaService.recipe.findUnique
        .mockResolvedValueOnce(existingRecipe)
        .mockResolvedValueOnce(updatedRecipe);
      mockPrismaService.recipe.update.mockResolvedValue({
        id: 'recipe-row-id',
      });

      const result = await service.updateRecipe('recipe-row-id', {
        coverImageUrl: 'https://static.example.com/cover.jpg',
        coverTitle: '封面标题',
        description: '后台补充描述',
        productionSteps: '1. 处理原料',
        nutritionDetailedData: {
          protein_dm_pct: 1,
          fat_dm_pct: 1,
        },
      });

      expect(mockPrismaService.recipe.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            coverImageUrl: 'https://static.example.com/cover.jpg',
            coverTitle: '封面标题',
          }),
        }),
      );
      expect(
        mockPrismaService.recipe.update.mock.calls[0][0].data
          .nutritionDetailedData,
      ).toBeUndefined();
      expect(result.nutritionDetailedData).toEqual(nutritionDetailedData);
    });
  });
});
