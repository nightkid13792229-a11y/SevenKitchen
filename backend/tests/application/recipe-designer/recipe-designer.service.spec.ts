import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('RecipeDesignerService', () => {
  let service: RecipeDesignerService;

  const prisma = {
    designRecipe: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    designRecipeItem: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    recipe: {
      create: jest.fn(),
    },
    designRecipePublishSnapshot: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const targetProvider = {
    getTargets: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeDesignerService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'FediafTargetProvider', useValue: targetProvider },
      ],
    }).compile();

    service = moduleRef.get(RecipeDesignerService);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
  });

  function draft(overrides: Record<string, unknown> = {}) {
    return {
      id: 'design-1',
      name: '成犬鸡肉配方',
      version: 1,
      status: 'DRAFT',
      fediafDogScenario: 'ADULT_MER_110',
      totalWeightG: 0,
      energyDensityKcalPerKg: 0,
      targetHealthTags: [],
      applicableLifeStages: [],
      notes: null,
      createdBy: 'staff-1',
      isCompliant: false,
      reviewStatus: 'NONE',
      reviewNote: null,
      calculatedNutrition: {},
      complianceStatus: {},
      assessmentSummary: {},
      missingDataReport: [],
      items: [],
      ...overrides,
    };
  }

  function item(overrides: Record<string, unknown> = {}) {
    return {
      id: 'item-1',
      nutritionFoodId: 'food-1',
      weightG: 100,
      ratioPercent: null,
      preparationMethod: 'RAW',
      nutrientTargetKey: null,
      nutrientTargetValue: null,
      sortOrder: 0,
      nutritionFood: {
        id: 'food-1',
        name: '鸡胸肉',
        nutritionData: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: {
            energyKcal: 120,
            moisture: 70,
            crudeProtein: 20,
            crudeFat: 3,
            ash: 1,
          },
          minerals: { calcium: 600, phosphorus: 500 },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        },
        mappings: [{ ingredientId: 'ingredient-1', isPrimary: true }],
      },
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

  it('creates drafts with the selected FEDIAF dog scenario', async () => {
    prisma.designRecipe.create.mockResolvedValue(
      draft({ fediafDogScenario: 'LATE_GROWTH' }),
    );

    await expect(
      service.createDraft(
        {
          name: '幼犬后期配方',
          scenario: 'LATE_GROWTH',
          notes: 'test',
        },
        'staff-1',
      ),
    ).resolves.toEqual(expect.objectContaining({ fediafDogScenario: 'LATE_GROWTH' }));

    expect(prisma.designRecipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '幼犬后期配方',
        fediafDogScenario: 'LATE_GROWTH',
        nutritionStandard: 'FEDIAF_2025',
        createdBy: 'staff-1',
      }),
      include: expect.any(Object),
    });
  });

  it('assesses free-total weights and persists draft assessment fields', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue([
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
    ]);
    prisma.designRecipe.update.mockResolvedValue(draft());

    const assessment = await service.assessDraft('design-1');

    expect(assessment.totalWeightG).toBe(100);
    expect(assessment.energyDensityKcalPerKg).toBe(1200);
    expect(assessment.items[0]).toEqual(
      expect.objectContaining({ id: 'item-1', ratioPercent: 100 }),
    );
    expect(prisma.designRecipe.update).toHaveBeenCalledWith({
      where: { id: 'design-1' },
      data: expect.objectContaining({
        totalWeightG: 100,
        energyDensityKcalPerKg: 1200,
        calculatedNutrition: assessment.nutrients,
        complianceStatus: assessment.entries,
        status: 'COMPLIANT',
        reviewStatus: 'NONE',
        isCompliant: true,
      }),
    });
  });

  it('persists null energy density and incomplete summary when energy data is missing', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        items: [
          item({
            nutritionFood: {
              id: 'food-1',
              name: '鸡胸肉',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: {
                  moisture: 70,
                  crudeProtein: 20,
                  crudeFat: 3,
                  ash: 1,
                },
                minerals: { calcium: 600, phosphorus: 500 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              mappings: [{ ingredientId: 'ingredient-1', isPrimary: true }],
            },
          }),
        ],
      }),
    );
    targetProvider.getTargets.mockResolvedValue([
      {
        nutrientKey: 'calcium',
        label: '钙',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 500,
        maxValue: null,
        fieldPaths: ['minerals.calcium'],
      },
    ]);
    prisma.designRecipe.update.mockResolvedValue(draft());

    const assessment = await service.assessDraft('design-1');

    expect(assessment.energyDensityKcalPerKg).toBeNull();
    expect(assessment.overallStatus).toBe('INCOMPLETE');
    expect(prisma.designRecipe.update).toHaveBeenCalledWith({
      where: { id: 'design-1' },
      data: expect.objectContaining({
        energyDensityKcalPerKg: null,
        assessmentSummary: expect.objectContaining({
          overallStatus: 'INCOMPLETE',
          summary: expect.any(Object),
        }),
      }),
    });
  });

  it('rejects publishing incomplete drafts without a review note', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        items: [
          item({
            nutritionFood: {
              id: 'food-1',
              name: '鸡胸肉',
              nutritionData: { energy_kcal: 120 },
              mappings: [{ ingredientId: 'ingredient-1', isPrimary: true }],
            },
          }),
        ],
      }),
    );
    targetProvider.getTargets.mockResolvedValue([
      {
        nutrientKey: 'calcium',
        label: '钙',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 500,
        maxValue: null,
        fieldPaths: ['minerals.calcium'],
      },
    ]);
    prisma.designRecipe.update.mockResolvedValue(draft());

    await expect(
      service.publishDraft('design-1', { reviewNote: '   ' }, 'staff-2'),
    ).rejects.toThrow(
      new BadRequestException('需审核配方必须填写审核说明'),
    );
  });

  it('rejects publishing drafts without energy density even with a review note', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        items: [
          item({
            nutritionFood: {
              id: 'food-1',
              name: '鸡胸肉',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: {
                  moisture: 70,
                  crudeProtein: 20,
                  crudeFat: 3,
                  ash: 1,
                },
                minerals: { calcium: 600, phosphorus: 500 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              mappings: [{ ingredientId: 'ingredient-1', isPrimary: true }],
            },
          }),
        ],
      }),
    );
    targetProvider.getTargets.mockResolvedValue([
      {
        nutrientKey: 'calcium',
        label: '钙',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 500,
        maxValue: null,
        fieldPaths: ['minerals.calcium'],
      },
    ]);
    prisma.designRecipe.update.mockResolvedValue(draft());
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'design-1',
      version: 1,
    });

    await expect(
      service.publishDraft(
        'design-1',
        { reviewNote: '人工审核钙数据，但能量缺失' },
        'staff-2',
      ),
    ).rejects.toThrow(
      new BadRequestException('缺少能量数据，无法发布正式食谱'),
    );
    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });

  it('publishes recipe items using mapped ingredient ids instead of nutrition food ids', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        isCompliant: true,
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.designRecipe.update.mockResolvedValue(draft({ status: 'PUBLISHED' }));
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'design-1',
      version: 1,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-1',
    });

    await service.publishDraft('design-1', {}, 'staff-2');

    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipeId: 'design-1',
        items: {
          create: [
            expect.objectContaining({
              ingredientId: 'ingredient-1',
              exampleWeight: 100,
            }),
          ],
        },
      }),
    });
    expect(prisma.recipe.create.mock.calls[0][0].data.items.create[0]).not.toEqual(
      expect.objectContaining({ ingredientId: 'food-1' }),
    );
  });

  it('rejects publishing when a nutrition food has no ingredient mapping', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        isCompliant: true,
        items: [
          item({
            nutritionFood: {
              id: 'food-unmapped',
              name: '未知营养原料',
              nutritionData: item().nutritionFood.nutritionData,
              mappings: [],
            },
          }),
        ],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.designRecipe.update.mockResolvedValue(draft());

    await expect(service.publishDraft('design-1', {}, 'staff-2')).rejects.toThrow(
      new BadRequestException('营养原料 未知营养原料 未映射采购原料，无法发布正式食谱'),
    );
    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });
});
