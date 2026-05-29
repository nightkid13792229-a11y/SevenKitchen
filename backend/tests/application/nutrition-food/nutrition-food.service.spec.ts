import { NutritionFoodCategory, NutritionFoodStatus } from '@prisma/client';
import { NutritionFoodService } from '../../../src/application/nutrition-food/nutrition-food.service';
import { SearchGovernanceService } from '../../../src/application/search-governance/search-governance.service';
import { validateNutritionProfileContract } from '../../../src/domain/nutrition-governance/nutrition-profile-contract';

describe('NutritionFoodService', () => {
  const prisma = {
    nutritionFood: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const searchGovernance = {
    expandQuery: jest.fn(),
    recordSearchEvent: jest.fn(),
  } as jest.Mocked<
    Pick<SearchGovernanceService, 'expandQuery' | 'recordSearchEvent'>
  >;

  let service: NutritionFoodService;

  beforeEach(() => {
    jest.clearAllMocks();
    searchGovernance.expandQuery.mockImplementation(async (_domain, rawQuery) =>
      rawQuery ? [rawQuery] : [],
    );
    searchGovernance.recordSearchEvent.mockResolvedValue({ id: 'query-log-1' });
    service = new NutritionFoodService(prisma, searchGovernance as any);
  });

  it('searches by the formal Chinese display name', async () => {
    prisma.nutritionFood.count.mockResolvedValue(0);
    prisma.nutritionFood.findMany.mockResolvedValue([]);

    await service.findAll({ search: '三文鱼', page: 1, pageSize: 20 });

    expect(prisma.nutritionFood.count).toHaveBeenCalledWith({
      where: {
        OR: expect.arrayContaining([
          { displayNameZh: { contains: '三文鱼', mode: 'insensitive' } },
        ]),
      },
    });
  });

  it('expands nutrition food search terms through search governance', async () => {
    searchGovernance.expandQuery.mockResolvedValue(['西蓝花', '西兰花']);
    prisma.nutritionFood.count.mockResolvedValue(0);
    prisma.nutritionFood.findMany.mockResolvedValue([]);

    await service.findAll({ search: '西蓝花', page: 1, pageSize: 20 });

    expect(searchGovernance.expandQuery).toHaveBeenCalledWith(
      'NUTRITION_FOOD',
      '西蓝花',
    );
    expect(prisma.nutritionFood.count).toHaveBeenCalledWith({
      where: {
        OR: expect.arrayContaining([
          { name: { contains: '西兰花', mode: 'insensitive' } },
          { nameEn: { contains: '西兰花', mode: 'insensitive' } },
          { displayNameZh: { contains: '西兰花', mode: 'insensitive' } },
        ]),
      },
    });
  });

  it('falls back to the original nutrition food search when search governance fails', async () => {
    searchGovernance.expandQuery.mockRejectedValue(new Error('alias unavailable'));
    prisma.nutritionFood.count.mockResolvedValue(0);
    prisma.nutritionFood.findMany.mockResolvedValue([]);

    await service.findAll({ search: '西蓝花', page: 1, pageSize: 20 });

    expect(prisma.nutritionFood.count).toHaveBeenCalledWith({
      where: {
        OR: expect.arrayContaining([
          { name: { contains: '西蓝花', mode: 'insensitive' } },
          { nameEn: { contains: '西蓝花', mode: 'insensitive' } },
          { displayNameZh: { contains: '西蓝花', mode: 'insensitive' } },
        ]),
      },
    });
  });

  it('limits nutrition food search expansion terms while keeping the original keyword first', async () => {
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
    prisma.nutritionFood.count.mockResolvedValue(0);
    prisma.nutritionFood.findMany.mockResolvedValue([]);

    await service.findAll({ search: '西蓝花', page: 1, pageSize: 20 });

    const where = prisma.nutritionFood.count.mock.calls[0][0].where;
    const searchedNames = where.OR.filter((condition: any) => condition.name)
      .map((condition: any) => condition.name.contains);
    expect(searchedNames).toEqual([
      '西蓝花',
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

  it('records nutrition food list searches with the total result count', async () => {
    prisma.nutritionFood.count.mockResolvedValue(4);
    prisma.nutritionFood.findMany.mockResolvedValue([]);

    await service.findAll({ search: ' 西蓝花 ', page: 1, pageSize: 20 });

    expect(searchGovernance.recordSearchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'NUTRITION_FOOD',
        source: 'ADMIN_NUTRITION_FOOD_LIST',
        rawQuery: '西蓝花',
        resultCount: 4,
      }),
    );
  });

  it('keeps returning nutrition food results when search event logging fails', async () => {
    searchGovernance.recordSearchEvent.mockRejectedValue(
      new Error('log unavailable'),
    );
    prisma.nutritionFood.count.mockResolvedValue(0);
    prisma.nutritionFood.findMany.mockResolvedValue([]);

    await expect(
      service.findAll({ search: '西蓝花', page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    expect(searchGovernance.recordSearchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'NUTRITION_FOOD',
        source: 'ADMIN_NUTRITION_FOOD_LIST',
        rawQuery: '西蓝花',
        resultCount: 0,
      }),
    );
  });

  it('stores manual Chinese display name metadata when creating a nutrition food', async () => {
    prisma.nutritionFood.findFirst.mockResolvedValue(null);
    prisma.nutritionFood.create.mockImplementation(async (args: any) => ({
      id: 'food-1',
      version: 1,
      status: 'PENDING',
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      mappings: [],
      ...args.data,
    }));

    const result = await service.create(
      {
        name: 'Fish, salmon, Atlantic, farmed, raw',
        displayNameZh: '  三文鱼，大西洋，养殖，生  ',
        category: NutritionFoodCategory.OTHER,
        dataSource: 'USDA',
        nutritionData: {},
      } as any,
      'staff-1',
    );

    expect(prisma.nutritionFood.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        displayNameZh: '三文鱼，大西洋，养殖，生',
        displayNameZhSource: 'MANUAL',
        displayNameZhReviewedAt: expect.any(Date),
        displayNameZhReviewedBy: 'staff-1',
      }),
      include: { mappings: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        displayNameZh: '三文鱼，大西洋，养殖，生',
        displayNameZhSource: 'MANUAL',
        displayNameZhReviewedBy: 'staff-1',
      }),
    );
  });

  it('updates and clears Chinese display name metadata explicitly', async () => {
    prisma.nutritionFood.findUnique.mockResolvedValue({ id: 'food-1' });
    prisma.nutritionFood.update.mockImplementation(async (args: any) => ({
      id: 'food-1',
      name: 'Fish, salmon, Atlantic, farmed, raw',
      nameEn: null,
      category: NutritionFoodCategory.OTHER,
      dataSource: 'USDA',
      externalId: null,
      version: 1,
      status: 'VERIFIED',
      nutritionData: {},
      notes: null,
      createdBy: null,
      verifiedBy: null,
      verifiedAt: null,
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      mappings: [],
      ...args.data,
    }));

    await (service as any).update(
      'food-1',
      { displayNameZh: '   ' },
      'staff-1',
    );

    expect(prisma.nutritionFood.update).toHaveBeenCalledWith({
      where: { id: 'food-1' },
      data: expect.objectContaining({
        displayNameZh: null,
        displayNameZhSource: null,
        displayNameZhReviewedAt: null,
        displayNameZhReviewedBy: null,
      }),
      include: expect.any(Object),
    });
  });
});

describe('NutritionFoodService USDA import', () => {
  const originalApiKey = process.env.USDA_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.USDA_API_KEY = originalApiKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('stores imported USDA nutrients as structured NutritionProfileV2 metadata, not legacy flat keys', async () => {
    process.env.USDA_API_KEY = 'test-usda-key';
    const prisma = {
      nutritionFood: {
        create: jest.fn((params) =>
          Promise.resolve({
            id: 'nutrition-food-1',
            name: params.data.name,
            nameEn: null,
            category: params.data.category,
            dataSource: params.data.dataSource,
            externalId: params.data.externalId,
            version: 1,
            status: NutritionFoodStatus.PENDING,
            nutritionData: params.data.nutritionData,
            notes: null,
            createdBy: params.data.createdBy,
            verifiedBy: null,
            verifiedAt: null,
            createdAt: new Date('2026-05-11T00:00:00.000Z'),
            updatedAt: new Date('2026-05-11T00:00:00.000Z'),
            mappings: [],
          }),
        ),
      },
    } as any;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        fdcId: 173904,
        description: 'Oats, regular and quick, not fortified, dry',
        publicationDate: '2019-04-01',
        foodNutrients: [
          {
            nutrient: { id: 1008, name: 'Energy', unitName: 'kcal' },
            amount: 379,
          },
          {
            nutrient: {
              id: 1114,
              name: 'Vitamin D (D2 + D3)',
              unitName: 'µg',
            },
            amount: 2.5,
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const service = new NutritionFoodService(prisma);
    await service.importFromUSDA(
      '173904',
      'Oats',
      NutritionFoodCategory.GRAIN,
      'user-1',
    );

    const nutritionData =
      prisma.nutritionFood.create.mock.calls[0][0].data.nutritionData;

    expect(nutritionData).toMatchObject({
      meta: {
        rawBasisType: 'PER_100_G',
        sourceType: 'USDA',
        sourceKind: 'FOOD_DATABASE',
        sourceCode: 'USDA_FDC',
        sourceProvider: 'USDA FoodData Central',
        sourceVersion: 'USDA_FDC:2019-04-01',
        externalId: '173904',
        confidenceLevel: 'MEDIUM',
      },
      macros: { energyKcal: 379 },
      vitamins: { vitaminD: 100 },
    });
    expect(
      validateNutritionProfileContract(nutritionData, {
        requireSourceMeta: true,
      }),
    ).toEqual([]);
    expect(nutritionData).not.toHaveProperty('energy_kcal');
    expect(nutritionData.meta.sourceForms['vitamins.vitaminD']).toMatchObject({
      sourceNutrientId: 1114,
      originalUnit: 'µg',
      canonicalUnit: 'IU',
    });
  });
});

describe('NutritionFoodService mapped profile management', () => {
  const primaryNutritionData = {
    meta: { rawBasisType: 'PER_100_G', sourceType: 'USDA' },
    macros: { energyKcal: 15, moisture: 95.2 },
  };
  const editedNutritionData = {
    meta: { rawBasisType: 'PER_100_G', sourceType: 'MANUAL' },
    macros: { energyKcal: 16, moisture: 95.1 },
  };

  const prisma = {
    nutritionFood: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    nutritionFoodMapping: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ingredient: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
  });

  it('refreshes Ingredient.nutritionProfile when an edited nutrition food is primary', async () => {
    prisma.nutritionFood.findUnique.mockResolvedValue({
      id: 'nutrition-food-with-peel',
    });
    prisma.nutritionFood.update.mockResolvedValue({
      id: 'nutrition-food-with-peel',
      name: 'Cucumber, with peel, raw',
      nameEn: 'Cucumber, with peel, raw',
      category: NutritionFoodCategory.OTHER,
      dataSource: 'USDA',
      externalId: 'USDA:168409',
      version: 1,
      status: NutritionFoodStatus.VERIFIED,
      nutritionData: editedNutritionData,
      createdAt: new Date('2026-05-16T00:00:00.000Z'),
      updatedAt: new Date('2026-05-16T00:00:00.000Z'),
      mappings: [
        {
          id: 'mapping-primary',
          ingredientId: 'ingredient-cucumber',
          nutritionFoodId: 'nutrition-food-with-peel',
          isPrimary: true,
          yieldRate: 1,
          notes: null,
          ingredient: {
            id: 'ingredient-cucumber',
            name: '黄瓜',
            type: 'FOOD',
            purchaseUnit: 'g',
          },
        },
      ],
    });

    const service = new NutritionFoodService(prisma);
    await service.update('nutrition-food-with-peel', {
      nutritionData: editedNutritionData,
    });

    expect(prisma.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ingredient-cucumber'] } },
      data: { nutritionProfile: editedNutritionData },
    });
  });

  it('sets a mapped nutrition food as primary and updates the ingredient cache', async () => {
    prisma.nutritionFoodMapping.findUnique.mockResolvedValue({
      id: 'mapping-peeled',
      ingredientId: 'ingredient-cucumber',
      nutritionFoodId: 'nutrition-food-peeled',
      isPrimary: false,
      yieldRate: 1,
      notes: null,
      nutritionFood: {
        id: 'nutrition-food-peeled',
        name: 'Cucumber, peeled, raw',
        nutritionData: primaryNutritionData,
      },
    });
    prisma.nutritionFoodMapping.update.mockResolvedValue({
      id: 'mapping-peeled',
      ingredientId: 'ingredient-cucumber',
      nutritionFoodId: 'nutrition-food-peeled',
      isPrimary: true,
      yieldRate: 1,
      notes: '去皮主档案',
    });

    const service = new NutritionFoodService(prisma);
    await service.updateMapping(
      'nutrition-food-peeled',
      'ingredient-cucumber',
      {
        isPrimary: true,
        notes: '去皮主档案',
      },
    );

    expect(prisma.nutritionFoodMapping.updateMany).toHaveBeenCalledWith({
      where: {
        ingredientId: 'ingredient-cucumber',
        isPrimary: true,
        NOT: { nutritionFoodId: 'nutrition-food-peeled' },
      },
      data: { isPrimary: false },
    });
    expect(prisma.nutritionFoodMapping.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          nutritionFoodId_ingredientId: {
            nutritionFoodId: 'nutrition-food-peeled',
            ingredientId: 'ingredient-cucumber',
          },
        },
        data: expect.objectContaining({
          isPrimary: true,
          notes: '去皮主档案',
        }),
      }),
    );
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'ingredient-cucumber' },
      data: { nutritionProfile: primaryNutritionData },
    });
  });

  it('creates a primary mapping and initializes the ingredient cache', async () => {
    prisma.nutritionFood.findUnique.mockResolvedValue({
      id: 'nutrition-food-manual',
      nutritionData: primaryNutritionData,
    });
    prisma.ingredient.findUnique = jest.fn().mockResolvedValue({
      id: 'ingredient-cucumber',
    });
    prisma.nutritionFoodMapping.findUnique.mockResolvedValue(null);
    prisma.nutritionFoodMapping.create = jest.fn().mockResolvedValue({
      id: 'mapping-manual',
      ingredientId: 'ingredient-cucumber',
      nutritionFoodId: 'nutrition-food-manual',
      isPrimary: true,
      yieldRate: 1,
      notes: '手工档案',
      ingredient: {
        id: 'ingredient-cucumber',
        name: '黄瓜',
        type: 'FOOD',
        purchaseUnit: 'g',
      },
    });

    const service = new NutritionFoodService(prisma);
    await service.createMapping('nutrition-food-manual', {
      ingredientId: 'ingredient-cucumber',
      isPrimary: true,
      notes: '手工档案',
    });

    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'ingredient-cucumber' },
      data: { nutritionProfile: primaryNutritionData },
    });
  });

  it('removes a secondary nutrition profile mapping without changing the ingredient cache', async () => {
    prisma.nutritionFoodMapping.findUnique.mockResolvedValue({
      id: 'mapping-secondary',
      ingredientId: 'ingredient-cucumber',
      nutritionFoodId: 'nutrition-food-peeled',
      isPrimary: false,
    });
    prisma.nutritionFoodMapping.delete.mockResolvedValue({
      id: 'mapping-secondary',
    });

    const service = new NutritionFoodService(prisma);
    await service.removeMapping('nutrition-food-peeled', 'ingredient-cucumber');

    expect(prisma.nutritionFoodMapping.delete).toHaveBeenCalledWith({
      where: {
        nutritionFoodId_ingredientId: {
          nutritionFoodId: 'nutrition-food-peeled',
          ingredientId: 'ingredient-cucumber',
        },
      },
    });
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it('promotes another profile when removing the current primary mapping', async () => {
    prisma.nutritionFoodMapping.findUnique.mockResolvedValue({
      id: 'mapping-primary',
      ingredientId: 'ingredient-cucumber',
      nutritionFoodId: 'nutrition-food-with-peel',
      isPrimary: true,
    });
    prisma.nutritionFoodMapping.findMany.mockResolvedValue([
      {
        id: 'mapping-fallback',
        ingredientId: 'ingredient-cucumber',
        nutritionFoodId: 'nutrition-food-peeled',
        isPrimary: false,
        nutritionFood: {
          id: 'nutrition-food-peeled',
          nutritionData: primaryNutritionData,
        },
      },
    ]);
    prisma.nutritionFoodMapping.delete.mockResolvedValue({
      id: 'mapping-primary',
    });
    prisma.nutritionFoodMapping.update.mockResolvedValue({
      id: 'mapping-fallback',
      isPrimary: true,
    });

    const service = new NutritionFoodService(prisma);
    await service.removeMapping(
      'nutrition-food-with-peel',
      'ingredient-cucumber',
    );

    expect(prisma.nutritionFoodMapping.delete).toHaveBeenCalledWith({
      where: {
        nutritionFoodId_ingredientId: {
          nutritionFoodId: 'nutrition-food-with-peel',
          ingredientId: 'ingredient-cucumber',
        },
      },
    });
    expect(prisma.nutritionFoodMapping.update).toHaveBeenCalledWith({
      where: { id: 'mapping-fallback' },
      data: { isPrimary: true },
    });
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'ingredient-cucumber' },
      data: { nutritionProfile: primaryNutritionData },
    });
  });

  it('rejects removing the only primary nutrition profile mapping', async () => {
    prisma.nutritionFoodMapping.findUnique.mockResolvedValue({
      id: 'mapping-primary',
      ingredientId: 'ingredient-cucumber',
      nutritionFoodId: 'nutrition-food-with-peel',
      isPrimary: true,
    });
    prisma.nutritionFoodMapping.findMany.mockResolvedValue([]);

    const service = new NutritionFoodService(prisma);

    await expect(
      service.removeMapping('nutrition-food-with-peel', 'ingredient-cucumber'),
    ).rejects.toThrow('不能删除唯一营养档案');
    expect(prisma.nutritionFoodMapping.delete).not.toHaveBeenCalled();
  });
});
