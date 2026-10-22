import { BadRequestException } from '@nestjs/common';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { SupplementTargetService } from '../../../src/application/recipe-designer/supplement-target.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 共享发布门槛（2026-10-22 · 发布门槛任务）。
 *
 * 覆盖：
 *  · readiness 响应形状 / summary；
 *  · 名称、参与评估原料、总重量、能量密度、报告构建失败、补剂目标、预处理、制作步骤的 blockers；
 *  · 未完全合规 / 缺营养数据只给 warnings，不硬阻断；
 *  · publishDraft 与 publishOrderDesignSlot（订单「加入待提交」）都执行同一套门槛；
 *  · 报告构建失败不会让预览接口抛错，只变成 blocker。
 */

const STAFF_ACCESS = { userId: 'staff-1', role: 'STAFF' as const };
const ADMIN_ACCESS = { userId: 'admin-1', role: 'ADMIN' as const };

function foodProfile(overrides: Record<string, unknown> = {}) {
  return {
    meta: { rawBasisType: 'PER_100_G' },
    macros: {
      energyKcal: 120,
      moisture: 70,
      crudeProtein: 20,
      crudeFat: 3,
      ash: 1,
      fiber: 0,
    },
    minerals: { calcium: 600, phosphorus: 500 },
    vitamins: {},
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
    ...overrides,
  };
}

function foodItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-food',
    ingredientId: 'ingredient-food',
    nutritionFoodId: 'food-food',
    weightG: 100,
    includeInAssessment: true,
    ratioPercent: 100,
    preparationMethod: '蒸熟',
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
      id: 'food-food',
      name: '鸡胸肉',
      displayNameZh: '鸡胸肉',
      nutritionData: foodProfile(),
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

function supplementItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-supplement',
    ingredientId: 'ingredient-supplement',
    nutritionFoodId: 'food-supplement',
    weightG: 1,
    includeInAssessment: true,
    ratioPercent: null,
    preparationMethod: '直接添加',
    nutrientTargetKey: null,
    nutrientTargetValue: null,
    supplementTargets: [
      {
        fieldPath: 'minerals.calcium',
        label: '钙',
        unit: 'mg',
        targetValuePerKg: 2800,
      },
    ],
    sortOrder: 1,
    ingredient: {
      id: 'ingredient-supplement',
      name: '碳酸钙粉',
      type: 'SUPPLEMENT',
      unitDisplayLabel: 'g',
      purchaseUnit: 'g',
      properties: null,
    },
    nutritionFood: {
      id: 'food-supplement',
      name: '碳酸钙粉',
      displayNameZh: '碳酸钙粉',
      nutritionData: {
        meta: { rawBasisType: 'PER_100_G' },
        macros: { energyKcal: 0 },
        minerals: { calcium: 1000 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      },
      mappings: [
        {
          ingredientId: 'ingredient-supplement',
          isPrimary: true,
          ingredient: {
            id: 'ingredient-supplement',
            name: '碳酸钙粉',
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
    id: 'draft-1',
    name: '鸡肉成犬配方',
    version: 1,
    contentRevision: 0,
    status: 'DRAFT',
    fediafDogScenario: 'ADULT_MER_110',
    nutritionStandard: 'FEDIAF_2025',
    energyDensityKcalPerKg: 955,
    totalWeightG: 100,
    targetHealthTags: ['JOINT'],
    applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
    notes: null,
    coverImageUrl: 'https://img.example.com/cover.jpg',
    coverTitle: '鸡肉成犬',
    description: '鲜鸡肉为主料，适合成犬日常维持。',
    sellingPoint: '鲜肉低敏，日常维持',
    detailImages: ['https://img.example.com/detail.jpg'],
    videoUrl: null,
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
    assessmentSummary: { overallStatus: 'COMPLIANT' },
    missingDataReport: [],
    publishedAt: null,
    publishedRecipeId: null,
    publishedRecipeVersion: null,
    revisionOfDesignRecipeId: null,
    revisionBaseRecipeId: null,
    customerDogId: 'dog-1',
    seriesId: 'series-1',
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    series: {
      id: 'series-1',
      name: '鸡肉成犬配方',
      referenceDogId: 'dog-1',
      designMode: 'CATALOG',
      orderId: null,
      orderQuantity: null,
    },
    items: [foodItem()],
    ...overrides,
  };
}

function compliantTargets() {
  return [
    {
      nutrientKey: 'calcium',
      label: '钙',
      category: 'MINERAL',
      expressionBasis: 'PER_1000_KCAL_ME',
      unit: 'mg',
      minValue: 500,
      maxValue: 7100,
      fieldPaths: ['minerals.calcium'],
    },
    {
      nutrientKey: 'ca_p_ratio',
      label: 'Ca:P',
      category: 'RATIO',
      expressionBasis: 'RATIO',
      unit: 'ratio',
      minValue: 1,
      maxValue: 2,
      fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
      calculation: 'RATIO',
    },
  ];
}

describe('RecipeDesignerService · shared launch readiness gate', () => {
  let service: RecipeDesignerService;

  const prisma = {
    user: { findMany: jest.fn() },
    designRecipe: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    designRecipeItem: {
      aggregate: jest.fn(),
    },
    preparationMethod: {
      findMany: jest.fn(),
    },
    recipe: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    recipeItem: {
      findMany: jest.fn(),
    },
    designRecipePublishSnapshot: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const targetProvider = { getTargets: jest.fn() };
  const supplementTargetService = new SupplementTargetService(prisma as PrismaService);
  const searchGovernance = {
    expandQuery: jest.fn(),
    recordSearchEvent: jest.fn(),
  };
  const aiDesignSuggestion = {
    isAvailable: jest.fn(),
    generate: jest.fn(),
  };

  beforeEach(() => {
    service = new RecipeDesignerService(
      prisma as PrismaService,
      targetProvider as any,
      searchGovernance as any,
      aiDesignSuggestion as any,
      undefined,
      undefined,
      undefined,
      undefined,
      supplementTargetService,
    );
    jest.clearAllMocks();

    prisma.user.findMany.mockResolvedValue([{ id: 'staff-1' }]);
    prisma.preparationMethod.findMany.mockResolvedValue([]);
    prisma.designRecipe.findFirst.mockResolvedValue(null);
    prisma.designRecipe.update.mockResolvedValue({});
    prisma.recipe.findFirst.mockResolvedValue(null);
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'draft-1',
      version: 1,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-1',
    });
    prisma.recipeItem.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
  });

  async function readinessFor(overrides: Record<string, unknown> = {}) {
    prisma.designRecipe.findUnique.mockResolvedValue(designDraft(overrides));
    return service.getDraftLaunchReadiness('draft-1', STAFF_ACCESS);
  }

  it('returns the shared readiness shape and summary for a publishable draft', async () => {
    const readiness = await readinessFor({
      series: {
        id: 'series-1',
        name: '鸡肉成犬配方',
        referenceDogId: 'dog-1',
        designMode: 'ORDER',
        orderId: 'order-1',
        orderQuantity: 2,
      },
      items: [foodItem(), supplementItem()],
    });

    expect(readiness).toMatchObject({
      draftId: 'draft-1',
      designMode: 'ORDER',
      ready: true,
      blockers: [],
      warnings: [],
      summary: {
        itemCount: 2,
        totalWeightG: 101,
        energyDensityKcalPerKg: expect.any(Number),
        supplementCount: 1,
        stepCount: 1,
        reportAvailable: true,
      },
    });
    expect(readiness.summary.energyDensityKcalPerKg).toBeGreaterThan(0);
  });

  it('blocks a draft without a resolved name', async () => {
    const readiness = await readinessFor({
      name: '   ',
      series: {
        id: 'series-1',
        name: '   ',
        referenceDogId: 'dog-1',
        designMode: 'CATALOG',
      },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NAME_REQUIRED',
          field: 'name',
        }),
      ]),
    );
  });

  it('blocks a draft with no included items', async () => {
    const readiness = await readinessFor({ items: [] });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NO_INCLUDED_ITEMS',
          field: 'items',
        }),
      ]),
    );
  });

  it('blocks zero total weight / missing energy and never throws', async () => {
    const readiness = await readinessFor({
      items: [
        foodItem({
          weightG: 0,
          nutritionFood: {
            ...foodItem().nutritionFood,
            nutritionData: foodProfile({
              macros: {
                moisture: 70,
                crudeProtein: 20,
                crudeFat: 3,
                ash: 1,
              },
            }),
          },
        }),
      ],
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.summary.reportAvailable).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TOTAL_WEIGHT_INVALID' }),
        expect.objectContaining({
          code: 'ENERGY_DENSITY_INVALID',
          field: 'energyDensityKcalPerKg',
        }),
      ]),
    );
  });

  it('turns report build failures into a blocker instead of throwing the preview', async () => {
    jest
      .spyOn(service, 'buildPublishedNutritionDetailedDataForDraft')
      .mockRejectedValue(new Error('report exploded'));

    const readiness = await readinessFor();

    expect(readiness.ready).toBe(false);
    expect(readiness.summary.reportAvailable).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NUTRITION_REPORT_UNAVAILABLE',
          message: expect.stringContaining('report exploded'),
        }),
      ]),
    );
  });

  it('requires persisted supplement targets with a positive per-kg value', async () => {
    const missing = await readinessFor({
      items: [foodItem(), supplementItem({ supplementTargets: null })],
    });
    expect(missing.ready).toBe(false);
    expect(missing.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SUPPLEMENT_TARGETS_REQUIRED',
          itemId: 'item-supplement',
          field: 'supplementTargets',
        }),
      ]),
    );

    const zero = await readinessFor({
      items: [
        foodItem(),
        supplementItem({
          supplementTargets: [
            {
              fieldPath: 'minerals.calcium',
              label: '钙',
              unit: 'mg',
              targetValuePerKg: 0,
            },
          ],
        }),
      ],
    });
    // 目标值缓存为 0 时，只要目标字段定义有效，门槛会按当前配方重算，不误阻断。
    expect(
      zero.blockers.some(
        (blocker) => blocker.code === 'SUPPLEMENT_TARGETS_REQUIRED',
      ),
    ).toBe(false);

    // 历史/接口层的 targetValue 与 targetValuePerKg 是同一含义，都认。
    const aliased = await readinessFor({
      items: [
        foodItem(),
        supplementItem({
          supplementTargets: [
            {
              fieldPath: 'minerals.calcium',
              label: '钙',
              unit: 'mg',
              targetValue: 2800,
            },
          ],
        }),
      ],
    });
    expect(
      aliased.blockers.some(
        (blocker) => blocker.code === 'SUPPLEMENT_TARGETS_REQUIRED',
      ),
    ).toBe(false);

    // 页面显示的浓度是前端按当前配方算的；保存时 targetValue 可能还是 null。
    // 门槛必须按当前档案和用量重算，不能误判成「没有目标」。
    const computedFromDefinitions = await readinessFor({
      items: [
        foodItem(),
        supplementItem({
          supplementTargets: [
            {
              fieldPath: 'minerals.calcium',
              label: '钙',
              unit: 'mg',
              targetValue: null,
            },
          ],
        }),
      ],
    });
    expect(computedFromDefinitions.ready).toBe(true);
  });

  it('requires a preparation method on every included item (note alone is not enough)', async () => {
    const readiness = await readinessFor({
      items: [
        foodItem({
          preparationMethod: null,
          preparationNote: '去皮、切块',
        }),
      ],
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PREPARATION_METHOD_REQUIRED',
          itemId: 'item-food',
          field: 'preparationMethod',
        }),
      ]),
    );
  });

  it('requires at least one valid production step', async () => {
    const readiness = await readinessFor({
      productionStepsJson: [{ sortOrder: 1, instruction: '   ' }],
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.summary.stepCount).toBe(0);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PRODUCTION_STEPS_REQUIRED',
          field: 'productionStepsJson',
        }),
      ]),
    );
  });

  it('keeps review / missing-data / out-of-range as warnings when the report is available', async () => {
    targetProvider.getTargets.mockResolvedValue([
      {
        nutrientKey: 'calcium',
        label: '钙',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 99999,
        maxValue: null,
        fieldPaths: ['minerals.calcium'],
      },
      {
        nutrientKey: 'zinc',
        label: '锌',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 20.8,
        maxValue: 227,
        fieldPaths: ['minerals.zinc'],
      },
      {
        // 边界值非法 → 评估成 MISSING_DATA；报告仍能生成，所以只能是 warning。
        nutrientKey: 'trace_missing',
        label: '缺数据项',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: Number.NaN,
        maxValue: 10,
        fieldPaths: ['minerals.copper'],
      },
    ]);

    const readiness = await readinessFor();

    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.summary.reportAvailable).toBe(true);
    expect(readiness.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'REVIEW_REQUIRED' }),
        expect.objectContaining({ code: 'MISSING_NUTRITION_DATA' }),
        expect.objectContaining({ code: 'NUTRIENT_OUT_OF_RANGE' }),
      ]),
    );
  });

  it('blocks catalog drafts without presentation or catalog copy', async () => {
    const readiness = await readinessFor({
      coverImageUrl: null,
      coverTitle: '   ',
      description: null,
      sellingPoint: '',
      applicableLifeStages: [],
      targetHealthTags: [],
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'COVER_IMAGE_REQUIRED',
          scope: 'PRESENTATION',
          field: 'coverImageUrl',
        }),
        expect.objectContaining({
          code: 'COVER_TITLE_REQUIRED',
          scope: 'PRESENTATION',
          field: 'coverTitle',
        }),
        expect.objectContaining({
          code: 'SELLING_POINT_REQUIRED',
          scope: 'CATALOG',
          field: 'sellingPoint',
        }),
      ]),
    );
    expect(readiness.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_HEALTH_TAGS_MISSING',
          scope: 'CATALOG',
          field: 'targetHealthTags',
        }),
      ]),
    );
  });

  it('blocks order designs without order context but does not require catalog copy', async () => {
    const readiness = await readinessFor({
      description: null,
      sellingPoint: null,
      applicableLifeStages: [],
      customerDogId: null,
      series: {
        id: 'series-1',
        name: '鸡肉成犬配方',
        referenceDogId: null,
        designMode: 'ORDER',
        orderId: '   ',
        orderQuantity: 0,
      },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ORDER_ID_REQUIRED',
          scope: 'ORDER',
          field: 'series.orderId',
        }),
        expect.objectContaining({
          code: 'ORDER_QUANTITY_INVALID',
          scope: 'ORDER',
          field: 'series.orderQuantity',
        }),
        expect.objectContaining({
          code: 'CUSTOMER_DOG_REQUIRED',
          scope: 'ORDER',
          field: 'customerDogId',
        }),
      ]),
    );
    expect(
      readiness.blockers.some((blocker) => blocker.scope === 'CATALOG'),
    ).toBe(false);
  });

  it('keeps common warning codes unique when catalog checks add a warning', async () => {
    targetProvider.getTargets.mockResolvedValue([
      {
        nutrientKey: 'calcium',
        label: '钙',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 99999,
        maxValue: null,
        fieldPaths: ['minerals.calcium'],
      },
    ]);

    const readiness = await readinessFor({ targetHealthTags: [] });

    const warningCodes = readiness.warnings.map((warning) => warning.code);
    expect(new Set(warningCodes).size).toBe(warningCodes.length);
    expect(readiness.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'REVIEW_REQUIRED', scope: 'COMMON' }),
        expect.objectContaining({
          code: 'NUTRIENT_OUT_OF_RANGE',
          scope: 'COMMON',
        }),
        expect.objectContaining({
          code: 'TARGET_HEALTH_TAGS_MISSING',
          scope: 'CATALOG',
        }),
      ]),
    );
  });

  it('summarizes persisted report state without generating a report on readiness', async () => {
    const readiness = await readinessFor({ nutritionReportJson: null });

    expect(readiness.summary).toMatchObject({
      reportAvailable: true,
      reportGenerated: false,
      reportStale: false,
    });
    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
  });

  it('marks a persisted report stale when contentRevision advanced', async () => {
    const readiness = await readinessFor({
      contentRevision: 4,
      nutritionReportJson: { ingredientRows: [] },
      nutritionReportRevision: 3,
      nutritionReportGeneratedAt: new Date('2026-10-22T09:00:00.000Z'),
    });

    expect(readiness.summary).toMatchObject({
      reportAvailable: true,
      reportGenerated: true,
      reportStale: true,
    });
    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
  });

  it('keeps a persisted report fresh when revision matches contentRevision', async () => {
    const readiness = await readinessFor({
      contentRevision: 4,
      nutritionReportJson: { ingredientRows: [] },
      nutritionReportRevision: 4,
      nutritionReportGeneratedAt: new Date('2026-10-22T09:00:00.000Z'),
    });

    expect(readiness.summary).toMatchObject({
      reportAvailable: true,
      reportGenerated: true,
      reportStale: false,
    });
  });

  it('enforces the same gate in publishDraft before creating a recipe', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      designDraft({ productionStepsJson: [] }),
    );

    await expect(
      service.publishDraft('draft-1', { name: '鸡肉成犬配方' }, ADMIN_ACCESS),
    ).rejects.toThrow(new BadRequestException('请至少填写一个制作步骤'));

    expect(prisma.recipe.create).not.toHaveBeenCalled();
    expect(prisma.designRecipePublishSnapshot.create).not.toHaveBeenCalled();
  });

  it('enforces presentation blockers in publishDraft before creating a recipe', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      designDraft({ coverImageUrl: null, coverTitle: null }),
    );

    await expect(
      service.publishDraft('draft-1', { name: '鸡肉成犬配方' }, ADMIN_ACCESS),
    ).rejects.toThrow('请上传封面图后再发布或加入待提交');

    expect(prisma.recipe.create).not.toHaveBeenCalled();
    expect(prisma.designRecipePublishSnapshot.create).not.toHaveBeenCalled();
  });

  it('enforces report failure in publishDraft as a blocker', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(designDraft());
    jest
      .spyOn(service, 'buildPublishedNutritionDetailedDataForDraft')
      .mockRejectedValue(new Error('report exploded'));

    await expect(
      service.publishDraft('draft-1', { name: '鸡肉成犬配方' }, ADMIN_ACCESS),
    ).rejects.toThrow('完整营养报告生成失败');

    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });

  it('enforces the shared gate in publishOrderDesignSlot (order stage action)', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      designDraft({
        productionStepsJson: [],
        series: {
          id: 'series-1',
          name: '鸡肉成犬配方',
          referenceDogId: 'dog-1',
          designMode: 'ORDER',
          orderId: 'order-1',
          orderQuantity: 2,
        },
      }),
    );

    await expect(
      service.publishOrderDesignSlot({
        draftId: 'draft-1',
        customerId: 'customer-1',
        dogId: 'dog-1',
        operatorId: 'admin-1',
      }),
    ).rejects.toThrow(new BadRequestException('请至少填写一个制作步骤'));

    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });
});
