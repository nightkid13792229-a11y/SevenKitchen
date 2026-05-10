import { Test, TestingModule } from '@nestjs/testing';
import { NutritionCandidateStatus, Prisma } from '@prisma/client';
import { NutritionGovernanceService } from '../../../src/application/nutrition-governance/nutrition-governance.service';
import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('NutritionGovernanceService', () => {
  let service: NutritionGovernanceService;
  const originalUsdaApiKey = process.env.USDA_API_KEY;
  const originalFetch = global.fetch;

  const mockPrismaService = {
    ingredient: {
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ingredientNutritionCandidate: {
      count: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    nutritionFood: {
      upsert: jest.fn(),
    },
    nutritionFoodMapping: {
      upsert: jest.fn(),
    },
    nutritionSourceRecord: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    supplementNutritionDraft: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NutritionGovernanceService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get(NutritionGovernanceService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrismaService),
    );
  });

  afterEach(() => {
    if (originalUsdaApiKey === undefined) {
      delete process.env.USDA_API_KEY;
    } else {
      process.env.USDA_API_KEY = originalUsdaApiKey;
    }
    global.fetch = originalFetch;
  });

  it('getOverview excludes packaging from coverage and returns mocked counts', async () => {
    mockPrismaService.ingredient.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1);
    mockPrismaService.ingredientNutritionCandidate.count = jest
      .fn()
      .mockResolvedValue(7);
    mockPrismaService.supplementNutritionDraft.count.mockResolvedValue(3);

    await expect(service.getOverview()).resolves.toEqual({
      foodIngredientCount: 4,
      supplementIngredientCount: 2,
      confirmedNutritionProfileCount: 5,
      incompleteProfileCount: 1,
      candidateCount: 7,
      supplementDraftCount: 3,
    });

    expect(mockPrismaService.ingredient.count).toHaveBeenNthCalledWith(1, {
      where: { type: 'FOOD' },
    });
    expect(mockPrismaService.ingredient.count).toHaveBeenNthCalledWith(2, {
      where: { type: 'SUPPLEMENT' },
    });
    expect(mockPrismaService.ingredient.count).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: ['FOOD', 'SUPPLEMENT'] },
        }),
      }),
    );
    expect(mockPrismaService.ingredient.count).toHaveBeenNthCalledWith(4, {
      where: {
        type: { in: ['FOOD', 'SUPPLEMENT'] },
        nutritionProfile: { equals: Prisma.AnyNull },
      },
    });
  });

  it('upsertSourceRecord uses the compound source key for USDA records', async () => {
    const normalizedNutrition = createEmptyNutritionProfile();
    mockPrismaService.nutritionSourceRecord.upsert.mockResolvedValue({
      id: 'source-record-1',
      sourceType: 'USDA',
      sourceKey: 'USDA:123',
    });

    await service.upsertSourceRecord({
      sourceType: 'USDA',
      externalId: '123',
      sourceTitle: 'USDA Chicken Breast',
      foodName: 'Chicken Breast',
      foodNameEn: 'Chicken Breast',
      dataType: 'Foundation',
      category: 'Poultry',
      sourceDetail: { provider: 'USDA FoodData Central' },
      rawData: { fdcId: 123 },
      normalizedNutrition,
    });

    expect(mockPrismaService.nutritionSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceType_sourceKey: {
            sourceType: 'USDA',
            sourceKey: 'USDA:123',
          },
        },
        create: expect.objectContaining({
          sourceType: 'USDA',
          sourceKey: 'USDA:123',
          sourceDetail: { provider: 'USDA FoodData Central' },
          rawData: { fdcId: 123 },
          normalizedNutrition,
          status: 'ACTIVE',
        }),
        update: expect.objectContaining({
          sourceTitle: 'USDA Chicken Breast',
          rawData: { fdcId: 123 },
          normalizedNutrition,
        }),
      }),
    );
    const call = mockPrismaService.nutritionSourceRecord.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('status');
  });

  it('imports a USDA source record by FDC id', async () => {
    process.env.USDA_API_KEY = 'test-usda-key';
    const food = {
      fdcId: 171077,
      description: 'Chicken breast, cooked, roasted',
      dataType: 'SR Legacy',
      publicationDate: '2019-04-01',
      foodCategory: { description: 'Poultry Products' },
      foodNutrients: [
        {
          nutrient: { id: 1008, name: 'Energy', unitName: 'kcal' },
          amount: 165,
        },
        {
          nutrient: { id: 1003, name: 'Protein', unitName: 'g' },
          amount: 31,
        },
      ],
    };
    const importedRecord = {
      id: 'source-record-1',
      sourceType: 'USDA',
      sourceKey: 'USDA:171077',
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(food),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;
    mockPrismaService.nutritionSourceRecord.upsert.mockResolvedValue(
      importedRecord,
    );

    await expect(service.importUsdaSourceRecord('171077')).resolves.toBe(
      importedRecord,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.nal.usda.gov/fdc/v1/food/171077?api_key=test-usda-key',
      { headers: { Accept: 'application/json' } },
    );
    expect(mockPrismaService.nutritionSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceType_sourceKey: {
            sourceType: 'USDA',
            sourceKey: 'USDA:171077',
          },
        },
        create: expect.objectContaining({
          sourceType: 'USDA',
          sourceKey: 'USDA:171077',
          sourceTitle: 'USDA FoodData Central',
          foodName: 'Chicken breast, cooked, roasted',
          foodNameEn: 'Chicken breast, cooked, roasted',
          dataType: 'SR Legacy',
          category: 'Poultry Products',
          sourceDetail: expect.objectContaining({
            fdcId: '171077',
            publicationDate: '2019-04-01',
          }),
          rawData: food,
          normalizedNutrition: expect.objectContaining({
            meta: expect.objectContaining({ sourceType: 'USDA' }),
            macros: expect.objectContaining({
              energyKcal: 165,
              crudeProtein: 31,
            }),
          }),
        }),
        update: expect.objectContaining({
          sourceTitle: 'USDA FoodData Central',
          rawData: food,
        }),
      }),
    );
  });

  it('rejects USDA import when the API key is missing', async () => {
    delete process.env.USDA_API_KEY;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(service.importUsdaSourceRecord('171077')).rejects.toThrow(
      'USDA API密钥未配置',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrismaService.nutritionSourceRecord.upsert).not.toHaveBeenCalled();
  });

  it('rejects USDA import when the API response fails', async () => {
    process.env.USDA_API_KEY = 'test-usda-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn(),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(service.importUsdaSourceRecord('171077')).rejects.toThrow(
      'USDA API请求失败',
    );

    expect(mockPrismaService.nutritionSourceRecord.upsert).not.toHaveBeenCalled();
  });

  it('does not reopen confirmed candidates when regenerating food matches', async () => {
    const normalizedNutrition = createEmptyNutritionProfile();
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      name: 'Chicken Breast',
      type: 'FOOD',
    });
    mockPrismaService.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-record-1',
        sourceType: 'USDA',
        foodName: 'Chicken Breast',
        normalizedNutrition,
      },
    ]);
    mockPrismaService.ingredientNutritionCandidate.findUnique.mockResolvedValue({
      id: 'candidate-1',
      status: NutritionCandidateStatus.CONFIRMED,
    });

    await expect(
      service.generateFoodCandidatesForIngredient('ingredient-1'),
    ).resolves.toEqual([]);

    expect(
      mockPrismaService.ingredientNutritionCandidate.upsert,
    ).not.toHaveBeenCalled();
  });

  it('confirmCandidate writes source metadata into Ingredient.nutritionProfile and confirms the candidate', async () => {
    const normalizedNutrition = createEmptyNutritionProfile();
    normalizedNutrition.macros.energyKcal = 165;
    mockPrismaService.ingredientNutritionCandidate.findUnique.mockResolvedValue(
      {
        id: 'candidate-1',
        ingredientId: 'ingredient-1',
        sourceRecordId: 'source-record-1',
        status: NutritionCandidateStatus.CANDIDATE,
        confidence: 'HIGH',
        score: 0.9,
        matchReasons: [
          { code: 'NAME_EXACT', label: '名称完全匹配', scoreDelta: 0.75 },
        ],
        normalizedNutrition,
        ingredient: {
          id: 'ingredient-1',
          name: 'Chicken Breast',
          type: 'FOOD',
        },
        sourceRecord: {
          id: 'source-record-1',
          sourceType: 'USDA',
          sourceTitle: 'USDA Chicken Breast',
          sourceDetail: { provider: 'USDA FoodData Central' },
          sourceKey: 'USDA:123',
          foodName: 'Chicken Breast',
          foodNameEn: 'Chicken Breast',
        },
      },
    );
    mockPrismaService.nutritionFood.upsert.mockResolvedValue({
      id: 'nutrition-food-1',
    });
    mockPrismaService.ingredientNutritionCandidate.update.mockResolvedValue({
      id: 'candidate-1',
      status: NutritionCandidateStatus.CONFIRMED,
    });

    await expect(
      service.confirmCandidate('candidate-1', 'admin-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        status: NutritionCandidateStatus.CONFIRMED,
      }),
    );

    expect(mockPrismaService.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'ingredient-1' },
      data: {
        nutritionProfile: expect.objectContaining({
          meta: expect.objectContaining({
            sourceType: 'USDA',
            sourceTitle: 'USDA Chicken Breast',
            sourceProvider: 'USDA FoodData Central',
            confidenceLevel: 'HIGH',
          }),
        }),
      },
    });
    expect(mockPrismaService.nutritionFood.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'VERIFIED',
        }),
      }),
    );
  });

  it('rejects confirmation for terminal candidates before writing nutrition data', async () => {
    const normalizedNutrition = createEmptyNutritionProfile();
    mockPrismaService.ingredientNutritionCandidate.findUnique.mockResolvedValue({
      id: 'candidate-1',
      ingredientId: 'ingredient-1',
      sourceRecordId: 'source-record-1',
      status: NutritionCandidateStatus.REJECTED,
      confidence: 'HIGH',
      score: 0.9,
      normalizedNutrition,
      ingredient: { id: 'ingredient-1', name: 'Chicken Breast', type: 'FOOD' },
      sourceRecord: {
        id: 'source-record-1',
        sourceType: 'USDA',
        sourceTitle: 'USDA Chicken Breast',
        sourceDetail: null,
        sourceKey: 'USDA:123',
        foodName: 'Chicken Breast',
        foodNameEn: null,
      },
    });

    await expect(
      service.confirmCandidate('candidate-1', 'admin-1'),
    ).rejects.toThrow('仅待确认候选可以确认');

    expect(mockPrismaService.ingredient.update).not.toHaveBeenCalled();
    expect(mockPrismaService.nutritionFood.upsert).not.toHaveBeenCalled();
  });

  it('does not reject an already confirmed candidate', async () => {
    mockPrismaService.ingredientNutritionCandidate.findUnique.mockResolvedValue({
      id: 'candidate-1',
      status: NutritionCandidateStatus.CONFIRMED,
    });

    await expect(service.rejectCandidate('candidate-1')).rejects.toThrow(
      '仅待确认候选可以拒绝',
    );

    expect(mockPrismaService.ingredientNutritionCandidate.update).not.toHaveBeenCalled();
  });
});
