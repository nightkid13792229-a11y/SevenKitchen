import { DeepSeekNutritionCandidateReviewProvider } from 'src/application/nutrition-governance/nutrition-candidate-review.provider';

describe('DeepSeekNutritionCandidateReviewProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls DeepSeek chat completions with JSON output and parses the review', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                identityVerdict: 'MATCH',
                stateVerdict: 'MATCH',
                ediblePortionVerdict: 'MATCH',
                processingVerdict: 'ACCEPTABLE',
                recommendedAction: 'CONFIRM_PRIMARY',
                preparationState: 'RAW',
                preparationStateLabel: '生重',
                ediblePortionLabel: '去皮去骨',
                processingLabel: null,
                riskFlags: [],
                rationale: '鸡胸肉与 USDA 生去皮去骨鸡胸肉匹配。',
                confidence: 'HIGH',
              }),
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new DeepSeekNutritionCandidateReviewProvider({
      apiKey: 'deepseek-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      requestTimeoutMs: 30000,
    });
    const review = await provider.reviewFoodCandidate({
      ingredient: { id: 'ingredient-1', name: '鸡胸肉', type: 'FOOD' },
      sourceRecord: {
        id: 'source-1',
        sourceType: 'USDA',
        sourceKey: 'USDA:123',
        foodName: 'Chicken breast, boneless, skinless, raw',
      },
      normalizedNutrition: {
        macros: { energyKcal: 120, crudeProtein: 20, crudeFat: 5 },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer deepseek-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0);
    expect(body.messages[0].content).toContain('Return only JSON');
    expect(review).toEqual(
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        recommendedAction: 'CONFIRM_PRIMARY',
        preparationStateLabel: '生',
        confidence: 'HIGH',
      }),
    );
  });

  it('throws a provider error with status for non-2xx responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'rate limited',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new DeepSeekNutritionCandidateReviewProvider({
      apiKey: 'deepseek-key',
    });

    await expect(
      provider.reviewFoodCandidate({
        ingredient: { id: 'ingredient-1', name: '鸡胸肉', type: 'FOOD' },
        sourceRecord: { id: 'source-1', foodName: 'Chicken breast, raw' },
        normalizedNutrition: {},
      }),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining('DeepSeek candidate review failed'),
    });
  });

  it('accepts DeepSeek decision as an alias for recommendedAction', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: 'CONFIRM_PRIMARY',
                rationale: '普通卷心菜来源匹配。',
                preparationState: 'RAW',
                preparationStateLabel: '生',
                ediblePortionLabel: '标准可食部',
                processingLabel: '未加工',
              }),
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new DeepSeekNutritionCandidateReviewProvider({
      apiKey: 'deepseek-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
    });

    const review = await provider.reviewFoodCandidate({
      ingredient: { id: 'ingredient-cabbage', name: '卷心菜', type: 'FOOD' },
      sourceRecord: {
        id: 'source-cabbage',
        sourceType: 'USDA',
        sourceKey: 'USDA:169335',
        foodName: 'Cabbage, common (danish, domestic, and pointed types), raw',
      },
      normalizedNutrition: {
        macros: { energyKcal: 25, crudeProtein: 1.28, crudeFat: 0.1 },
      },
    });

    expect(review.recommendedAction).toBe('CONFIRM_PRIMARY');
    expect(review.rationale).toBe('普通卷心菜来源匹配。');
  });
});
