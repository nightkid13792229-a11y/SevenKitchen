import { BadRequestException } from '@nestjs/common';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { SupplementTargetService } from '../../../src/application/recipe-designer/supplement-target.service';
import type { NutritionProfileV2 } from '../../../src/domain/ingredient/types';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 补剂显式目标接入设计器流程（2026-10-22 · Task 3）
 *
 * 覆盖：
 * - 纤维素粉默认目标 → 膳食纤维 19.67 g/kg；
 * - 鱼肝油默认目标 → 维生素 A / D；
 * - 没有默认目标、也没有显式目标 → 400（不再按缺口推断）；
 * - add / update 会把显式或默认目标解析后持久化，发布门槛只认已持久化的 supplementTargets；
 * - 未知/空/为 0 的目标拒绝，不静默丢弃；
 * - 发布与私密快照保持 `{fieldPath,label,targetValuePerKg,unit}` 负载结构。
 */

const STAFF_ACCESS = { userId: 'staff-1', role: 'STAFF' as const };
const ADMIN_ACCESS = { userId: 'admin-1', role: 'ADMIN' as const };

function fiberProfile(): NutritionProfileV2 {
  return {
    meta: { rawBasisType: 'PER_1_G' } as NutritionProfileV2['meta'],
    macros: { energyKcal: 0, fiber: 1, insolubleFiber: 1 },
    minerals: {},
    vitamins: {},
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  } as NutritionProfileV2;
}

function codLiverOilProfile(): NutritionProfileV2 {
  return {
    meta: { rawBasisType: 'PER_1_G' } as NutritionProfileV2['meta'],
    macros: { energyKcal: 0 },
    minerals: {},
    vitamins: { vitaminA: 5000, vitaminD: 500 },
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  } as NutritionProfileV2;
}

function foodProfile(): NutritionProfileV2 {
  return {
    meta: { rawBasisType: 'PER_100_G' } as NutritionProfileV2['meta'],
    macros: {
      energyKcal: 120,
      moisture: 70,
      crudeProtein: 20,
      crudeFat: 3,
      ash: 1,
      fiber: 0,
    },
    minerals: {},
    vitamins: {},
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  } as NutritionProfileV2;
}

function foodItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'food-item-1',
    ingredientId: 'ingredient-food',
    nutritionFoodId: 'food-base',
    weightG: 4900,
    includeInAssessment: true,
    ratioPercent: null,
    preparationMethod: '蒸熟',
    nutrientTargetKey: null,
    nutrientTargetValue: null,
    supplementTargets: null,
    sortOrder: 0,
    ingredient: {
      id: 'ingredient-food',
      name: '基础食材',
      type: 'FOOD',
      unitDisplayLabel: 'g',
      purchaseUnit: 'g',
      properties: null,
    },
    nutritionFood: {
      id: 'food-base',
      name: '基础食材',
      nutritionData: foodProfile(),
      preparationState: null,
      mappings: [
        {
          ingredientId: 'ingredient-food',
          isPrimary: true,
          ingredient: {
            id: 'ingredient-food',
            name: '基础食材',
            type: 'FOOD',
          },
        },
      ],
    },
    ...overrides,
  };
}

function fiberSupplementItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'supplement-fiber-item',
    ingredientId: 'ingredient-fiber',
    nutritionFoodId: 'food-fiber',
    weightG: 100,
    includeInAssessment: true,
    ratioPercent: null,
    preparationMethod: '直接添加',
    nutrientTargetKey: null,
    nutrientTargetValue: null,
    supplementTargets: null,
    sortOrder: 1,
    ingredient: {
      id: 'ingredient-fiber',
      name: '纤维素粉',
      type: 'SUPPLEMENT',
      unitDisplayLabel: 'g',
      purchaseUnit: 'g',
      properties: null,
    },
    nutritionFood: {
      id: 'food-fiber',
      name: '纤维素粉',
      nutritionData: fiberProfile(),
      preparationState: null,
      mappings: [
        {
          ingredientId: 'ingredient-fiber',
          isPrimary: true,
          ingredient: {
            id: 'ingredient-fiber',
            name: '纤维素粉',
            type: 'SUPPLEMENT',
          },
        },
      ],
    },
    ...overrides,
  };
}

function designDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'design-1',
    name: '纤维补剂食谱',
    version: 1,
    contentRevision: 0,
    status: 'DRAFT',
    fediafDogScenario: 'ADULT_MER_110',
    nutritionStandard: 'FEDIAF_2025',
    totalWeightG: 5000,
    energyDensityKcalPerKg: 1176,
    targetHealthTags: ['JOINT'],
    applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
    notes: null,
    coverImageUrl: 'https://img.example.com/cover.jpg',
    coverTitle: '纤维补剂食谱',
    description: '纤维补剂展示描述',
    sellingPoint: '膳食纤维补充',
    detailImages: ['https://img.example.com/detail.jpg'],
    videoUrl: null,
    // 发布门槛要求至少一个有效制作步骤
    productionStepsJson: [
      {
        sortOrder: 1,
        instruction: '食材称重后混合',
        durationMinutes: null,
        temperatureC: null,
        equipment: null,
      },
    ],
    createdBy: 'staff-1',
    isCompliant: true,
    reviewStatus: 'NONE',
    reviewNote: null,
    calculatedNutrition: {},
    complianceStatus: {},
    assessmentSummary: {},
    missingDataReport: [],
    publishedAt: null,
    publishedRecipeId: null,
    publishedRecipeVersion: null,
    revisionOfDesignRecipeId: null,
    revisionBaseRecipeId: null,
    customerDogId: 'dog-1',
    seriesId: null,
    seriesLifeStage: null,
    series: null,
    items: [],
    ...overrides,
  };
}

function createPrismaMock() {
  const prisma: any = {
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'staff-1' }]) },
    designRecipe: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      aggregate: jest.fn().mockResolvedValue({ _max: { version: null } }),
      update: jest.fn().mockResolvedValue({}),
    },
    designRecipeItem: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
      create: jest.fn(),
      update: jest.fn(),
    },
    nutritionFood: { findUnique: jest.fn() },
    nutritionFoodMapping: {
      findFirst: jest.fn().mockResolvedValue({ id: 'mapping-1' }),
    },
    ingredient: { findMany: jest.fn() },
    recipeItem: { findMany: jest.fn().mockResolvedValue([]) },
    preparationMethod: { findMany: jest.fn().mockResolvedValue([]) },
    recipe: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    designRecipePublishSnapshot: { create: jest.fn().mockResolvedValue({}) },
    favoriteRecipe: { updateMany: jest.fn() },
    customRecipeOrder: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
  };
  return prisma;
}

function makeService(prisma: any, targetProvider: any) {
  const supplementTargetService = new SupplementTargetService(
    prisma as PrismaService,
  );
  return new RecipeDesignerService(
    prisma as PrismaService,
    targetProvider,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    supplementTargetService,
  );
}

