import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { SearchGovernanceService } from '../../../src/application/search-governance/search-governance.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('RecipeDesignerService', () => {
  let service: RecipeDesignerService;

  const prisma = {
    user: {
      findMany: jest.fn(),
    },
    designRecipe: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    designRecipeItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    nutritionFoodMapping: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    nutritionFood: {
      create: jest.fn(),
    },
    ingredient: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    recipe: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    favoriteRecipe: {
      updateMany: jest.fn(),
    },
    recipeSeries: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    recipeItem: {
      findMany: jest.fn(),
    },
    preparationMethod: {
      findMany: jest.fn(),
    },
    designRecipePublishSnapshot: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const targetProvider = {
    getTargets: jest.fn(),
  };
  const searchGovernance = {
    expandQuery: jest.fn(),
    recordSearchEvent: jest.fn(),
  };
  const adminAccess = { userId: 'admin-1', role: 'ADMIN' };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeDesignerService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'FediafTargetProvider', useValue: targetProvider },
        { provide: SearchGovernanceService, useValue: searchGovernance },
      ],
    }).compile();

    service = moduleRef.get(RecipeDesignerService);
    jest.resetAllMocks();
    searchGovernance.expandQuery.mockImplementation(
      async (_domain, rawQuery) => (rawQuery ? [rawQuery] : []),
    );
    searchGovernance.recordSearchEvent.mockResolvedValue({ id: 'query-log-1' });
    prisma.designRecipe.aggregate.mockResolvedValue({
      _max: { version: null },
    });
    prisma.user.findMany.mockResolvedValue([
      { id: 'staff-1' },
      { id: 'admin-1' },
    ]);
    prisma.recipeItem.findMany.mockResolvedValue([]);
    prisma.preparationMethod.findMany.mockResolvedValue([]);
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
      publishedAt: null,
      publishedRecipeId: null,
      publishedRecipeVersion: null,
      revisionOfDesignRecipeId: null,
      revisionBaseRecipeId: null,
      createdAt: new Date('2026-05-20T00:00:00.000Z'),
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
      items: [],
      ...overrides,
    };
  }

  function seriesRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'series-1',
      name: '成犬鸡肉配方',
      status: 'ACTIVE',
      deletedAt: null,
      deletedBy: null,
      createdBy: 'customer-1',
      createdAt: new Date('2026-05-20T00:00:00.000Z'),
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
      designs: [],
      recipes: [],
      ...overrides,
    };
  }

  function item(overrides: Record<string, unknown> = {}) {
    return {
      id: 'item-1',
      nutritionFoodId: 'food-1',
      weightG: 100,
      includeInAssessment: true,
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
            fiber: 0,
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
    ).resolves.toEqual(
      expect.objectContaining({ fediafDogScenario: 'LATE_GROWTH' }),
    );

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
      type: { in: ['FOOD', 'SUPPLEMENT'] },
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
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: { name: 'asc' },
      select: expect.objectContaining({
        nutritionFoodMappings: expect.objectContaining({
          where: { nutritionFood: { status: 'VERIFIED' } },
        }),
      }),
    });
  });

  it('expands common ingredient search aliases such as 西蓝花 to 西兰花', async () => {
    searchGovernance.expandQuery.mockResolvedValue(['西蓝花', '西兰花']);
    prisma.ingredient.count.mockResolvedValue(0);
    prisma.ingredient.findMany.mockResolvedValue([]);

    await service.listIngredientOptions({
      search: '西蓝花',
      page: 1,
      pageSize: 20,
    });

    expect(searchGovernance.expandQuery).toHaveBeenCalledWith(
      'INGREDIENT',
      '西蓝花',
    );
    const where = prisma.ingredient.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { name: { contains: '西蓝花', mode: 'insensitive' } },
        { name: { contains: '西兰花', mode: 'insensitive' } },
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

  it('uses search governance expansion for ingredient option search terms', async () => {
    searchGovernance.expandQuery.mockResolvedValue([
      '鸡胸肉',
      '鸡胸',
      'chicken breast',
    ]);
    prisma.ingredient.count.mockResolvedValue(0);
    prisma.ingredient.findMany.mockResolvedValue([]);

    await service.listIngredientOptions({
      search: '鸡胸肉',
      page: 1,
      pageSize: 20,
    });

    expect(searchGovernance.expandQuery).toHaveBeenCalledWith(
      'INGREDIENT',
      '鸡胸肉',
    );
    const where = prisma.ingredient.findMany.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        type: { in: ['FOOD', 'SUPPLEMENT'] },
        nutritionFoodMappings: {
          some: { nutritionFood: { status: 'VERIFIED' } },
        },
      }),
    );
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { name: { contains: '鸡胸', mode: 'insensitive' } },
        { name: { contains: 'chicken breast', mode: 'insensitive' } },
      ]),
    );
  });

  it('excludes negated salt nutrition profile matches and ranks direct salt ingredients first', async () => {
    prisma.ingredient.count.mockResolvedValue(3);
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-pakchoi',
        name: '上海青',
        type: 'FOOD',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-pakchoi-cooked',
            nutritionFoodId: 'food-pakchoi-cooked',
            ingredientId: 'ingredient-pakchoi',
            yieldRate: 1,
            isPrimary: false,
            notes: null,
            nutritionFood: {
              id: 'food-pakchoi-cooked',
              name: 'Cabbage, chinese, cooked, boiled, without salt',
              nameEn: 'Cabbage, chinese, cooked, boiled, without salt',
              displayNameZh: '上海青（水煮沥干，不加盐）',
              category: 'OTHER',
              dataSource: 'USDA',
              status: 'VERIFIED',
            },
          },
        ],
      },
      {
        id: 'ingredient-sea-salt',
        name: '低钠海盐',
        type: 'FOOD',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-sea-salt',
            nutritionFoodId: 'food-sea-salt',
            ingredientId: 'ingredient-sea-salt',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-sea-salt',
              name: 'Sea salt',
              nameEn: 'Sea salt',
              displayNameZh: '低钠海盐',
              category: 'OTHER',
              dataSource: 'MANUAL',
              status: 'VERIFIED',
            },
          },
        ],
      },
      {
        id: 'ingredient-table-salt',
        name: '食用盐',
        type: 'FOOD',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-table-salt',
            nutritionFoodId: 'food-table-salt',
            ingredientId: 'ingredient-table-salt',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-table-salt',
              name: 'Salt, table',
              nameEn: 'Salt, table',
              displayNameZh: '食盐（精制食盐）',
              category: 'OTHER',
              dataSource: 'USDA',
              status: 'VERIFIED',
            },
          },
        ],
      },
    ]);

    await expect(
      service.listIngredientOptions({
        search: '盐',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      data: [
        { id: 'ingredient-table-salt', name: '食用盐' },
        { id: 'ingredient-sea-salt', name: '低钠海盐' },
      ],
      total: 2,
      hasMore: false,
    });

    const where = prisma.ingredient.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          AND: expect.arrayContaining([
            { name: { contains: '盐', mode: 'insensitive' } },
            expect.objectContaining({
              NOT: expect.arrayContaining([
                { name: { contains: '不加盐', mode: 'insensitive' } },
                { name: { contains: 'without salt', mode: 'insensitive' } },
              ]),
            }),
          ]),
        }),
      ]),
    );
  });

  it('records ingredient option searches with the final total result count', async () => {
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-chicken-breast',
        name: '鸡胸肉',
        type: 'FOOD',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-chicken-breast',
            nutritionFoodId: 'food-chicken-breast',
            ingredientId: 'ingredient-chicken-breast',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-chicken-breast',
              name: 'Chicken breast raw',
              nameEn: 'Chicken breast raw',
              displayNameZh: '鸡胸肉（生）',
              category: 'OTHER',
              dataSource: 'USDA',
              status: 'VERIFIED',
            },
          },
        ],
      },
      {
        id: 'ingredient-chicken-tender',
        name: '鸡胸肉小里脊',
        type: 'FOOD',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-chicken-tender',
            nutritionFoodId: 'food-chicken-tender',
            ingredientId: 'ingredient-chicken-tender',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-chicken-tender',
              name: 'Chicken tenderloin raw',
              nameEn: 'Chicken tenderloin raw',
              displayNameZh: '鸡胸肉小里脊（生）',
              category: 'OTHER',
              dataSource: 'USDA',
              status: 'VERIFIED',
            },
          },
        ],
      },
    ]);

    await service.listIngredientOptions({
      search: ' 鸡胸肉 ',
      page: 1,
      pageSize: 20,
    });

    expect(searchGovernance.recordSearchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'INGREDIENT',
        source: 'RECIPE_DESIGNER_INGREDIENT_OPTIONS',
        rawQuery: '鸡胸肉',
        resultCount: 2,
      }),
    );
  });

  it('falls back to the original ingredient search when search governance fails', async () => {
    searchGovernance.expandQuery.mockRejectedValue(
      new Error('alias unavailable'),
    );
    prisma.ingredient.count.mockResolvedValue(0);
    prisma.ingredient.findMany.mockResolvedValue([]);

    await service.listIngredientOptions({
      search: '鸡胸肉',
      page: 1,
      pageSize: 20,
    });

    const where = prisma.ingredient.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { name: { contains: '鸡胸肉', mode: 'insensitive' } },
      ]),
    );
  });

  it('limits ingredient search expansion terms while keeping the original keyword first', async () => {
    searchGovernance.expandQuery.mockResolvedValue([
      'alias-1',
      'alias-2',
      'alias-3',
      'alias-4',
      'alias-5',
      'alias-6',
      'alias-7',
      'alias-8',
      'alias-9',
    ]);
    prisma.ingredient.count.mockResolvedValue(0);
    prisma.ingredient.findMany.mockResolvedValue([]);

    await service.listIngredientOptions({
      search: '鸡胸肉',
      page: 1,
      pageSize: 20,
    });

    const where = prisma.ingredient.findMany.mock.calls[0][0].where;
    const searchedNames = where.OR.filter(
      (condition: any) => condition.name,
    ).map((condition: any) => condition.name.contains);
    expect(searchedNames).toEqual([
      '鸡胸肉',
      'alias-1',
      'alias-2',
      'alias-3',
      'alias-4',
      'alias-5',
      'alias-6',
      'alias-7',
    ]);
    expect(searchedNames).not.toContain('alias-8');
  });

  it('ranks food ingredient options by per-100g nutrient amount when a nutrient target is provided', async () => {
    targetProvider.getTargets.mockResolvedValue([
      {
        nutrientKey: 'potassium',
        label: '钾',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 1.25,
        maxValue: null,
        fieldPaths: ['minerals.potassium'],
      },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-celery',
        name: '芹菜',
        type: 'FOOD',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-celery',
            nutritionFoodId: 'food-celery',
            ingredientId: 'ingredient-celery',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-celery',
              name: 'Celery raw',
              nameEn: 'Celery raw',
              displayNameZh: '芹菜（生）',
              category: 'OTHER',
              dataSource: 'USDA',
              status: 'VERIFIED',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: {
                  energyKcal: 14,
                  moisture: 95,
                  crudeProtein: 0.7,
                  crudeFat: 0.2,
                  ash: 0.8,
                  fiber: 0,
                },
                minerals: { potassium: 260 },
              },
            },
          },
        ],
      },
      {
        id: 'ingredient-sweet-potato',
        name: '红薯',
        type: 'FOOD',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-sweet-potato',
            nutritionFoodId: 'food-sweet-potato',
            ingredientId: 'ingredient-sweet-potato',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-sweet-potato',
              name: 'Sweet potato raw',
              nameEn: 'Sweet potato raw',
              displayNameZh: '红薯/甘薯（生，未加工）',
              category: 'OTHER',
              dataSource: 'USDA',
              status: 'VERIFIED',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: {
                  energyKcal: 86,
                  moisture: 77,
                  crudeProtein: 1.6,
                  crudeFat: 0.1,
                  ash: 1,
                  fiber: 3,
                },
                minerals: { potassium: 337 },
              },
            },
          },
        ],
      },
      {
        id: 'ingredient-potassium-supplement',
        name: '柠檬酸钾胶囊',
        type: 'SUPPLEMENT',
        purchaseUnit: '粒',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-potassium-supplement',
            nutritionFoodId: 'food-potassium-supplement',
            ingredientId: 'ingredient-potassium-supplement',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-potassium-supplement',
              name: 'Potassium citrate capsule',
              nameEn: 'Potassium citrate capsule',
              displayNameZh: '柠檬酸钾胶囊',
              category: 'SUPPLEMENT',
              dataSource: 'MANUAL',
              status: 'VERIFIED',
              nutritionData: {
                meta: { rawBasisType: 'PER_SERVING', servingUnitLabel: '粒' },
                minerals: { potassium: 99 },
              },
            },
          },
        ],
      },
    ]);

    await expect(
      service.listIngredientOptions({
        nutrientKey: 'potassium',
        scenario: 'ADULT_MER_110',
        expressionBasis: 'PER_1000_KCAL_ME',
        page: 1,
        pageSize: 20,
      } as any),
    ).resolves.toMatchObject({
      data: [
        {
          id: 'ingredient-potassium-supplement',
          defaultNutritionFoodId: 'food-potassium-supplement',
          nutrientMatch: {
            nutrientKey: 'potassium',
            label: '钾',
            amount: 0.099,
            unit: 'g',
            basis: 'PER_SERVING',
            displayText: '0.1g/粒',
          },
        },
        {
          id: 'ingredient-sweet-potato',
          nutrientMatch: {
            amount: 0.337,
            basis: 'PER_100_G',
            displayText: '0.34g/100g',
          },
        },
        { id: 'ingredient-celery' },
      ],
      foodData: [
        { id: 'ingredient-sweet-potato' },
        { id: 'ingredient-celery' },
      ],
      supplementTotal: 1,
      foodTotal: 2,
      total: 3,
      hasMore: false,
    });
    expect(targetProvider.getTargets).toHaveBeenCalledWith('ADULT_MER_110');
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: ['FOOD', 'SUPPLEMENT'] },
          nutritionFoodMappings: {
            some: { nutritionFood: { status: 'VERIFIED' } },
          },
        }),
        select: expect.objectContaining({
          nutritionFoodMappings: expect.objectContaining({
            select: expect.objectContaining({
              nutritionFood: expect.objectContaining({
                select: expect.objectContaining({ nutritionData: true }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('lists nutrient supplements separately without requiring energy density', async () => {
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
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-eggshell',
        name: '鸡蛋壳粉',
        type: 'SUPPLEMENT',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-eggshell',
            nutritionFoodId: 'food-eggshell',
            ingredientId: 'ingredient-eggshell',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-eggshell',
              name: 'Eggshell powder',
              nameEn: 'Eggshell powder',
              displayNameZh: '鸡蛋壳粉',
              category: 'SUPPLEMENT',
              dataSource: 'MANUAL',
              status: 'VERIFIED',
              nutritionData: {
                meta: { rawBasisType: 'PER_1_G' },
                minerals: { calcium: 360 },
              },
            },
          },
        ],
      },
      {
        id: 'ingredient-calcium-carbonate',
        name: '碳酸钙粉',
        type: 'SUPPLEMENT',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-calcium-carbonate',
            nutritionFoodId: 'food-calcium-carbonate',
            ingredientId: 'ingredient-calcium-carbonate',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-calcium-carbonate',
              name: 'Calcium carbonate',
              nameEn: 'Calcium carbonate',
              displayNameZh: '碳酸钙粉',
              category: 'SUPPLEMENT',
              dataSource: 'MANUAL',
              status: 'VERIFIED',
              nutritionData: {
                meta: { rawBasisType: 'PER_1_G' },
                minerals: { calcium: 353 },
              },
            },
          },
        ],
      },
      {
        id: 'ingredient-kale',
        name: '羽衣甘蓝',
        type: 'FOOD',
        purchaseUnit: 'g',
        brand: null,
        productModel: null,
        nutritionFoodMappings: [
          {
            id: 'mapping-kale',
            nutritionFoodId: 'food-kale',
            ingredientId: 'ingredient-kale',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-kale',
              name: 'Kale raw',
              nameEn: 'Kale raw',
              displayNameZh: '羽衣甘蓝（生）',
              category: 'OTHER',
              dataSource: 'USDA',
              status: 'VERIFIED',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: {
                  energyKcal: 50,
                  moisture: 86,
                  crudeProtein: 2.5,
                  crudeFat: 0,
                  ash: 1,
                  fiber: 0.5,
                },
                minerals: { calcium: 150 },
              },
            },
          },
        ],
      },
    ]);

    await expect(
      service.listIngredientOptions({
        nutrientKey: 'calcium',
        scenario: 'ADULT_MER_110',
        expressionBasis: 'PER_1000_KCAL_ME',
        page: 1,
        pageSize: 20,
      } as any),
    ).resolves.toMatchObject({
      supplementData: [
        {
          id: 'ingredient-eggshell',
          nutrientMatch: {
            nutrientKey: 'calcium',
            label: '钙',
            amount: 360,
            unit: 'mg',
            basis: 'PER_1_G',
            basisLabel: '/g',
            displayText: '360mg/g',
          },
        },
        {
          id: 'ingredient-calcium-carbonate',
          nutrientMatch: {
            amount: 353,
            basis: 'PER_1_G',
            displayText: '353mg/g',
          },
        },
      ],
      foodData: [
        {
          id: 'ingredient-kale',
          nutrientMatch: {
            amount: 150,
            basis: 'PER_100_G',
            displayText: '150mg/100g',
          },
        },
      ],
      data: [
        { id: 'ingredient-eggshell' },
        { id: 'ingredient-calcium-carbonate' },
        { id: 'ingredient-kale' },
      ],
      supplementTotal: 2,
      foodTotal: 1,
      total: 3,
      hasMore: false,
    });
  });

  it('creates a manual supplement ingredient option with a usable primary nutrition profile', async () => {
    prisma.ingredient.create.mockResolvedValue({
      id: 'ingredient-calcium',
      name: '柠檬酸钙',
      type: 'SUPPLEMENT',
      purchaseUnit: 'g',
      brand: null,
      productModel: null,
      nutritionFoodMappings: [],
    });
    prisma.nutritionFood.create.mockResolvedValue({
      id: 'food-calcium',
      name: '柠檬酸钙 手工补剂档案',
      nameEn: null,
      displayNameZh: '柠檬酸钙 手工补剂档案',
      category: 'SUPPLEMENT',
      dataSource: 'MANUAL',
      status: 'VERIFIED',
      nutritionData: {
        meta: { rawBasisType: 'PER_1_G' },
        minerals: { calcium: 210 },
      },
    });
    prisma.nutritionFoodMapping.create.mockResolvedValue({
      id: 'mapping-calcium',
      nutritionFoodId: 'food-calcium',
      ingredientId: 'ingredient-calcium',
      yieldRate: 1,
      isPrimary: true,
      notes: '小程序手工新增补剂档案',
      ingredient: {
        id: 'ingredient-calcium',
        name: '柠檬酸钙',
        type: 'SUPPLEMENT',
        purchaseUnit: 'g',
      },
    });

    await expect(
      service.createSupplementOption(
        {
          name: ' 柠檬酸钙 ',
          profileName: '柠檬酸钙 手工补剂档案',
          basisType: 'PER_1_G',
          nutrients: {
            'minerals.calcium': 210,
            'vitamins.vitaminD': null,
          },
        } as any,
        'staff-1',
      ),
    ).resolves.toMatchObject({
      id: 'ingredient-calcium',
      name: '柠檬酸钙',
      type: 'SUPPLEMENT',
      defaultNutritionFoodId: 'food-calcium',
      nutritionProfiles: [
        {
          mappingId: 'mapping-calcium',
          nutritionFoodId: 'food-calcium',
          name: '柠檬酸钙 手工补剂档案',
          dataSource: 'MANUAL',
          isPrimary: true,
        },
      ],
    });

    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '柠檬酸钙',
        type: 'SUPPLEMENT',
        baseUnit: 'G',
        purchaseUnit: 'g',
        purchaseToBaseRatio: 1,
        currentPricePerPurchaseUnit: 0,
        procurementEnabled: false,
        diyEnabled: false,
        properties: expect.objectContaining({
          category_type: 'OTHER',
          display_unit: 'g',
          active_nutrients: {
            calcium: { value: 210, unit: 'mg' },
          },
        }),
      }),
    });
    expect(prisma.nutritionFood.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '柠檬酸钙 手工补剂档案',
        displayNameZh: '柠檬酸钙 手工补剂档案',
        category: 'SUPPLEMENT',
        dataSource: 'MANUAL',
        status: 'VERIFIED',
        createdBy: 'staff-1',
        nutritionData: expect.objectContaining({
          meta: expect.objectContaining({
            rawBasisType: 'PER_1_G',
            sourceType: 'MANUAL',
            sourceProvider: '小程序手工录入',
          }),
          minerals: expect.objectContaining({ calcium: 210 }),
        }),
      }),
    });
    expect(prisma.nutritionFoodMapping.create).toHaveBeenCalledWith({
      data: {
        nutritionFoodId: 'food-calcium',
        ingredientId: 'ingredient-calcium',
        yieldRate: 1,
        isPrimary: true,
        notes: '小程序手工新增补剂档案',
      },
      include: expect.any(Object),
    });
  });

  it('uses supplement display units instead of purchase package units in designer ingredient options', async () => {
    prisma.ingredient.count.mockResolvedValue(1);
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-calcium-carbonate',
        name: '碳酸钙粉',
        type: 'SUPPLEMENT',
        unitDisplayLabel: 'g',
        purchaseUnit: '罐',
        brand: 'NOW FOODS',
        productModel: '600mg钙/1.7g，340g/罐',
        properties: { display_unit: 'g' },
        nutritionFoodMappings: [
          {
            id: 'mapping-calcium-carbonate',
            nutritionFoodId: 'food-calcium-carbonate',
            yieldRate: 1,
            isPrimary: true,
            notes: null,
            nutritionFood: {
              id: 'food-calcium-carbonate',
              name: '碳酸钙粉补剂档案',
              nameEn: null,
              displayNameZh: '碳酸钙粉补剂档案',
              category: 'SUPPLEMENT',
              dataSource: 'MANUAL',
              status: 'VERIFIED',
            },
          },
        ],
      },
    ]);

    await expect(
      service.listIngredientOptions({
        search: '碳酸钙',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      data: [
        {
          id: 'ingredient-calcium-carbonate',
          type: 'SUPPLEMENT',
          purchaseUnit: 'g',
        },
      ],
    });
  });

  it('creates a serving-based manual supplement without requiring unit gram weight', async () => {
    prisma.ingredient.create.mockResolvedValue({
      id: 'ingredient-taurine',
      name: '牛磺酸胶囊',
      type: 'SUPPLEMENT',
      purchaseUnit: '粒',
      brand: null,
      productModel: null,
      nutritionFoodMappings: [],
    });
    prisma.nutritionFood.create.mockResolvedValue({
      id: 'food-taurine',
      name: '牛磺酸胶囊 手工补剂档案',
      nameEn: null,
      displayNameZh: '牛磺酸胶囊 手工补剂档案',
      category: 'SUPPLEMENT',
      dataSource: 'MANUAL',
      status: 'VERIFIED',
      nutritionData: {
        meta: { rawBasisType: 'PER_SERVING' },
        aminoAcids: { taurine: 0.5 },
      },
    });
    prisma.nutritionFoodMapping.create.mockResolvedValue({
      id: 'mapping-taurine',
      nutritionFoodId: 'food-taurine',
      ingredientId: 'ingredient-taurine',
      yieldRate: 1,
      isPrimary: true,
      notes: '小程序手工新增补剂档案',
      ingredient: {
        id: 'ingredient-taurine',
        name: '牛磺酸胶囊',
        type: 'SUPPLEMENT',
        purchaseUnit: '粒',
      },
    });

    await service.createSupplementOption(
      {
        name: '牛磺酸胶囊',
        basisType: 'PER_SERVING',
        usageUnit: '粒',
        nutrients: {
          'aminoAcids.taurine': 0.5,
        },
      } as any,
      'staff-1',
    );

    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        purchaseUnit: '粒',
        purchaseToBaseRatio: 1,
        properties: expect.objectContaining({
          display_unit: '粒',
          serving_unit_label: '粒',
          active_nutrients: {
            taurine: { value: 0.5, unit: 'g' },
          },
        }),
      }),
    });
    expect(prisma.nutritionFood.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ediblePortionLabel: '每粒补剂',
        nutritionData: expect.objectContaining({
          meta: expect.objectContaining({
            rawBasisType: 'PER_SERVING',
            servingUnitLabel: '粒',
            servingWeightG: null,
          }),
          aminoAcids: expect.objectContaining({ taurine: 0.5 }),
        }),
      }),
    });
  });

  it('rejects manual supplement creation when all nutrition fields are empty', async () => {
    await expect(
      service.createSupplementOption(
        {
          name: '空白补剂',
          nutrients: {
            'minerals.calcium': null,
            'vitamins.vitaminE': '',
          },
        } as any,
        'staff-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.ingredient.create).not.toHaveBeenCalled();
    expect(prisma.nutritionFood.create).not.toHaveBeenCalled();
    expect(prisma.nutritionFoodMapping.create).not.toHaveBeenCalled();
  });

  it('adds design items with both the selected standard ingredient and nutrition profile', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({ id: 'design-1', createdBy: 'staff-1', status: 'DRAFT' }),
    );
    prisma.nutritionFoodMapping.findFirst.mockResolvedValue({
      id: 'mapping-1',
    });
    prisma.designRecipeItem.create.mockResolvedValue(
      item({
        ingredientId: 'ingredient-mussel',
        nutritionFoodId: 'food-raw',
      }),
    );

    await service.addItem(
      'design-1',
      {
        ingredientId: 'ingredient-mussel',
        nutritionFoodId: 'food-raw',
        weightG: 100,
        sortOrder: 0,
      } as any,
      'staff-1',
    );

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

  it('defaults a new design item to the latest recipe preparation method for that ingredient', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({ id: 'design-1', createdBy: 'staff-1', status: 'DRAFT' }),
    );
    prisma.nutritionFoodMapping.findFirst.mockResolvedValue({
      id: 'mapping-1',
    });
    prisma.recipeItem.findMany.mockResolvedValue([
      {
        ingredientId: 'ingredient-mussel',
        preparationMethod: '蒸熟、压泥',
        recipe: { updatedAt: new Date('2026-05-26T08:00:00.000Z') },
      },
    ]);
    prisma.designRecipeItem.create.mockResolvedValue(
      item({
        ingredientId: 'ingredient-mussel',
        nutritionFoodId: 'food-raw',
        preparationMethod: '蒸熟、压泥',
      }),
    );

    await service.addItem(
      'design-1',
      {
        ingredientId: 'ingredient-mussel',
        nutritionFoodId: 'food-raw',
        weightG: 100,
      } as any,
      'staff-1',
    );

    expect(prisma.designRecipeItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ingredientId: 'ingredient-mussel',
        preparationMethod: '蒸熟、压泥',
      }),
      include: expect.any(Object),
    });
  });

  it('rejects design items when the selected ingredient is not mapped to the nutrition profile', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({ id: 'design-1', createdBy: 'staff-1', status: 'DRAFT' }),
    );
    prisma.nutritionFoodMapping.findFirst.mockResolvedValue(null);

    await expect(
      service.addItem(
        'design-1',
        {
          ingredientId: 'ingredient-oyster',
          nutritionFoodId: 'food-mussel',
          weightG: 100,
        } as any,
        'staff-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.designRecipeItem.create).not.toHaveBeenCalled();
  });

  it('rejects draft metadata edits from another staff user', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({ id: 'design-other', createdBy: 'staff-2', status: 'DRAFT' }),
    );
    prisma.designRecipe.update.mockResolvedValue(
      draft({ id: 'design-other', name: 'stolen' }),
    );

    await expect(
      service.updateDraft('design-other', { name: 'stolen' }, 'staff-1'),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
  });

  it('keeps a series draft assigned to the selected life stage when switching scenarios', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'series-design',
        createdBy: 'staff-1',
        status: 'DRAFT',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        fediafDogScenario: 'ADULT_MER_110',
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      }),
    );
    prisma.designRecipe.update.mockResolvedValue(
      draft({
        id: 'series-design',
        fediafDogScenario: 'ADULT_MER_95',
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
      }),
    );

    await service.updateDraft(
      'series-design',
      { scenario: 'ADULT_MER_95' },
      'staff-1',
    );

    expect(prisma.designRecipe.update).toHaveBeenCalledWith({
      where: { id: 'series-design' },
      data: expect.objectContaining({
        fediafDogScenario: 'ADULT_MER_95',
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
      }),
      include: expect.any(Object),
    });
  });

  it('loads a draft detail for the current staff user', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({ id: 'design-1', createdBy: 'staff-1', status: 'DRAFT' }),
    );

    await expect(
      (service as any).getDraft('design-1', 'staff-1'),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'design-1', createdBy: 'staff-1' }),
    );

    expect(prisma.designRecipe.findUnique).toHaveBeenCalledWith({
      where: { id: 'design-1' },
      include: expect.any(Object),
    });
  });

  it('does not reveal unpublished draft details owned by another staff user', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({ id: 'design-other', createdBy: 'staff-2', status: 'DRAFT' }),
    );

    await expect(
      (service as any).getDraft('design-other', 'staff-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows staff to load published draft details from shared recipe series', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-published',
        createdBy: 'staff-2',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-series-1',
        publishedAt: new Date('2026-05-20T00:00:00.000Z'),
      }),
    );

    await expect(
      (service as any).getDraft('design-published', 'staff-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'design-published',
        publishedRecipeId: 'recipe-series-1',
      }),
    );
  });

  it('does not reveal another customer draft detail', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-other',
        createdBy: 'customer-2',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-other',
        publishedAt: new Date('2026-05-20T00:00:00.000Z'),
      }),
    );

    await expect(
      service.getDraft('design-other', {
        userId: 'customer-1',
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects adding items to another staff user draft', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({ id: 'design-other', createdBy: 'staff-2', status: 'DRAFT' }),
    );
    prisma.nutritionFoodMapping.findFirst.mockResolvedValue({
      id: 'mapping-1',
    });
    prisma.designRecipeItem.create.mockResolvedValue(item());

    await expect(
      service.addItem(
        'design-other',
        {
          ingredientId: 'ingredient-mussel',
          nutritionFoodId: 'food-raw',
          weightG: 100,
        } as any,
        'staff-1',
      ),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.designRecipeItem.create).not.toHaveBeenCalled();
  });

  it('rejects item updates from another staff user', async () => {
    prisma.designRecipeItem.findUnique.mockResolvedValue({
      id: 'item-other',
      designRecipe: {
        id: 'design-other',
        createdBy: 'staff-2',
        status: 'DRAFT',
        publishedRecipeId: null,
        publishedAt: null,
      },
    });
    prisma.designRecipeItem.update.mockResolvedValue(
      item({ id: 'item-other' }),
    );

    await expect(
      service.updateItem('item-other', { weightG: 120 }, 'staff-1'),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.designRecipeItem.update).not.toHaveBeenCalled();
  });

  it('rejects item deletion from another staff user', async () => {
    prisma.designRecipeItem.findUnique.mockResolvedValue({
      id: 'item-other',
      designRecipe: {
        id: 'design-other',
        createdBy: 'staff-2',
        status: 'DRAFT',
        publishedRecipeId: null,
        publishedAt: null,
      },
    });
    prisma.designRecipeItem.delete.mockResolvedValue(
      item({ id: 'item-other' }),
    );

    await expect(service.removeItem('item-other', 'staff-1')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.designRecipeItem.delete).not.toHaveBeenCalled();
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
    prisma.designRecipe.delete.mockResolvedValue(
      draft({ id: 'design-delete' }),
    );

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

  it('lists only drafts created by the current customer', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft({ id: 'customer-design', createdBy: 'customer-1' }),
    ]);

    await expect(
      service.listDrafts({ userId: 'customer-1', role: 'CUSTOMER' }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'customer-design',
        createdBy: 'customer-1',
      }),
    ]);

    expect(prisma.designRecipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdBy: 'customer-1' },
      }),
    );
  });

  it('preserves staff draft listing access to own drafts and published sources', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft({ id: 'staff-design', createdBy: 'staff-1' }),
    ]);

    await service.listDrafts({ userId: 'staff-1', role: 'STAFF' });

    expect(prisma.designRecipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { createdBy: 'staff-1' },
            {
              status: 'PUBLISHED',
              publishedRecipeId: { not: null },
            },
          ],
        },
      }),
    );
  });

  it('lists one current workbench card per published recipe series', async () => {
    const publishedV1 = draft({
      id: 'design-published-v1',
      name: '萝卜绿豆鸭胸猪里脊',
      status: 'PUBLISHED',
      publishedRecipeId: 'recipe-series-1',
      publishedRecipeVersion: 1,
      publishedAt: new Date('2026-05-26T03:00:00.000Z'),
      updatedAt: new Date('2026-05-26T03:00:00.000Z'),
    });
    const publishedV2 = draft({
      id: 'design-published-v2',
      name: '萝卜绿豆鸭胸猪里脊',
      status: 'PUBLISHED',
      publishedRecipeId: 'recipe-series-1',
      publishedRecipeVersion: 2,
      publishedAt: new Date('2026-05-27T02:00:00.000Z'),
      revisionBaseRecipeId: 'recipe-series-1',
      updatedAt: new Date('2026-05-27T02:00:00.000Z'),
    });
    const activeRevision = draft({
      id: 'design-revision',
      name: '萝卜绿豆鸭胸猪里脊 修订',
      status: 'COMPLIANT',
      revisionOfDesignRecipeId: 'design-published-v2',
      revisionBaseRecipeId: 'recipe-series-1',
      updatedAt: new Date('2026-05-27T04:00:00.000Z'),
    });
    const newDraft = draft({
      id: 'new-draft',
      name: '新食谱草稿',
      status: 'DRAFT',
      updatedAt: new Date('2026-05-27T01:00:00.000Z'),
    });
    prisma.designRecipe.findMany.mockResolvedValue([
      activeRevision,
      publishedV2,
      newDraft,
      publishedV1,
    ]);

    await expect(service.listDrafts('staff-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'design-revision',
        revisionChangeState: 'UNCHANGED',
        versionHistory: [
          expect.objectContaining({ id: 'design-revision' }),
          expect.objectContaining({ id: 'design-published-v2' }),
          expect.objectContaining({ id: 'design-published-v1' }),
        ],
      }),
      expect.objectContaining({ id: 'new-draft' }),
    ]);

    expect(prisma.designRecipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { createdBy: 'staff-1' },
            {
              status: 'PUBLISHED',
              publishedRecipeId: { not: null },
            },
          ],
        },
        select: expect.any(Object),
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });

  it('returns lightweight workbench cards without item nutrition or cached assessment payloads', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft({
        id: 'heavy-design',
        items: [item()],
        calculatedNutrition: { large: 'nutrition-cache' },
        complianceStatus: { large: 'assessment-cache' },
        assessmentSummary: { overallStatus: 'NEEDS_REVIEW' },
        missingDataReport: [{ nutrientKey: 'calcium' }],
      }),
    ]);

    const result = await service.listDrafts('staff-1');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'heavy-design',
        name: '成犬鸡肉配方',
        revisionChangeState: 'NOT_REVISION',
      }),
    ]);
    expect(result[0]).not.toHaveProperty('items');
    expect(result[0]).not.toHaveProperty('calculatedNutrition');
    expect(result[0]).not.toHaveProperty('complianceStatus');
    expect(result[0]).not.toHaveProperty('assessmentSummary');
    expect(result[0]).not.toHaveProperty('missingDataReport');
    expect(prisma.designRecipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          items: expect.objectContaining({
            select: expect.objectContaining({
              nutritionFoodId: true,
              weightG: true,
            }),
          }),
        }),
      }),
    );
  });

  it('lists backfilled published source drafts for any staff user', async () => {
    const backfilledPublished = draft({
      id: 'design-backfilled',
      createdBy: 'recipe-designer-backfill',
      status: 'PUBLISHED',
      publishedRecipeId: 'recipe-series-1',
      publishedRecipeVersion: 11,
      publishedAt: new Date('2026-05-27T03:00:00.000Z'),
    });
    prisma.designRecipe.findMany.mockResolvedValue([backfilledPublished]);

    await expect(service.listDrafts('staff-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'design-backfilled',
        publishedRecipeId: 'recipe-series-1',
        revisionChangeState: 'NOT_REVISION',
      }),
    ]);
  });

  it('marks active revision cards as changed when publishable recipe inputs differ', async () => {
    const baseItem = item({
      id: 'item-base',
      ingredientId: 'ingredient-1',
      nutritionFoodId: 'food-1',
      weightG: 100,
      includeInAssessment: true,
      preparationMethod: '蒸熟',
      sortOrder: 0,
    });
    const changedItem = item({
      id: 'item-revision',
      ingredientId: 'ingredient-1',
      nutritionFoodId: 'food-1',
      weightG: 120,
      includeInAssessment: true,
      preparationMethod: '蒸熟',
      sortOrder: 0,
    });
    const published = draft({
      id: 'design-published',
      name: '鸡肉成犬维护',
      status: 'PUBLISHED',
      publishedRecipeId: 'recipe-series-1',
      publishedRecipeVersion: 1,
      publishedAt: new Date('2026-05-26T03:00:00.000Z'),
      updatedAt: new Date('2026-05-26T03:00:00.000Z'),
      items: [baseItem],
    });
    const activeRevision = draft({
      id: 'design-revision',
      name: '鸡肉成犬维护 修订',
      status: 'COMPLIANT',
      revisionOfDesignRecipeId: 'design-published',
      revisionBaseRecipeId: 'recipe-series-1',
      updatedAt: new Date('2026-05-27T04:00:00.000Z'),
      items: [changedItem],
    });
    prisma.designRecipe.findMany.mockResolvedValue([activeRevision, published]);

    await expect(service.listDrafts('staff-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'design-revision',
        revisionChangeState: 'CHANGED',
      }),
    ]);
  });

  it('lists the latest published card when a recipe series has no active revision draft', async () => {
    const publishedV1 = draft({
      id: 'design-published-v1',
      name: '萝卜绿豆鸭胸猪里脊',
      status: 'PUBLISHED',
      publishedRecipeId: 'recipe-series-1',
      publishedRecipeVersion: 1,
      publishedAt: new Date('2026-05-26T03:00:00.000Z'),
      updatedAt: new Date('2026-05-26T03:00:00.000Z'),
    });
    const publishedV2 = draft({
      id: 'design-published-v2',
      name: '萝卜绿豆鸭胸猪里脊',
      status: 'PUBLISHED',
      publishedRecipeId: 'recipe-series-1',
      publishedRecipeVersion: 2,
      publishedAt: new Date('2026-05-27T02:00:00.000Z'),
      revisionBaseRecipeId: 'recipe-series-1',
      updatedAt: new Date('2026-05-27T02:00:00.000Z'),
    });
    prisma.designRecipe.findMany.mockResolvedValue([publishedV2, publishedV1]);

    await expect(service.listDrafts('staff-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'design-published-v2',
        publishedRecipeVersion: 2,
      }),
    ]);
  });

  it('creates an editable revision draft from a published design recipe', async () => {
    const sourcePublishedAt = new Date('2026-05-27T03:00:00.000Z');
    const sourceItem = item({
      id: 'item-source',
      ingredientId: 'ingredient-source',
      nutritionFoodId: 'food-source',
      weightG: 88,
      includeInAssessment: false,
      preparationMethod: '蒸熟',
      nutrientTargetKey: 'calcium',
      nutrientTargetValue: 1200,
      sortOrder: 7,
    });
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-published',
        name: '鸡肉成犬维护 修订',
        version: 1,
        createdBy: 'staff-1',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-series-1',
        publishedRecipeVersion: 2,
        publishedAt: sourcePublishedAt,
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        isCompliant: true,
        reviewStatus: 'NONE',
        reviewNote: 'approved',
        items: [sourceItem],
      }),
    );
    prisma.designRecipe.aggregate.mockResolvedValue({
      _max: { version: 3 },
    });
    prisma.designRecipe.create.mockResolvedValue(
      draft({
        id: 'design-revision',
        name: '鸡肉成犬维护 修订',
        version: 4,
        createdBy: 'staff-1',
        status: 'DRAFT',
        publishedRecipeId: null,
        publishedRecipeVersion: null,
        publishedAt: null,
        revisionOfDesignRecipeId: 'design-published',
        revisionBaseRecipeId: 'recipe-series-1',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        items: [sourceItem],
      }),
    );

    await expect(
      service.createRevisionDraft('design-published', 'staff-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'design-revision',
        status: 'DRAFT',
        revisionBaseRecipeId: 'recipe-series-1',
      }),
    );

    expect(prisma.designRecipe.aggregate).toHaveBeenCalledWith({
      where: { name: '鸡肉成犬维护 修订' },
      _max: { version: true },
    });
    expect(prisma.designRecipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '鸡肉成犬维护 修订',
        version: 4,
        status: 'DRAFT',
        fediafDogScenario: 'ADULT_MER_110',
        nutritionStandard: 'FEDIAF_2025',
        createdBy: 'staff-1',
        revisionOfDesignRecipeId: 'design-published',
        revisionBaseRecipeId: 'recipe-series-1',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        publishedAt: null,
        publishedRecipeId: null,
        publishedRecipeVersion: null,
        isCompliant: false,
        reviewStatus: 'NONE',
        reviewNote: null,
        items: {
          create: [
            expect.objectContaining({
              ingredientId: 'ingredient-source',
              nutritionFoodId: 'food-source',
              weightG: 88,
              includeInAssessment: false,
              preparationMethod: '蒸熟',
              nutrientTargetKey: 'calcium',
              nutrientTargetValue: 1200,
              sortOrder: 7,
            }),
          ],
        },
      }),
      include: expect.any(Object),
    });
  });

  it('creates a user-owned revision from a backfilled published source draft', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-backfilled',
        name: '鸡肉成犬维护',
        createdBy: 'recipe-designer-backfill',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-series-1',
        publishedRecipeVersion: 11,
        publishedAt: new Date('2026-05-27T03:00:00.000Z'),
        items: [item({ id: 'item-source' })],
      }),
    );
    prisma.designRecipe.findFirst.mockResolvedValue(null);
    prisma.designRecipe.create.mockResolvedValue(
      draft({
        id: 'design-revision',
        name: '鸡肉成犬维护 修订',
        createdBy: 'staff-1',
        status: 'DRAFT',
        revisionOfDesignRecipeId: 'design-backfilled',
        revisionBaseRecipeId: 'recipe-series-1',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      }),
    );

    await expect(
      service.createRevisionDraft('design-backfilled', 'staff-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'design-revision',
        createdBy: 'staff-1',
        revisionBaseRecipeId: 'recipe-series-1',
      }),
    );

    expect(prisma.designRecipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdBy: 'staff-1',
        revisionOfDesignRecipeId: 'design-backfilled',
        revisionBaseRecipeId: 'recipe-series-1',
      }),
      include: expect.any(Object),
    });
  });

  it('reuses an existing active revision draft instead of creating duplicates', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-published',
        name: '鸡肉成犬维护',
        createdBy: 'staff-1',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-series-1',
        publishedRecipeVersion: 2,
        publishedAt: new Date('2026-05-27T03:00:00.000Z'),
      }),
    );
    prisma.designRecipe.findFirst.mockResolvedValue(
      draft({
        id: 'design-existing-revision',
        name: '鸡肉成犬维护 修订',
        createdBy: 'staff-1',
        status: 'DRAFT',
        revisionOfDesignRecipeId: 'design-published',
        revisionBaseRecipeId: 'recipe-series-1',
      }),
    );

    await expect(
      service.createRevisionDraft('design-published', 'staff-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'design-existing-revision',
        revisionBaseRecipeId: 'recipe-series-1',
      }),
    );

    expect(prisma.designRecipe.findFirst).toHaveBeenCalledWith({
      where: {
        createdBy: 'staff-1',
        revisionBaseRecipeId: 'recipe-series-1',
        status: { not: 'PUBLISHED' },
        publishedRecipeId: null,
        publishedAt: null,
      },
      include: expect.any(Object),
      orderBy: { updatedAt: 'desc' },
    });
    expect(prisma.designRecipe.aggregate).not.toHaveBeenCalled();
    expect(prisma.designRecipe.create).not.toHaveBeenCalled();
  });

  it('does not reuse a stale published revision marker as an editable revision draft', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-published',
        name: '鸡肉成犬维护',
        createdBy: 'staff-1',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-series-1',
        publishedRecipeVersion: 2,
        publishedAt: new Date('2026-05-27T03:00:00.000Z'),
        items: [item({ id: 'item-source' })],
      }),
    );
    prisma.designRecipe.findFirst.mockResolvedValue(null);
    prisma.designRecipe.create.mockResolvedValue(
      draft({
        id: 'design-new-revision',
        name: '鸡肉成犬维护 修订',
        createdBy: 'staff-1',
        status: 'DRAFT',
        revisionOfDesignRecipeId: 'design-published',
        revisionBaseRecipeId: 'recipe-series-1',
      }),
    );

    await expect(
      service.createRevisionDraft('design-published', 'staff-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'design-new-revision',
        status: 'DRAFT',
        publishedRecipeId: null,
        publishedAt: null,
      }),
    );

    expect(prisma.designRecipe.findFirst).toHaveBeenCalledWith({
      where: {
        createdBy: 'staff-1',
        revisionBaseRecipeId: 'recipe-series-1',
        status: { not: 'PUBLISHED' },
        publishedRecipeId: null,
        publishedAt: null,
      },
      include: expect.any(Object),
      orderBy: { updatedAt: 'desc' },
    });
    expect(prisma.designRecipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'DRAFT',
        publishedRecipeId: null,
        publishedAt: null,
        revisionOfDesignRecipeId: 'design-published',
        revisionBaseRecipeId: 'recipe-series-1',
      }),
      include: expect.any(Object),
    });
  });

  it('rejects customer revision creation for formal recipes', async () => {
    await expect(
      service.createRevisionDraft('design-published', {
        userId: 'customer-1',
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow('只有员工可以修订正式食谱');

    expect(prisma.designRecipe.findUnique).not.toHaveBeenCalled();
    expect(prisma.designRecipe.create).not.toHaveBeenCalled();
  });

  it('does not create a revision from a customer-created published-looking draft', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-customer-published',
        createdBy: 'customer-1',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-customer',
        publishedAt: new Date('2026-05-27T03:00:00.000Z'),
      }),
    );

    await expect(
      service.createRevisionDraft('design-customer-published', {
        userId: 'staff-1',
        role: 'STAFF',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.designRecipe.findFirst).not.toHaveBeenCalled();
    expect(prisma.designRecipe.create).not.toHaveBeenCalled();
  });

  it('rejects publishing an unchanged revision draft', async () => {
    const sourceItem = item({
      id: 'item-source',
      ingredientId: 'ingredient-source',
      nutritionFoodId: 'food-source',
      weightG: 88,
      includeInAssessment: true,
      preparationMethod: '蒸熟',
      sortOrder: 7,
    });
    const published = draft({
      id: 'design-published',
      name: '鸡肉成犬维护',
      status: 'PUBLISHED',
      publishedRecipeId: 'recipe-series-1',
      publishedRecipeVersion: 2,
      publishedAt: new Date('2026-05-27T03:00:00.000Z'),
      items: [sourceItem],
    });
    const revision = draft({
      id: 'design-revision',
      name: '鸡肉成犬维护 修订',
      status: 'COMPLIANT',
      revisionOfDesignRecipeId: 'design-published',
      revisionBaseRecipeId: 'recipe-series-1',
      items: [
        item({
          id: 'item-revision',
          ingredientId: 'ingredient-source',
          nutritionFoodId: 'food-source',
          weightG: 88,
          includeInAssessment: true,
          preparationMethod: '蒸熟',
          sortOrder: 7,
        }),
      ],
    });
    prisma.designRecipe.findUnique.mockResolvedValue(revision);
    prisma.designRecipe.findFirst.mockResolvedValue(published);

    await expect(
      service.publishDraft(
        'design-revision',
        { name: '鸡肉成犬维护 修订' },
        adminAccess,
      ),
    ).rejects.toThrow('当前修订与已发布版本一致，无需发布新版本');

    expect(targetProvider.getTargets).not.toHaveBeenCalled();
    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });

  it('rejects revision creation for unpublished design recipes', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-draft',
        createdBy: 'staff-1',
        status: 'DRAFT',
        publishedRecipeId: null,
        publishedAt: null,
      }),
    );

    await expect(
      service.createRevisionDraft('design-draft', 'staff-1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.designRecipe.create).not.toHaveBeenCalled();
  });

  it('rejects direct customer publishing before formal recipe side effects', async () => {
    await expect(
      service.publishDraft(
        'design-customer',
        { name: '客户私有草稿' },
        { userId: 'customer-1', role: 'CUSTOMER' },
      ),
    ).rejects.toThrow('只有管理员可以发布正式食谱');

    expect(prisma.recipe.create).not.toHaveBeenCalled();
    expect(prisma.designRecipePublishSnapshot.create).not.toHaveBeenCalled();
    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
  });

  it('rejects admin publishing of customer-created private drafts', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-customer',
        name: '客户私有草稿',
        createdBy: 'customer-1',
        status: 'DRAFT',
        isCompliant: true,
        items: [item()],
      }),
    );

    await expect(
      service.publishDraft(
        'design-customer',
        { name: '客户私有草稿' },
        adminAccess,
      ),
    ).rejects.toThrow(
      new BadRequestException('用户私有草稿不能发布为正式食谱'),
    );

    expect(targetProvider.getTargets).not.toHaveBeenCalled();
    expect(prisma.recipe.create).not.toHaveBeenCalled();
    expect(prisma.designRecipePublishSnapshot.create).not.toHaveBeenCalled();
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

    const assessment = await service.assessDraft('design-1', 'staff-1');

    expect(assessment.totalWeightG).toBe(100);
    expect(assessment.energyDensityKcalPerKg).toBe(1310);
    expect(assessment.items[0]).toEqual(
      expect.objectContaining({ id: 'item-1', ratioPercent: 100 }),
    );
    expect(prisma.designRecipe.update).toHaveBeenCalledWith({
      where: { id: 'design-1' },
      data: expect.objectContaining({
        totalWeightG: 100,
        energyDensityKcalPerKg: 1310,
        calculatedNutrition: assessment.nutrients,
        complianceStatus: assessment.groupedEntries,
        status: 'COMPLIANT',
        reviewStatus: 'NONE',
        isCompliant: true,
      }),
    });
  });

  it('keeps an untouched empty draft in draft state after automatic assessment', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'empty-stage-design',
        items: [],
        status: 'DRAFT',
        reviewStatus: 'NONE',
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.designRecipe.update.mockResolvedValue(draft());

    const assessment = await service.assessDraft('empty-stage-design', 'staff-1');

    expect(assessment.totalWeightG).toBe(0);
    expect(prisma.designRecipe.update).toHaveBeenCalledWith({
      where: { id: 'empty-stage-design' },
      data: expect.objectContaining({
        totalWeightG: 0,
        status: 'DRAFT',
        reviewStatus: 'NONE',
        isCompliant: false,
      }),
    });
  });

  it('returns grouped assessment data without the duplicate flat entries payload', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.designRecipe.update.mockResolvedValue(draft());

    const assessment = await service.assessDraft('design-1', 'staff-1');

    expect(assessment.groupedEntries.length).toBeGreaterThan(0);
    expect(assessment).not.toHaveProperty('entries');
    expect(prisma.designRecipe.update).toHaveBeenCalledWith({
      where: { id: 'design-1' },
      data: expect.objectContaining({
        complianceStatus: assessment.groupedEntries,
        assessmentSummary: expect.objectContaining({
          rawEntryCount: expect.any(Number),
        }),
      }),
    });
  });

  it('excludes disabled draft items from nutrition assessment without deleting them', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        items: [
          item({ id: 'item-included', weightG: 100 }),
          item({
            id: 'item-disabled',
            weightG: 900,
            includeInAssessment: false,
            nutritionFood: {
              id: 'food-disabled',
              name: '临时排除原料',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: {
                  energyKcal: 1000,
                  moisture: 0,
                  crudeProtein: 0,
                  crudeFat: 100,
                  ash: 0,
                  fiber: 0,
                },
                minerals: { calcium: 999999, phosphorus: 1 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              mappings: [
                { ingredientId: 'ingredient-disabled', isPrimary: true },
              ],
            },
          }),
        ],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.designRecipe.update.mockResolvedValue(draft());

    const assessment = await service.assessDraft('design-1', 'staff-1');

    expect(assessment.totalWeightG).toBe(100);
    expect(assessment.items.map((candidate) => candidate.id)).toEqual([
      'item-included',
    ]);
    expect(assessment.nutrients.calcium.per1000Kcal).toBeLessThan(5000);
    expect(prisma.designRecipe.update).toHaveBeenCalledWith({
      where: { id: 'design-1' },
      data: expect.objectContaining({
        totalWeightG: 100,
      }),
    });
  });

  it('does not overwrite published design recipe state while refreshing assessment', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-published',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-series-1',
        publishedRecipeVersion: 3,
        publishedAt: new Date('2026-05-27T03:00:00.000Z'),
        items: [item({ id: 'item-published', weightG: 100 })],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());

    const assessment = await service.assessDraft('design-published', 'staff-1');

    expect(assessment.totalWeightG).toBe(100);
    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
  });

  it('does not let customers assess or mutate another customer private draft', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-other',
        createdBy: 'customer-2',
        items: [item({ id: 'item-other', weightG: 100 })],
      }),
    );

    await expect(
      service.assessDraft('design-other', {
        userId: 'customer-1',
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
  });

  it('uses supplement display units for legacy serving-based assessment profiles', async () => {
    const seaweedIngredient = {
      id: 'ingredient-seaweed',
      name: '海藻粉',
      type: 'SUPPLEMENT',
      unitDisplayLabel: '平勺',
      purchaseUnit: '瓶',
      properties: { display_unit: '平勺' },
    };
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        items: [
          item(),
          item({
            id: 'item-seaweed',
            ingredientId: 'ingredient-seaweed',
            weightG: 0.2,
            ingredient: seaweedIngredient,
            nutritionFood: {
              id: 'food-seaweed',
              name: '海藻粉补剂档案',
              nutritionData: {
                meta: { rawBasisType: 'PER_SERVING' },
                macros: {},
                minerals: { iodine: 450 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              mappings: [
                {
                  ingredientId: 'ingredient-seaweed',
                  isPrimary: true,
                  ingredient: seaweedIngredient,
                },
              ],
            },
          }),
        ],
      }),
    );
    targetProvider.getTargets.mockResolvedValue([
      {
        nutrientKey: 'iodine',
        label: '碘',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'ug',
        minValue: 100,
        maxValue: null,
        fieldPaths: ['minerals.iodine'],
      },
    ]);
    prisma.designRecipe.update.mockResolvedValue(draft());

    const assessment = await service.assessDraft('design-1', 'staff-1');
    const iodine = assessment.groupedEntries.find(
      (entry) => entry.nutrientKey === 'iodine',
    );

    expect(iodine).toEqual(expect.objectContaining({ status: 'COMPLIANT' }));
    expect(iodine?.currentValue).toBeCloseTo(687.023, 3);
    expect(iodine?.contributors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'item-seaweed',
          amount: 90,
          amountUnit: '平勺',
          missing: false,
        }),
      ]),
    );
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

    const assessment = await service.assessDraft('design-1', 'staff-1');

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
              nutritionData: {
                ...item().nutritionFood.nutritionData,
                minerals: { calcium: 10, phosphorus: 500 },
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

    await expect(
      service.publishDraft(
        'design-1',
        { name: '钙不足审核食谱', reviewNote: '   ' },
        adminAccess,
      ),
    ).rejects.toThrow(new BadRequestException('需审核配方必须填写审核说明'));
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
        { name: '能量缺失测试食谱', reviewNote: '人工审核钙数据，但能量缺失' },
        adminAccess,
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
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
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
      { name: '三文鱼成犬维护' },
      adminAccess,
    );

    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipeId: 'design-1',
        name: '三文鱼成犬维护',
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
    expect(
      prisma.recipe.create.mock.calls[0][0].data.items.create[0],
    ).not.toEqual(expect.objectContaining({ ingredientId: 'food-1' }));
  });

  it('does not store nutrient target context on food items when adding from a nutrient search', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-1',
        createdBy: 'staff-1',
        status: 'DRAFT',
      }),
    );
    prisma.nutritionFoodMapping.findFirst.mockResolvedValue({
      id: 'mapping-food-1',
    });
    prisma.designRecipeItem.create.mockResolvedValue(
      item({
        id: 'food-item-1',
        ingredientId: 'food-hemp',
      }),
    );

    await service.addItem(
      'design-1',
      {
        ingredientId: 'food-hemp',
        nutritionFoodId: 'nutrition-hemp',
        weightG: 1,
        nutrientTargetKey: 'magnesium',
        nutrientTargetValue: 0.2,
      },
      { userId: 'staff-1', role: 'STAFF' },
    );

    expect(prisma.designRecipeItem.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({
        nutrientTargetKey: 'magnesium',
        nutrientTargetValue: 0.2,
      }),
      include: expect.any(Object),
    });
  });

  it('publishes revision drafts as the next version of the original formal recipe', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'design-revision',
        name: '三文鱼成犬维护 修订',
        isCompliant: true,
        revisionOfDesignRecipeId: 'design-published',
        revisionBaseRecipeId: 'recipe-series-1',
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.recipe.findFirst.mockResolvedValue({
      recipeId: 'recipe-series-1',
      version: 2,
    });
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-v3',
      recipeId: 'recipe-series-1',
      version: 3,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-v3',
    });
    prisma.designRecipe.update.mockResolvedValue(
      draft({
        id: 'design-revision',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-series-1',
        publishedRecipeVersion: 3,
      }),
    );

    await service.publishDraft(
      'design-revision',
      { name: '三文鱼成犬维护' },
      adminAccess,
    );

    expect(prisma.recipe.findFirst).toHaveBeenCalledWith({
      where: { recipeId: 'recipe-series-1' },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipeId: 'recipe-series-1',
        version: 3,
        name: '三文鱼成犬维护',
      }),
    });
    expect(prisma.designRecipePublishSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        designRecipeId: 'design-revision',
        recipeId: 'recipe-series-1',
        recipeVersion: 3,
      }),
    });
    expect(prisma.designRecipe.update).toHaveBeenLastCalledWith({
      where: { id: 'design-revision' },
      data: expect.objectContaining({
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-series-1',
        publishedRecipeVersion: 3,
      }),
      include: expect.any(Object),
    });
  });

  it('inherits existing presentation media when publishing a designer revision', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'adult-series-revision',
        name: '燕麦鳕鱼猪肉 修订',
        isCompliant: true,
        seriesId: 'series-oat-cod-pork',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        revisionBaseRecipeId: 'adult-stage-recipe',
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.recipe.findFirst
      .mockResolvedValueOnce({
        recipeId: 'adult-stage-recipe',
        version: 5,
      })
      .mockResolvedValueOnce({
        coverImageUrl:
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-cover.jpg',
        coverTitle: '燕麦鳕鱼猪肉',
        detailImages: [
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-detail.jpg',
        ],
        videoUrl: 'https://video.sevenkitchen.cloud/oat-cod-pork.mp4',
      });
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-adult-v6',
      recipeId: 'adult-stage-recipe',
      version: 6,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-adult-v6',
    });
    prisma.designRecipe.update.mockResolvedValue(
      draft({
        id: 'adult-series-revision',
        status: 'PUBLISHED',
        publishedRecipeId: 'adult-stage-recipe',
        publishedRecipeVersion: 6,
      }),
    );

    await service.publishDraft(
      'adult-series-revision',
      { name: '燕麦鳕鱼猪肉' },
      adminAccess,
    );

    expect(prisma.recipe.findFirst).toHaveBeenNthCalledWith(2, {
      where: { recipeId: 'adult-stage-recipe', version: 5 },
      select: {
        id: true,
        coverImageUrl: true,
        coverTitle: true,
        detailImages: true,
        viewCount: true,
        favoriteCount: true,
        diyGenCount: true,
        likeCount: true,
        salesCount: true,
        videoUrl: true,
      },
    });
    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipeId: 'adult-stage-recipe',
        version: 6,
        coverImageUrl:
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-cover.jpg',
        coverTitle: '燕麦鳕鱼猪肉',
        detailImages: [
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-detail.jpg',
        ],
        videoUrl: 'https://video.sevenkitchen.cloud/oat-cod-pork.mp4',
      }),
    });
  });

  it('inherits operational counters and moves favorites when publishing a designer revision', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'adult-series-revision',
        name: '燕麦鳕鱼猪肉 修订',
        isCompliant: true,
        revisionBaseRecipeId: 'adult-stage-recipe',
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.recipe.findFirst
      .mockResolvedValueOnce({
        recipeId: 'adult-stage-recipe',
        version: 5,
      })
      .mockResolvedValueOnce({
        id: 'recipe-row-adult-v5',
        viewCount: 231,
        favoriteCount: 20,
        diyGenCount: 26,
        likeCount: 3,
        salesCount: 7,
        coverImageUrl:
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-cover.jpg',
        coverTitle: null,
        detailImages: [
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-detail.jpg',
        ],
        videoUrl: null,
      });
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-adult-v6',
      recipeId: 'adult-stage-recipe',
      version: 6,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-adult-v6',
    });
    prisma.favoriteRecipe.updateMany.mockResolvedValue({ count: 20 });
    prisma.designRecipe.update.mockResolvedValue(
      draft({
        id: 'adult-series-revision',
        status: 'PUBLISHED',
        publishedRecipeId: 'adult-stage-recipe',
        publishedRecipeVersion: 6,
      }),
    );

    await service.publishDraft(
      'adult-series-revision',
      { name: '燕麦鳕鱼猪肉 修订' },
      adminAccess,
    );

    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipeId: 'adult-stage-recipe',
        version: 6,
        name: '燕麦鳕鱼猪肉',
        viewCount: 231,
        favoriteCount: 20,
        diyGenCount: 26,
        likeCount: 3,
        salesCount: 7,
        detailImages: [
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-detail.jpg',
        ],
      }),
    });
    expect(prisma.designRecipePublishSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        snapshotData: expect.objectContaining({
          designRecipe: expect.objectContaining({
            name: '燕麦鳕鱼猪肉',
          }),
        }),
      }),
    });
    expect(prisma.designRecipe.update).toHaveBeenCalledWith({
      where: { id: 'adult-series-revision' },
      data: expect.objectContaining({
        status: 'PUBLISHED',
      }),
      include: expect.any(Object),
    });
    expect(
      prisma.designRecipe.update.mock.calls[0][0].data.name,
    ).toBeUndefined();
    expect(prisma.favoriteRecipe.updateMany).toHaveBeenCalledWith({
      where: { recipeId: 'recipe-row-adult-v5' },
      data: { recipeId: 'recipe-row-adult-v6' },
    });
  });

  it('inherits series presentation media when publishing a new life-stage recipe', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'senior-series-design',
        name: '燕麦鳕鱼猪肉',
        isCompliant: true,
        seriesId: 'series-oat-cod-pork',
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        fediafDogScenario: 'ADULT_MER_95',
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.recipe.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        coverImageUrl:
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-cover.jpg',
        coverTitle: '燕麦鳕鱼猪肉',
        detailImages: [],
        videoUrl: null,
      });
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-senior-v1',
      recipeId: 'senior-series-design',
      version: 1,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-senior-v1',
    });
    prisma.designRecipe.update.mockResolvedValue(
      draft({
        id: 'senior-series-design',
        status: 'PUBLISHED',
        publishedRecipeId: 'senior-series-design',
        publishedRecipeVersion: 1,
      }),
    );

    await service.publishDraft(
      'senior-series-design',
      { name: '燕麦鳕鱼猪肉' },
      adminAccess,
    );

    expect(prisma.recipe.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        seriesId: 'series-oat-cod-pork',
        coverImageUrl: { not: null },
      },
      orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }],
      select: {
        coverImageUrl: true,
        coverTitle: true,
        detailImages: true,
        videoUrl: true,
      },
    });
    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipeId: 'senior-series-design',
        version: 1,
        coverImageUrl:
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-cover.jpg',
        coverTitle: '燕麦鳕鱼猪肉',
      }),
    });
  });

  it('publishes series drafts with formal recipe series linkage', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'series-design',
        name: '牛肉南瓜鲜食',
        isCompliant: true,
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'series-design',
      version: 1,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-1',
    });
    prisma.designRecipe.update.mockResolvedValue(
      draft({ id: 'series-design', status: 'PUBLISHED' }),
    );

    await service.publishDraft(
      'series-design',
      { name: '牛肉南瓜鲜食' },
      adminAccess,
    );

    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipeId: 'series-design',
        name: '牛肉南瓜鲜食',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      }),
    });
  });

  it('publishes series drafts only for the edited series life stage when legacy applicable stages remain', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'adult-series-design',
        name: '燕麦鳕鱼猪肉 修订',
        isCompliant: true,
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        fediafDogScenario: 'ADULT_MER_110',
        applicableLifeStages: ['ADULT', 'SENIOR'],
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-adult-v6',
      recipeId: 'adult-stage-recipe',
      version: 6,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-adult-v6',
    });
    prisma.designRecipe.update.mockResolvedValue(
      draft({ id: 'adult-series-design', status: 'PUBLISHED' }),
    );

    await service.publishDraft(
      'adult-series-design',
      { name: '燕麦鳕鱼猪肉' },
      adminAccess,
    );

    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      }),
    });
  });

  it('publishes a new life-stage draft in an existing series with its own formal recipe id', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        id: 'senior-design',
        name: '牛肉南瓜鲜食',
        version: 4,
        isCompliant: true,
        seriesId: 'series-1',
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        fediafDogScenario: 'ADULT_MER_95',
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.recipe.findFirst.mockResolvedValue(null);
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-senior',
      recipeId: 'senior-design',
      version: 1,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-senior',
    });
    prisma.designRecipe.update.mockResolvedValue(
      draft({
        id: 'senior-design',
        status: 'PUBLISHED',
        publishedRecipeId: 'senior-design',
        publishedRecipeVersion: 1,
      }),
    );

    await service.publishDraft(
      'senior-design',
      { name: '牛肉南瓜鲜食' },
      adminAccess,
    );

    expect(prisma.recipe.findFirst).toHaveBeenCalledWith({
      where: {
        seriesId: 'series-1',
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      },
      orderBy: { version: 'desc' },
      select: { recipeId: true, version: true },
    });
    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipeId: 'senior-design',
        version: 1,
        seriesId: 'series-1',
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      }),
    });
    expect(prisma.designRecipe.update).toHaveBeenLastCalledWith({
      where: { id: 'senior-design' },
      data: expect.objectContaining({
        publishedRecipeId: 'senior-design',
        publishedRecipeVersion: 1,
      }),
      include: expect.any(Object),
    });
  });

  it.each([
    ['EARLY_GROWTH_REPRODUCTION', ['PUPPY_UNDER_14_WEEKS']],
    ['LATE_GROWTH', ['PUPPY_14_WEEKS_PLUS']],
    ['ADULT_MER_95', ['LOW_ACTIVITY_ADULT_OR_SENIOR']],
    ['ADULT_MER_110', ['HIGH_ACTIVITY_ADULT']],
    ['REPRODUCTION', ['REPRODUCTION']],
  ])(
    'publishes %s drafts with the precise backend recipe life stage',
    async (scenario, expectedLifeStages) => {
      prisma.designRecipe.findUnique.mockResolvedValue(
        draft({
          fediafDogScenario: scenario,
          applicableLifeStages: [],
          isCompliant: true,
          items: [item()],
        }),
      );
      targetProvider.getTargets.mockResolvedValue(compliantTargets());
      prisma.designRecipe.update.mockResolvedValue(
        draft({ status: 'PUBLISHED' }),
      );
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
        { name: '阶段映射食谱' },
        adminAccess,
      );

      expect(prisma.recipe.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          applicableLifeStages: expectedLifeStages,
        }),
      );
    },
  );

  it('publishes admin-editable recipe metadata and nutrition summary', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        fediafDogScenario: 'REPRODUCTION',
        targetHealthTags: ['tag-skin', 'tag-weight'],
        applicableLifeStages: [],
        isCompliant: true,
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
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
      { name: '三文鱼繁殖期配方' },
      adminAccess,
    );

    const createData = prisma.recipe.create.mock.calls[0][0].data;
    expect(createData.status).toBe('DRAFT');
    expect(createData.designSource).toBe('Setar');
    expect(createData.productionLossRate).toBe(1.05);
    expect(createData.batchLaborHours).toBe(2);
    expect(createData.applicableLifeStages).toEqual(['REPRODUCTION']);
    expect(createData.healthTagAssignments).toEqual({
      create: [{ healthTagId: 'tag-skin' }, { healthTagId: 'tag-weight' }],
    });
    expect(createData.nutritionDetailedData).toEqual(
      expect.objectContaining({
        source: 'SETAR_RECIPE_DESIGNER',
        schemaVersion: 1,
        standard: 'FEDIAF_2025',
        scenario: 'REPRODUCTION',
        summary: {
          moisture_pct: 70,
          protein_dm_pct: 66.67,
          fat_dm_pct: 10,
          fiber_dm_pct: 0,
          ash_dm_pct: 3.33,
          carbs_dm_pct: 0,
          ca_p_ratio: 1.2,
          energy_density_kcal_per_kg: 1310,
        },
        report: expect.objectContaining({
          ingredientRows: [
            expect.objectContaining({
              ingredientName: '鸡胸肉',
              amountLabel: '100g',
              weightPercentLabel: '100%',
            }),
          ],
          macroRows: expect.arrayContaining([
            expect.objectContaining({
              key: 'crudeProtein',
              name: '蛋白质',
              dryMatterLabel: '66.67%',
            }),
          ]),
          energyDensityRows: expect.arrayContaining([
            expect.objectContaining({
              label: '每公斤配方',
              value: '1310 kcal/kg',
            }),
          ]),
          nutrientSections: expect.objectContaining({
            minerals: expect.objectContaining({
              title: '微量元素',
              dryMatterHeader: '/100gDM',
              rows: expect.arrayContaining([
                expect.objectContaining({
                  key: 'calcium',
                  name: '钙',
                  unit: 'mg',
                  status: 'COMPLIANT',
                }),
              ]),
            }),
          }),
        }),
      }),
    );
    expect(createData.nutritionDetailedData.protein_dm_pct).toBe(66.67);
  });

  it('rounds published energy density and stores combination nutrients in report sections', async () => {
    const baseItem = item();
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        isCompliant: true,
        items: [
          item({
            nutritionFood: {
              ...baseItem.nutritionFood,
              displayNameZh: '鲜鸡胸肉（生）',
              nutritionData: {
                ...baseItem.nutritionFood.nutritionData,
                macros: {
                  ...baseItem.nutritionFood.nutritionData.macros,
                  crudeFat: 3.1,
                },
                minerals: { calcium: 600, phosphorus: 500 },
                fattyAcids: { epa: 0.06, dha: 0.07 },
              },
            },
          }),
          item({
            id: 'water-item',
            nutritionFoodId: 'food-water',
            weightG: 3,
            nutritionFood: {
              id: 'food-water',
              name: '清水',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: {
                  moisture: 100,
                  crudeProtein: 0,
                  crudeFat: 0,
                  ash: 0,
                  fiber: 0,
                },
                minerals: { calcium: 0, phosphorus: 0 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              mappings: [{ ingredientId: 'ingredient-water', isPrimary: true }],
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
        minValue: 1,
        maxValue: 10000,
        fieldPaths: ['minerals.calcium'],
      },
      {
        nutrientKey: 'phosphorus',
        label: '磷',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 1,
        maxValue: 10000,
        fieldPaths: ['minerals.phosphorus'],
      },
      {
        nutrientKey: 'calciumPhosphorusRatio',
        label: '钙磷比',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: 'ratio',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
      {
        nutrientKey: 'epaDha',
        label: 'EPA + DHA',
        category: 'COMBINATION',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: null,
        maxValue: null,
        fieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
        calculation: 'SUM',
      },
    ]);
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'design-1',
      version: 1,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-1',
    });

    await service.publishDraft('design-1', { name: '组合营养食谱' }, adminAccess);

    const createData = prisma.recipe.create.mock.calls[0][0].data;
    expect(createData.energyDensityKcalPerKg).toBe(1277);
    expect(createData.nutritionDetailedData.report.ingredientRows[0]).toEqual(
      expect.objectContaining({
        ingredientName: '鲜鸡胸肉（生）',
      }),
    );
    expect(createData.nutritionDetailedData.report.energyDensityRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: '每公斤配方',
          value: '1277 kcal/kg',
        }),
      ]),
    );
    expect(
      createData.nutritionDetailedData.report.nutrientSections.minerals.rows,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'calciumPhosphorusRatio',
          name: '钙磷比',
          unit: '比例',
        }),
      ]),
    );
    expect(
      createData.nutritionDetailedData.report.nutrientSections.fattyAcids.rows,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'epaDha',
          name: 'EPA + DHA',
          unit: 'g',
        }),
      ]),
    );
  });

  it('formats published supplement report rows with display unit, brand, and spec', () => {
    const rows = (service as any).buildPublishedIngredientReportRows(
      {
        items: [
          {
            id: 'supplement-item-1',
            ingredientId: 'supplement-calcium',
            nutritionFood: {
              id: 'food-supplement-calcium',
              name: '碳酸钙粉营养档案',
              displayNameZh: '碳酸钙粉 · NOW · 227g/瓶',
              mappings: [],
            },
            ingredient: {
              id: 'supplement-calcium',
              name: '碳酸钙',
              type: 'SUPPLEMENT',
              unitDisplayLabel: null,
              purchaseUnit: 'g',
              properties: { display_unit: '平勺' },
              brand: 'NOW',
              productModel: '227g/瓶',
            },
          },
        ],
      },
      {
        items: [
          {
            id: 'supplement-item-1',
            name: '碳酸钙',
            weightG: 2,
            ratioPercent: 2,
          },
        ],
      },
    );

    expect(rows).toEqual([
      {
        ingredientName: '碳酸钙粉 · NOW · 227g/瓶',
        amountLabel: '2平勺',
        weightPercentLabel: '-',
      },
    ]);
  });

  it('fills missing preparation methods from ingredient history when publishing old designer drafts', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        isCompliant: true,
        items: [item({ preparationMethod: null })],
      }),
    );
    prisma.recipeItem.findMany.mockResolvedValue([
      {
        ingredientId: 'ingredient-1',
        preparationMethod: '去皮、煮熟',
        recipe: { updatedAt: new Date('2026-05-26T08:00:00.000Z') },
      },
    ]);
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'design-1',
      version: 1,
    });
    prisma.designRecipePublishSnapshot.create.mockResolvedValue({
      id: 'snapshot-1',
    });

    await service.publishDraft('design-1', { name: '历史制备食谱' }, adminAccess);

    expect(prisma.recipe.create.mock.calls[0][0].data.items.create[0]).toEqual(
      expect.objectContaining({
        preparationMethod: '去皮、煮熟',
      }),
    );
  });

  it('falls back to calcium and phosphorus totals when publishing calcium-phosphorus ratio', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        isCompliant: true,
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
        minValue: 1,
        maxValue: 10000,
        fieldPaths: ['minerals.calcium'],
      },
      {
        nutrientKey: 'phosphorus',
        label: '磷',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 1,
        maxValue: 10000,
        fieldPaths: ['minerals.phosphorus'],
      },
    ]);
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
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
      { name: '钙磷比兜底食谱' },
      adminAccess,
    );

    expect(
      prisma.recipe.create.mock.calls[0][0].data.nutritionDetailedData
        .ca_p_ratio,
    ).toBe(1.2);
  });

  it('publishes supplement targets from actual nutrient contribution per kg', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        isCompliant: true,
        items: [
          item({
            id: 'food-item-1',
            ingredientId: 'ingredient-1',
            weightG: 414,
            nutritionFood: {
              id: 'food-1',
              name: '低钙基础食材',
              nutritionData: {
                ...item().nutritionFood.nutritionData,
                minerals: { calcium: 0, phosphorus: 500 },
              },
              mappings: [{ ingredientId: 'ingredient-1', isPrimary: true }],
            },
          }),
          item({
            id: 'supplement-item-1',
            ingredientId: 'supplement-calcium',
            weightG: 3,
            nutrientTargetKey: 'calcium',
            nutrientTargetValue: 500,
            ingredient: {
              id: 'supplement-calcium',
              name: '鸡蛋壳粉',
              type: 'SUPPLEMENT',
              unitDisplayLabel: 'g',
              purchaseUnit: 'g',
              properties: null,
            },
            nutritionFood: {
              id: 'food-supplement-calcium',
              name: '鸡蛋壳粉',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: { energyKcal: 0 },
                minerals: { calcium: 36000 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              mappings: [
                {
                  ingredientId: 'supplement-calcium',
                  isPrimary: true,
                  ingredient: {
                    id: 'supplement-calcium',
                    name: '鸡蛋壳粉',
                    type: 'SUPPLEMENT',
                  },
                },
              ],
            },
          }),
        ],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
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
      { name: '补剂目标食谱', reviewNote: '补剂目标映射回归测试' },
      adminAccess,
    );

    const createData = prisma.recipe.create.mock.calls[0][0].data;
    const supplementItem = createData.items.create.find(
      (createdItem: any) => createdItem.ingredientId === 'supplement-calcium',
    );
    const expectedTargetValue = Math.round((1080 / 417) * 1000);

    expect(supplementItem).toEqual(
      expect.objectContaining({
        nutrientTargetKey: 'calcium',
        nutrientTargetValue: expect.any(Number),
        ratioPercent: null,
        supplementTargets: [
          expect.objectContaining({
            fieldPath: 'minerals.calcium',
            label: '钙',
            targetValuePerKg: expect.any(Number),
            unit: 'mg',
          }),
        ],
      }),
    );
    expect(supplementItem).not.toHaveProperty('exampleWeight');
    expect(supplementItem.nutrientTargetValue).toBe(expectedTargetValue);
    expect(supplementItem.supplementTargets[0].targetValuePerKg).toBe(
      expectedTargetValue,
    );
  });

  it('does not publish legacy nutrient target fields for non-supplement ingredients', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        isCompliant: true,
        items: [
          item({
            id: 'food-hemp-item',
            ingredientId: 'food-hemp',
            weightG: 1,
            nutrientTargetKey: 'magnesium',
            nutrientTargetValue: 0.2,
            ingredient: {
              id: 'food-hemp',
              name: '火麻籽',
              type: 'FOOD',
            },
            nutritionFood: {
              ...item().nutritionFood,
              id: 'nutrition-hemp',
              name: '火麻籽',
              mappings: [
                {
                  ingredientId: 'food-hemp',
                  isPrimary: true,
                  ingredient: {
                    id: 'food-hemp',
                    name: '火麻籽',
                    type: 'FOOD',
                  },
                },
              ],
            },
          }),
        ],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
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
      { name: '食材目标清理食谱', reviewNote: '允许人工审核发布' },
      adminAccess,
    );

    const createData = prisma.recipe.create.mock.calls[0][0].data;
    const foodItem = createData.items.create.find(
      (createdItem: any) => createdItem.ingredientId === 'food-hemp',
    );

    expect(foodItem).not.toHaveProperty('nutrientTargetKey');
    expect(foodItem).not.toHaveProperty('nutrientTargetValue');
    expect(foodItem).not.toHaveProperty('supplementTargets');
  });

  it('stores actual supplement contribution instead of FEDIAF minimum targets', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        isCompliant: true,
        items: [
          item({
            id: 'food-item-1',
            ingredientId: 'ingredient-1',
            weightG: 100,
            nutritionFood: {
              id: 'food-1',
              name: '低矿物基础食材',
              nutritionData: {
                ...item().nutritionFood.nutritionData,
                minerals: { calcium: 0, phosphorus: 500, iodine: 0.001 },
              },
              mappings: [{ ingredientId: 'ingredient-1', isPrimary: true }],
            },
          }),
          item({
            id: 'supplement-calcium-item',
            ingredientId: 'supplement-calcium',
            weightG: 1,
            nutrientTargetKey: 'calcium',
            nutrientTargetValue: 1.45,
            ingredient: {
              id: 'supplement-calcium',
              name: '鸡蛋壳粉',
              type: 'SUPPLEMENT',
              unitDisplayLabel: 'g',
              purchaseUnit: 'g',
              properties: null,
            },
            nutritionFood: {
              id: 'food-supplement-calcium',
              name: '鸡蛋壳粉',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: { energyKcal: 0 },
                minerals: { calcium: 38000 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              mappings: [
                {
                  ingredientId: 'supplement-calcium',
                  isPrimary: true,
                  ingredient: {
                    id: 'supplement-calcium',
                    name: '鸡蛋壳粉',
                    type: 'SUPPLEMENT',
                  },
                },
              ],
            },
          }),
          item({
            id: 'supplement-iodine-item',
            ingredientId: 'supplement-iodine',
            weightG: 1,
            nutrientTargetKey: 'iodine',
            nutrientTargetValue: 0.3,
            ingredient: {
              id: 'supplement-iodine',
              name: '海藻粉',
              type: 'SUPPLEMENT',
              unitDisplayLabel: 'g',
              purchaseUnit: 'g',
              properties: null,
            },
            nutritionFood: {
              id: 'food-supplement-iodine',
              name: '海藻粉',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: { energyKcal: 0 },
                minerals: { iodine: 30000 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              mappings: [
                {
                  ingredientId: 'supplement-iodine',
                  isPrimary: true,
                  ingredient: {
                    id: 'supplement-iodine',
                    name: '海藻粉',
                    type: 'SUPPLEMENT',
                  },
                },
              ],
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
        unit: 'g',
        minValue: 1.45,
        maxValue: 7.1,
        fieldPaths: ['minerals.calcium'],
      },
      {
        nutrientKey: 'iodine',
        label: '碘',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 0.3,
        maxValue: 2.6,
        fieldPaths: ['minerals.iodine'],
      },
    ]);
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
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
      { name: '补剂单位换算食谱', reviewNote: '单位换算回归测试' },
      adminAccess,
    );

    const createData = prisma.recipe.create.mock.calls[0][0].data;
    const items = createData.items.create;
    const calciumTarget = items.find(
      (createdItem: any) => createdItem.ingredientId === 'supplement-calcium',
    )?.supplementTargets?.[0];
    const iodineTarget = items.find(
      (createdItem: any) => createdItem.ingredientId === 'supplement-iodine',
    )?.supplementTargets?.[0];

    expect(calciumTarget).toMatchObject({
      fieldPath: 'minerals.calcium',
      label: '钙',
      unit: 'mg',
    });
    expect(calciumTarget.targetValuePerKg).toBe(Math.round((380 / 102) * 1000));
    expect(iodineTarget).toMatchObject({
      fieldPath: 'minerals.iodine',
      label: '碘',
      unit: 'μg',
    });
    expect(iodineTarget.targetValuePerKg).toBe(Math.round((300 / 102) * 1000));
  });

  it('keeps only deficient nutrients when publishing a multi-nutrient supplement target', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        isCompliant: true,
        items: [
          item({
            id: 'food-item-1',
            ingredientId: 'ingredient-1',
            weightG: 100,
            nutritionFood: {
              id: 'food-1',
              name: '基础食材',
              nutritionData: {
                ...item().nutritionFood.nutritionData,
                minerals: { calcium: 600, phosphorus: 500, zinc: 0.001 },
              },
              mappings: [{ ingredientId: 'ingredient-1', isPrimary: true }],
            },
          }),
          item({
            id: 'supplement-multi-item',
            ingredientId: 'supplement-multi',
            weightG: 1,
            nutrientTargetKey: null,
            nutrientTargetValue: null,
            ingredient: {
              id: 'supplement-multi',
              name: '复合矿物粉',
              type: 'SUPPLEMENT',
              unitDisplayLabel: 'g',
              purchaseUnit: 'g',
              properties: null,
            },
            nutritionFood: {
              id: 'food-supplement-multi',
              name: '复合矿物粉',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: { energyKcal: 0 },
                minerals: { calcium: 1000, zinc: 3000 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              mappings: [
                {
                  ingredientId: 'supplement-multi',
                  isPrimary: true,
                  ingredient: {
                    id: 'supplement-multi',
                    name: '复合矿物粉',
                    type: 'SUPPLEMENT',
                  },
                },
              ],
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
        maxValue: 7100,
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
    ]);
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
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
      { name: '复合补剂目标食谱', reviewNote: '复合补剂目标回归测试' },
      adminAccess,
    );

    const createData = prisma.recipe.create.mock.calls[0][0].data;
    const supplementItem = createData.items.create.find(
      (createdItem: any) => createdItem.ingredientId === 'supplement-multi',
    );

    expect(supplementItem.supplementTargets).toHaveLength(1);
    expect(supplementItem.supplementTargets[0]).toMatchObject({
      fieldPath: 'minerals.zinc',
      label: '锌',
      unit: 'mg',
    });
    expect(supplementItem.supplementTargets[0].targetValuePerKg).toBe(
      Math.round((30 / 101) * 1000),
    );
  });

  it('infers supplement nutrient targets from assessment contribution when designer target context is missing', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        isCompliant: true,
        items: [
          item({
            id: 'food-item-1',
            ingredientId: 'ingredient-1',
            weightG: 100,
            nutritionFood: {
              id: 'food-1',
              name: '低钙基础食材',
              nutritionData: {
                ...item().nutritionFood.nutritionData,
                minerals: { calcium: 0, phosphorus: 500 },
              },
              mappings: [{ ingredientId: 'ingredient-1', isPrimary: true }],
            },
          }),
          item({
            id: 'supplement-item-1',
            ingredientId: 'supplement-calcium',
            weightG: 1,
            nutrientTargetKey: null,
            nutrientTargetValue: null,
            ingredient: {
              id: 'supplement-calcium',
              name: '鸡蛋壳粉',
              type: 'SUPPLEMENT',
              unitDisplayLabel: 'g',
              purchaseUnit: 'g',
              properties: null,
            },
            nutritionFood: {
              id: 'food-supplement-calcium',
              name: '鸡蛋壳粉',
              nutritionData: {
                meta: { rawBasisType: 'PER_100_G' },
                macros: { energyKcal: 0 },
                minerals: { calcium: 38000 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              mappings: [
                {
                  ingredientId: 'supplement-calcium',
                  isPrimary: true,
                  ingredient: {
                    id: 'supplement-calcium',
                    name: '鸡蛋壳粉',
                    type: 'SUPPLEMENT',
                  },
                },
              ],
            },
          }),
        ],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
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
      { name: '补剂目标推断食谱', reviewNote: '补剂目标推断回归测试' },
      adminAccess,
    );

    const createData = prisma.recipe.create.mock.calls[0][0].data;
    const supplementItem = createData.items.create.find(
      (createdItem: any) => createdItem.ingredientId === 'supplement-calcium',
    );
    const expectedTargetValue = Math.round((380 / 101) * 1000);

    expect(supplementItem).toEqual(
      expect.objectContaining({
        nutrientTargetKey: 'calcium',
        nutrientTargetValue: expect.any(Number),
        supplementTargets: [
          expect.objectContaining({
            fieldPath: 'minerals.calcium',
            label: '钙',
            targetValuePerKg: expect.any(Number),
            unit: 'mg',
          }),
        ],
      }),
    );
    expect(supplementItem.nutrientTargetValue).toBe(expectedTargetValue);
    expect(supplementItem.supplementTargets[0].targetValuePerKg).toBe(
      expectedTargetValue,
    );
  });

  it('rejects publishing without a final recipe name', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({
        name: '未命名食谱',
        isCompliant: true,
        items: [item()],
      }),
    );
    targetProvider.getTargets.mockResolvedValue(compliantTargets());

    await expect(
      service.publishDraft('design-1', { name: '   ' }, adminAccess),
    ).rejects.toThrow(new BadRequestException('请填写食谱名称'));

    expect(prisma.recipe.create).not.toHaveBeenCalled();
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
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
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
      { name: '钙不足审核食谱', reviewNote: '人工确认钙不足但允许第一版发布' },
      adminAccess,
    );

    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'DRAFT',
      }),
    });
    expect(prisma.designRecipePublishSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reviewStatus: 'APPROVED',
        reviewNote: '人工确认钙不足但允许第一版发布',
        publishedBy: 'admin-1',
      }),
    });
    expect(prisma.designRecipe.update).toHaveBeenLastCalledWith({
      where: { id: 'design-1' },
      data: expect.objectContaining({
        status: 'PUBLISHED',
        reviewStatus: 'APPROVED',
        reviewedBy: 'admin-1',
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
    prisma.designRecipe.update.mockResolvedValue(
      draft({ status: 'PUBLISHED' }),
    );
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
      { name: '加载一致性测试食谱' },
      adminAccess,
    );

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

    await expect(
      service.publishDraft(
        'design-1',
        { name: '未映射原料测试食谱' },
        adminAccess,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        '营养原料 未知营养原料 未映射采购原料，无法发布正式食谱',
      ),
    );
    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });

  describe('recipe designer series workbench', () => {
    function uniqueNameVersionCollision() {
      return new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`name`,`version`)',
        {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['name', 'version'] },
        },
      );
    }

    function transactionConflict() {
      return new Prisma.PrismaClientKnownRequestError(
        'Transaction failed due to a write conflict or deadlock',
        {
          code: 'P2034',
          clientVersion: 'test',
        },
      );
    }

    it('lists only active customer-owned series for customer users', async () => {
      prisma.recipeSeries.findMany.mockResolvedValue([
        seriesRecord({ id: 'series-customer', createdBy: 'customer-1' }),
      ]);

      await expect(
        service.listSeries({ userId: 'customer-1', role: 'CUSTOMER' }),
      ).resolves.toEqual([
        expect.objectContaining({
          id: 'series-customer',
          name: '成犬鸡肉配方',
        }),
      ]);

      expect(prisma.recipeSeries.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            createdBy: 'customer-1',
          },
        }),
      );
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('lists series created by internal users for staff users', async () => {
      prisma.recipeSeries.findMany.mockResolvedValue([
        seriesRecord({ id: 'series-staff', createdBy: 'staff-1' }),
      ]);

      await service.listSeries({ userId: 'staff-1', role: 'STAFF' });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: ['STAFF', 'ADMIN'] } },
        select: { id: true },
      });
      expect(prisma.recipeSeries.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            createdBy: {
              in: [
                'staff-1',
                'admin-1',
                'recipe-designer-backfill',
                'recipe-series-backfill',
              ],
            },
          },
        }),
      );
    });

    it('returns one series card with five stage statuses', async () => {
      prisma.recipeSeries.findMany.mockResolvedValue([
        {
          id: 'series-1',
          name: '牛肉南瓜鲜食',
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: new Date('2026-05-31T14:32:00.000Z'),
          designs: [
            draft({
              id: 'early-puppy-design',
              seriesId: 'series-1',
              seriesLifeStage: 'PUPPY_UNDER_14_WEEKS',
              status: 'DRAFT',
              reviewStatus: 'REQUIRED',
              updatedAt: new Date('2026-05-31T12:00:00.000Z'),
            }),
            draft({
              id: 'late-puppy-design',
              seriesId: 'series-1',
              seriesLifeStage: 'PUPPY_14_WEEKS_PLUS',
              status: 'NEEDS_REVIEW',
              updatedAt: new Date('2026-05-31T12:30:00.000Z'),
            }),
            draft({
              id: 'adult-design',
              seriesId: 'series-1',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PUBLISHED',
              publishedRecipeId: 'adult-recipe-id',
              updatedAt: new Date('2026-05-31T14:32:00.000Z'),
            }),
            draft({
              id: 'senior-design',
              seriesId: 'series-1',
              seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
              status: 'DRAFT',
              updatedAt: new Date('2026-05-31T13:08:00.000Z'),
            }),
          ],
          recipes: [
            {
              recipeId: 'adult-recipe-id',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PUBLIC',
              version: 1,
              updatedAt: new Date('2026-05-31T14:40:00.000Z'),
            },
          ],
        },
      ]);

      const cards = await service.listSeries('staff-1');

      expect(cards).toEqual([
        expect.objectContaining({
          id: 'series-1',
          name: '牛肉南瓜鲜食',
          publishedStageCount: 1,
          stages: [
            expect.objectContaining({
              lifeStage: 'PUPPY_UNDER_14_WEEKS',
              status: 'IN_REVIEW',
              recipeStatusCategory: 'DRAFT',
            }),
            expect.objectContaining({
              lifeStage: 'PUPPY_14_WEEKS_PLUS',
              status: 'NEEDS_CHANGES',
              recipeStatusCategory: 'DRAFT',
            }),
            expect.objectContaining({
              lifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PUBLISHED',
              recipeStatusCategory: 'PUBLIC',
            }),
            expect.objectContaining({
              lifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
              status: 'MODIFIED',
              recipeStatusCategory: 'DRAFT',
            }),
            expect.objectContaining({
              lifeStage: 'REPRODUCTION',
              status: 'NOT_DESIGNED',
              recipeStatusCategory: 'NOT_DESIGNED',
            }),
          ],
        }),
      ]);
    });

    it('maps private custom recipe stages ahead of public and draft states', async () => {
      prisma.recipeSeries.findMany.mockResolvedValue([
        {
          id: 'series-1',
          name: '私密定制鲜食',
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: new Date('2026-06-11T08:00:00.000Z'),
          designs: [
            draft({
              id: 'adult-revision',
              seriesId: 'series-1',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'COMPLIANT',
              revisionBaseRecipeId: 'private-recipe-id',
              updatedAt: new Date('2026-06-11T09:00:00.000Z'),
            }),
          ],
          recipes: [
            {
              recipeId: 'private-recipe-id',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PRIVATE_CUSTOM',
              version: 1,
              updatedAt: new Date('2026-06-11T08:30:00.000Z'),
            },
            {
              recipeId: 'private-recipe-id',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PUBLIC',
              version: 1,
              updatedAt: new Date('2026-06-11T08:00:00.000Z'),
            },
          ],
        },
      ]);

      const cards = await service.listSeries(
        { userId: 'staff-1', role: 'STAFF' },
        { status: 'PRIVATE_CUSTOM' },
      );

      expect(cards).toEqual([
        expect.objectContaining({
          id: 'series-1',
          stages: expect.arrayContaining([
            expect.objectContaining({
              lifeStage: 'HIGH_ACTIVITY_ADULT',
              recipeStatusCategory: 'PRIVATE_CUSTOM',
            }),
          ]),
        }),
      ]);
    });

    it('filters series cards by admin recipe status category', async () => {
      prisma.recipeSeries.findMany.mockResolvedValue([
        {
          id: 'series-draft',
          name: '草稿鲜食',
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: new Date('2026-06-11T08:00:00.000Z'),
          designs: [
            draft({
              id: 'draft-design',
              seriesId: 'series-draft',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'DRAFT',
            }),
          ],
          recipes: [],
        },
        {
          id: 'series-public',
          name: '公开鲜食',
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: new Date('2026-06-11T08:00:00.000Z'),
          designs: [],
          recipes: [
            {
              recipeId: 'public-recipe-id',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PUBLIC',
              version: 1,
              updatedAt: new Date('2026-06-11T08:00:00.000Z'),
            },
          ],
        },
        {
          id: 'series-private',
          name: '私密鲜食',
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: new Date('2026-06-11T08:00:00.000Z'),
          designs: [],
          recipes: [
            {
              recipeId: 'private-recipe-id',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PRIVATE_CUSTOM',
              version: 1,
              updatedAt: new Date('2026-06-11T08:00:00.000Z'),
            },
          ],
        },
      ]);

      await expect(
        service.listSeries(
          { userId: 'staff-1', role: 'STAFF' },
          { status: 'PUBLIC' },
        ),
      ).resolves.toEqual([
        expect.objectContaining({
          id: 'series-public',
        }),
      ]);
    });

    it('shows a stage as draft when a backend recipe draft exists after a public version', async () => {
      prisma.recipeSeries.findMany.mockResolvedValue([
        {
          id: 'series-1',
          name: '牛肉南瓜鲜食',
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: new Date('2026-05-31T14:32:00.000Z'),
          designs: [
            draft({
              id: 'adult-design',
              seriesId: 'series-1',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PUBLISHED',
              publishedRecipeId: 'adult-recipe-id',
              updatedAt: new Date('2026-05-31T14:32:00.000Z'),
            }),
          ],
          recipes: [
            {
              recipeId: 'adult-recipe-id',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PUBLIC',
              version: 1,
              updatedAt: new Date('2026-05-31T14:40:00.000Z'),
            },
            {
              recipeId: 'adult-recipe-id',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'DRAFT',
              version: 2,
              updatedAt: new Date('2026-05-31T15:00:00.000Z'),
            },
          ],
        },
      ]);

      const cards = await service.listSeries('staff-1');

      expect(cards[0]).toEqual(
        expect.objectContaining({
          publishedStageCount: 1,
          stages: expect.arrayContaining([
            expect.objectContaining({
              lifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'DRAFT',
              recipeId: 'adult-recipe-id',
            }),
          ]),
        }),
      );
    });

    it('keeps an unchanged active revision stage published in the series list', async () => {
      const publishedItem = item({
        id: 'published-item',
        ingredientId: 'ingredient-1',
        nutritionFoodId: 'food-1',
        weightG: 128,
        preparationMethod: 'STEAMED',
        sortOrder: 1,
      });
      const publishedDesign = draft({
        id: 'published-adult-design',
        name: '燕麦鳕鱼猪肉',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        status: 'PUBLISHED',
        publishedRecipeId: 'adult-recipe-id',
        publishedRecipeVersion: 1,
        publishedAt: new Date('2026-06-08T08:00:00.000Z'),
        items: [publishedItem],
      });
      const unchangedRevision = draft({
        id: 'adult-revision-design',
        name: '燕麦鳕鱼猪肉 修订',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        status: 'COMPLIANT',
        revisionOfDesignRecipeId: 'published-adult-design',
        revisionBaseRecipeId: 'adult-recipe-id',
        updatedAt: new Date('2026-06-09T04:00:00.000Z'),
        items: [
          item({
            id: 'revision-item',
            ingredientId: 'ingredient-1',
            nutritionFoodId: 'food-1',
            weightG: 128,
            preparationMethod: 'STEAMED',
            sortOrder: 1,
          }),
        ],
      });
      prisma.recipeSeries.findMany.mockResolvedValue([
        {
          id: 'series-1',
          name: '燕麦鳕鱼猪肉',
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: new Date('2026-06-09T04:00:00.000Z'),
          designs: [unchangedRevision, publishedDesign],
          recipes: [
            {
              recipeId: 'adult-recipe-id',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PUBLIC',
              version: 1,
              updatedAt: new Date('2026-06-08T08:00:00.000Z'),
            },
          ],
        },
      ]);

      const cards = await service.listSeries('staff-1');

      expect(cards[0]).toEqual(
        expect.objectContaining({
          publishedStageCount: 1,
          stages: expect.arrayContaining([
            expect.objectContaining({
              lifeStage: 'HIGH_ACTIVITY_ADULT',
              draftId: 'published-adult-design',
              status: 'PUBLISHED',
              recipeId: 'adult-recipe-id',
            }),
          ]),
        }),
      );
    });

    it('marks a published stage modified when its active revision changes publishable inputs', async () => {
      const publishedDesign = draft({
        id: 'published-adult-design',
        name: '燕麦鳕鱼猪肉',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        status: 'PUBLISHED',
        publishedRecipeId: 'adult-recipe-id',
        publishedRecipeVersion: 1,
        publishedAt: new Date('2026-06-08T08:00:00.000Z'),
        items: [
          item({
            id: 'published-item',
            ingredientId: 'ingredient-1',
            nutritionFoodId: 'food-1',
            weightG: 128,
            preparationMethod: 'STEAMED',
            sortOrder: 1,
          }),
        ],
      });
      const changedRevision = draft({
        id: 'adult-revision-design',
        name: '燕麦鳕鱼猪肉 修订',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        status: 'COMPLIANT',
        revisionOfDesignRecipeId: 'published-adult-design',
        revisionBaseRecipeId: 'adult-recipe-id',
        items: [
          item({
            id: 'revision-item',
            ingredientId: 'ingredient-1',
            nutritionFoodId: 'food-1',
            weightG: 148,
            preparationMethod: 'STEAMED',
            sortOrder: 1,
          }),
        ],
      });
      prisma.recipeSeries.findMany.mockResolvedValue([
        {
          id: 'series-1',
          name: '燕麦鳕鱼猪肉',
          status: 'ACTIVE',
          deletedAt: null,
          updatedAt: new Date('2026-06-09T04:00:00.000Z'),
          designs: [changedRevision, publishedDesign],
          recipes: [
            {
              recipeId: 'adult-recipe-id',
              seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'PUBLIC',
              version: 1,
              updatedAt: new Date('2026-06-08T08:00:00.000Z'),
            },
          ],
        },
      ]);

      const cards = await service.listSeries('staff-1');

      expect(cards[0]).toEqual(
        expect.objectContaining({
          stages: expect.arrayContaining([
            expect.objectContaining({
              lifeStage: 'HIGH_ACTIVITY_ADULT',
              status: 'MODIFIED',
            }),
          ]),
        }),
      );
    });

    it('reuses an existing unpublished stage draft', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue({
        id: 'series-1',
        name: '牛肉南瓜鲜食',
        status: 'ACTIVE',
        createdBy: 'staff-1',
      });
      prisma.designRecipe.findFirst.mockResolvedValue(
        draft({
          id: 'senior-design',
          seriesId: 'series-1',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          fediafDogScenario: 'ADULT_MER_95',
          status: 'DRAFT',
          publishedRecipeId: null,
          publishedAt: null,
          items: [item({ id: 'stage-item' })],
        }),
      );

      await expect(
        service.createSeriesStageDraft(
          'series-1',
          { scenario: 'ADULT_MER_95' },
          'staff-1',
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'senior-design',
          items: [expect.objectContaining({ id: 'stage-item' })],
        }),
      );

      expect(prisma.designRecipe.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          seriesId: 'series-1',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          publishedRecipeId: null,
          publishedAt: null,
        }),
        include: expect.any(Object),
        orderBy: { updatedAt: 'desc' },
      });
      expect(prisma.designRecipe.create).not.toHaveBeenCalled();
    });

    it('assigns the next design version when creating a new series stage draft', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue({
        id: 'series-1',
        name: '牛肉南瓜鲜食',
        status: 'ACTIVE',
        createdBy: 'staff-1',
        designs: [],
      });
      prisma.designRecipe.aggregate.mockResolvedValue({ _max: { version: 2 } });
      prisma.designRecipe.create.mockResolvedValue(
        draft({
          id: 'reproduction-design',
          name: '牛肉南瓜鲜食',
          version: 3,
          seriesId: 'series-1',
          seriesLifeStage: 'REPRODUCTION',
          fediafDogScenario: 'REPRODUCTION',
        }),
      );

      await expect(
        service.createSeriesStageDraft(
          'series-1',
          { scenario: 'REPRODUCTION' },
          'staff-1',
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'reproduction-design',
          version: 3,
        }),
      );

      expect(prisma.designRecipe.aggregate).toHaveBeenCalledWith({
        where: { name: '牛肉南瓜鲜食' },
        _max: { version: true },
      });
      expect(prisma.designRecipe.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: '牛肉南瓜鲜食',
          version: 3,
          seriesId: 'series-1',
          seriesLifeStage: 'REPRODUCTION',
          applicableLifeStages: ['REPRODUCTION'],
        }),
        include: expect.any(Object),
      });
    });

    it('copies item structure from a same-series published stage template when requested', async () => {
      const sourceItem = item({
        id: 'source-item-1',
        ingredientId: 'ingredient-1',
        nutritionFoodId: 'food-1',
        weightG: 128,
        includeInAssessment: true,
        ratioPercent: 64,
        preparationMethod: 'STEAMED',
        nutrientTargetKey: 'calcium',
        nutrientTargetValue: 500,
        sortOrder: 2,
      });
      prisma.recipeSeries.findUnique.mockResolvedValue({
        id: 'series-1',
        name: '牛肉南瓜鲜食',
        status: 'ACTIVE',
        createdBy: 'staff-1',
      });
      prisma.designRecipe.findFirst.mockResolvedValue(null);
      prisma.designRecipe.findUnique.mockResolvedValue(
        draft({
          id: 'published-adult-design',
          seriesId: 'series-1',
          seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
          status: 'PUBLISHED',
          publishedRecipeId: 'adult-recipe-id',
          publishedAt: new Date('2026-05-31T10:00:00.000Z'),
          items: [sourceItem],
        }),
      );
      prisma.designRecipe.aggregate.mockResolvedValue({ _max: { version: 2 } });
      prisma.designRecipe.create.mockResolvedValue(
        draft({
          id: 'reproduction-design',
          name: '牛肉南瓜鲜食',
          version: 3,
          seriesId: 'series-1',
          seriesLifeStage: 'REPRODUCTION',
          fediafDogScenario: 'REPRODUCTION',
          items: [sourceItem],
        }),
      );

      await expect(
        service.createSeriesStageDraft(
          'series-1',
          {
            scenario: 'REPRODUCTION',
            sourceDraftId: 'published-adult-design',
          } as any,
          'staff-1',
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'reproduction-design',
          items: [expect.objectContaining({ id: 'source-item-1' })],
        }),
      );

      expect(prisma.designRecipe.findUnique).toHaveBeenCalledWith({
        where: { id: 'published-adult-design' },
        include: expect.any(Object),
      });
      expect(prisma.designRecipe.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          seriesId: 'series-1',
          seriesLifeStage: 'REPRODUCTION',
          status: 'DRAFT',
          items: {
            create: [
              expect.objectContaining({
                ingredientId: 'ingredient-1',
                nutritionFoodId: 'food-1',
                weightG: 128,
                includeInAssessment: true,
                ratioPercent: 64,
                preparationMethod: 'STEAMED',
                nutrientTargetKey: 'calcium',
                nutrientTargetValue: 500,
                sortOrder: 2,
              }),
            ],
          },
        }),
        include: expect.any(Object),
      });
    });

    it('copies from the published same-stage template when a published card points at a newer revision draft', async () => {
      const revisionItem = item({
        id: 'revision-item-1',
        nutritionFoodId: 'revision-food',
        weightG: 88,
        sortOrder: 1,
      });
      const publishedItem = item({
        id: 'published-item-1',
        ingredientId: 'published-ingredient',
        nutritionFoodId: 'published-food',
        weightG: 128,
        sortOrder: 2,
      });
      prisma.recipeSeries.findUnique.mockResolvedValue({
        id: 'series-1',
        name: '燕麦鳕鱼猪肉',
        status: 'ACTIVE',
        createdBy: 'staff-1',
      });
      prisma.designRecipe.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          draft({
            id: 'published-under-14-design',
            seriesId: 'series-1',
            seriesLifeStage: 'PUPPY_UNDER_14_WEEKS',
            status: 'PUBLISHED',
            publishedRecipeId: 'under-14-recipe-id',
            publishedAt: new Date('2026-06-07T03:22:51.483Z'),
            items: [publishedItem],
          }),
        );
      prisma.designRecipe.findUnique.mockResolvedValue(
        draft({
          id: 'under-14-revision-design',
          seriesId: 'series-1',
          seriesLifeStage: 'PUPPY_UNDER_14_WEEKS',
          status: 'COMPLIANT',
          revisionBaseRecipeId: 'under-14-recipe-id',
          items: [revisionItem],
        }),
      );
      prisma.designRecipe.aggregate.mockResolvedValue({ _max: { version: 5 } });
      prisma.designRecipe.create.mockResolvedValue(
        draft({
          id: 'late-puppy-design',
          name: '燕麦鳕鱼猪肉',
          version: 6,
          seriesId: 'series-1',
          seriesLifeStage: 'PUPPY_14_WEEKS_PLUS',
          fediafDogScenario: 'LATE_GROWTH',
          items: [publishedItem],
        }),
      );

      await expect(
        service.createSeriesStageDraft(
          'series-1',
          {
            scenario: 'LATE_GROWTH',
            sourceDraftId: 'under-14-revision-design',
          } as any,
          'staff-1',
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'late-puppy-design',
        }),
      );

      expect(prisma.designRecipe.findFirst).toHaveBeenNthCalledWith(2, {
        where: expect.objectContaining({
          seriesId: 'series-1',
          seriesLifeStage: 'PUPPY_UNDER_14_WEEKS',
        }),
        include: expect.any(Object),
        orderBy: { updatedAt: 'desc' },
      });
      expect(prisma.designRecipe.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          seriesId: 'series-1',
          seriesLifeStage: 'PUPPY_14_WEEKS_PLUS',
          items: {
            create: [
              expect.objectContaining({
                ingredientId: 'published-ingredient',
                nutritionFoodId: 'published-food',
                weightG: 128,
                sortOrder: 2,
              }),
            ],
          },
        }),
        include: expect.any(Object),
      });
    });

    it('retries series creation when the initial design version collides', async () => {
      prisma.recipeSeries.create.mockResolvedValue({
        id: 'series-1',
        name: '牛肉南瓜鲜食',
        status: 'ACTIVE',
        deletedAt: null,
        updatedAt: new Date('2026-05-31T14:32:00.000Z'),
      });
      prisma.designRecipe.aggregate
        .mockResolvedValueOnce({ _max: { version: 2 } })
        .mockResolvedValueOnce({ _max: { version: 3 } });
      prisma.designRecipe.create
        .mockRejectedValueOnce(uniqueNameVersionCollision())
        .mockResolvedValueOnce(
          draft({
            id: 'adult-design',
            name: '牛肉南瓜鲜食',
            version: 4,
            seriesId: 'series-1',
            seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
          }),
        );

      await expect(
        service.createSeries(
          { name: '牛肉南瓜鲜食', scenario: 'ADULT_MER_110' },
          'staff-1',
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'series-1',
          stages: expect.arrayContaining([
            expect.objectContaining({
              lifeStage: 'HIGH_ACTIVITY_ADULT',
              draftId: 'adult-design',
              status: 'MODIFIED',
            }),
          ]),
        }),
      );

      expect(prisma.designRecipe.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          name: '牛肉南瓜鲜食',
          version: 3,
          seriesId: 'series-1',
        }),
        include: expect.any(Object),
      });
      expect(prisma.designRecipe.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          name: '牛肉南瓜鲜食',
          version: 4,
          seriesId: 'series-1',
        }),
        include: expect.any(Object),
      });
    });

    it('retries stage draft creation when the allocated design version collides', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue({
        id: 'series-1',
        name: '牛肉南瓜鲜食',
        status: 'ACTIVE',
        createdBy: 'staff-1',
      });
      prisma.designRecipe.findFirst.mockResolvedValue(null);
      prisma.designRecipe.aggregate
        .mockResolvedValueOnce({ _max: { version: 2 } })
        .mockResolvedValueOnce({ _max: { version: 3 } });
      prisma.designRecipe.create
        .mockRejectedValueOnce(uniqueNameVersionCollision())
        .mockResolvedValueOnce(
          draft({
            id: 'reproduction-design',
            name: '牛肉南瓜鲜食',
            version: 4,
            seriesId: 'series-1',
            seriesLifeStage: 'REPRODUCTION',
            fediafDogScenario: 'REPRODUCTION',
          }),
        );

      await expect(
        service.createSeriesStageDraft(
          'series-1',
          { scenario: 'REPRODUCTION' },
          'staff-1',
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'reproduction-design',
          version: 4,
        }),
      );

      expect(prisma.designRecipe.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          name: '牛肉南瓜鲜食',
          version: 3,
          seriesId: 'series-1',
        }),
        include: expect.any(Object),
      });
      expect(prisma.designRecipe.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          name: '牛肉南瓜鲜食',
          version: 4,
          seriesId: 'series-1',
        }),
        include: expect.any(Object),
      });
    });

    it('retries stage draft creation transaction conflicts and reuses the winner draft', async () => {
      prisma.$transaction
        .mockRejectedValueOnce(transactionConflict())
        .mockImplementationOnce(async (callback: any) => callback(prisma));
      prisma.recipeSeries.findUnique.mockResolvedValue({
        id: 'series-1',
        name: '牛肉南瓜鲜食',
        status: 'ACTIVE',
        createdBy: 'staff-1',
      });
      prisma.designRecipe.findFirst.mockResolvedValue(
        draft({
          id: 'winner-design',
          seriesId: 'series-1',
          seriesLifeStage: 'REPRODUCTION',
          fediafDogScenario: 'REPRODUCTION',
          status: 'DRAFT',
          publishedRecipeId: null,
          publishedAt: null,
          items: [item({ id: 'winner-item' })],
        }),
      );

      await expect(
        service.createSeriesStageDraft(
          'series-1',
          { scenario: 'REPRODUCTION' },
          'staff-1',
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'winner-design',
          items: [expect.objectContaining({ id: 'winner-item' })],
        }),
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.designRecipe.create).not.toHaveBeenCalled();
    });

    it('requires exact confirmation before deleting a series', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue({
        id: 'series-1',
        name: '牛肉南瓜鲜食',
        status: 'ACTIVE',
        createdBy: 'staff-1',
        designs: [],
      });

      await expect(
        service.deleteSeries(
          'series-1',
          {
            confirmName: '牛肉南瓜',
            confirmUserVisibleRemoval: true,
          },
          'staff-1',
        ),
      ).rejects.toThrow(new BadRequestException('系列名称确认不一致'));

      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
    });

    it('does not create a stage draft for another customer series', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          id: 'series-other',
          createdBy: 'customer-2',
          designs: undefined,
          recipes: undefined,
        }),
      );

      await expect(
        service.createSeriesStageDraft(
          'series-other',
          { scenario: 'ADULT_MER_110' },
          { userId: 'customer-1', role: 'CUSTOMER' },
        ),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.designRecipe.create).not.toHaveBeenCalled();
    });

    it('does not rename another customer series', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          id: 'series-other',
          createdBy: 'customer-2',
          designs: undefined,
          recipes: undefined,
        }),
      );

      await expect(
        service.renameSeries(
          'series-other',
          { name: '新名字' },
          { userId: 'customer-1', role: 'CUSTOMER' },
        ),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });

    it('does not delete another customer series', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          id: 'series-other',
          createdBy: 'customer-2',
          designs: [],
          recipes: undefined,
        }),
      );

      await expect(
        service.deleteSeries(
          'series-other',
          {
            confirmName: '成犬鸡肉配方',
            confirmUserVisibleRemoval: true,
          },
          { userId: 'customer-1', role: 'CUSTOMER' },
        ),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });
  });
});
