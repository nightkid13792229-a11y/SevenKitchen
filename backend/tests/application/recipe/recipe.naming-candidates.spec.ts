import { BadRequestException } from '@nestjs/common';

import { RecipeService } from '../../../src/application/recipe/recipe.service';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';

/**
 * 定制单的上线检查里点「AI 生成」能不能出名字。
 *
 * 背景（2026-11-07 线上反馈）：订单定制的设计草稿要等「加入本单待提交」
 * 才会变成正式食谱（`Recipe` 行）。在那之前系列下一条 `Recipe` 都没有，
 * 命名接口只读 `series.recipes`，于是必然回「这个系列还没有配方，先设计再起名」——
 * 而这时草稿里其实已经有 24 种原料了。
 *
 * 这几条用例锁的是：**没有正式食谱时，用设计草稿的事实起名**；
 * 草稿本身也还是空的，才继续报原来那句话。
 */
describe('RecipeService AI 起名的事实来源', () => {
  const prisma = {
    recipeSeries: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    designRecipe: {
      findMany: jest.fn(),
    },
  } as any;

  const targetProvider = {
    getTargets: jest.fn(),
  };

  const namingService = {
    isAvailable: jest.fn(),
    generate: jest.fn(),
  };

  let designerService: RecipeDesignerService;
  let service: RecipeService;

  function seriesRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'series-1',
      name: '财宝定制 · 青口贝虾仁鸡胸',
      recipes: [],
      ...overrides,
    };
  }

  /** 一条能算营养的草稿明细：100g 鸡胸肉 */
  function draftItem(overrides: Record<string, unknown> = {}) {
    return {
      id: 'item-1',
      designRecipeId: 'draft-1',
      ingredientId: 'ingredient-1',
      nutritionFoodId: 'food-1',
      weightG: 100,
      includeInAssessment: true,
      ratioPercent: 70,
      preparationMethod: null,
      nutrientTargetKey: null,
      nutrientTargetValue: null,
      supplementTargets: null,
      supplementAlternatives: null,
      sortOrder: 0,
      ingredient: { id: 'ingredient-1', name: '鸡胸肉', type: 'FOOD' },
      nutritionFood: {
        id: 'food-1',
        name: '鸡胸肉',
        category: 'MEAT',
        nutritionData: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: {
            energyKcal: 131,
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
        mappings: [],
      },
      ...overrides,
    };
  }

  function draftRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'draft-1',
      name: '财宝定制 · 青口贝虾仁鸡胸',
      version: 1,
      contentRevision: 3,
      status: 'DRAFT',
      fediafDogScenario: 'ADULT_MER_110',
      nutritionStandard: 'FEDIAF_2025',
      energyDensityKcalPerKg: 1310,
      totalWeightG: 100,
      targetHealthTags: [],
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      notes: null,
      calculatedNutrition: {},
      complianceStatus: {},
      assessmentSummary: {},
      missingDataReport: [],
      createdBy: 'staff-1',
      publishedAt: null,
      publishedRecipeId: null,
      publishedRecipeVersion: null,
      seriesId: 'series-1',
      seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      customerDogId: 'dog-1',
      productionStepsJson: [],
      nutritionReportJson: null,
      nutritionReportRevision: null,
      createdAt: new Date('2026-11-07T10:00:00.000Z'),
      updatedAt: new Date('2026-11-07T10:00:00.000Z'),
      items: [draftItem()],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    designerService = new RecipeDesignerService(
      prisma as any,
      targetProvider as any,
    );
    service = new RecipeService(
      prisma as any,
      undefined,
      namingService as any,
      undefined,
      designerService,
    );
    targetProvider.getTargets.mockResolvedValue([]);
    prisma.recipeSeries.findMany.mockResolvedValue([
      { name: '均衡营养 · 三文鱼南瓜' },
    ]);
    namingService.generate.mockResolvedValue({
      candidates: [
        {
          name: '青口虾仁鸡胸',
          valuePoint: '高蛋白',
          ingredients: '青口贝、虾仁、鸡胸',
          reason: '',
          complianceWarning: false,
          duplicate: false,
        },
      ],
      provider: 'deepseek',
    });
  });

  it('系列还没有正式食谱时，用设计草稿的原料与营养起名', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(seriesRecord());
    prisma.designRecipe.findMany.mockResolvedValue([draftRecord()]);

    const result = await service.generateSeriesNameCandidates('series-1');

    expect(namingService.generate).toHaveBeenCalledTimes(1);
    const payload = namingService.generate.mock.calls[0][0];
    expect(payload.foodItems).toEqual([{ name: '鸡胸肉', ratio: 70 }]);
    expect(payload.moisturePercent).toBeCloseTo(70, 1);
    expect(payload.proteinPercentDm).toBeCloseTo(66.67, 1);
    expect(payload.fatPercentDm).toBeCloseTo(10, 1);
    expect(payload.energyDensityKcalPerKg).toBeCloseTo(1310, 0);
    expect(payload.lifeStageLabels).toEqual(['普通或高运动量成犬']);
    expect(payload.currentName).toBe('财宝定制 · 青口贝虾仁鸡胸');
    expect(payload.existingNames).toEqual(['均衡营养 · 三文鱼南瓜']);
    expect(result.candidates[0].name).toBe('青口虾仁鸡胸');
  });

  it('草稿里还没有食材时，仍然报「先设计再起名」', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(seriesRecord());
    prisma.designRecipe.findMany.mockResolvedValue([
      draftRecord({
        // 刚建的空白草稿：只有补剂，没有可起名的主料
        items: [
          draftItem({
            id: 'item-2',
            ingredient: { id: 'ingredient-2', name: '钙片', type: 'SUPPLEMENT' },
          }),
        ],
      }),
    ]);

    await expect(
      service.generateSeriesNameCandidates('series-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.generateSeriesNameCandidates('series-1'),
    ).rejects.toThrow('这个系列还没有配方，先设计再起名');
    expect(namingService.generate).not.toHaveBeenCalled();
  });

  it('系列没有草稿也没有食谱时，报「先设计再起名」', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(seriesRecord());
    prisma.designRecipe.findMany.mockResolvedValue([]);

    await expect(
      service.generateSeriesNameCandidates('series-1'),
    ).rejects.toThrow('这个系列还没有配方，先设计再起名');
    expect(namingService.generate).not.toHaveBeenCalled();
  });

  it('有正式食谱的产品线仍然用食谱当事实来源，不去读草稿', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(
      seriesRecord({
        recipes: [
          {
            id: 'recipe-1',
            seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
            status: 'PUBLIC',
            energyDensityKcalPerKg: 4000,
            applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
            nutritionDetailedData: {
              summary: {
                moisture_pct: 65,
                protein_dm_pct: 32,
                fat_dm_pct: 18,
              },
            },
            items: [
              {
                id: 'recipe-item-1',
                ratioPercent: 40,
                ingredient: { name: '牛肉', type: 'FOOD' },
              },
            ],
          },
        ],
      }),
    );

    await service.generateSeriesNameCandidates('series-1');

    expect(prisma.designRecipe.findMany).not.toHaveBeenCalled();
    const payload = namingService.generate.mock.calls[0][0];
    expect(payload.foodItems).toEqual([{ name: '牛肉', ratio: 40 }]);
    expect(payload.proteinPercentDm).toBe(32);
    expect(payload.energyDensityKcalPerKg).toBe(4000);
  });
});
