import { NutritionGovernanceService } from 'src/application/nutrition-governance/nutrition-governance.service';

describe('NutritionGovernanceService Agent review', () => {
  const mockPrisma = {
    ingredientNutritionCandidate: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const reviewProvider = {
    reviewFoodCandidate: jest.fn(),
  };

  let service: NutritionGovernanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NutritionGovernanceService(
      mockPrisma,
      undefined,
      reviewProvider as any,
    );
  });

  it('runs Agent review, evaluates hard gates, and caches review metadata', async () => {
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue({
      id: 'candidate-1',
      normalizedNutrition: {
        macros: { energyKcal: 120, crudeProtein: 20, crudeFat: 5 },
        meta: { rawBasisType: 'PER_100_G' },
      },
      ingredient: { id: 'ingredient-1', name: '鸡胸肉', type: 'FOOD' },
      sourceRecord: {
        id: 'source-1',
        sourceKey: 'USDA:123',
        foodName: 'Chicken breast, boneless, skinless, raw',
        category: 'Poultry Products',
      },
    });
    reviewProvider.reviewFoodCandidate.mockResolvedValue({
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
      rationale: 'Matches chicken breast raw edible portion.',
      provider: 'test',
      model: 'test-model',
      promptVersion: 'nutrition-candidate-review-v1',
    });
    mockPrisma.ingredientNutritionCandidate.update.mockImplementation(
      async ({ data }) => ({
        id: 'candidate-1',
        ...data,
      }),
    );

    const result = await service.reviewCandidateWithAgent('candidate-1');

    expect(result.reviewGroup).toBe('AUTO_REVIEWABLE');
    expect(result.preparationStateLabel).toBe('生重');
    expect(result.ediblePortionLabel).toBe('去皮去骨');
    expect(result.hardGateResults).toEqual(
      expect.objectContaining({ canBatchConfirm: true }),
    );
  });
});
