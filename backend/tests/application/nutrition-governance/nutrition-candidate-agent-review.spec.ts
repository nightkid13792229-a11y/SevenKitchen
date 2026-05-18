import { NutritionGovernanceService } from 'src/application/nutrition-governance/nutrition-governance.service';

describe('NutritionGovernanceService Agent review', () => {
  const mockPrisma = {
    ingredient: {
      findUnique: jest.fn(),
    },
    nutritionSourceRecord: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    ingredientNutritionCandidate: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const reviewProvider = {
    createFoodCandidateSearchPlan: jest.fn(),
    reviewFoodCandidate: jest.fn(),
    reviewNutritionValidation: jest.fn(),
  };

  let service: NutritionGovernanceService;

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.nutritionSourceRecord.findUnique.mockResolvedValue(null);
    mockPrisma.nutritionSourceRecord.update.mockImplementation(
      async ({ where, data }) => ({ id: where.id, ...data }),
    );
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
        macros: {
          energyKcal: 120,
          moisture: 70,
          crudeProtein: 20,
          crudeFat: 5,
        },
        minerals: {
          calcium: 12,
          phosphorus: 180,
        },
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
    expect(result.preparationStateLabel).toBe('生');
    expect(result.ediblePortionLabel).toBe('去皮去骨');
    expect(result.hardGateResults).toEqual(
      expect.objectContaining({ canBatchConfirm: true }),
    );
  });

  it('generates broad candidates and lets Agent rank them with the reviewer requirement', async () => {
    mockPrisma.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-pumpkin',
      name: '南瓜',
      type: 'FOOD',
    });
    mockPrisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-flower',
        sourceType: 'USDA',
        sourceKey: 'USDA:169270',
        foodName: 'Pumpkin flowers, raw',
        normalizedNutrition: { macros: { energyKcal: 15 }, meta: { rawBasisType: 'PER_100_G' } },
      },
      {
        id: 'source-pumpkin',
        sourceType: 'USDA',
        sourceKey: 'USDA:168448',
        foodName: 'Pumpkin, raw',
        normalizedNutrition: { macros: { energyKcal: 26 }, meta: { rawBasisType: 'PER_100_G' } },
      },
    ]);
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue(null);
    mockPrisma.ingredientNutritionCandidate.upsert
      .mockResolvedValueOnce({ id: 'candidate-flower' })
      .mockResolvedValueOnce({ id: 'candidate-pumpkin' });
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
      {
        id: 'candidate-flower',
        ingredientId: 'ingredient-pumpkin',
        normalizedNutrition: { macros: { energyKcal: 15 }, meta: { rawBasisType: 'PER_100_G' } },
        ingredient: { id: 'ingredient-pumpkin', name: '南瓜', type: 'FOOD' },
        sourceRecord: {
          id: 'source-flower',
          sourceType: 'USDA',
          sourceKey: 'USDA:169270',
          foodName: 'Pumpkin flowers, raw',
        },
      },
      {
        id: 'candidate-pumpkin',
        ingredientId: 'ingredient-pumpkin',
        normalizedNutrition: { macros: { energyKcal: 26 }, meta: { rawBasisType: 'PER_100_G' } },
        ingredient: { id: 'ingredient-pumpkin', name: '南瓜', type: 'FOOD' },
        sourceRecord: {
          id: 'source-pumpkin',
          sourceType: 'USDA',
          sourceKey: 'USDA:168448',
          foodName: 'Pumpkin, raw',
        },
      },
    ]);
    reviewProvider.reviewFoodCandidate
      .mockResolvedValueOnce({
        recommendedAction: 'REJECT',
        confidence: 'HIGH',
        identityVerdict: 'MISMATCH',
        stateVerdict: 'MATCH',
        ediblePortionVerdict: 'MISMATCH',
        processingVerdict: 'ACCEPTABLE',
        preparationState: 'RAW',
        preparationStateLabel: '生',
        ediblePortionLabel: '标准可食部',
        processingLabel: '未加工',
        riskFlags: ['FLOWER_PART'],
        rationale: '南瓜花不是普通南瓜果肉。',
        provider: 'test',
        model: 'test-model',
        promptVersion: 'nutrition-candidate-review-v1',
      })
      .mockResolvedValueOnce({
        recommendedAction: 'CONFIRM_PRIMARY',
        confidence: 'HIGH',
        identityVerdict: 'MATCH',
        stateVerdict: 'MATCH',
        ediblePortionVerdict: 'MATCH',
        processingVerdict: 'ACCEPTABLE',
        preparationState: 'RAW',
        preparationStateLabel: '生',
        ediblePortionLabel: '标准可食部',
        processingLabel: '未加工',
        riskFlags: [],
        rationale: '符合普通南瓜果肉、生、未加工。',
        provider: 'test',
        model: 'test-model',
        promptVersion: 'nutrition-candidate-review-v1',
      });
    mockPrisma.ingredientNutritionCandidate.update.mockImplementation(
      async ({ where, data }) => ({
        id: where.id,
        ...data,
        ingredient: { id: 'ingredient-pumpkin', name: '南瓜', type: 'FOOD' },
        sourceRecord: {
          foodName: where.id === 'candidate-pumpkin' ? 'Pumpkin, raw' : 'Pumpkin flowers, raw',
        },
      }),
    );

    const result = await service.rankFoodCandidatesWithAgent({
      ingredientId: 'ingredient-pumpkin',
      reviewerRequirement: '我要普通南瓜果肉，生的，不要南瓜花和南瓜籽。',
    });

    expect(reviewProvider.reviewFoodCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewerRequirement: '我要普通南瓜果肉，生的，不要南瓜花和南瓜籽。',
      }),
    );
    expect(result[0].id).toBe('candidate-pumpkin');
  });

  it('uses an Agent search plan to recall broad confusable candidates before ranking', async () => {
    mockPrisma.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-cabbage',
      name: '卷心菜',
      type: 'FOOD',
    });
    mockPrisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-common',
        sourceType: 'USDA',
        sourceKey: 'USDA:169335',
        foodName: 'Cabbage, common (danish, domestic, and pointed types), raw',
        normalizedNutrition: { macros: { energyKcal: 25 }, meta: { rawBasisType: 'PER_100_G' } },
      },
      {
        id: 'source-chinese',
        sourceType: 'USDA',
        sourceKey: 'USDA:170390',
        foodName: 'Cabbage, chinese (pak-choi), raw',
        normalizedNutrition: { macros: { energyKcal: 13 }, meta: { rawBasisType: 'PER_100_G' } },
      },
      {
        id: 'source-red',
        sourceType: 'USDA',
        sourceKey: 'USDA:169977',
        foodName: 'Cabbage, red, raw',
        normalizedNutrition: { macros: { energyKcal: 31 }, meta: { rawBasisType: 'PER_100_G' } },
      },
      {
        id: 'source-chicken',
        sourceType: 'USDA',
        sourceKey: 'USDA:171077',
        foodName: 'Chicken breast, raw',
        normalizedNutrition: { macros: { energyKcal: 120 }, meta: { rawBasisType: 'PER_100_G' } },
      },
    ]);
    reviewProvider.createFoodCandidateSearchPlan.mockResolvedValue({
      provider: 'test',
      model: 'test-model',
      promptVersion: 'nutrition-candidate-search-plan-v1',
      searchTerms: ['common cabbage raw', 'green cabbage raw'],
      includeTerms: ['cabbage raw'],
      excludeTerms: ['chinese cabbage', 'pak-choi', 'pe-tsai', 'red cabbage'],
      rationale: '卷心菜优先普通结球甘蓝，但保留易混淆白菜类给 Agent 排序。',
    });
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue(null);
    mockPrisma.ingredientNutritionCandidate.upsert.mockImplementation(
      async ({ create }) => ({ id: `candidate-${create.sourceRecordId}` }),
    );
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
      {
        id: 'candidate-source-common',
        ingredientId: 'ingredient-cabbage',
        status: 'CANDIDATE',
        score: 0.9,
        normalizedNutrition: { macros: { energyKcal: 25 }, meta: { rawBasisType: 'PER_100_G' } },
        ingredient: { id: 'ingredient-cabbage', name: '卷心菜', type: 'FOOD' },
        sourceRecord: {
          id: 'source-common',
          sourceType: 'USDA',
          sourceKey: 'USDA:169335',
          foodName: 'Cabbage, common (danish, domestic, and pointed types), raw',
        },
      },
      {
        id: 'candidate-source-chinese',
        ingredientId: 'ingredient-cabbage',
        status: 'CANDIDATE',
        score: 0.55,
        normalizedNutrition: { macros: { energyKcal: 13 }, meta: { rawBasisType: 'PER_100_G' } },
        ingredient: { id: 'ingredient-cabbage', name: '卷心菜', type: 'FOOD' },
        sourceRecord: {
          id: 'source-chinese',
          sourceType: 'USDA',
          sourceKey: 'USDA:170390',
          foodName: 'Cabbage, chinese (pak-choi), raw',
        },
      },
      {
        id: 'candidate-source-red',
        ingredientId: 'ingredient-cabbage',
        status: 'CANDIDATE',
        score: 0.55,
        normalizedNutrition: { macros: { energyKcal: 31 }, meta: { rawBasisType: 'PER_100_G' } },
        ingredient: { id: 'ingredient-cabbage', name: '卷心菜', type: 'FOOD' },
        sourceRecord: {
          id: 'source-red',
          sourceType: 'USDA',
          sourceKey: 'USDA:169977',
          foodName: 'Cabbage, red, raw',
        },
      },
    ]);
    reviewProvider.reviewFoodCandidate
      .mockResolvedValueOnce({
        recommendedAction: 'CONFIRM_PRIMARY',
        confidence: 'HIGH',
        identityVerdict: 'MATCH',
        stateVerdict: 'MATCH',
        ediblePortionVerdict: 'MATCH',
        processingVerdict: 'ACCEPTABLE',
        preparationState: 'RAW',
        preparationStateLabel: '生',
        ediblePortionLabel: '标准可食部',
        processingLabel: '未加工',
        riskFlags: [],
        rationale: '普通卷心菜可作为主档案。',
        provider: 'test',
        model: 'test-model',
        promptVersion: 'nutrition-candidate-review-v1',
      })
      .mockResolvedValue({
        recommendedAction: 'REJECT',
        confidence: 'HIGH',
        identityVerdict: 'MISMATCH',
        stateVerdict: 'MATCH',
        ediblePortionVerdict: 'UNKNOWN',
        processingVerdict: 'ACCEPTABLE',
        preparationState: 'RAW',
        preparationStateLabel: '生',
        ediblePortionLabel: '标准可食部',
        processingLabel: '未加工',
        riskFlags: ['CONFUSABLE_VARIANT'],
        rationale: '这是易混淆变体，保留给人工查看但不推荐。',
        provider: 'test',
        model: 'test-model',
        promptVersion: 'nutrition-candidate-review-v1',
      });
    mockPrisma.ingredientNutritionCandidate.update.mockImplementation(
      async ({ where, data }) => ({ id: where.id, status: 'CANDIDATE', ...data }),
    );

    await service.rankFoodCandidatesWithAgent({
      ingredientId: 'ingredient-cabbage',
      reviewerRequirement: '普通卷心菜，生，USDA 优先。',
    });

    expect(reviewProvider.createFoodCandidateSearchPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredient: { id: 'ingredient-cabbage', name: '卷心菜', type: 'FOOD' },
        reviewerRequirement: '普通卷心菜，生，USDA 优先。',
      }),
    );
    expect(mockPrisma.ingredientNutritionCandidate.upsert).toHaveBeenCalledTimes(3);
    expect(
      mockPrisma.ingredientNutritionCandidate.upsert.mock.calls.map(
        ([call]) => call.create.sourceRecordId,
      ),
    ).toEqual(['source-common', 'source-chinese', 'source-red']);
    expect(reviewProvider.reviewFoodCandidate).toHaveBeenCalledTimes(3);
  });

  it('uses a default search requirement when the reviewer leaves the requirement empty', async () => {
    mockPrisma.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-cabbage',
      name: '卷心菜',
      type: 'FOOD',
    });
    mockPrisma.nutritionSourceRecord.findMany.mockResolvedValue([]);
    reviewProvider.createFoodCandidateSearchPlan.mockResolvedValue({
      provider: 'test',
      model: 'test-model',
      promptVersion: 'nutrition-candidate-search-plan-v1',
      searchTerms: ['cabbage raw'],
      includeTerms: ['cabbage'],
      excludeTerms: ['pak-choi', 'pe-tsai', 'red cabbage'],
      rationale: '默认按标准原料名生成搜索词。',
    });
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([]);

    await service.rankFoodCandidatesWithAgent({
      ingredientId: 'ingredient-cabbage',
      reviewerRequirement: '',
    });

    expect(reviewProvider.createFoodCandidateSearchPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewerRequirement: expect.stringContaining('标准原料「卷心菜」'),
      }),
    );
  });

  it('does not let broad generic Agent terms create unrelated candidates', async () => {
    mockPrisma.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-cabbage',
      name: '卷心菜',
      type: 'FOOD',
    });
    mockPrisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-common',
        sourceType: 'USDA',
        sourceKey: 'USDA:169335',
        foodName: 'Cabbage, common (danish, domestic, and pointed types), raw',
        category: 'Vegetables and Vegetable Products',
        normalizedNutrition: { macros: { energyKcal: 25 }, meta: { rawBasisType: 'PER_100_G' } },
      },
      {
        id: 'source-asparagus',
        sourceType: 'USDA',
        sourceKey: 'USDA:168389',
        foodName: 'Asparagus, raw',
        category: 'Vegetables and Vegetable Products',
        normalizedNutrition: { macros: { energyKcal: 20 }, meta: { rawBasisType: 'PER_100_G' } },
      },
      {
        id: 'source-broccoli',
        sourceType: 'USDA',
        sourceKey: 'USDA:747447',
        foodName: 'Broccoli, raw',
        category: 'Vegetables and Vegetable Products',
        normalizedNutrition: { macros: { energyKcal: 34 }, meta: { rawBasisType: 'PER_100_G' } },
      },
      {
        id: 'source-green-peas',
        sourceType: 'USDA',
        sourceKey: 'USDA:170419',
        foodName: 'Peas, green, raw',
        category: 'Vegetables and Vegetable Products',
        normalizedNutrition: { macros: { energyKcal: 81 }, meta: { rawBasisType: 'PER_100_G' } },
      },
      {
        id: 'source-white-rice',
        sourceType: 'USDA',
        sourceKey: 'USDA:168879',
        foodName: 'Rice, white, medium-grain, raw, enriched',
        category: 'Cereal Grains and Pasta',
        normalizedNutrition: { macros: { energyKcal: 360 }, meta: { rawBasisType: 'PER_100_G' } },
      },
    ]);
    reviewProvider.createFoodCandidateSearchPlan.mockResolvedValue({
      provider: 'test',
      model: 'test-model',
      promptVersion: 'nutrition-candidate-search-plan-v1',
      searchTerms: ['green cabbage', 'white cabbage', 'cabbage'],
      includeTerms: ['vegetables raw'],
      excludeTerms: ['broccoli'],
      rationale: '测试泛词不应污染召回。',
    });
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue(null);
    mockPrisma.ingredientNutritionCandidate.upsert.mockImplementation(
      async ({ create }) => ({ id: `candidate-${create.sourceRecordId}` }),
    );
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([]);

    await service.rankFoodCandidatesWithAgent({
      ingredientId: 'ingredient-cabbage',
      reviewerRequirement: '',
    });

    expect(
      mockPrisma.ingredientNutritionCandidate.upsert.mock.calls.map(
        ([call]) => call.create.sourceRecordId,
      ),
    ).toEqual(['source-common']);
  });

  it('keeps ranked candidates visible when one Agent review call fails', async () => {
    mockPrisma.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-cabbage',
      name: '卷心菜',
      type: 'FOOD',
    });
    mockPrisma.nutritionSourceRecord.findMany.mockResolvedValue([]);
    reviewProvider.createFoodCandidateSearchPlan.mockResolvedValue({
      provider: 'test',
      model: 'test-model',
      promptVersion: 'nutrition-candidate-search-plan-v1',
      searchTerms: ['cabbage'],
      includeTerms: ['cabbage raw'],
      excludeTerms: [],
      rationale: '测试单条审核失败。',
    });
    mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
      {
        id: 'candidate-common',
        ingredientId: 'ingredient-cabbage',
        status: 'CANDIDATE',
        score: 0.9,
        normalizedNutrition: {
          macros: { energyKcal: 25, crudeProtein: 1.28, crudeFat: 0.1, moisture: 92.18 },
          minerals: { calcium: 40, phosphorus: 26 },
          meta: { rawBasisType: 'PER_100_G' },
        },
        ingredient: { id: 'ingredient-cabbage', name: '卷心菜', type: 'FOOD' },
        sourceRecord: {
          id: 'source-common',
          sourceType: 'USDA',
          sourceKey: 'USDA:169335',
          foodName: 'Cabbage, common (danish, domestic, and pointed types), raw',
        },
      },
    ]);
    reviewProvider.reviewFoodCandidate.mockRejectedValue(
      new Error('DeepSeek response did not include message content'),
    );
    mockPrisma.ingredientNutritionCandidate.update.mockImplementation(
      async ({ where, data }) => ({
        id: where.id,
        status: 'CANDIDATE',
        score: 0.9,
        ...data,
      }),
    );

    const result = await service.rankFoodCandidatesWithAgent({
      ingredientId: 'ingredient-cabbage',
      reviewerRequirement: '',
    });

    expect(result).toHaveLength(1);
    expect(result[0].agentReviewStatus).toBe('FAILED');
    expect(result[0].agentReview.recommendedAction).toBe('NEEDS_HUMAN_REVIEW');
    expect(result[0].agentReview.rationale).toContain('Agent 审核失败');
  });

  it('includes already confirmed matches when ranking by a reviewer requirement', async () => {
    mockPrisma.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-cucumber',
      name: '黄瓜',
      type: 'FOOD',
    });
    mockPrisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-peeled',
        sourceType: 'USDA',
        sourceKey: 'USDA:169225',
        foodName: 'Cucumber, peeled, raw',
        normalizedNutrition: { macros: { energyKcal: 12 }, meta: { rawBasisType: 'PER_100_G' } },
      },
      {
        id: 'source-with-peel',
        sourceType: 'USDA',
        sourceKey: 'USDA:168409',
        foodName: 'Cucumber, with peel, raw',
        normalizedNutrition: { macros: { energyKcal: 15 }, meta: { rawBasisType: 'PER_100_G' } },
      },
    ]);
    mockPrisma.ingredientNutritionCandidate.findUnique.mockImplementation(
      async ({ where }) => {
        if (where.ingredientId_sourceRecordId.sourceRecordId === 'source-peeled') {
          return { id: 'candidate-peeled', status: 'CONFIRMED' };
        }
        return null;
      },
    );
    mockPrisma.ingredientNutritionCandidate.upsert.mockResolvedValue({
      id: 'candidate-with-peel',
    });
    mockPrisma.ingredientNutritionCandidate.findMany.mockImplementation(
      async ({ where }) => {
        const confirmedCandidate = {
          id: 'candidate-peeled',
          ingredientId: 'ingredient-cucumber',
          status: 'CONFIRMED',
          score: 0.98,
          normalizedNutrition: { macros: { energyKcal: 12 }, meta: { rawBasisType: 'PER_100_G' } },
          ingredient: { id: 'ingredient-cucumber', name: '黄瓜', type: 'FOOD' },
          sourceRecord: {
            id: 'source-peeled',
            sourceType: 'USDA',
            sourceKey: 'USDA:169225',
            foodName: 'Cucumber, peeled, raw',
          },
        };
        const pendingCandidate = {
          id: 'candidate-with-peel',
          ingredientId: 'ingredient-cucumber',
          status: 'CANDIDATE',
          score: 0.8,
          normalizedNutrition: { macros: { energyKcal: 15 }, meta: { rawBasisType: 'PER_100_G' } },
          ingredient: { id: 'ingredient-cucumber', name: '黄瓜', type: 'FOOD' },
          sourceRecord: {
            id: 'source-with-peel',
            sourceType: 'USDA',
            sourceKey: 'USDA:168409',
            foodName: 'Cucumber, with peel, raw',
          },
        };

        if (where.status === 'CANDIDATE') return [pendingCandidate];
        if (where.status?.in?.includes('CONFIRMED')) {
          return [confirmedCandidate, pendingCandidate];
        }
        return [];
      },
    );
    reviewProvider.reviewFoodCandidate.mockImplementation(async ({ sourceRecord }) => {
      if (sourceRecord.foodName.includes('peeled')) {
        return {
          recommendedAction: 'CONFIRM_PRIMARY',
          confidence: 'HIGH',
          identityVerdict: 'MATCH',
          stateVerdict: 'MATCH',
          ediblePortionVerdict: 'MATCH',
          processingVerdict: 'ACCEPTABLE',
          preparationState: 'RAW',
          preparationStateLabel: '生',
          ediblePortionLabel: '去皮',
          processingLabel: '未加工',
          riskFlags: [],
          rationale: '符合去皮黄瓜。',
          provider: 'test',
          model: 'test-model',
          promptVersion: 'nutrition-candidate-review-v1',
        };
      }

      return {
        recommendedAction: 'REJECT',
        confidence: 'HIGH',
        identityVerdict: 'MATCH',
        stateVerdict: 'MATCH',
        ediblePortionVerdict: 'MISMATCH',
        processingVerdict: 'ACCEPTABLE',
        preparationState: 'RAW',
        preparationStateLabel: '生',
        ediblePortionLabel: '带皮',
        processingLabel: '未加工',
        riskFlags: ['PORTION_MISMATCH'],
        rationale: '带皮黄瓜不符合去皮要求。',
        provider: 'test',
        model: 'test-model',
        promptVersion: 'nutrition-candidate-review-v1',
      };
    });
    mockPrisma.ingredientNutritionCandidate.update.mockImplementation(
      async ({ where, data }) => ({
        id: where.id,
        status: where.id === 'candidate-peeled' ? 'CONFIRMED' : 'CANDIDATE',
        score: where.id === 'candidate-peeled' ? 0.98 : 0.8,
        ...data,
        ingredient: { id: 'ingredient-cucumber', name: '黄瓜', type: 'FOOD' },
        sourceRecord: {
          foodName:
            where.id === 'candidate-peeled'
              ? 'Cucumber, peeled, raw'
              : 'Cucumber, with peel, raw',
        },
      }),
    );

    const result = await service.rankFoodCandidatesWithAgent({
      ingredientId: 'ingredient-cucumber',
      reviewerRequirement: '去皮黄瓜',
    });

    expect(result.map((candidate) => candidate.id)).toEqual([
      'candidate-peeled',
      'candidate-with-peel',
    ]);
    expect(result[0].status).toBe('CONFIRMED');
  });

  it('combines deterministic nutrition validation with Agent risk summary', async () => {
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue({
      id: 'candidate-cucumber',
      normalizedNutrition: {
        vitamins: { vitaminC: null },
        meta: { rawBasisType: 'PER_100_G' },
      },
      ingredient: { id: 'ingredient-cucumber', name: '黄瓜', type: 'FOOD' },
      sourceRecord: {
        id: 'source-cucumber',
        sourceType: 'USDA',
        sourceKey: 'USDA:169225',
        foodName: 'Cucumber, peeled, raw',
        rawData: {
          foodNutrients: [
            {
              nutrient: { id: 1162, name: 'Vitamin C, total ascorbic acid', unitName: 'mg' },
              amount: 3.2,
            },
          ],
        },
      },
    });
    reviewProvider.reviewNutritionValidation.mockResolvedValue({
      provider: 'test',
      model: 'test-model',
      promptVersion: 'nutrition-data-validation-v1',
      verdict: 'NEEDS_HUMAN_REVIEW',
      confidence: 'HIGH',
      summary: '维生素 C 在来源中存在，但标准化档案缺失。',
      riskFlags: ['MISSING_EXPECTED_FIELD'],
    });

    const result = await service.validateCandidateNutritionWithAgent(
      'candidate-cucumber',
    );

    expect(result.system.status).toBe('FAIL');
    expect(result.system.missingExpectedFields[0]).toEqual(
      expect.objectContaining({ fieldPath: 'vitamins.vitaminC' }),
    );
    expect(result.agent?.summary).toContain('维生素 C');
  });

  it('can search whitelisted USDA online sources before Agent ranking', async () => {
    const originalUsdaApiKey = process.env.USDA_API_KEY;
    const originalUsdaLocalDataDir = process.env.USDA_LOCAL_DATA_DIR;
    const originalFetch = global.fetch;
    process.env.USDA_API_KEY = 'test-usda-key';
    process.env.USDA_LOCAL_DATA_DIR = '/tmp/missing-usda-local-dir';

    try {
      mockPrisma.ingredient.findUnique.mockResolvedValue({
        id: 'ingredient-quail-egg',
        name: '鹌鹑蛋',
        type: 'FOOD',
      });
      reviewProvider.createFoodCandidateSearchPlan.mockResolvedValue({
        provider: 'test',
        model: 'test-model',
        promptVersion: 'nutrition-candidate-search-plan-v1',
        searchTerms: ['quail egg raw'],
        includeTerms: ['quail egg'],
        excludeTerms: ['duck egg', 'chicken egg'],
        rationale: '优先查找鹌鹑蛋，排除鸭蛋和鸡蛋。',
      });

      const usdaSearchResult = {
        foods: [
          {
            fdcId: 172191,
            description: 'Egg, quail, whole, fresh, raw',
            dataType: 'SR Legacy',
          },
        ],
      };
      const usdaDetail = {
        fdcId: 172191,
        description: 'Egg, quail, whole, fresh, raw',
        dataType: 'SR Legacy',
        publicationDate: '2019-04-01',
        foodCategory: { description: 'Dairy and Egg Products' },
        foodNutrients: [
          {
            nutrient: { id: 1008, name: 'Energy', unitName: 'kcal' },
            amount: 158,
          },
          {
            nutrient: { id: 1003, name: 'Protein', unitName: 'g' },
            amount: 13.05,
          },
        ],
      };
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(usdaSearchResult),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(usdaDetail),
        }) as unknown as typeof global.fetch;

      const sourceRecord = {
        id: 'source-quail-egg',
        sourceType: 'USDA',
        sourceKey: 'USDA:172191',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Egg, quail, whole, fresh, raw',
        dataType: 'SR Legacy',
        normalizedNutrition: {
          macros: { energyKcal: 158, crudeProtein: 13.05 },
          meta: { rawBasisType: 'PER_100_G' },
        },
      };
      mockPrisma.nutritionSourceRecord.upsert.mockResolvedValue(sourceRecord);
      mockPrisma.nutritionSourceRecord.findMany.mockResolvedValue([
        sourceRecord,
      ]);
      mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue(null);
      mockPrisma.ingredientNutritionCandidate.upsert.mockResolvedValue({
        id: 'candidate-quail-egg',
      });
      mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
        {
          id: 'candidate-quail-egg',
          ingredientId: 'ingredient-quail-egg',
          status: 'CANDIDATE',
          score: 0.92,
          normalizedNutrition: sourceRecord.normalizedNutrition,
          ingredient: {
            id: 'ingredient-quail-egg',
            name: '鹌鹑蛋',
            type: 'FOOD',
          },
          sourceRecord,
        },
      ]);
      reviewProvider.reviewFoodCandidate.mockResolvedValue({
        recommendedAction: 'CONFIRM_PRIMARY',
        confidence: 'HIGH',
        identityVerdict: 'MATCH',
        stateVerdict: 'MATCH',
        ediblePortionVerdict: 'MATCH',
        processingVerdict: 'ACCEPTABLE',
        preparationState: 'RAW',
        preparationStateLabel: '生',
        ediblePortionLabel: '整体',
        processingLabel: '未加工',
        riskFlags: [],
        rationale: '来源记录明确为鹌鹑蛋。',
        provider: 'test',
        model: 'test-model',
        promptVersion: 'nutrition-candidate-review-v1',
      });
      mockPrisma.ingredientNutritionCandidate.update.mockImplementation(
        async ({ where, data }) => ({ id: where.id, status: 'CANDIDATE', ...data }),
      );

      await service.rankFoodCandidatesWithAgent({
        ingredientId: 'ingredient-quail-egg',
        reviewerRequirement: '寻找鹌鹑蛋原始营养档案',
        onlineWhitelistSearch: true,
      });

      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=test-usda-key',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('quail egg raw'),
        }),
      );
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.nal.usda.gov/fdc/v1/food/172191?api_key=test-usda-key',
        { headers: { Accept: 'application/json' } },
      );
      expect(mockPrisma.nutritionSourceRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            sourceType: 'USDA',
            sourceKey: 'USDA:172191',
            sourceDetail: expect.objectContaining({
              importMode: 'usda-api',
            }),
            normalizedNutrition: expect.objectContaining({
              macros: expect.objectContaining({
                energyKcal: 158,
                crudeProtein: 13.05,
              }),
            }),
          }),
        }),
      );
      expect(reviewProvider.reviewFoodCandidate).toHaveBeenCalledTimes(1);
    } finally {
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
      global.fetch = originalFetch;
    }
  });

  it('uses trusted web search when USDA API key is not configured', async () => {
    const originalUsdaApiKey = process.env.USDA_API_KEY;
    try {
      delete process.env.USDA_API_KEY;
      const trustedWebSearch = {
        search: jest.fn().mockResolvedValue([
          {
            sourceType: 'MANUAL',
            externalId: 'trusted-web-quail-egg-cooked',
            sourceTitle: 'Trusted web source: foodstandards.gov.au',
            foodName: 'Quail egg cooked',
            sourceDetail: {
              provider: 'Trusted whitelist web source',
              trustedDomain: 'foodstandards.gov.au',
              url: 'https://www.foodstandards.gov.au/nutrition/quail-egg.csv',
            },
            rawData: { rows: [{ foodName: 'Quail egg cooked' }] },
            normalizedNutrition: {
              macros: { energyKcal: 158, crudeProtein: 13.1 },
              meta: { rawBasisType: 'PER_100_G' },
            },
          },
        ]),
      };
      service = new NutritionGovernanceService(
        mockPrisma,
        undefined,
        reviewProvider as any,
        undefined,
        trustedWebSearch as any,
      );
      mockPrisma.ingredient.findUnique.mockResolvedValue({
        id: 'ingredient-quail-egg',
        name: '鹌鹑蛋',
        type: 'FOOD',
      });
      reviewProvider.createFoodCandidateSearchPlan.mockResolvedValue({
        provider: 'test',
        model: 'test-model',
        promptVersion: 'nutrition-candidate-search-plan-v1',
        searchTerms: ['quail egg cooked'],
        includeTerms: ['quail egg'],
        excludeTerms: ['duck egg', 'chicken egg'],
        rationale: '优先查找熟鹌鹑蛋。',
      });
      const sourceRecord = {
        id: 'source-trusted-web-quail-egg',
        sourceType: 'MANUAL',
        sourceKey: 'MANUAL:trusted-web-quail-egg-cooked',
        sourceTitle: 'Trusted web source: foodstandards.gov.au',
        foodName: 'Quail egg cooked',
        normalizedNutrition: {
          macros: { energyKcal: 158, crudeProtein: 13.1 },
          meta: { rawBasisType: 'PER_100_G' },
        },
      };
      mockPrisma.nutritionSourceRecord.upsert.mockResolvedValue(sourceRecord);
      mockPrisma.nutritionSourceRecord.findMany.mockResolvedValue([
        sourceRecord,
      ]);
      mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue(null);
      mockPrisma.ingredientNutritionCandidate.upsert.mockResolvedValue({
        id: 'candidate-trusted-web-quail-egg',
      });
      mockPrisma.ingredientNutritionCandidate.findMany.mockResolvedValue([
        {
          id: 'candidate-trusted-web-quail-egg',
          ingredientId: 'ingredient-quail-egg',
          status: 'CANDIDATE',
          score: 0.8,
          normalizedNutrition: sourceRecord.normalizedNutrition,
          ingredient: {
            id: 'ingredient-quail-egg',
            name: '鹌鹑蛋',
            type: 'FOOD',
          },
          sourceRecord,
        },
      ]);
      reviewProvider.reviewFoodCandidate.mockResolvedValue({
        recommendedAction: 'CONFIRM_SECONDARY',
        confidence: 'MEDIUM',
        identityVerdict: 'POSSIBLE_MATCH',
        stateVerdict: 'MATCH',
        ediblePortionVerdict: 'MATCH',
        processingVerdict: 'ACCEPTABLE',
        preparationState: 'COOKED',
        preparationStateLabel: '熟',
        ediblePortionLabel: '整体',
        processingLabel: '未加工',
        riskFlags: ['WEB_SOURCE_REVIEW_REQUIRED'],
        rationale: '可信网页来源，需要人工确认。',
        provider: 'test',
        model: 'test-model',
        promptVersion: 'nutrition-candidate-review-v1',
      });
      mockPrisma.ingredientNutritionCandidate.update.mockImplementation(
        async ({ where, data }) => ({ id: where.id, status: 'CANDIDATE', ...data }),
      );

      await service.rankFoodCandidatesWithAgent({
        ingredientId: 'ingredient-quail-egg',
        reviewerRequirement:
          '请从 https://www.foodstandards.gov.au/nutrition/quail-egg.csv 查找熟鹌鹑蛋营养数据',
        onlineWhitelistSearch: true,
      });

      expect(trustedWebSearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredientName: '鹌鹑蛋',
          searchTerms: ['quail egg cooked', 'quail egg'],
        }),
      );
      expect(mockPrisma.nutritionSourceRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            sourceType: 'MANUAL',
            sourceKey: 'MANUAL:trusted-web-quail-egg-cooked',
            normalizedNutrition: expect.objectContaining({
              macros: expect.objectContaining({ energyKcal: 158 }),
            }),
          }),
        }),
      );
      expect(reviewProvider.reviewFoodCandidate).toHaveBeenCalledTimes(1);
    } finally {
      if (originalUsdaApiKey === undefined) {
        delete process.env.USDA_API_KEY;
      } else {
        process.env.USDA_API_KEY = originalUsdaApiKey;
      }
    }
  });
});
