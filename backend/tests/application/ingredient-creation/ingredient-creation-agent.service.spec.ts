import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
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
