import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import type { NutritionProfileV2 } from '../../../src/domain/ingredient/types';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import {
  AddRecipeDesignItemDto,
  UpdateRecipeDesignItemDto,
  UpdateRecipeProductionStepsDto,
} from '../../../src/interfaces/dto/recipe-designer/recipe-designer.dto';

/**
 * 原料预处理与结构化制作步骤（2026-10-22 · Task 4）
 *
 * 覆盖：
 * - 预处理 method/note/source 在新增、修改、重新读取时持久化；
 * - 显式填写 method/note → MANUAL；系统自动解析 → AUTO；显式 AUTO 被尊重；
 * - 制作步骤 Get/Patch、排序/唯一性/数值范围校验；
 * - 发布正式食谱与私密快照同时写入 prep 字段和 productionStepsJson，
 *   legacy `Recipe.productionSteps` 字符串不被改写。
 */

const STAFF_ACCESS = { userId: 'staff-1', role: 'STAFF' as const };
const ADMIN_ACCESS = { userId: 'admin-1', role: 'ADMIN' as const };

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
    weightG: 5000,
    includeInAssessment: true,
    ratioPercent: 100,
    preparationMethod: null,
    preparationNote: null,
    preparationSource: null,
    nutrientTargetKey: null,
    nutrientTargetValue: null,
    supplementTargets: null,
    sortOrder: 0,
    ingredient: {
      id: 'ingredient-food',
      name: '鸡胸肉',
      type: 'FOOD',
      unitDisplayLabel: 'g',
      purchaseUnit: 'g',
      properties: null,
    },
    nutritionFood: {
      id: 'food-base',
      name: '鸡胸肉',
      nutritionData: foodProfile(),
      preparationState: 'RAW',
      mappings: [
        {
          ingredientId: 'ingredient-food',
          isPrimary: true,
          ingredient: {
            id: 'ingredient-food',
            name: '鸡胸肉',
            type: 'FOOD',
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
    name: '鸡肉食谱',
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
    coverTitle: '鸡肉食谱',
    description: '鸡肉食谱展示描述',
    sellingPoint: '鲜肉主食',
    detailImages: ['https://img.example.com/detail.jpg'],
    videoUrl: null,
    productionStepsJson: null,
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

const VALID_STEPS = [
  {
    sortOrder: 1,
    instruction: '将所有食材按配方称重',
    durationMinutes: 10,
    temperatureC: null,
    equipment: '厨房秤',
  },
  {
    sortOrder: 2,
    instruction: '混合均匀后分装冷冻',
    durationMinutes: null,
    temperatureC: -18,
    equipment: null,
  },
];

function createPrismaMock() {
  const prisma: any = {
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'staff-1' }]) },
    designRecipe: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      aggregate: jest.fn().mockResolvedValue({ _max: { version: null } }),
      create: jest.fn(),
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
    ingredient: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'ingredient-food', type: 'FOOD' }]),
    },
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

