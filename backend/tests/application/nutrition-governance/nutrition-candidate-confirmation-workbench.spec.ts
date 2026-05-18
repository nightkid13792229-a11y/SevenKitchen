import { BadRequestException } from '@nestjs/common';
import { NutritionCandidateStatus } from '@prisma/client';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { NutritionGovernanceService } from 'src/application/nutrition-governance/nutrition-governance.service';

describe('NutritionGovernanceService confirmation workbench', () => {
  const originalUsdaLocalDataDir = process.env.USDA_LOCAL_DATA_DIR;
  const mockPrisma = {
    ingredientNutritionCandidate: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    ingredient: { update: jest.fn() },
    nutritionSourceRecord: { update: jest.fn() },
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
  const secondaryCandidate = {
    ...candidate,
    id: 'candidate-2',
    sourceRecordId: 'source-2',
    agentReview: {
      recommendedAction: 'CONFIRM_SECONDARY',
      confidence: 'HIGH',
      riskFlags: [],
    },
    sourceRecord: {
      id: 'source-2',
      sourceType: 'USDA',
      sourceKey: 'USDA:456',
      sourceTitle: 'USDA Peeled Cucumber',
      sourceDetail: { provider: 'USDA FoodData Central' },
      foodName: 'Cucumber, peeled, raw',
      foodNameEn: 'Cucumber, peeled, raw',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USDA_LOCAL_DATA_DIR = join(
      tmpdir(),
      'missing-usda-local-dir',
    );
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

  afterEach(() => {
    if (originalUsdaLocalDataDir === undefined) {
      delete process.env.USDA_LOCAL_DATA_DIR;
    } else {
      process.env.USDA_LOCAL_DATA_DIR = originalUsdaLocalDataDir;
    }
  });

  it('confirms an Agent-reviewed candidate as primary with standardized state/spec labels', async () => {
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
          preparationStateLabel: '生',
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

  it('refreshes USDA candidate nutrition from local CSV before confirmation writes nutrition data', async () => {
    const localDir = await mkdtemp(join(tmpdir(), 'usda-confirm-'));
    process.env.USDA_LOCAL_DATA_DIR = localDir;
    await writeFile(
      join(localDir, 'food.csv'),
      [
        '"fdc_id","data_type","description","food_category_id","publication_date"',
        '"168409","sr_legacy_food","Cucumber, with peel, raw","11","2019-04-01"',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(localDir, 'nutrient.csv'),
      [
        '"id","name","unit_name","nutrient_nbr","rank"',
        '"1051","Water","G","255","100.0"',
        '"1104","Vitamin A, IU","IU","318","7500.0"',
        '"1109","Vitamin E (alpha-tocopherol)","MG","323","7905.0"',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(localDir, 'food_nutrient.csv'),
      [
        '"id","fdc_id","nutrient_id","amount","data_points","derivation_id","min","max","median","footnote","min_year_acquired"',
        '"1","168409","1051","95.23","1","46","","","","",""',
        '"2","168409","1104","105","1","46","","","","",""',
        '"3","168409","1109","0.03","1","46","","","","",""',
      ].join('\n'),
      'utf8',
    );
    const staleCandidate = {
      ...candidate,
      sourceRecord: {
        ...candidate.sourceRecord,
        sourceKey: 'USDA:168409',
        sourceTitle: 'USDA FoodData Central',
        sourceDetail: {
          fdcId: '168409',
          importMode: 'bulk-usda-food-candidates',
        },
        foodName: 'Cucumber, with peel, raw',
        foodNameEn: 'Cucumber, with peel, raw',
      },
      normalizedNutrition: {
        macros: { moisture: 95.2 },
        vitamins: { vitaminA: 105, vitaminE: null },
      },
    };
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue(
      staleCandidate,
    );
    mockPrisma.nutritionSourceRecord.update.mockImplementation(
      async (args: any) => ({
        ...staleCandidate.sourceRecord,
        ...args.data,
      }),
    );

    await service.confirmCandidateFromWorkbench('candidate-1', 'admin-1', {
      mappingRole: 'PRIMARY',
      preparationState: 'RAW',
      ediblePortionLabel: '带皮',
      processingLabel: '未加工',
    });

    expect(mockPrisma.nutritionFood.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          nutritionData: expect.objectContaining({
            macros: expect.objectContaining({
              moisture: 95.23,
            }),
            vitamins: expect.objectContaining({
              vitaminA: 105,
              vitaminE: 0.0447,
            }),
          }),
        }),
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

  it('applies one ingredient nutrition configuration with a primary and secondary candidate in one transaction', async () => {
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
      {
        ...candidate,
        id: 'candidate-1',
        ingredient: { id: 'ingredient-1', type: 'FOOD', name: '黄瓜' },
        sourceRecord: {
          ...candidate.sourceRecord,
          id: 'source-1',
          sourceKey: 'USDA:168409',
          sourceTitle: 'USDA Cucumber With Peel',
          foodName: 'Cucumber, with peel, raw',
          foodNameEn: 'Cucumber, with peel, raw',
        },
      },
      secondaryCandidate,
    ]);
    mockPrisma.nutritionFood.upsert
      .mockResolvedValueOnce({ id: 'nutrition-food-primary' })
      .mockResolvedValueOnce({ id: 'nutrition-food-secondary' });

    await service.applyIngredientCandidateConfiguration(
      {
        ingredientId: 'ingredient-1',
        entries: [
          {
            candidateId: 'candidate-1',
            mappingRole: 'PRIMARY',
            preparationState: 'RAW',
            ediblePortionLabel: '带皮',
            processingLabel: '未加工',
          },
          {
            candidateId: 'candidate-2',
            mappingRole: 'SECONDARY',
            preparationState: 'RAW',
            ediblePortionLabel: '去皮',
            processingLabel: '未加工',
          },
        ],
      },
      'admin-1',
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.ingredient.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.ingredient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ingredient-1' },
        data: expect.objectContaining({
          nutritionProfile: expect.objectContaining({
            meta: expect.objectContaining({
              sourceTitle: 'USDA Cucumber With Peel',
            }),
          }),
        }),
      }),
    );
    expect(mockPrisma.nutritionFoodMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          nutritionFoodId: 'nutrition-food-primary',
          isPrimary: true,
        }),
      }),
    );
    expect(mockPrisma.nutritionFoodMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          nutritionFoodId: 'nutrition-food-secondary',
          isPrimary: false,
        }),
      }),
    );
    expect(mockPrisma.ingredientNutritionCandidate.update).toHaveBeenCalledTimes(
      2,
    );
  });

  it('allows confirmed candidates to be reassigned between primary and secondary profiles', async () => {
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
      {
        ...candidate,
        id: 'candidate-1',
        status: NutritionCandidateStatus.CONFIRMED,
        confirmationSnapshot: { mappingRole: 'PRIMARY' },
        ingredient: { id: 'ingredient-1', type: 'FOOD', name: '黄瓜' },
        sourceRecord: {
          ...candidate.sourceRecord,
          id: 'source-1',
          sourceKey: 'USDA:168409',
          sourceTitle: 'USDA Cucumber With Peel',
          foodName: 'Cucumber, with peel, raw',
          foodNameEn: 'Cucumber, with peel, raw',
        },
      },
      {
        ...secondaryCandidate,
        id: 'candidate-2',
        status: NutritionCandidateStatus.CONFIRMED,
        confirmationSnapshot: { mappingRole: 'SECONDARY' },
        ingredient: { id: 'ingredient-1', type: 'FOOD', name: '黄瓜' },
        sourceRecord: {
          ...secondaryCandidate.sourceRecord,
          id: 'source-2',
          sourceKey: 'USDA:169225',
          sourceTitle: 'USDA Peeled Cucumber',
          foodName: 'Cucumber, peeled, raw',
          foodNameEn: 'Cucumber, peeled, raw',
        },
      },
    ]);
    mockPrisma.nutritionFood.upsert
      .mockResolvedValueOnce({ id: 'nutrition-food-secondary-now-primary' })
      .mockResolvedValueOnce({ id: 'nutrition-food-primary-now-secondary' });

    await service.applyIngredientCandidateConfiguration(
      {
        ingredientId: 'ingredient-1',
        entries: [
          {
            candidateId: 'candidate-2',
            mappingRole: 'PRIMARY',
            preparationState: 'RAW',
            ediblePortionLabel: '去皮',
            processingLabel: '未加工',
          },
          {
            candidateId: 'candidate-1',
            mappingRole: 'SECONDARY',
            preparationState: 'RAW',
            ediblePortionLabel: '带皮',
            processingLabel: '未加工',
          },
        ],
      },
      'admin-1',
    );

    expect(mockPrisma.ingredient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ingredient-1' },
        data: expect.objectContaining({
          nutritionProfile: expect.objectContaining({
            meta: expect.objectContaining({
              sourceTitle: 'USDA Peeled Cucumber',
            }),
          }),
        }),
      }),
    );
    expect(mockPrisma.nutritionFoodMapping.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ingredientId: 'ingredient-1',
          isPrimary: true,
        }),
        data: { isPrimary: false },
      }),
    );
    expect(mockPrisma.nutritionFoodMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          nutritionFoodId: 'nutrition-food-secondary-now-primary',
          isPrimary: true,
        }),
        update: expect.objectContaining({ isPrimary: true }),
      }),
    );
    expect(mockPrisma.nutritionFoodMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          nutritionFoodId: 'nutrition-food-primary-now-secondary',
          isPrimary: false,
        }),
        update: expect.objectContaining({ isPrimary: false }),
      }),
    );
  });

  it('requires exactly one primary candidate when applying an ingredient configuration', async () => {
    await expect(
      service.applyIngredientCandidateConfiguration(
        {
          ingredientId: 'ingredient-1',
          entries: [
            {
              candidateId: 'candidate-2',
              mappingRole: 'SECONDARY',
            },
          ],
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
