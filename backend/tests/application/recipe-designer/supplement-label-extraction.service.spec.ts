import { BadRequestException } from '@nestjs/common';
import {
  SupplementLabelExtractionService,
  type SupplementLabelExtractionResult,
  type SupplementLabelOcrProvider,
} from '../../../src/application/recipe-designer/supplement-label-extraction.service';

describe('SupplementLabelExtractionService', () => {
  const originalFetch = global.fetch;

  const ocrProvider: jest.Mocked<SupplementLabelOcrProvider> = {
    recognizeImage: jest.fn(),
  };
  const agentProviderConfigService = {
    getEnabledDeepSeekRuntimeConfig: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ocrProvider.recognizeImage.mockResolvedValue({
      text: '产品名称：柠檬酸钙\n营养分析：每粒含钙 200mg，磷 0mg',
      confidence: 91.5,
      lines: [
        { text: '产品名称：柠檬酸钙', confidence: 93 },
        { text: '营养分析：每粒含钙 200mg，磷 0mg', confidence: 90 },
      ],
    });
    agentProviderConfigService.getEnabledDeepSeekRuntimeConfig.mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      reviewModel: 'deepseek-v4-pro',
      apiKey: 'deepseek-test-key',
      maxConcurrency: 1,
      requestTimeoutMs: 90000,
      retryCount: 2,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('extracts a normalized supplement draft from OCR text through DeepSeek', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ingredientName: '柠檬酸钙',
                profileName: '柠檬酸钙 包装识别档案',
                usageUnit: '粒',
                basisType: 'PER_SERVING',
                servingWeightG: null,
                densityGPerMl: null,
                nutrients: {
                  'minerals.calcium': 200,
                  'minerals.phosphorus': 0,
                  'unknown.field': 123,
                },
                rawIngredientsText: 'Calcium citrate',
                warnings: ['包装未标注每粒重量'],
                confidence: 'MEDIUM',
              }),
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const service = new SupplementLabelExtractionService(
      ocrProvider,
      agentProviderConfigService as any,
    );
    const result = await service.extractFromImage({
      imageUrl: 'https://cdn.example.com/label.jpg',
      originalFilename: 'label.jpg',
      requestedBy: 'staff-1',
    });

    expect(result).toEqual<SupplementLabelExtractionResult>({
      ingredientName: '柠檬酸钙',
      profileName: '柠檬酸钙 包装识别档案',
      usageUnit: '粒',
      basisType: 'PER_SERVING',
      servingWeightG: undefined,
      densityGPerMl: undefined,
      nutrients: {
        'minerals.calcium': 200,
      },
      rawIngredientsText: 'Calcium citrate',
      ocrText: '产品名称：柠檬酸钙\n营养分析：每粒含钙 200mg，磷 0mg',
      ocrConfidence: 91.5,
      warnings: ['包装未标注每粒重量', '已忽略无法识别的营养字段 unknown.field'],
      confidence: 'MEDIUM',
    });

    expect(ocrProvider.recognizeImage).toHaveBeenCalledWith({
      imageUrl: 'https://cdn.example.com/label.jpg',
      originalFilename: 'label.jpg',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer deepseek-test-key',
        }),
      }),
    );
    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[1].content).toContain('产品名称：柠檬酸钙');
  });

  it('fails clearly when OCR returns no recognizable text', async () => {
    ocrProvider.recognizeImage.mockResolvedValue({
      text: '',
      confidence: 0,
      lines: [],
    });
    const service = new SupplementLabelExtractionService(
      ocrProvider,
      agentProviderConfigService as any,
    );

    await expect(
      service.extractFromImage({
        imageUrl: 'https://cdn.example.com/label.jpg',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
