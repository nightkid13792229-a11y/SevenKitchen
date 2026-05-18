import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('RecipeDesignerService', () => {
  let service: RecipeDesignerService;

  const prisma = {
    designRecipe: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    designRecipeItem: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    nutritionFoodMapping: {
      findFirst: jest.fn(),
    },
    ingredient: {
      count: jest.fn(),
      findMany: jest.fn(),
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
    jest.resetAllMocks();
    prisma.designRecipe.aggregate.mockResolvedValue({ _max: { version: null } });
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

  it('assigns the next version when a draft name already exists', async () => {
    prisma.designRecipe.aggregate.mockResolvedValue({ _max: { version: 3 } });
    prisma.designRecipe.create.mockResolvedValue(
      draft({ name: '未命名配方', version: 4 }),
    );

    await expect(
      service.createDraft(
        {
          name: '未命名配方',
          scenario: 'ADULT_MER_110',
        },
        'staff-1',
      ),
    ).resolves.toEqual(expect.objectContaining({ version: 4 }));

    expect(prisma.designRecipe.aggregate).toHaveBeenCalledWith({
      where: { name: '未命名配方' },
      _max: { version: true },
    });
    expect(prisma.designRecipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '未命名配方',
        version: 4,
      }),
      include: expect.any(Object),
    });
  });

  it('lists standard ingredient options with verified nutrition profiles and localized profile labels', async () => {
    prisma.ingredient.count.mockResolvedValue(1);
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-mussel',
        name: '青口贝肉',
        type: 'FOOD',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-secondary',
            nutritionFoodId: 'food-cooked',
            ingredientId: 'ingredient-mussel',
            yieldRate: 0.82,
            isPrimary: false,
            notes: 'boiled profile',
            nutritionFood: {
              id: 'food-cooked',
              name: 'Mussel, green, meat, boiled',
              nameEn: 'Green mussel boiled',
              category: 'OTHER',
              dataSource: 'NZFCD',
              status: 'VERIFIED',
            },
          },
          {
            id: 'mapping-primary',
            nutritionFoodId: 'food-raw',
            ingredientId: 'ingredient-mussel',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-raw',
              name: 'Mussel, green, meat, fresh, raw',
              nameEn: 'Green mussel raw',
              displayNameZh: '青口贝肉正式生食档案',
              category: 'OTHER',
              dataSource: 'NZFCD',
              status: 'VERIFIED',
            },
          },
        ],
      },
    ]);

    await expect(
      service.listIngredientOptions({
        search: 'mussel',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      data: [
        {
          id: 'ingredient-mussel',
          name: '青口贝肉',
          type: 'FOOD',
          purchaseUnit: 'g',
          brand: null,
          productModel: null,
          defaultNutritionFoodId: 'food-raw',
          nutritionProfiles: [
            expect.objectContaining({
              mappingId: 'mapping-primary',
              nutritionFoodId: 'food-raw',
              name: '青口贝肉正式生食档案',
              nameEn: 'Mussel, green, meat, fresh, raw',
              dataSource: 'NZFCD',
              isPrimary: true,
            }),
            expect.objectContaining({
              mappingId: 'mapping-secondary',
              nutritionFoodId: 'food-cooked',
              name: '青口贝肉（水煮）',
              nameEn: 'Mussel, green, meat, boiled',
              isPrimary: false,
            }),
          ],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    const expectedWhere = expect.objectContaining({
      type: 'FOOD',
      nutritionFoodMappings: {
        some: { nutritionFood: { status: 'VERIFIED' } },
      },
      OR: expect.arrayContaining([
        { name: { contains: 'mussel', mode: 'insensitive' } },
        {
          nutritionFoodMappings: {
            some: {
              nutritionFood: {
                displayNameZh: { contains: 'mussel', mode: 'insensitive' },
              },
            },
          },
        },
      ]),
    });
    expect(prisma.ingredient.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      skip: 0,
      take: 20,
      orderBy: { name: 'asc' },
      select: expect.objectContaining({
        nutritionFoodMappings: expect.objectContaining({
          where: { nutritionFood: { status: 'VERIFIED' } },
        }),
      }),
    });
  });

  it('expands common ingredient search aliases such as 西蓝花 to 西兰花', async () => {
    prisma.ingredient.count.mockResolvedValue(0);
    prisma.ingredient.findMany.mockResolvedValue([]);

    await service.listIngredientOptions({
      search: '西蓝花',
      page: 1,
      pageSize: 20,
    });

    const where = prisma.ingredient.count.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { name: { contains: '西蓝花', mode: 'insensitive' } },
        { name: { contains: '西兰花', mode: 'insensitive' } },
        { name: { contains: '青花菜', mode: 'insensitive' } },
        {
          nutritionFoodMappings: {
            some: {
              nutritionFood: {
                displayNameZh: { contains: '西兰花', mode: 'insensitive' },
              },
            },
          },
        },
      ]),
    );
  });

  it('adds design items with both the selected standard ingredient and nutrition profile', async () => {
    prisma.nutritionFoodMapping.findFirst.mockResolvedValue({ id: 'mapping-1' });
    prisma.designRecipeItem.create.mockResolvedValue(
      item({
        ingredientId: 'ingredient-mussel',
        nutritionFoodId: 'food-raw',
      }),
    );

    await service.addItem('design-1', {
      ingredientId: 'ingredient-mussel',
      nutritionFoodId: 'food-raw',
      weightG: 100,
      sortOrder: 0,
    } as any);

    expect(prisma.nutritionFoodMapping.findFirst).toHaveBeenCalledWith({
      where: {
        ingredientId: 'ingredient-mussel',
        nutritionFoodId: 'food-raw',
      },
      select: { id: true },
    });
    expect(prisma.designRecipeItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        designRecipeId: 'design-1',
        ingredientId: 'ingredient-mussel',
        nutritionFoodId: 'food-raw',
        weightG: 100,
      }),
      include: expect.any(Object),
    });
  });

  it('rejects design items when the selected ingredient is not mapped to the nutrition profile', async () => {
    prisma.nutritionFoodMapping.findFirst.mockResolvedValue(null);

    await expect(
      service.addItem('design-1', {
        ingredientId: 'ingredient-oyster',
        nutritionFoodId: 'food-mussel',
        weightG: 100,
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.designRecipeItem.create).not.toHaveBeenCalled();
  });

  it('hard deletes an unpublished draft created by the current staff user', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-delete',
        createdBy: 'staff-1',
        status: 'DRAFT',
        publishedRecipeId: null,
        publishedAt: null,
      }),
    );
    prisma.designRecipe.delete.mockResolvedValue(draft({ id: 'design-delete' }));

    await expect(
      service.deleteDraft('design-delete', 'staff-1'),
    ).resolves.toEqual(expect.objectContaining({ id: 'design-delete' }));

    expect(prisma.designRecipe.findUnique).toHaveBeenCalledWith({
      where: { id: 'design-delete' },
      select: {
        id: true,
        createdBy: true,
        status: true,
        publishedRecipeId: true,
        publishedAt: true,
      },
    });
    expect(prisma.designRecipe.delete).toHaveBeenCalledWith({
      where: { id: 'design-delete' },
    });
  });

  it('rejects hard deletion after a draft has been published', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-published',
        createdBy: 'staff-1',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-1',
        publishedAt: new Date('2026-05-18T00:00:00.000Z'),
      }),
    );

    await expect(
      service.deleteDraft('design-published', 'staff-1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.designRecipe.delete).not.toHaveBeenCalled();
  });

  it('does not reveal or delete drafts owned by another staff user', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-other',
        createdBy: 'staff-2',
        status: 'DRAFT',
      }),
    );

    await expect(
      service.deleteDraft('design-other', 'staff-1'),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.designRecipe.delete).not.toHaveBeenCalled();
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
        complianceStatus: assessment.groupedEntries,
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
          rawSummary: expect.any(Object),
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

  it('records review approval when publishing a non-compliant draft with a review note', async () => {
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
        minValue: 10000,
        maxValue: null,
        fieldPaths: ['minerals.calcium'],
      },
    ]);
    prisma.designRecipe.update.mockResolvedValue(draft({ status: 'PUBLISHED' }));
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'design-1',
      version: 1,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-1',
    });

    await service.publishDraft(
      'design-1',
      { reviewNote: '人工确认钙不足但允许第一版发布' },
      'staff-2',
    );

    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'PUBLIC',
      }),
    });
    expect(prisma.designRecipePublishSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reviewStatus: 'APPROVED',
        reviewNote: '人工确认钙不足但允许第一版发布',
        publishedBy: 'staff-2',
      }),
    });
    expect(prisma.designRecipe.update).toHaveBeenLastCalledWith({
      where: { id: 'design-1' },
      data: expect.objectContaining({
        status: 'PUBLISHED',
        reviewStatus: 'APPROVED',
        reviewedBy: 'staff-2',
        reviewedAt: expect.any(Date),
      }),
      include: expect.any(Object),
    });
  });

  it('publishes using the same loaded draft that was assessed', async () => {
    const firstLoadedItem = item({
      id: 'item-loaded-for-publish',
      weightG: 100,
      nutritionFood: {
        ...item().nutritionFood,
        id: 'food-loaded-for-publish',
        mappings: [{ ingredientId: 'ingredient-loaded', isPrimary: true }],
      },
    });
    const staleSecondLoadItem = item({
      id: 'item-stale-second-load',
      weightG: 200,
      nutritionFood: {
        ...item().nutritionFood,
        id: 'food-stale-second-load',
        mappings: [{ ingredientId: 'ingredient-stale', isPrimary: true }],
      },
    });
    prisma.designRecipe.findUnique
      .mockResolvedValueOnce(draft({ items: [firstLoadedItem] }))
      .mockResolvedValueOnce(draft({ items: [staleSecondLoadItem] }));
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

    expect(prisma.designRecipe.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        items: {
          create: [
            expect.objectContaining({
              ingredientId: 'ingredient-loaded',
              ratioPercent: 100,
            }),
          ],
        },
      }),
    });
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
