import { Test, TestingModule } from '@nestjs/testing';
import {
  NutritionCandidateStatus,
  Prisma,
  SupplementNutritionDraftStatus,
} from '@prisma/client';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { LabelRecognitionProvider } from '../../../src/application/nutrition-governance/label-recognition.provider';
import { NutritionGovernanceService } from '../../../src/application/nutrition-governance/nutrition-governance.service';
import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import { validateNutritionProfileContract } from '../../../src/domain/nutrition-governance/nutrition-profile-contract';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('NutritionGovernanceService', () => {
  let service: NutritionGovernanceService;
  const originalUsdaApiKey = process.env.USDA_API_KEY;
  const originalUsdaLocalDataDir = process.env.USDA_LOCAL_DATA_DIR;
  const originalCfctFullReportDir = process.env.CFCT_FULL_REPORT_DIR;
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
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    nutritionFood: {
      upsert: jest.fn(),
    },
    nutritionFoodMapping: {
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    nutritionSourceRecord: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    supplementNutritionDraft: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
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
    mockPrismaService.nutritionSourceRecord.findUnique.mockResolvedValue(null);
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
    if (originalUsdaLocalDataDir === undefined) {
      delete process.env.USDA_LOCAL_DATA_DIR;
    } else {
      process.env.USDA_LOCAL_DATA_DIR = originalUsdaLocalDataDir;
    }
    if (originalCfctFullReportDir === undefined) {
      delete process.env.CFCT_FULL_REPORT_DIR;
    } else {
      process.env.CFCT_FULL_REPORT_DIR = originalCfctFullReportDir;
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
    process.env.USDA_LOCAL_DATA_DIR = join(tmpdir(), 'missing-usda-local-dir');
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
            provider: 'USDA FoodData Central',
            sourceProvider: 'USDA FoodData Central',
            publicationDate: '2019-04-01',
          }),
          rawData: food,
          normalizedNutrition: expect.objectContaining({
            meta: expect.objectContaining({
              sourceType: 'USDA',
              sourceKind: 'FOOD_DATABASE',
              sourceCode: 'USDA_FDC',
              sourceProvider: 'USDA FoodData Central',
              sourceVersion: 'USDA_FDC:2019-04-01',
              externalId: '171077',
              confidenceLevel: 'MEDIUM',
            }),
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
    const normalizedNutrition =
      mockPrismaService.nutritionSourceRecord.upsert.mock.calls[0][0].create
        .normalizedNutrition;
    expect(
      validateNutritionProfileContract(normalizedNutrition, {
        requireSourceMeta: true,
      }),
    ).toEqual([]);
  });

  it('imports reviewed CFCT OCR rows into nutrition source records', async () => {
    const importedRecord = {
      id: 'cfct-source-1',
      sourceType: 'CFCT',
      sourceKey: 'CFCT:第六版 第一册:p120:r7',
      foodName: '苹果（代表值）',
    };
    mockPrismaService.nutritionSourceRecord.upsert.mockResolvedValue(
      importedRecord,
    );

    await expect(
      service.importReviewedCfctSourceRows({
        rows: [
          {
            volume: '第六版 第一册',
            page: 120,
            row: 7,
            foodName: '苹果（代表值）',
            foodCode: '061101x',
            ediblePortionPercent: 85,
            energyKj: 227,
            nutrients: {
              moisture: 86.1,
              energyKcal: 53,
              crudeProtein: 0.4,
              crudeFat: 0.2,
              carbohydrate: 13.7,
              insolubleFiber: 1.7,
            },
          },
        ],
      }),
    ).resolves.toEqual({
      importedCount: 1,
      records: [importedRecord],
    });

    expect(mockPrismaService.nutritionSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceType_sourceKey: {
            sourceType: 'CFCT',
            sourceKey: 'CFCT:第六版 第一册:p120:r7',
          },
        },
        create: expect.objectContaining({
          sourceType: 'CFCT',
          foodName: '苹果（代表值）',
          sourceDetail: expect.objectContaining({
            volume: '第六版 第一册',
            page: 120,
            row: 7,
            foodCode: '061101x',
            ediblePortionPercent: 85,
            energyKj: 227,
          }),
          normalizedNutrition: expect.objectContaining({
            meta: expect.objectContaining({
              sourceType: 'CFCT',
              sourceProvider: '中国食物成分表',
            }),
            macros: expect.objectContaining({
              energyKcal: 53,
              moisture: 86.1,
              insolubleFiber: 1.7,
            }),
          }),
        }),
      }),
    );
  });

  it('loads the generated local CFCT structured library queue for admin review', async () => {
    const reportDir = await mkdtemp(join(tmpdir(), 'cfct-full-'));
    process.env.CFCT_FULL_REPORT_DIR = reportDir;
    await writeFile(
      join(reportDir, 'cfct-v6-full-review-summary.json'),
      JSON.stringify({
        generatedAt: '2026-05-17T09:23:38.184Z',
        totalRows: 2,
        autoReadyRows: 1,
        needsReviewRows: 1,
      }),
      'utf8',
    );
    await writeFile(
      join(reportDir, 'cfct-v6-full-auto-ready.json'),
      JSON.stringify({
        generatedAt: '2026-05-17T09:23:38.184Z',
        rows: [
          {
            volume: '第六版 第一册',
            page: 88,
            row: 16,
            foodName: '黄瓜（鲜）［胡瓜］',
            foodCode: '043208',
            nutrients: { energyKcal: 16, moisture: 95.8 },
            qualityFlags: [],
            reviewStatus: 'AUTO_STRUCTURED',
          },
        ],
      }),
      'utf8',
    );

    await expect(
      service.getLocalCfctStructuredLibrary({ queue: 'auto-ready' }),
    ).resolves.toMatchObject({
      queue: 'auto-ready',
      rowCount: 1,
      summary: {
        totalRows: 2,
        autoReadyRows: 1,
        needsReviewRows: 1,
      },
      rows: [
        expect.objectContaining({
          foodName: '黄瓜（鲜）［胡瓜］',
          foodCode: '043208',
        }),
      ],
    });
  });

  it('reports a clear error when the local CFCT structured library is missing', async () => {
    const reportDir = await mkdtemp(join(tmpdir(), 'missing-cfct-full-'));
    process.env.CFCT_FULL_REPORT_DIR = reportDir;

    await expect(
      service.getLocalCfctStructuredLibrary({ queue: 'needs-review' }),
    ).rejects.toThrow('CFCT 全量中间库尚未生成');
  });

  it('creates a candidate for a selected Chinese ingredient during USDA import', async () => {
    process.env.USDA_API_KEY = 'test-usda-key';
    process.env.USDA_LOCAL_DATA_DIR = join(tmpdir(), 'missing-usda-local-dir');
    const normalizedNutrition = createEmptyNutritionProfile();
    normalizedNutrition.macros.energyKcal = 165;
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
      ],
    };
    const sourceRecord = {
      id: 'source-record-1',
      sourceType: 'USDA',
      sourceKey: 'USDA:171077',
      sourceTitle: 'USDA FoodData Central',
      sourceDetail: { provider: 'USDA FoodData Central' },
      foodName: 'Chicken breast, cooked, roasted',
      foodNameEn: 'Chicken breast, cooked, roasted',
      normalizedNutrition,
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(food),
    }) as unknown as typeof global.fetch;
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      name: '鸡胸肉',
      type: 'FOOD',
    });
    mockPrismaService.nutritionSourceRecord.upsert.mockResolvedValue(
      sourceRecord,
    );
    mockPrismaService.ingredientNutritionCandidate.findUnique.mockResolvedValue(
      null,
    );
    mockPrismaService.ingredientNutritionCandidate.upsert.mockResolvedValue({
      id: 'candidate-1',
      ingredientId: 'ingredient-1',
      sourceRecordId: 'source-record-1',
    });

    await expect(
      service.importUsdaSourceRecord('171077', {
        ingredientId: 'ingredient-1',
      }),
    ).resolves.toBe(sourceRecord);

    expect(mockPrismaService.ingredient.findUnique).toHaveBeenCalledWith({
      where: { id: 'ingredient-1' },
      select: { id: true, name: true, type: true },
    });
    expect(
      mockPrismaService.ingredientNutritionCandidate.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          ingredientId: 'ingredient-1',
          sourceRecordId: 'source-record-1',
          sourcePriority: 1,
          confidence: 'HIGH',
          score: 0.95,
          status: NutritionCandidateStatus.CANDIDATE,
          matchReasons: expect.arrayContaining([
            expect.objectContaining({
              code: 'MANUAL',
              label: '人工指定 USDA FDC ID',
            }),
            expect.objectContaining({
              code: 'SOURCE_PRIORITY',
              label: 'USDA 优先来源',
            }),
          ]),
        }),
      }),
    );
  });

  it('imports a USDA source record from local CSV files when the API key is missing', async () => {
    delete process.env.USDA_API_KEY;
    const localDir = await mkdtemp(join(tmpdir(), 'usda-local-'));
    process.env.USDA_LOCAL_DATA_DIR = localDir;
    await writeFile(
      join(localDir, 'food.csv'),
      [
        '"fdc_id","data_type","description","food_category_id","publication_date"',
        '"169934","sr_legacy_food","Peaches, dried, sulfured, uncooked","9","2019-04-01"',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(localDir, 'nutrient.csv'),
      [
        '"id","name","unit_name","nutrient_nbr","rank"',
        '"1008","Energy","KCAL","208","300.0"',
        '"1003","Protein","G","203","600.0"',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(localDir, 'food_nutrient.csv'),
      [
        '"id","fdc_id","nutrient_id","amount","data_points","derivation_id","min","max","median","footnote","min_year_acquired"',
        '"1","169934","1008","239","1","46","","","","",""',
        '"2","169934","1003","3.61","1","46","","","","",""',
      ].join('\n'),
      'utf8',
    );

    const importedRecord = {
      id: 'source-record-local',
      sourceType: 'USDA',
      sourceKey: 'USDA:169934',
    };
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
    mockPrismaService.nutritionSourceRecord.upsert.mockResolvedValueOnce(
      importedRecord,
    );

    await expect(service.importUsdaSourceRecord('169934')).resolves.toBe(
      importedRecord,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrismaService.nutritionSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceKey: 'USDA:169934',
          foodName: 'Peaches, dried, sulfured, uncooked',
          rawData: expect.objectContaining({
            fdcId: '169934',
            dataType: 'sr_legacy_food',
            foodNutrients: expect.arrayContaining([
              expect.objectContaining({
                nutrient: expect.objectContaining({
                  id: 1008,
                  name: 'Energy',
                  unitName: 'KCAL',
                }),
                amount: 239,
              }),
            ]),
          }),
          normalizedNutrition: expect.objectContaining({
            macros: expect.objectContaining({
              energyKcal: 239,
              crudeProtein: 3.61,
            }),
          }),
        }),
      }),
    );
  });

  it('refreshes generated USDA candidates from local CSV detail rows before storing nutrition', async () => {
    const localDir = await mkdtemp(join(tmpdir(), 'usda-local-candidate-'));
    process.env.USDA_LOCAL_DATA_DIR = localDir;
    await writeFile(
      join(localDir, 'food.csv'),
      [
        '"fdc_id","data_type","description","food_category_id","publication_date"',
        '"169934","sr_legacy_food","Peaches, dried, sulfured, uncooked","9","2019-04-01"',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(localDir, 'nutrient.csv'),
      [
        '"id","name","unit_name","nutrient_nbr","rank"',
        '"1008","Energy","KCAL","208","300.0"',
        '"1051","Water","G","255","100.0"',
        '"1109","Vitamin E (alpha-tocopherol)","MG","323","7905.0"',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(localDir, 'food_nutrient.csv'),
      [
        '"id","fdc_id","nutrient_id","amount","data_points","derivation_id","min","max","median","footnote","min_year_acquired"',
        '"1","169934","1008","239","1","46","","","","",""',
        '"2","169934","1051","8.87","1","46","","","","",""',
        '"3","169934","1109","0.15","1","46","","","","",""',
      ].join('\n'),
      'utf8',
    );

    const staleSourceRecord = {
      id: 'source-record-search',
      sourceType: 'USDA',
      sourceKey: 'USDA:169934',
      sourceTitle: 'USDA FoodData Central',
      sourceDetail: {
        fdcId: '169934',
        importMode: 'bulk-usda-food-candidates',
      },
      foodName: 'Peaches, dried, sulfured, uncooked',
      foodNameEn: 'Peaches, dried, sulfured, uncooked',
      dataType: 'SR Legacy',
      category: null,
      rawData: { fdcId: 169934 },
      normalizedNutrition: {
        macros: { energyKcal: 239, moisture: 8.9 },
        vitamins: { vitaminE: null },
      },
    };

    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      name: 'Peaches dried',
      type: 'FOOD',
    });
    mockPrismaService.nutritionSourceRecord.findMany.mockResolvedValue([
      staleSourceRecord,
    ]);
    mockPrismaService.nutritionSourceRecord.update.mockImplementation(
      async (args: any) => ({
        ...staleSourceRecord,
        ...args.data,
      }),
    );
    mockPrismaService.ingredientNutritionCandidate.findUnique.mockResolvedValue(
      null,
    );
    mockPrismaService.ingredientNutritionCandidate.upsert.mockResolvedValue({
      id: 'candidate-1',
    });

    await service.generateFoodCandidatesForIngredient('ingredient-1');

    expect(mockPrismaService.nutritionSourceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'source-record-search' },
        data: expect.objectContaining({
          foodName: 'Peaches, dried, sulfured, uncooked',
          sourceDetail: expect.objectContaining({
            importMode: 'local-usda-csv',
          }),
          normalizedNutrition: expect.objectContaining({
            macros: expect.objectContaining({
              moisture: 8.87,
            }),
            vitamins: expect.objectContaining({
              vitaminE: 0.2235,
            }),
          }),
        }),
      }),
    );
    expect(
      mockPrismaService.ingredientNutritionCandidate.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          normalizedNutrition: expect.objectContaining({
            macros: expect.objectContaining({
              moisture: 8.87,
            }),
            vitamins: expect.objectContaining({
              vitaminE: 0.2235,
            }),
          }),
        }),
      }),
    );
  });

  it('rejects USDA import when the API key is missing', async () => {
    delete process.env.USDA_API_KEY;
    process.env.USDA_LOCAL_DATA_DIR = join(tmpdir(), 'missing-usda-local-dir');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(service.importUsdaSourceRecord('999999999')).rejects.toThrow(
      'USDA API密钥未配置',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrismaService.nutritionSourceRecord.upsert).not.toHaveBeenCalled();
  });

  it('lists candidates in a stable ingredient-grouped review order', async () => {
    mockPrismaService.ingredientNutritionCandidate.findMany.mockResolvedValue(
      [],
    );

    await expect(
      service.listCandidates({
        status: NutritionCandidateStatus.CANDIDATE,
      }),
    ).resolves.toEqual([]);

    expect(
      mockPrismaService.ingredientNutritionCandidate.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { sourcePriority: 'asc' },
          { score: 'desc' },
          { ingredient: { name: 'asc' } },
          { sourceRecord: { foodName: 'asc' } },
          { id: 'asc' },
        ],
      }),
    );
  });

  it('can list all candidate records for one ingredient so confirmed profiles remain visible', async () => {
    mockPrismaService.ingredientNutritionCandidate.findMany.mockResolvedValue(
      [],
    );

    await expect(
      service.listCandidates({
        ingredientId: 'ingredient-cucumber',
      } as any),
    ).resolves.toEqual([]);

    expect(
      mockPrismaService.ingredientNutritionCandidate.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ingredientId: 'ingredient-cucumber',
        },
      }),
    );
  });

  it('rejects USDA import when the response has no mappable nutrients', async () => {
    process.env.USDA_API_KEY = 'test-usda-key';
    process.env.USDA_LOCAL_DATA_DIR = join(tmpdir(), 'missing-usda-local-dir');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        fdcId: 171077,
        description: 'Chicken breast, cooked, roasted',
        foodNutrients: [],
      }),
    }) as unknown as typeof global.fetch;

    await expect(service.importUsdaSourceRecord('171077')).rejects.toThrow(
      'USDA 营养数据为空',
    );

    expect(mockPrismaService.nutritionSourceRecord.upsert).not.toHaveBeenCalled();
  });

  it('wraps USDA fetch and JSON parsing failures', async () => {
    process.env.USDA_API_KEY = 'test-usda-key';
    process.env.USDA_LOCAL_DATA_DIR = join(tmpdir(), 'missing-usda-local-dir');
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof global.fetch;

    await expect(service.importUsdaSourceRecord('171077')).rejects.toThrow(
      'USDA API请求失败',
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockRejectedValue(new Error('invalid json')),
    }) as unknown as typeof global.fetch;

    await expect(service.importUsdaSourceRecord('171077')).rejects.toThrow(
      'USDA API请求失败',
    );

    expect(mockPrismaService.nutritionSourceRecord.upsert).not.toHaveBeenCalled();
  });

  it('rejects USDA import when the API response fails', async () => {
    process.env.USDA_API_KEY = 'test-usda-key';
    process.env.USDA_LOCAL_DATA_DIR = join(tmpdir(), 'missing-usda-local-dir');
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
            sourceKind: 'FOOD_DATABASE',
            sourceCode: 'USDA_FDC',
            sourceVersion: 'USDA_FDC',
            externalId: '123',
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
    expect(mockPrismaService.nutritionFoodMapping.updateMany).toHaveBeenCalledWith({
      where: {
        ingredientId: 'ingredient-1',
        isPrimary: true,
        NOT: {
          nutritionFoodId: 'nutrition-food-1',
        },
      },
      data: {
        isPrimary: false,
      },
    });
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

  it('creates supplement label drafts without confirming them', async () => {
    const labelExtraction = {
      ocrText: '每粒含 EPA 180mg DHA 120mg',
      extractedItems: [],
      missingFields: ['servingWeightG'],
      normalizedNutrition: null,
    };
    const labelRecognitionProvider: LabelRecognitionProvider = {
      extractFromImage: jest.fn().mockResolvedValue(labelExtraction),
    };
    const serviceWithProvider = new NutritionGovernanceService(
      mockPrismaService,
      labelRecognitionProvider,
    );
    const draft = {
      id: 'draft-1',
      ingredientId: 'supplement-1',
      status: 'DRAFT',
      missingFields: ['servingWeightG'],
    };
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'supplement-1',
      name: '鱼油胶囊',
      type: 'SUPPLEMENT',
      nutritionProfile: { macros: { energyKcal: 10 } },
    });
    mockPrismaService.supplementNutritionDraft.create.mockResolvedValue(draft);

    const result = await serviceWithProvider.createSupplementDraftFromLabelImage({
      ingredientId: 'supplement-1',
      imageUrl: 'https://cdn.example.com/label.jpg',
      imageKey: 'supplement-labels/1.jpg',
      createdBy: 'admin-1',
    });

    expect(result).toBe(draft);
    expect(labelRecognitionProvider.extractFromImage).toHaveBeenCalledWith({
      imageUrl: 'https://cdn.example.com/label.jpg',
      ingredientName: '鱼油胶囊',
    });
    expect(mockPrismaService.supplementNutritionDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ingredientId: 'supplement-1',
        imageUrl: 'https://cdn.example.com/label.jpg',
        imageKey: 'supplement-labels/1.jpg',
        ocrText: '每粒含 EPA 180mg DHA 120mg',
        aiExtraction: labelExtraction,
        missingFields: ['servingWeightG'],
        status: 'DRAFT',
        createdBy: 'admin-1',
      }),
    });
    expect(mockPrismaService.ingredient.update).not.toHaveBeenCalled();
  });

  it('lists supplement drafts with ingredient and source details', async () => {
    const drafts = [
      {
        id: 'draft-1',
        status: SupplementNutritionDraftStatus.DRAFT,
        ingredient: { id: 'supplement-1', name: '鱼油胶囊' },
      },
    ];
    mockPrismaService.supplementNutritionDraft.findMany.mockResolvedValue(
      drafts,
    );

    await expect(
      service.listSupplementDrafts({
        status: SupplementNutritionDraftStatus.DRAFT,
      }),
    ).resolves.toBe(drafts);

    expect(mockPrismaService.supplementNutritionDraft.findMany).toHaveBeenCalledWith({
      where: { status: SupplementNutritionDraftStatus.DRAFT },
      include: expect.objectContaining({
        ingredient: expect.any(Object),
        sourceRecord: true,
      }),
      orderBy: [{ createdAt: 'desc' }],
    });
  });

  it('confirms a supplement draft and writes ingredient nutritionProfile', async () => {
    const normalizedNutrition = createEmptyNutritionProfile();
    normalizedNutrition.fattyAcids.epa = 180;
    normalizedNutrition.fattyAcids.dha = 120;
    const draft = {
      id: 'draft-1',
      ingredientId: 'supplement-1',
      sourceRecordId: null,
      imageUrl: 'https://cdn.example.com/label.jpg',
      imageKey: 'supplement-labels/label.jpg',
      ocrText: 'EPA 180mg DHA 120mg',
      aiExtraction: { extractedItems: [] },
      normalizedNutrition,
      missingFields: [],
      status: SupplementNutritionDraftStatus.DRAFT,
      ingredient: {
        id: 'supplement-1',
        name: '鱼油胶囊',
        type: 'SUPPLEMENT',
      },
      sourceRecord: null,
    };
    mockPrismaService.supplementNutritionDraft.findUnique.mockResolvedValue(
      draft,
    );
    mockPrismaService.nutritionSourceRecord.upsert.mockResolvedValue({
      id: 'source-record-1',
    });
    mockPrismaService.supplementNutritionDraft.update.mockResolvedValue({
      id: 'draft-1',
      status: SupplementNutritionDraftStatus.CONFIRMED,
    });

    await expect(
      service.confirmSupplementDraft('draft-1', 'admin-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        status: SupplementNutritionDraftStatus.CONFIRMED,
      }),
    );

    expect(mockPrismaService.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'supplement-1' },
      data: {
        nutritionProfile: expect.objectContaining({
          meta: expect.objectContaining({
            sourceType: 'SUPPLEMENT_LABEL',
            sourceProvider: 'Product label',
            confidenceLevel: 'HIGH',
          }),
        }),
      },
    });
    expect(mockPrismaService.supplementNutritionDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: expect.objectContaining({
        status: SupplementNutritionDraftStatus.CONFIRMED,
        confirmedBy: 'admin-1',
        sourceRecordId: 'source-record-1',
      }),
    });
  });

  it('rejects supplement drafts only while they are still drafts', async () => {
    mockPrismaService.supplementNutritionDraft.findUnique.mockResolvedValueOnce({
      id: 'draft-1',
      status: SupplementNutritionDraftStatus.DRAFT,
    });
    mockPrismaService.supplementNutritionDraft.update.mockResolvedValue({
      id: 'draft-1',
      status: SupplementNutritionDraftStatus.REJECTED,
    });

    await expect(service.rejectSupplementDraft('draft-1')).resolves.toEqual(
      expect.objectContaining({
        status: SupplementNutritionDraftStatus.REJECTED,
      }),
    );

    mockPrismaService.supplementNutritionDraft.findUnique.mockResolvedValueOnce({
      id: 'draft-2',
      status: SupplementNutritionDraftStatus.CONFIRMED,
    });

    await expect(service.rejectSupplementDraft('draft-2')).rejects.toThrow(
      '仅草稿状态可以拒绝',
    );
  });
});
