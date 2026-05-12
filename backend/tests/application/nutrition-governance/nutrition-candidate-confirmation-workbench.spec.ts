import { BadRequestException } from '@nestjs/common';
import { NutritionCandidateStatus } from '@prisma/client';
import { NutritionGovernanceService } from 'src/application/nutrition-governance/nutrition-governance.service';

describe('NutritionGovernanceService confirmation workbench', () => {
  const mockPrisma = {
    ingredientNutritionCandidate: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    ingredient: { update: jest.fn() },
    nutritionFood: { upsert: jest.fn() },
    nutritionFoodMapping: { updateMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  let service: NutritionGovernanceService;

  const candidate = {
    id: 'candidate-1',
    ingredientId: 'ingredient-1',
    sourceRecordId: 'source-1',
    status: NutritionCandidateStatus.CANDIDATE,
    confidence: 'HIGH',
    score: 0.95,
    normalizedNutrition: {
      macros: { energyKcal: 120, crudeProtein: 20, crudeFat: 5 },
      meta: { rawBasisType: 'PER_100_G' },
    },
    agentReview: {
      recommendedAction: 'CONFIRM_PRIMARY',
      confidence: 'HIGH',
      riskFlags: [],
    },
    hardGateResults: {
      canBatchConfirm: true,
      blockingReasons: [],
      warningReasons: [],
    },
    preparationState: 'RAW',
    preparationStateLabel: '生重',
    ediblePortionLabel: '去皮去骨',
    processingLabel: null,
    ingredient: { id: 'ingredient-1', type: 'FOOD', name: '鸡胸肉' },
    sourceRecord: {
      id: 'source-1',
      sourceType: 'USDA',
      sourceKey: 'USDA:123',
      sourceTitle: 'USDA Chicken Breast',
      sourceDetail: { provider: 'USDA FoodData Central' },
      foodName: 'Chicken breast, boneless, skinless, raw',
      foodNameEn: 'Chicken breast, boneless, skinless, raw',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrisma),
    );
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue(
      candidate,
    );
    mockPrisma.nutritionFood.upsert.mockResolvedValue({
      id: 'nutrition-food-1',
    });
    mockPrisma.ingredientNutritionCandidate.update.mockResolvedValue({
      id: 'candidate-1',
      status: NutritionCandidateStatus.CONFIRMED,
    });
    service = new NutritionGovernanceService(mockPrisma);
  });

  it('confirms an Agent-reviewed candidate as primary with state/spec labels', async () => {
    await service.confirmCandidateFromWorkbench('candidate-1', 'admin-1', {
      mappingRole: 'PRIMARY',
      preparationState: 'RAW',
      preparationStateLabel: '生重',
      ediblePortionLabel: '去皮去骨',
      processingLabel: null,
      reviewNote: 'Reviewed in workbench',
    });

    expect(mockPrisma.nutritionFood.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          preparationState: 'RAW',
          preparationStateLabel: '生重',
          ediblePortionLabel: '去皮去骨',
        }),
      }),
    );
    expect(mockPrisma.nutritionFoodMapping.updateMany).toHaveBeenCalled();
    expect(mockPrisma.nutritionFoodMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isPrimary: true }),
        update: expect.objectContaining({ isPrimary: true }),
      }),
    );
  });

  it('blocks batch confirmation when hard gates fail', async () => {
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue({
      ...candidate,
      hardGateResults: {
        canBatchConfirm: false,
        blockingReasons: ['LOW_AGENT_CONFIDENCE'],
      },
    });

    await expect(
      service.confirmCandidateFromWorkbench('candidate-1', 'admin-1', {
        mappingRole: 'PRIMARY',
        batchMode: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
