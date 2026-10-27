import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { SupplementTargetService } from '../../../src/application/recipe-designer/supplement-target.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 草稿营养报告持久化（2026-10-22）。
 *
 * 覆盖：
 *  · POST 生成 → 按当前 contentRevision 落库，返回发布口径 report；
 *  · 内容修改（contentRevision +1）后 GET 标记 stale；
 *  · GET 无报告时返回 200 + report:null；
 *  · 权限与草稿详情一致（非作者顾客拿不到）；
 *  · 报告生成失败统一 400，且不写库。
 */

const STAFF_ACCESS = { userId: 'staff-1', role: 'STAFF' as const };
const CUSTOMER_ACCESS = {
  userId: 'customer-1',
  role: 'CUSTOMER' as const,
  customerId: 'customer-1',
};

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
    targetHealthTags: [],
    applicableLifeStages: [],
    notes: null,
    productionStepsJson: [
      {
        sortOrder: 1,
        instruction: '食材称重后混合',
        durationMinutes: null,
        temperatureC: null,
        equipment: null,
      },
    ],
    nutritionReportJson: null,
    nutritionReportRevision: null,
    nutritionReportGeneratedAt: null,
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

describe('RecipeDesignerService · persisted draft nutrition report', () => {
  let service: RecipeDesignerService;

  const prisma = {
    user: { findMany: jest.fn() },
    designRecipe: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    designRecipeItem: {
      aggregate: jest.fn(),
    },
    preparationMethod: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const targetProvider = { getTargets: jest.fn() };
  const supplementTargetService = new SupplementTargetService(
    prisma as PrismaService,
  );
  const searchGovernance = {
    expandQuery: jest.fn(),
    recordSearchEvent: jest.fn(),
  };
  beforeEach(() => {
    service = new RecipeDesignerService(
      prisma as PrismaService,
      targetProvider as any,
      searchGovernance as any,
      undefined,
      undefined,
      undefined,
      supplementTargetService,
    );
    jest.clearAllMocks();

    prisma.user.findMany.mockResolvedValue([{ id: 'staff-1' }]);
    prisma.preparationMethod.findMany.mockResolvedValue([]);
    prisma.designRecipe.update.mockResolvedValue({});
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
  });

  it('generates a report, persists it with the current revision, and returns its shape', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      designDraft({ contentRevision: 7 }),
    );

    const result = await service.generateDraftNutritionReport(
      'draft-1',
      STAFF_ACCESS,
    );

    expect(result).toMatchObject({
      draftId: 'draft-1',
      revision: 7,
      stale: false,
      generatedAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(result.generatedAt as string))).toBe(false);
    expect(result.report).toMatchObject({
      ingredientRows: [
        expect.objectContaining({
          ingredientName: '鸡胸肉',
          weightPercentLabel: '100%',
          concentrationLabel: '-',
        }),
      ],
      macroRows: expect.arrayContaining([
        expect.objectContaining({ key: 'crudeProtein', name: '蛋白质' }),
      ]),
      energyDensityRows: expect.any(Array),
      nutrientSections: expect.objectContaining({
        minerals: expect.objectContaining({
          title: '微量元素',
          rows: expect.any(Array),
        }),
        vitamins: expect.any(Object),
        aminoAcids: expect.any(Object),
        fattyAcids: expect.any(Object),
      }),
    });

    expect(prisma.designRecipe.update).toHaveBeenCalledTimes(1);
    const updateArgs = prisma.designRecipe.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'draft-1' });
    expect(updateArgs.data.nutritionReportJson).toEqual(result.report);
    expect(updateArgs.data.nutritionReportRevision).toBe(7);
    expect(updateArgs.data.nutritionReportGeneratedAt).toBeInstanceOf(Date);
  });

  it('reads the persisted report back and marks it stale after content changes', async () => {
    let storedDraft: Record<string, any> = designDraft({
      contentRevision: 7,
    });
    prisma.designRecipe.findUnique.mockImplementation(async () => storedDraft);
    prisma.designRecipe.update.mockImplementation(async ({ data }) => {
      storedDraft = { ...storedDraft, ...data };
      return storedDraft;
    });

    const generated = await service.generateDraftNutritionReport(
      'draft-1',
      STAFF_ACCESS,
    );

    const fresh = await service.getDraftNutritionReport(
      'draft-1',
      STAFF_ACCESS,
    );
    expect(fresh).toMatchObject({
      draftId: 'draft-1',
      revision: 7,
      stale: false,
      generatedAt: generated.generatedAt,
      report: generated.report,
    });

    // 模拟编辑器保存一次：contentRevision +1，落库报告仍是上一版。
    storedDraft = { ...storedDraft, contentRevision: 8 };
    const stale = await service.getDraftNutritionReport(
      'draft-1',
      STAFF_ACCESS,
    );
    expect(stale).toMatchObject({
      draftId: 'draft-1',
      revision: 7,
      stale: true,
      generatedAt: generated.generatedAt,
      report: generated.report,
    });
  });

  it('returns 200-style report:null when no report has been generated', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(designDraft());

    await expect(
      service.getDraftNutritionReport('draft-1', STAFF_ACCESS),
    ).resolves.toEqual({
      draftId: 'draft-1',
      generatedAt: null,
      revision: null,
      stale: false,
      report: null,
    });
  });

  it('uses the same access rule as draft detail (non-owner customers get 404)', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      designDraft({ createdBy: 'staff-1' }),
    );

    await expect(
      service.generateDraftNutritionReport('draft-1', CUSTOMER_ACCESS),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getDraftNutritionReport('draft-1', CUSTOMER_ACCESS),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
  });

  it('turns report generation failures into 400 without writing a report', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(designDraft());
    jest
      .spyOn(service, 'buildPublishedNutritionDetailedDataForDraft')
      .mockRejectedValue(new Error('report exploded'));

    await expect(
      service.generateDraftNutritionReport('draft-1', STAFF_ACCESS),
    ).rejects.toEqual(
      new BadRequestException('完整营养报告生成失败：report exploded'),
    );
    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
  });
});