describe('原料预处理与结构化制作步骤（Task 4）', () => {
  let prisma: any;
  let targetProvider: any;
  let service: RecipeDesignerService;

  beforeEach(() => {
    prisma = createPrismaMock();
    targetProvider = { getTargets: jest.fn().mockResolvedValue([]) };
    service = new RecipeDesignerService(
      prisma as PrismaService,
      targetProvider,
    );
  });

  function mockEditableDraft(overrides: Record<string, unknown> = {}) {
    prisma.designRecipe.findUnique.mockResolvedValue(
      designDraft({
        id: 'design-1',
        createdBy: 'staff-1',
        status: 'DRAFT',
        publishedRecipeId: null,
        publishedAt: null,
        seriesId: null,
        seriesLifeStage: null,
        ...overrides,
      }),
    );
  }

  describe('addItem preparation', () => {
    function mockCreate() {
      prisma.designRecipeItem.create.mockImplementation(async (args: any) => ({
        id: 'created-item',
        ...args.data,
      }));
    }

    it('persists an explicit method and note as MANUAL and returns them in the item DTO', async () => {
      mockEditableDraft();
      mockCreate();

      const created = await service.addItem(
        'design-1',
        {
          ingredientId: 'ingredient-food',
          nutritionFoodId: 'food-base',
          weightG: 5000,
          preparationMethod: '去皮切块',
          preparationNote: '鸡胸肉，去皮，按生重称',
        },
        STAFF_ACCESS,
      );

      const createArgs = prisma.designRecipeItem.create.mock.calls[0][0];
      expect(createArgs.data).toEqual(
        expect.objectContaining({
          preparationMethod: '去皮切块',
          preparationNote: '鸡胸肉，去皮，按生重称',
          preparationSource: 'MANUAL',
        }),
      );
      // 返回给编辑器的明细 DTO 必须带预处理字段
      expect(createArgs.select).toEqual(
        expect.objectContaining({
          preparationNote: true,
          preparationSource: true,
        }),
      );
      expect(created).toEqual(
        expect.objectContaining({
          preparationMethod: '去皮切块',
          preparationNote: '鸡胸肉，去皮，按生重称',
          preparationSource: 'MANUAL',
        }),
      );
    });

    it('marks a system-resolved default method as AUTO', async () => {
      mockEditableDraft();
      mockCreate();
      prisma.recipeItem.findMany.mockResolvedValue([
        {
          ingredientId: 'ingredient-food',
          preparationMethod: '生重',
          recipe: { updatedAt: new Date('2026-10-20T00:00:00Z') },
        },
      ]);
      prisma.nutritionFood.findUnique.mockImplementation(async (args: any) => {
        if (args?.select?.preparationState) {
          return { preparationState: 'RAW' };
        }
        return null;
      });

      await service.addItem(
        'design-1',
        {
          ingredientId: 'ingredient-food',
          nutritionFoodId: 'food-base',
          weightG: 5000,
        },
        STAFF_ACCESS,
      );

      const createData = prisma.designRecipeItem.create.mock.calls[0][0].data;
      expect(createData).toEqual(
        expect.objectContaining({
          preparationMethod: '生重',
          preparationNote: null,
          preparationSource: 'AUTO',
        }),
      );
    });

    it('defaults a note-only edit to MANUAL while still bringing the default method', async () => {
      mockEditableDraft();
      mockCreate();
      prisma.recipeItem.findMany.mockResolvedValue([
        {
          ingredientId: 'ingredient-food',
          preparationMethod: '生重',
          recipe: { updatedAt: new Date('2026-10-20T00:00:00Z') },
        },
      ]);
      prisma.nutritionFood.findUnique.mockImplementation(async (args: any) => {
        if (args?.select?.preparationState) {
          return { preparationState: 'RAW' };
        }
        return null;
      });

      await service.addItem(
        'design-1',
        {
          ingredientId: 'ingredient-food',
          nutritionFoodId: 'food-base',
          weightG: 5000,
          preparationNote: '去骨后按生重称',
        },
        STAFF_ACCESS,
      );

      const createData = prisma.designRecipeItem.create.mock.calls[0][0].data;
      expect(createData).toEqual(
        expect.objectContaining({
          preparationMethod: '生重',
          preparationNote: '去骨后按生重称',
          preparationSource: 'MANUAL',
        }),
      );
    });

    it('honors an explicitly supplied AUTO source', async () => {
      mockEditableDraft();
      mockCreate();

      await service.addItem(
        'design-1',
        {
          ingredientId: 'ingredient-food',
          nutritionFoodId: 'food-base',
          weightG: 5000,
          preparationMethod: '去皮切块',
          preparationSource: 'AUTO',
        },
        STAFF_ACCESS,
      );

      const createData = prisma.designRecipeItem.create.mock.calls[0][0].data;
      expect(createData.preparationSource).toBe('AUTO');
    });
  });

  describe('updateItem preparation', () => {
    function mockUpdateItem(
      current: {
        preparationMethod?: string | null;
        preparationNote?: string | null;
        preparationSource?: string | null;
      } = {},
    ) {
      prisma.designRecipeItem.findUnique.mockResolvedValue({
        id: 'food-item-1',
        preparationMethod: current.preparationMethod ?? null,
        preparationNote: current.preparationNote ?? null,
        preparationSource: current.preparationSource ?? null,
        designRecipe: {
          id: 'design-1',
          createdBy: 'staff-1',
          status: 'DRAFT',
          publishedRecipeId: null,
          publishedAt: null,
          totalWeightG: 5000,
        },
      });
      prisma.designRecipeItem.update.mockImplementation(async (args: any) => ({
        id: 'food-item-1',
        ...args.data,
      }));
    }

    it('persists edited method and note and flips the source to MANUAL', async () => {
      mockUpdateItem({
        preparationMethod: '生重',
        preparationNote: null,
        preparationSource: 'AUTO',
      });

      await service.updateItem(
        'food-item-1',
        {
          preparationMethod: '去皮切块',
          preparationNote: '去皮后按生重称',
        },
        STAFF_ACCESS,
      );

      expect(prisma.designRecipeItem.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          preparationMethod: '去皮切块',
          preparationNote: '去皮后按生重称',
          preparationSource: 'MANUAL',
        }),
      );
    });

    it('keeps AUTO when the editor echoes unchanged values without a source', async () => {
      mockUpdateItem({
        preparationMethod: '生重',
        preparationNote: null,
        preparationSource: 'AUTO',
      });

      await service.updateItem(
        'food-item-1',
        { preparationMethod: '生重', preparationNote: null },
        STAFF_ACCESS,
      );

      expect(prisma.designRecipeItem.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          preparationMethod: '生重',
          preparationNote: null,
          preparationSource: 'AUTO',
        }),
      );
    });

    it('does not touch preparation columns when only weight changes', async () => {
      mockUpdateItem({
        preparationMethod: '生重',
        preparationNote: '去骨',
        preparationSource: 'MANUAL',
      });

      await service.updateItem('food-item-1', { weightG: 4500 }, STAFF_ACCESS);

      const updateData = prisma.designRecipeItem.update.mock.calls[0][0].data;
      expect(updateData).toEqual({ weightG: 4500 });
    });

    it('rejects an invalid preparation source and an over-long note', async () => {
      mockUpdateItem();

      await expect(
        service.updateItem(
          'food-item-1',
          { preparationSource: 'INHERITED' as any },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateItem(
          'food-item-1',
          { preparationNote: 'x'.repeat(501) },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(
        new BadRequestException('原料预处理补充说明不能超过 500 个字符'),
      );

      expect(prisma.designRecipeItem.update).not.toHaveBeenCalled();
    });
  });

  describe('draft reload', () => {
    it('returns preparation note/source from getDraft', async () => {
      prisma.designRecipe.findUnique.mockResolvedValue(
        designDraft({
          items: [
            foodItem({
              preparationMethod: '去皮切块',
              preparationNote: '鸡胸肉，去皮，生重',
              preparationSource: 'MANUAL',
            }),
          ],
        }),
      );

      const draft = await service.getDraft('design-1', STAFF_ACCESS);

      expect(draft.items[0]).toEqual(
        expect.objectContaining({
          preparationMethod: '去皮切块',
          preparationNote: '鸡胸肉，去皮，生重',
          preparationSource: 'MANUAL',
        }),
      );
    });
  });

  describe('production steps', () => {
    function mockStepsDraft(productionStepsJson: unknown) {
      prisma.designRecipe.findUnique.mockResolvedValue(
        designDraft({
          id: 'design-1',
          productionStepsJson,
        }),
      );
    }

    it('gets stored steps sorted by sortOrder and tolerates legacy bad entries', async () => {
      mockStepsDraft([
        { sortOrder: 2, instruction: ' 分装冷冻 ', temperatureC: -18 },
        { sortOrder: 1, instruction: '称重' },
        { sortOrder: 1, instruction: '重复排序应忽略' },
        { sortOrder: 3, instruction: '   ' },
      ]);

      const result = await service.getDraftProductionSteps(
        'design-1',
        STAFF_ACCESS,
      );

      expect(result).toEqual({
        draftId: 'design-1',
        productionSteps: [
          {
            sortOrder: 1,
            instruction: '称重',
            durationMinutes: null,
            temperatureC: null,
            equipment: null,
          },
          {
            sortOrder: 2,
            instruction: '分装冷冻',
            durationMinutes: null,
            temperatureC: -18,
            equipment: null,
          },
        ],
      });
    });

    it('replaces steps, trims text and bumps content revision', async () => {
      mockEditableDraft();

      const result = await service.updateDraftProductionSteps(
        'design-1',
        {
          steps: [
            {
              sortOrder: 1,
              instruction: '  将所有食材按配方称重  ',
              durationMinutes: 10,
              equipment: '  厨房秤 ',
            },
            {
              sortOrder: 2,
              instruction: '混合均匀后分装冷冻',
              temperatureC: -18,
            },
          ] as any,
        },
        STAFF_ACCESS,
      );

      const updateData = prisma.designRecipe.update.mock.calls[0][0].data;
      expect(updateData.contentRevision).toEqual({ increment: 1 });
      expect(updateData.productionStepsJson).toEqual([
        {
          sortOrder: 1,
          instruction: '将所有食材按配方称重',
          durationMinutes: 10,
          temperatureC: null,
          equipment: '厨房秤',
        },
        {
          sortOrder: 2,
          instruction: '混合均匀后分装冷冻',
          durationMinutes: null,
          temperatureC: -18,
          equipment: null,
        },
      ]);
      expect(result.productionSteps).toEqual(updateData.productionStepsJson);
    });

    it('clears steps with an empty array', async () => {
      mockEditableDraft();

      const result = await service.updateDraftProductionSteps(
        'design-1',
        { steps: [] },
        STAFF_ACCESS,
      );

      expect(
        prisma.designRecipe.update.mock.calls[0][0].data.productionStepsJson,
      ).toBe(Prisma.DbNull);
      expect(result.productionSteps).toEqual([]);
    });

    const invalidCases: Array<[string, unknown]> = [
      ['empty instruction', [{ sortOrder: 1, instruction: '   ' }]],
      [
        'duplicate sortOrder',
        [
          { sortOrder: 1, instruction: '第一步' },
          { sortOrder: 1, instruction: '第二步' },
        ],
      ],
      [
        'descending sortOrder',
        [
          { sortOrder: 2, instruction: '第二步' },
          { sortOrder: 1, instruction: '第一步' },
        ],
      ],
      [
        'negative duration',
        [{ sortOrder: 1, instruction: '称重', durationMinutes: -1 }],
      ],
      [
        'temperature above range',
        [{ sortOrder: 1, instruction: '烘烤', temperatureC: 501 }],
      ],
      [
        'too many steps',
        Array.from({ length: 51 }, (_, index) => ({
          sortOrder: index + 1,
          instruction: `步骤 ${index + 1}`,
        })),
      ],
    ];

    it.each(invalidCases)(
      'rejects %s without writing',
      async (_name, steps) => {
        mockEditableDraft();

        await expect(
          service.updateDraftProductionSteps(
            'design-1',
            { steps } as any,
            STAFF_ACCESS,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.designRecipe.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('publish', () => {
    function mockPublishDraft(items: unknown[], draftOverrides = {}) {
      prisma.designRecipe.findUnique.mockResolvedValue(
        designDraft({
          name: '鸡肉食谱',
          items,
          ...draftOverrides,
        }),
      );
      prisma.designRecipe.update.mockResolvedValue(
        designDraft({ name: '鸡肉食谱', status: 'PUBLISHED' }),
      );
      prisma.recipe.create.mockResolvedValue({
        id: 'recipe-row-1',
        recipeId: 'design-1',
        version: 1,
      });
    }

    it('copies preparation note/source and structured steps to the published recipe', async () => {
      mockPublishDraft(
        [
          foodItem({
            preparationMethod: '去皮切块',
            preparationNote: '鸡胸肉，去皮，按生重称',
            preparationSource: 'MANUAL',
          }),
        ],
        { productionStepsJson: VALID_STEPS },
      );

      await service.publishDraft(
        'design-1',
        { name: '鸡肉食谱', reviewNote: '预处理与步骤发布回归' },
        ADMIN_ACCESS,
      );

      const createData = prisma.recipe.create.mock.calls[0][0].data;
      expect(createData.productionStepsJson).toEqual(VALID_STEPS);
      // legacy 字符串字段同步写一份，供 DIY 卡片等旧消费方使用
      expect(createData.productionSteps).toContain('将所有食材按配方称重');

      const publishedItem = createData.items.create[0];
      expect(publishedItem).toEqual(
        expect.objectContaining({
          preparationMethod: '去皮切块',
          preparationNote: '鸡胸肉，去皮，按生重称',
          preparationSource: 'MANUAL',
        }),
      );

      const snapshotData =
        prisma.designRecipePublishSnapshot.create.mock.calls[0][0].data
          .snapshotData;
      expect(snapshotData.designRecipe.productionStepsJson).toEqual(
        VALID_STEPS,
      );
    });

    it('keeps AUTO source and publishes no legacy productionSteps string', async () => {
      mockPublishDraft(
        [
          foodItem({
            preparationMethod: '生重',
            preparationNote: null,
            preparationSource: 'AUTO',
          }),
        ],
        { productionStepsJson: VALID_STEPS },
      );

      await service.publishDraft(
        'design-1',
        { name: '鸡肉食谱', reviewNote: '自动来源发布回归' },
        ADMIN_ACCESS,
      );

      const createData = prisma.recipe.create.mock.calls[0][0].data;
      expect(createData.items.create[0].preparationSource).toBe('AUTO');
      expect(createData.productionStepsJson).toEqual(VALID_STEPS);
      expect(createData.productionSteps).toContain('将所有食材按配方称重');
    });

    it('rejects publishing when stored steps are malformed', async () => {
      mockPublishDraft([foodItem()], {
        productionStepsJson: [{ sortOrder: 1, instruction: '' }],
      });

      await expect(
        service.publishDraft(
          'design-1',
          { name: '鸡肉食谱', reviewNote: '脏步骤发布回归' },
          ADMIN_ACCESS,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.recipe.create).not.toHaveBeenCalled();
    });
  });

  describe('private recipe snapshot', () => {
    it('persists preparation note/source and structured steps without touching legacy productionSteps', async () => {
      const draft = designDraft({
        productionStepsJson: VALID_STEPS,
        items: [
          foodItem({
            preparationMethod: '去皮切块',
            preparationNote: '鸡胸肉，去皮，按生重称',
            preparationSource: 'MANUAL',
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
      expect(createData.productionStepsJson).toEqual(VALID_STEPS);
      expect(createData.productionSteps).toContain('将所有食材按配方称重');
      expect(createData.items.create[0]).toEqual(
        expect.objectContaining({
          preparationMethod: '去皮切块',
          preparationNote: '鸡胸肉，去皮，按生重称',
          preparationSource: 'MANUAL',
        }),
      );
    });

    it('updates steps on an existing private recipe without rewriting legacy productionSteps', async () => {
      const draft = designDraft({
        productionStepsJson: VALID_STEPS,
        items: [foodItem({ preparationSource: 'AUTO' })],
      });
      prisma.recipe.findFirst.mockResolvedValue({
        id: 'private-row-1',
        recipeId: 'private-recipe-1',
        version: 1,
      });
      prisma.recipe.update.mockResolvedValue({
        id: 'private-row-1',
        recipeId: 'private-recipe-1',
        version: 1,
      });

      await (service as any).createOrUpdatePrivateRecipeSnapshot(draft, {
        customerOwnerId: 'customer-1',
        customOrderId: null,
      });

      const updateData = prisma.recipe.update.mock.calls[0][0].data;
      expect(updateData.productionStepsJson).toEqual(VALID_STEPS);
      expect(updateData.productionSteps).toContain('将所有食材按配方称重');
    });
  });

  describe('DTO validation', () => {
    it('accepts preparationNote up to 500 characters and a known source', async () => {
      const dto = plainToInstance(AddRecipeDesignItemDto, {
        nutritionFoodId: 'food-base',
        weightG: 100,
        preparationNote: 'x'.repeat(500),
        preparationSource: 'AUTO',
      });
      await expect(validate(dto)).resolves.toEqual([]);

      const updateDto = plainToInstance(UpdateRecipeDesignItemDto, {
        preparationNote: null,
        preparationSource: null,
      });
      await expect(validate(updateDto)).resolves.toEqual([]);
    });

    it('rejects an over-long note and an unknown source', async () => {
      const tooLong = plainToInstance(AddRecipeDesignItemDto, {
        nutritionFoodId: 'food-base',
        weightG: 100,
        preparationNote: 'x'.repeat(501),
      });
      await expect(validate(tooLong)).resolves.toEqual([
        expect.objectContaining({ property: 'preparationNote' }),
      ]);

      const badSource = plainToInstance(UpdateRecipeDesignItemDto, {
        preparationSource: 'INHERITED',
      });
      await expect(validate(badSource)).resolves.toEqual([
        expect.objectContaining({ property: 'preparationSource' }),
      ]);
    });

    it('validates the production steps body shape and numeric limits', async () => {
      const valid = plainToInstance(UpdateRecipeProductionStepsDto, {
        steps: VALID_STEPS,
      });
      await expect(validate(valid)).resolves.toEqual([]);

      const invalid = plainToInstance(UpdateRecipeProductionStepsDto, {
        steps: [
          {
            sortOrder: 1,
            instruction: '称重',
            durationMinutes: -1,
            temperatureC: 501,
          },
        ],
      });
      const errors = await validate(invalid);
      expect(errors[0].property).toBe('steps');
      expect(errors[0].children?.[0].children?.length).toBeGreaterThan(0);
    });
  });
});
