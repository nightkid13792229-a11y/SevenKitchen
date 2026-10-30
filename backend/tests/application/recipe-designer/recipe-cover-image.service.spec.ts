import { RecipeCoverImageService } from 'src/application/recipe-designer/recipe-cover-image.service';

/**
 * 封面生图（2026-10-28 重构）：
 *  · DeepSeek 写 brief（visualBriefService 已 mock）；
 *  · Seedream 5.0 Pro：2048x1152、watermark:false、response_format:url；
 *  · 750×422 压缩后存 COS；不再调用智谱。
 */
describe('RecipeCoverImageService · Seedream', () => {
  const configService = {
    getEnabledProviderRuntimeConfig: jest.fn().mockResolvedValue({
      provider: 'ARK',
      model: 'doubao-seedream-5-0-pro-260628',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'key',
      requestTimeoutMs: 120000,
      maxConcurrency: 1,
      retryCount: 0,
    }),
    getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKey: 'deepseek-key',
      requestTimeoutMs: 30000,
    }),
  };
  const cosService = {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://cos.example.com/recipes/covers/ai.jpg',
    }),
  };
  const imageOptimizationService = {
    optimizeForUpload: jest.fn().mockResolvedValue({
      buffer: Buffer.from('optimized'),
      filename: 'ai-cover-miniapp-cover.jpg',
    }),
  };
  const visualBriefService = {
    build: jest.fn().mockResolvedValue(
      'A high-end commercial food photograph on a light oak table, with sliced duck breast and oat groats.',
    ),
  };
  const recipeCoverConfigService = {
    getPromptTemplate: jest.fn().mockResolvedValue('system prompt'),
  };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: RecipeCoverImageService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getEnabledProviderRuntimeConfig.mockResolvedValue({
      provider: 'ARK',
      model: 'doubao-seedream-5-0-pro-260628',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'key',
      requestTimeoutMs: 120000,
      maxConcurrency: 1,
      retryCount: 0,
    });
    configService.getEnabledDeepSeekRuntimeConfig.mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKey: 'deepseek-key',
      requestTimeoutMs: 30000,
    });
    visualBriefService.build.mockResolvedValue(
      'A high-end commercial food photograph on a light oak table, with sliced duck breast and oat groats.',
    );
    recipeCoverConfigService.getPromptTemplate.mockResolvedValue('system prompt');
    imageOptimizationService.optimizeForUpload.mockResolvedValue({
      buffer: Buffer.from('optimized'),
      filename: 'ai-cover-miniapp-cover.jpg',
    });

    fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ data: [{ url: 'https://ark-temp.example.com/a.jpg' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    service = new (RecipeCoverImageService as any)(
      configService,
      cosService,
      imageOptimizationService,
      visualBriefService,
      recipeCoverConfigService,
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('有食材时先让 DeepSeek 写 brief，再用 Seedream 2048x1152 / watermark:false', async () => {
    const ingredients = [
      { name: '鸭胸', preparationMethod: '鸭胸/生/去皮', ratioPercent: 100 },
    ];

    const result = await service.generate({
      recipeName: '鸭肉南瓜燕麦',
      ingredients,
      layout: 'COVER_16_9',
    });

    expect(visualBriefService.build).toHaveBeenCalledTimes(1);
    const loader = visualBriefService.build.mock.calls[0][0];
    expect(typeof loader).toBe('function');
    await expect(loader()).resolves.toEqual(ingredients);
    expect(configService.getEnabledProviderRuntimeConfig).toHaveBeenCalledWith({
      purpose: 'RECIPE_COVER_IMAGE',
      provider: 'ARK',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'doubao-seedream-5-0-pro-260628',
      size: '2048x1152',
      response_format: 'url',
      watermark: false,
    });
    expect(body.prompt).toContain(
      'A high-end commercial food photograph on a light oak table',
    );
    expect(body.prompt).not.toContain('鸭胸');
    expect(body.prompt).toContain('画面中不要出现任何文字、标签或 LOGO。');
    expect(imageOptimizationService.optimizeForUpload).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      'recipe-cover',
    );
    expect(cosService.uploadImage).toHaveBeenCalledWith(
      Buffer.from('optimized'),
      'ai-cover-miniapp-cover.jpg',
      'recipes/covers',
    );
    expect(result).toMatchObject({
      url: 'https://cos.example.com/recipes/covers/ai.jpg',
      provider: 'ARK',
      model: 'doubao-seedream-5-0-pro-260628',
    });
  });

  it('可以直接传取数函数：由写提示词的服务在工具调用时取食材', async () => {
    const ingredients = [
      { name: '鸡胸', preparationMethod: '去骨', ratioPercent: 22.5 },
    ];
    const loadIngredients = jest.fn().mockResolvedValue(ingredients);

    await service.generate({
      recipeName: '青口贝虾仁鸡胸',
      loadIngredients,
      layout: 'COVER_16_9',
    });

    expect(visualBriefService.build).toHaveBeenCalledWith(loadIngredients);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    );
  });

  it('DeepSeek / Ark / 提示词任一缺失时不可用', async () => {
    await expect(service.isAvailable()).resolves.toBe(true);
    expect(configService.getEnabledDeepSeekRuntimeConfig).toHaveBeenCalledWith({
      purpose: 'RECIPE_COVER_PROMPT',
      fallbackToDefault: false,
    });

    configService.getEnabledDeepSeekRuntimeConfig.mockRejectedValueOnce(
      new Error('not configured'),
    );
    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('没有食材时走旧 prompt 兼容路径，但仍然用 Seedream', async () => {
    await service.generate({
      recipeName: '鸡肉南瓜',
      foodNames: ['鸡肉', '南瓜'],
    });

    expect(visualBriefService.build).not.toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.prompt).toContain('鸡肉');
    expect(body.size).toBe('2048x1152');
  });
});