describe('补剂显式目标设计器流程（Task 3）', () => {
  let prisma: any;
  let targetProvider: any;
  let service: RecipeDesignerService;

  beforeEach(() => {
    prisma = createPrismaMock();
    targetProvider = { getTargets: jest.fn().mockResolvedValue([]) };
    service = makeService(prisma, targetProvider);
  });

  function mockAddItemDraft(totalWeightG: number) {
    prisma.designRecipe.findUnique.mockResolvedValue({
      id: 'design-1',
      createdBy: 'staff-1',
      status: 'DRAFT',
      publishedRecipeId: null,
      publishedAt: null,
      seriesId: null,
      seriesLifeStage: null,
      totalWeightG,
    });
    prisma.ingredient.findMany.mockResolvedValue([
      { id: 'ingredient-fiber', type: 'SUPPLEMENT' },
    ]);
    prisma.designRecipeItem.create.mockImplementation(async (args: any) => ({
      id: 'created-item',
      ...args.data,
    }));
  }

  function mockSupplementProfile(input: {
    id: string;
    name: string;
    nutritionData: NutritionProfileV2;
    defaultSupplementTargets: unknown;
  }) {
    prisma.nutritionFood.findUnique.mockImplementation(async (args: any) => {
      if (args?.select?.preparationState) {
        return { preparationState: null };
      }
      return {
        id: input.id,
        name: input.name,
        nutritionData: input.nutritionData,
        defaultSupplementTargets: input.defaultSupplementTargets,
      };
    });
  }

  describe('addItem', () => {
    it('applies the fiber powder default target and computes 19.67 g/kg', async () => {
      mockAddItemDraft(5084);
      mockSupplementProfile({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: fiberProfile(),
        defaultSupplementTargets: [
          { fieldPath: 'macros.fiber', label: '膳食纤维', unit: 'g' },
        ],
      });

      const created = await service.addItem(
        'design-1',
        {
          ingredientId: 'ingredient-fiber',
          nutritionFoodId: 'food-fiber',
          weightG: 100,
        },
        STAFF_ACCESS,
      );

      const createData = prisma.designRecipeItem.create.mock.calls[0][0].data;
      expect(createData.supplementTargets).toEqual([
        expect.objectContaining({
          // 100 g 纤维素粉（1 g 纤维/g）÷ 5084 g × 1000 = 19.67
          fieldPath: 'macros.fiber',
          label: '膳食纤维',
          unit: 'g',
          targetValue: 19.67,
        }),
      ]);
      expect(createData.nutrientTargetKey).toBe('fiber');
      expect(createData.nutrientTargetValue).toBe(19.67);
      expect(created).toEqual(expect.objectContaining({ id: 'created-item' }));
    });

    it('applies both cod liver oil default targets (vitamin A and D)', async () => {
      mockAddItemDraft(1000);
      mockSupplementProfile({
        id: 'food-cod-liver-oil',
        name: '鱼肝油',
        nutritionData: codLiverOilProfile(),
        defaultSupplementTargets: [
          { fieldPath: 'vitamins.vitaminA', label: '维生素 A', unit: 'IU' },
          { fieldPath: 'vitamins.vitaminD', label: '维生素 D', unit: 'IU' },
        ],
      });

      await service.addItem(
        'design-1',
        {
          ingredientId: 'ingredient-fiber',
          nutritionFoodId: 'food-cod-liver-oil',
          weightG: 2,
        },
        STAFF_ACCESS,
      );

      const createData = prisma.designRecipeItem.create.mock.calls[0][0].data;
      expect(createData.supplementTargets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldPath: 'vitamins.vitaminA',
            label: '维生素 A',
            unit: 'IU',
            targetValue: 10000,
          }),
          expect.objectContaining({
            fieldPath: 'vitamins.vitaminD',
            label: '维生素 D',
            unit: 'IU',
            targetValue: 1000,
          }),
        ]),
      );
      expect(createData.supplementTargets).toHaveLength(2);
    });

    it('accepts explicit supplement targets and ignores client-supplied computed values', async () => {
      mockAddItemDraft(1000);
      mockSupplementProfile({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: fiberProfile(),
        defaultSupplementTargets: null,
      });

      await service.addItem(
        'design-1',
        {
          ingredientId: 'ingredient-fiber',
          nutritionFoodId: 'food-fiber',
          weightG: 10,
          supplementTargets: [
            {
              fieldPath: 'macros.insolubleFiber',
              label: '不可溶性纤维',
              unit: 'g',
              targetValuePerKg: 999,
            },
          ],
        },
        STAFF_ACCESS,
      );

      const createData = prisma.designRecipeItem.create.mock.calls[0][0].data;
      expect(createData.supplementTargets).toEqual([
        expect.objectContaining({
          fieldPath: 'macros.insolubleFiber',
          label: '不可溶性纤维',
          unit: 'g',
          // 10 g × 1 g/g ÷ 1000 g × 1000 = 10，不是客户端传的 999
          targetValue: 10,
        }),
      ]);
      expect(createData.nutrientTargetValue).toBe(10);
    });

    it('accepts a derived EPA+DHA target as a single fieldPath', async () => {
      mockAddItemDraft(1000);
      mockSupplementProfile({
        id: 'food-fish-oil',
        name: '鱼油',
        nutritionData: {
          meta: { rawBasisType: 'PER_1_G' } as NutritionProfileV2['meta'],
          macros: { energyKcal: 0 },
          minerals: {},
          vitamins: {},
          fattyAcids: { epa: 120, dha: 80 },
          aminoAcids: {},
          customItems: [],
        } as NutritionProfileV2,
        defaultSupplementTargets: null,
      });

      await service.addItem(
        'design-1',
        {
          ingredientId: 'ingredient-fiber',
          nutritionFoodId: 'food-fish-oil',
          weightG: 10,
          supplementTargets: [{ fieldPath: 'derived.epaDha' }],
        },
        STAFF_ACCESS,
      );

      const createData = prisma.designRecipeItem.create.mock.calls[0][0].data;
      expect(createData.supplementTargets).toEqual([
        expect.objectContaining({
          fieldPath: 'derived.epaDha',
          label: 'EPA + DHA',
          unit: 'mg',
          // (120 + 80) mg/g × 10 g ÷ 1000 g × 1000 = 2000 mg/kg
          targetValue: 2000,
        }),
      ]);
    });

    it('rejects adding a supplement with neither explicit nor default targets', async () => {
      mockAddItemDraft(1000);
      mockSupplementProfile({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: fiberProfile(),
        defaultSupplementTargets: null,
      });

      await expect(
        service.addItem(
          'design-1',
          {
            ingredientId: 'ingredient-fiber',
            nutritionFoodId: 'food-fiber',
            weightG: 10,
          },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          '补剂原料「纤维素粉」缺少营养目标：请在添加时选择目标营养素，或为该补剂的营养档案配置默认目标',
        ),
      );

      expect(prisma.designRecipeItem.create).not.toHaveBeenCalled();
    });

    it('rejects unknown or zero-value explicit targets instead of silently dropping them', async () => {
      mockAddItemDraft(1000);
      mockSupplementProfile({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: fiberProfile(),
        defaultSupplementTargets: null,
      });

      await expect(
        service.addItem(
          'design-1',
          {
            ingredientId: 'ingredient-fiber',
            nutritionFoodId: 'food-fiber',
            weightG: 10,
            supplementTargets: [{ fieldPath: 'macros.unknownFiber' }],
          },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.addItem(
          'design-1',
          {
            ingredientId: 'ingredient-fiber',
            nutritionFoodId: 'food-fiber',
            weightG: 10,
            supplementTargets: [{ fieldPath: 'macros.crudeFat' }],
          },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.designRecipeItem.create).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    function mockUpdateItem(input: {
      totalWeightG: number;
      weightG?: number;
      nutritionData: NutritionProfileV2;
      name?: string;
    }) {
      const draft = {
        id: 'design-1',
        createdBy: 'staff-1',
        status: 'DRAFT',
        publishedRecipeId: null,
        publishedAt: null,
        totalWeightG: input.totalWeightG,
      };
      prisma.designRecipeItem.findUnique.mockImplementation(
        async (args: any) => {
          if (args?.select?.designRecipe) {
            return { id: 'supplement-fiber-item', designRecipe: draft };
          }
          return {
            id: 'supplement-fiber-item',
            nutritionFoodId: 'food-fiber',
            weightG: input.weightG ?? 10,
            includeInAssessment: true,
            ingredient: { type: 'SUPPLEMENT' },
            nutritionFood: {
              id: 'food-fiber',
              name: input.name ?? '纤维素粉',
              nutritionData: input.nutritionData,
            },
          };
        },
      );
      prisma.nutritionFood.findUnique.mockResolvedValue({
        id: 'food-fiber',
        name: input.name ?? '纤维素粉',
        nutritionData: input.nutritionData,
        defaultSupplementTargets: null,
      });
      prisma.designRecipeItem.update.mockImplementation(async (args: any) => ({
        id: 'supplement-fiber-item',
        ...args.data,
      }));
    }

    it('allows changing target definitions and recomputes the concentration', async () => {
      mockUpdateItem({
        totalWeightG: 1000,
        weightG: 10,
        nutritionData: fiberProfile(),
      });

      await service.updateItem(
        'supplement-fiber-item',
        {
          supplementTargets: [
            {
              fieldPath: 'macros.insolubleFiber',
              label: '不可溶性纤维',
              unit: 'g',
            },
          ],
        },
        STAFF_ACCESS,
      );

      const updateData = prisma.designRecipeItem.update.mock.calls[0][0].data;
      expect(updateData.supplementTargets).toEqual([
        expect.objectContaining({
          fieldPath: 'macros.insolubleFiber',
          label: '不可溶性纤维',
          unit: 'g',
          targetValue: 10,
        }),
      ]);
      expect(updateData.nutrientTargetKey).toBe('insolubleFiber');
      expect(updateData.nutrientTargetValue).toBe(10);
    });

    it('rejects an unknown target field instead of silently dropping it', async () => {
      mockUpdateItem({ totalWeightG: 1000, nutritionData: fiberProfile() });

      await expect(
        service.updateItem(
          'supplement-fiber-item',
          { supplementTargets: [{ fieldPath: 'macros.notARealField' }] },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.designRecipeItem.update).not.toHaveBeenCalled();
    });

    it('rejects clearing all supplement targets', async () => {
      mockUpdateItem({ totalWeightG: 1000, nutritionData: fiberProfile() });

      await expect(
        service.updateItem(
          'supplement-fiber-item',
          { supplementTargets: [] },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(
        new BadRequestException('补剂必须至少保留一个目标营养素，不能清空目标'),
      );

      expect(prisma.designRecipeItem.update).not.toHaveBeenCalled();
    });
  });

  describe('publishDraft', () => {
    function mockPublishDraft(items: unknown[], name = '纤维补剂食谱') {
      prisma.designRecipe.findUnique.mockResolvedValue(
        designDraft({ name, items }),
      );
      prisma.designRecipe.update.mockResolvedValue(
        designDraft({ name, status: 'PUBLISHED' }),
      );
      prisma.recipe.create.mockResolvedValue({
        id: 'recipe-row-1',
        recipeId: 'design-1',
        version: 1,
      });
    }

    it('publishes explicit targets with the existing per-kg payload shape', async () => {
      mockPublishDraft([
        foodItem(),
        fiberSupplementItem({
          supplementTargets: [
            {
              fieldPath: 'macros.fiber',
              label: '膳食纤维',
              unit: 'g',
              targetValuePerKg: 20,
            },
          ],
        }),
      ]);

      await service.publishDraft(
        'design-1',
        { name: '纤维补剂食谱', reviewNote: '补剂目标发布回归' },
        ADMIN_ACCESS,
      );

      const createData = prisma.recipe.create.mock.calls[0][0].data;
      const publishedSupplement = createData.items.create.find(
        (item: any) => item.ingredientId === 'ingredient-fiber',
      );

      expect(publishedSupplement).toEqual(
        expect.objectContaining({
          nutrientTargetKey: 'fiber',
          nutrientTargetValue: 20,
          supplementTargets: [
            {
              fieldPath: 'macros.fiber',
              label: '膳食纤维',
              targetValuePerKg: 20,
              unit: 'g',
            },
          ],
        }),
      );
    });

    it('hard-blocks publishing when only nutrition profile default targets exist', async () => {
      mockPublishDraft([foodItem(), fiberSupplementItem()]);
      prisma.nutritionFood.findUnique.mockResolvedValue({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: fiberProfile(),
        defaultSupplementTargets: [
          { fieldPath: 'macros.fiber', label: '膳食纤维', unit: 'g' },
        ],
      });

      // 发布门槛只认补剂项上已经持久化的 supplementTargets；
      // 默认目标应在 add/update 时落库，而不是发布时现推。
      await expect(
        service.publishDraft(
          'design-1',
          { name: '纤维补剂食谱', reviewNote: '默认目标发布回归' },
          ADMIN_ACCESS,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          '补剂「纤维素粉」未填写有效的补剂目标：需要至少一条包含 fieldPath 且每 kg 目标值大于 0 的 supplementTargets',
        ),
      );

      expect(prisma.recipe.create).not.toHaveBeenCalled();
      expect(prisma.designRecipePublishSnapshot.create).not.toHaveBeenCalled();
    });

    it('hard-blocks publishing a supplement without explicit or default targets', async () => {
      mockPublishDraft([foodItem(), fiberSupplementItem()]);
      prisma.nutritionFood.findUnique.mockResolvedValue({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: fiberProfile(),
        defaultSupplementTargets: null,
      });

      await expect(
        service.publishDraft(
          'design-1',
          { name: '纤维补剂食谱', reviewNote: '缺少目标的发布回归' },
          ADMIN_ACCESS,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          '补剂「纤维素粉」未填写有效的补剂目标：需要至少一条包含 fieldPath 且每 kg 目标值大于 0 的 supplementTargets',
        ),
      );

      expect(prisma.recipe.create).not.toHaveBeenCalled();
      expect(prisma.designRecipePublishSnapshot.create).not.toHaveBeenCalled();
    });
  });

  describe('private recipe snapshot', () => {
    it('persists explicit targets with computed values for private snapshots', async () => {
      const draft = designDraft({
        items: [
          foodItem(),
          fiberSupplementItem({
            supplementTargets: [
              { fieldPath: 'macros.fiber', label: '膳食纤维', unit: 'g' },
            ],
          }),
        ],
      });
      prisma.recipe.create.mockResolvedValue({
        id: 'private-row-1',
        recipeId: 'private-recipe-1',
        version: 1,
      });

      await (service as any).createOrUpdatePrivateRecipeSnapshot(draft, {
        customerOwnerId: 'customer-1',
        customOrderId: null,
      });

      const createData = prisma.recipe.create.mock.calls[0][0].data;
      const itemCreate = createData.items.create.find(
        (item: any) => item.ingredientId === 'ingredient-fiber',
      );
      expect(itemCreate).toEqual(
        expect.objectContaining({
          nutrientTargetKey: 'fiber',
          nutrientTargetValue: 20,
          supplementTargets: [
            {
              fieldPath: 'macros.fiber',
              label: '膳食纤维',
              targetValuePerKg: 20,
              unit: 'g',
            },
          ],
        }),
      );
    });

    it('hard-blocks private snapshots when a supplement has no target', async () => {
      const draft = designDraft({
        items: [foodItem(), fiberSupplementItem()],
      });
      prisma.nutritionFood.findUnique.mockResolvedValue({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: fiberProfile(),
        defaultSupplementTargets: null,
      });

      await expect(
        (service as any).createOrUpdatePrivateRecipeSnapshot(draft, {
          customerOwnerId: 'customer-1',
          customOrderId: null,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          '补剂原料「纤维素粉」缺少营养目标：请在添加时选择目标营养素，或为该补剂的营养档案配置默认目标',
        ),
      );

      expect(prisma.recipe.create).not.toHaveBeenCalled();
    });
  });
});
