import { OpenAINutritionCandidateReviewProvider } from 'src/application/nutrition-governance/nutrition-candidate-review.provider';

describe('OpenAINutritionCandidateReviewProvider', () => {
  const originalFetch = global.fetch;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_NUTRITION_REVIEW_MODEL;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }
    if (originalModel === undefined) {
      delete process.env.OPENAI_NUTRITION_REVIEW_MODEL;
    } else {
      process.env.OPENAI_NUTRITION_REVIEW_MODEL = originalModel;
    }
  });

  it('calls OpenAI Responses API with structured output and parses the review', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_NUTRITION_REVIEW_MODEL = 'test-model';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
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
                  rationale: 'The source describes raw boneless skinless chicken breast.',
                  confidence: 'HIGH',
                }),
              },
            ],
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new OpenAINutritionCandidateReviewProvider();
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
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('test-model');
    expect(body.text.format.type).toBe('json_schema');
    expect(review).toEqual(
      expect.objectContaining({
        provider: 'openai',
        model: 'test-model',
        recommendedAction: 'CONFIRM_PRIMARY',
        preparationStateLabel: '生重',
        ediblePortionLabel: '去皮去骨',
        confidence: 'HIGH',
      }),
    );
  });
});
