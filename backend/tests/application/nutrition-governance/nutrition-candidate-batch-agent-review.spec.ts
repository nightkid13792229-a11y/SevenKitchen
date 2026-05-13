import { NutritionCandidateStatus } from '@prisma/client';
import { NutritionGovernanceService } from 'src/application/nutrition-governance/nutrition-governance.service';
import { NutritionCandidateReviewProviderError } from 'src/application/nutrition-governance/nutrition-candidate-review.provider';

const nutritionProfile = {
  macros: { energyKcal: 120, crudeProtein: 20, crudeFat: 5 },
  meta: { rawBasisType: 'PER_100_G' },
};

const candidate = {
  id: 'candidate-1',
  status: NutritionCandidateStatus.CANDIDATE,
  normalizedNutrition: nutritionProfile,
  agentReview: null,
  ingredient: { id: 'ingredient-1', name: '鸡胸肉', type: 'FOOD' },
  sourceRecord: {
    id: 'source-1',
    sourceKey: 'USDA:123',
    foodName: 'Chicken breast, boneless, skinless, raw',
  },
};

const agentReview = {
  recommendedAction: 'CONFIRM_PRIMARY',
  confidence: 'HIGH',
  identityVerdict: 'MATCH',
  stateVerdict: 'MATCH',
  ediblePortionVerdict: 'MATCH',
  processingVerdict: 'ACCEPTABLE',
  preparationState: 'RAW',
  preparationStateLabel: '生重',
  ediblePortionLabel: '去皮去骨',
  processingLabel: null,
  riskFlags: [],
  rationale: '匹配鸡胸肉生重。',
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  promptVersion: 'nutrition-candidate-review-v1',
};

describe('NutritionGovernanceService batch Agent review', () => {
  const mockPrisma = {
    ingredientNutritionCandidate: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    nutritionAgentReviewJob: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    ingredient: { update: jest.fn() },
    nutritionFood: { create: jest.fn(), upsert: jest.fn() },
    nutritionFoodMapping: { upsert: jest.fn() },
  } as any;
  const reviewProvider = {
    reviewFoodCandidate: jest.fn(),
  };

  let service: NutritionGovernanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.nutritionAgentReviewJob.create.mockImplementation(
      async ({ data }) => ({
        id: 'job-1',
        ...data,
      }),
    );
    mockPrisma.nutritionAgentReviewJob.update.mockImplementation(
      async ({ data }) => ({
        id: 'job-1',
        ...data,
      }),
    );
    mockPrisma.ingredientNutritionCandidate.update.mockImplementation(
      async ({ data }) => ({
        id: 'candidate-1',
        ...data,
      }),
    );
    service = new NutritionGovernanceService(
      mockPrisma,
      undefined,
      reviewProvider as any,
    );
  });

  it('reviews pending candidates and stores Agent review, hard gates, review group, and labels', async () => {
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
      candidate,
    ]);
    reviewProvider.reviewFoodCandidate.mockResolvedValue(agentReview);

    const job = await service.startBatchAgentReview(
      { limit: 10, forceRerun: false },
      'admin-1',
    );

    expect(job.status).toBe('SUCCEEDED');
    expect(reviewProvider.reviewFoodCandidate).toHaveBeenCalledTimes(1);
    expect(mockPrisma.ingredientNutritionCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'candidate-1' },
        data: expect.objectContaining({
          agentReviewStatus: 'COMPLETED',
          reviewGroup: 'AUTO_REVIEWABLE',
          preparationStateLabel: '生重',
          ediblePortionLabel: '去皮去骨',
          hardGateResults: expect.objectContaining({
            canBatchConfirm: true,
          }),
        }),
      }),
    );
  });

  it('skips candidates with existing Agent review when forceRerun is false', async () => {
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
      { ...candidate, id: 'candidate-2', agentReview },
    ]);

    const job = await service.startBatchAgentReview(
      { limit: 10, forceRerun: false },
      'admin-1',
    );

    expect(job.status).toBe('SUCCEEDED');
    expect(job.skippedCount).toBe(1);
    expect(reviewProvider.reviewFoodCandidate).not.toHaveBeenCalled();
    expect(mockPrisma.ingredientNutritionCandidate.update).not.toHaveBeenCalled();
  });

  it('does not confirm candidates or write formal nutrition records', async () => {
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
      candidate,
    ]);
    reviewProvider.reviewFoodCandidate.mockResolvedValue(agentReview);

    await service.startBatchAgentReview(
      { limit: 10, forceRerun: false },
      'admin-1',
    );

    expect(mockPrisma.ingredient.update).not.toHaveBeenCalled();
    expect(mockPrisma.nutritionFood.create).not.toHaveBeenCalled();
    expect(mockPrisma.nutritionFood.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.nutritionFoodMapping.upsert).not.toHaveBeenCalled();
  });

  it('marks partial failure when one provider call fails', async () => {
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
      candidate,
    ]);
    reviewProvider.reviewFoodCandidate.mockRejectedValue(new Error('bad json'));

    const job = await service.startBatchAgentReview(
      { limit: 10, forceRerun: false },
      'admin-1',
    );

    expect(job.status).toBe('PARTIAL_FAILED');
    expect(job.failedCount).toBe(1);
    expect(job.lastError).toContain('bad json');
  });

  it('retries 429 before counting a success', async () => {
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
      candidate,
    ]);
    reviewProvider.reviewFoodCandidate
      .mockRejectedValueOnce(
        new NutritionCandidateReviewProviderError('rate limited', 429),
      )
      .mockResolvedValueOnce(agentReview);

    const job = await service.startBatchAgentReview(
      { limit: 10, forceRerun: false },
      'admin-1',
    );

    expect(job.status).toBe('SUCCEEDED');
    expect(job.successCount).toBe(1);
    expect(reviewProvider.reviewFoodCandidate).toHaveBeenCalledTimes(2);
  });
});
