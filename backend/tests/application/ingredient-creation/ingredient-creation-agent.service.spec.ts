import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IngredientCreationAgentService } from '../../../src/application/ingredient-creation/ingredient-creation-agent.service';
import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';

function createPrismaMock() {
  return {
    ingredientCreationJob: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ingredientCreationMessage: {
      create: jest.fn(),
    },
    ingredientCreationDraft: {
      create: jest.fn(),
    },
    nutritionSourceRecord: {
      findMany: jest.fn(),
    },
  };
}

describe('IngredientCreationAgentService', () => {
  it('builds a ready-for-review draft from the best active source records with completeness summaries', async () => {
    const rawProfile = createEmptyNutritionProfile();
    rawProfile.macros.energyKcal = 132;
    rawProfile.macros.crudeProtein = 19.8;
    rawProfile.meta.fieldSources = {
      'macros.energyKcal': {
        sourceType: 'USDA',
        sourceKey: 'USDA:raw',
        confidenceLevel: 'HIGH',
        compatibility: 'EXACT_FOOD',
      },
      'macros.crudeProtein': {
        sourceType: 'USDA',
        sourceKey: 'USDA:raw',
        confidenceLevel: 'HIGH',
        compatibility: 'EXACT_FOOD',
      },
    };

    const boiledProfile = createEmptyNutritionProfile();
    boiledProfile.macros.energyKcal = 165;
    boiledProfile.macros.crudeProtein = 23.5;

    const roastedProfile = createEmptyNutritionProfile();
    roastedProfile.macros.energyKcal = 201;

    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestText: '新增鸭胸肉，最好有生和水煮档案',
      status: 'DRAFTING',
      createdBy: 'staff-1',
    });
    prisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-roasted',
        sourceType: 'USDA',
        sourceKey: 'USDA:roasted',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, roasted',
        foodNameEn: 'Duck, breast, meat only, roasted',
        normalizedNutrition: roastedProfile,
        status: 'ACTIVE',
      },
      {
        id: 'source-raw',
        sourceType: 'USDA',
        sourceKey: 'USDA:raw',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, raw',
        foodNameEn: 'Duck, breast, meat only, raw',
        normalizedNutrition: rawProfile,
        status: 'ACTIVE',
      },
      {
        id: 'source-boiled',
        sourceType: 'USDA',
        sourceKey: 'USDA:boiled',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, boiled',
        foodNameEn: 'Duck, breast, meat only, boiled',
        normalizedNutrition: boiledProfile,
        status: 'ACTIVE',
      },
    ]);
    prisma.ingredientCreationDraft.create.mockResolvedValue({
      id: 'draft-1',
      profiles: [],
    });
    const service = new IngredientCreationAgentService(prisma as any);

    const result = await service.runJob('job-1');

    expect(prisma.nutritionSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'ACTIVE',
        normalizedNutrition: expect.any(Object),
      }),
      orderBy: [{ sourceType: 'asc' }, { foodName: 'asc' }],
      take: 24,
    });
    const recallFilters =
      prisma.nutritionSourceRecord.findMany.mock.calls[0][0].where.OR;
    expect(recallFilters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          foodNameEn: { contains: 'duck', mode: 'insensitive' },
        }),
        expect.objectContaining({
          foodNameEn: { contains: 'breast', mode: 'insensitive' },
        }),
      ]),
    );
    expect(recallFilters).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          foodName: { contains: 'meat', mode: 'insensitive' },
        }),
        expect.objectContaining({
          foodNameEn: { contains: 'meat', mode: 'insensitive' },
        }),
      ]),
    );
    expect(prisma.ingredientCreationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'SEARCHING_SOURCES',
        currentStage: '正在查找可信营养来源',
        progress: 25,
      },
    });
    expect(prisma.ingredientCreationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'BUILDING_REPORT',
        currentStage: '正在生成草稿和审核报告',
        progress: 75,
      },
    });
    expect(prisma.ingredientCreationDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: 'job-1',
        status: 'READY_FOR_REVIEW',
        suggestedName: '鸭胸肉',
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: 'g',
        procurementStrategy: 'DAILY_PURCHASE',
        diyEnabled: true,
        procurementEnabled: false,
        profiles: {
          create: [
            expect.objectContaining({
              role: 'PRIMARY',
              sourceRecordId: 'source-raw',
              sourceType: 'USDA',
              sourceKey: 'USDA:raw',
              sourceFoodName: 'Duck, breast, meat only, raw',
              sourceFoodNameEn: 'Duck, breast, meat only, raw',
              suggestedDisplayNameZh: '鸭胸肉（生）',
              preparationState: 'RAW',
              preparationStateLabel: '生',
              nutritionData: rawProfile,
              completenessSummary: expect.objectContaining({
                filled: 2,
                sourceCoverage: {
                  filledWithSource: 2,
                  filledWithoutSource: 0,
                },
              }),
              fieldSourceSummary: expect.any(Object),
              supplementRiskSummary: expect.any(Object),
              agentRationale: expect.stringContaining('语义匹配'),
              sortOrder: 0,
            }),
            expect.objectContaining({
              role: 'SECONDARY',
              sourceRecordId: 'source-boiled',
              sourceFoodName: 'Duck, breast, meat only, boiled',
              suggestedDisplayNameZh: '鸭胸肉（水煮）',
              preparationState: 'COOKED',
              preparationStateLabel: '熟',
              processingLabel: '水煮',
              nutritionData: boiledProfile,
              sortOrder: 1,
            }),
          ],
        },
      }),
      include: expect.objectContaining({
        profiles: expect.objectContaining({
          orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
        }),
      }),
    });
    expect(prisma.ingredientCreationMessage.create).toHaveBeenCalledWith({
      data: {
        jobId: 'job-1',
        role: 'AGENT',
        content: '已生成「鸭胸肉」草稿，包含 2 个营养档案建议。',
      },
    });
    expect(prisma.ingredientCreationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        status: 'READY_FOR_REVIEW',
        currentStage: '草稿已生成，等待审核',
        progress: 100,
        completedAt: expect.any(Date),
      }),
    });
    expect(result.id).toBe('draft-1');
  });

  it('uses user messages as additional search context after the user answers a question', async () => {
    const profile = createEmptyNutritionProfile();
    profile.macros.energyKcal = 132;
    profile.macros.crudeProtein = 19.8;

    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestText: '新增本地替代食材',
      status: 'SEARCHING_SOURCES',
      createdBy: 'staff-1',
      draft: null,
      messages: [
        { role: 'USER', content: 'duck breast raw' },
        { role: 'QUESTION', content: '请补充英文名' },
      ],
    });
    prisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-duck',
        sourceType: 'USDA',
        sourceKey: 'USDA:duck',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, raw',
        foodNameEn: 'Duck, breast, meat only, raw',
        normalizedNutrition: profile,
        status: 'ACTIVE',
      },
    ]);
    prisma.ingredientCreationDraft.create.mockResolvedValue({ id: 'draft-1' });
    const service = new IngredientCreationAgentService(prisma as any);

    await service.runJob('job-1');

    const recallFilters =
      prisma.nutritionSourceRecord.findMany.mock.calls[0][0].where.OR;
    expect(recallFilters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          foodNameEn: { contains: 'duck', mode: 'insensitive' },
        }),
        expect.objectContaining({
          foodNameEn: { contains: 'breast', mode: 'insensitive' },
        }),
      ]),
    );
    expect(prisma.ingredientCreationDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profiles: {
            create: [
              expect.objectContaining({
                sourceRecordId: 'source-duck',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('skips invalid normalized nutrition records and builds from the next valid candidate', async () => {
    const validProfile = createEmptyNutritionProfile();
    validProfile.macros.energyKcal = 165;

    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestText: '新增鸭胸肉',
      status: 'DRAFTING',
      createdBy: 'staff-1',
      draft: null,
      messages: [],
    });
    prisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-json-null',
        sourceType: 'USDA',
        sourceKey: 'USDA:json-null',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, raw',
        foodNameEn: 'Duck, breast, meat only, raw',
        normalizedNutrition: Prisma.JsonNull,
        status: 'ACTIVE',
      },
      {
        id: 'source-bad',
        sourceType: 'USDA',
        sourceKey: 'USDA:bad',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, raw boneless',
        foodNameEn: 'Duck, breast, meat only, raw boneless',
        normalizedNutrition: [],
        status: 'ACTIVE',
      },
      {
        id: 'source-valid',
        sourceType: 'USDA',
        sourceKey: 'USDA:valid',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, boiled',
        foodNameEn: 'Duck, breast, meat only, boiled',
        normalizedNutrition: validProfile,
        status: 'ACTIVE',
      },
    ]);
    prisma.ingredientCreationDraft.create.mockResolvedValue({ id: 'draft-1' });
    const service = new IngredientCreationAgentService(prisma as any);

    await service.runJob('job-1');

    const profiles =
      prisma.ingredientCreationDraft.create.mock.calls[0][0].data.profiles
        .create;
    expect(profiles).toEqual([
      expect.objectContaining({
        sourceRecordId: 'source-valid',
        nutritionData: expect.objectContaining({
          macros: expect.objectContaining({ energyKcal: 165 }),
        }),
      }),
    ]);
  });

  it('waits for user input instead of creating a draft when every candidate has invalid nutrition', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestText: '新增鸭胸肉',
      status: 'DRAFTING',
      createdBy: 'staff-1',
      draft: null,
      messages: [],
    });
    prisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-bad',
        sourceType: 'USDA',
        sourceKey: 'USDA:bad',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, raw',
        foodNameEn: 'Duck, breast, meat only, raw',
        normalizedNutrition: [],
        status: 'ACTIVE',
      },
    ]);
    const service = new IngredientCreationAgentService(prisma as any);

    await expect(service.runJob('job-1')).rejects.toThrow(BadRequestException);

    expect(prisma.ingredientCreationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        status: 'WAITING_USER',
        currentStage: '等待补充食材语义',
      }),
    });
    expect(prisma.ingredientCreationDraft.create).not.toHaveBeenCalled();
  });

  it('keeps a cooked profile as secondary when multiple raw candidates score higher', async () => {
    const rawProfile = createEmptyNutritionProfile();
    rawProfile.macros.energyKcal = 132;
    const rawSkinlessProfile = createEmptyNutritionProfile();
    rawSkinlessProfile.macros.energyKcal = 120;
    const boiledProfile = createEmptyNutritionProfile();
    boiledProfile.macros.energyKcal = 165;

    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestText: '新增鸭胸肉，最好有生和水煮档案',
      status: 'DRAFTING',
      createdBy: 'staff-1',
      draft: null,
      messages: [],
    });
    prisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-raw',
        sourceType: 'USDA',
        sourceKey: 'USDA:raw',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, raw',
        foodNameEn: 'Duck, breast, meat only, raw',
        normalizedNutrition: rawProfile,
        status: 'ACTIVE',
      },
      {
        id: 'source-raw-skinless',
        sourceType: 'USDA',
        sourceKey: 'USDA:raw-skinless',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, skinless, raw',
        foodNameEn: 'Duck, breast, meat only, skinless, raw',
        normalizedNutrition: rawSkinlessProfile,
        status: 'ACTIVE',
      },
      {
        id: 'source-boiled',
        sourceType: 'USDA',
        sourceKey: 'USDA:boiled',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, boiled',
        foodNameEn: 'Duck, breast, boiled',
        normalizedNutrition: boiledProfile,
        status: 'ACTIVE',
      },
    ]);
    prisma.ingredientCreationDraft.create.mockResolvedValue({ id: 'draft-1' });
    const service = new IngredientCreationAgentService(prisma as any);

    await service.runJob('job-1');

    expect(
      prisma.ingredientCreationDraft.create.mock.calls[0][0].data.profiles
        .create,
    ).toEqual([
      expect.objectContaining({
        role: 'PRIMARY',
        sourceRecordId: 'source-raw',
      }),
      expect.objectContaining({
        role: 'SECONDARY',
        sourceRecordId: 'source-boiled',
      }),
    ]);
  });

  it('rejects direct job runs when a draft already exists', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestText: '新增鸭胸肉',
      status: 'READY_FOR_REVIEW',
      createdBy: 'staff-1',
      draft: { id: 'draft-1', status: 'READY_FOR_REVIEW' },
      messages: [],
    });
    const service = new IngredientCreationAgentService(prisma as any);

    await expect(service.runJob('job-1')).rejects.toThrow(
      '已有草稿，请编辑或拒绝后重新创建任务',
    );
    expect(prisma.nutritionSourceRecord.findMany).not.toHaveBeenCalled();
    expect(prisma.ingredientCreationDraft.create).not.toHaveBeenCalled();
  });

  it('asks a key semantic question and waits for the user when no source candidate is found', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestText: '新增很少见的本地食材',
      status: 'DRAFTING',
      createdBy: 'staff-1',
    });
    prisma.nutritionSourceRecord.findMany.mockResolvedValue([]);
    const service = new IngredientCreationAgentService(prisma as any);

    await expect(service.runJob('job-1')).rejects.toThrow(BadRequestException);

    expect(prisma.ingredientCreationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        status: 'WAITING_USER',
        waitingQuestion: expect.stringContaining('没有找到'),
        currentStage: '等待补充食材语义',
        progress: 35,
      }),
    });
    expect(prisma.ingredientCreationMessage.create).toHaveBeenCalledWith({
      data: {
        jobId: 'job-1',
        role: 'QUESTION',
        content: expect.stringContaining('没有找到'),
      },
    });
    expect(prisma.ingredientCreationDraft.create).not.toHaveBeenCalled();
  });

  it('throws not found when the job is missing', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue(null);
    const service = new IngredientCreationAgentService(prisma as any);

    await expect(service.runJob('missing-job')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.runJob('missing-job')).rejects.toThrow(
      'AI 新增食材任务不存在',
    );
    expect(prisma.ingredientCreationJob.update).not.toHaveBeenCalled();
    expect(prisma.ingredientCreationMessage.create).not.toHaveBeenCalled();
  });
});
