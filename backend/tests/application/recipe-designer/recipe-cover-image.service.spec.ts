import { RecipeCoverImageService } from 'src/application/recipe-designer/recipe-cover-image.service';

/**
 * 封面生图（2026-11-07 结构化版）：
 *  · DeepSeek 只写「食材形态」（visualBriefService 已 mock）；
 *  · cover-style 模板拼提示词：清单 / 机位 / 台面 / 骨架 / 道具 / 安全区 / 负面；
 *  · Seedream 5.0 Pro 并发出 N 张（2048x1152、watermark:false）；
 *  · 750×422 压缩后存 COS；部分失败不影响整体。
 */
describe('RecipeCoverImageService · Seedream', () => {
  const configService = {
    getEnabledProviderRuntimeConfig: jest.fn(),
    getEnabledDeepSeekRuntimeConfig: jest.fn(),
  };
  const cosService = { uploadImage: jest.fn() };
  const imageOptimizationService = { optimizeForUpload: jest.fn() };
  const visualBriefService = { buildForms: jest.fn() };
  const recipeCoverConfigService = { getPromptTemplate: jest.fn() };

  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: RecipeCoverImageService;
  let uploadSeq = 0;
  let generateSeq = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    uploadSeq = 0;
    generateSeq = 0;

    configService.getEnabledProviderRuntimeConfig.mockResolvedValue({
      provider: 'ARK',
      model: 'doubao-seedream-5-0-pro-260628',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'key',
      requestTimeoutMs: 120000,
    });
    configService.getEnabledDeepSeekRuntimeConfig.mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKey: 'deepseek-key',
      requestTimeoutMs: 30000,
    });
    visualBriefService.buildForms.mockResolvedValue({
      鸭胸: '两块并排平放，鸭皮朝上，划十字纹',
    });
    cosService.uploadImage.mockImplementation(async () => {
      uploadSeq += 1;
      return {
        url: `https://cos.example.com/recipes/covers/ai-${uploadSeq}.jpg`,
      };
    });
    imageOptimizationService.optimizeForUpload.mockImplementation(async () => ({
      buffer: Buffer.from('optimized'),
      filename: 'ai-cover-miniapp-cover.jpg',
    }));

    fetchMock = jest.fn(async (url: string) => {
      if (String(url).includes('/images/generations')) {
        generateSeq += 1;
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              data: [
                { url: `https://ark-temp.example.com/${generateSeq}.jpg` },
              ],
            }),
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    service = new RecipeCoverImageService(
      configService as never,
      cosService as never,
      imageOptimizationService as never,
      visualBriefService as never,
      recipeCoverConfigService as never,
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('默认出一张：模板拼提示词，Seedream 2048x1152 / watermark:false', async () => {
    const ingredients = [
      { name: '鸭胸', preparationMethod: '鸭胸/生/去皮', ratioPercent: 100 },
    ];

    const result = await service.generate({
      recipeName: '鸭肉南瓜燕麦',
      ingredients,
      layout: 'COVER_16_9',
    });

    expect(visualBriefService.buildForms).toHaveBeenCalledTimes(1);
    const loader = visualBriefService.buildForms.mock.calls[0][0];
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
    // 清单写死，模型不能自己加料
    expect(body.prompt).toContain(
      '画面中必须且只能出现以下 1 种食材，不要添加清单以外的任何食材：鸭胸。',
    );
    // 品牌层固定：正俯拍 + 安全区 + 负面词
    expect(body.prompt).toContain('正俯拍 90° 垂直向下');
    expect(body.prompt).toContain('四边各留 10% 的空白');
    expect(body.prompt).toContain('不要熟食');
    // 形态来自文本模型
    expect(body.prompt).toContain('鸭胸：两块并排平放，鸭皮朝上，划十字纹');

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
      url: 'https://cos.example.com/recipes/covers/ai-1.jpg',
      provider: 'ARK',
      model: 'doubao-seedream-5-0-pro-260628',
    });
    expect(result.candidates).toHaveLength(1);
  });

  it('可以直接传取数函数：由写形态的服务在工具调用时取食材', async () => {
    const ingredients = [
      { name: '鸡胸', preparationMethod: '去骨', ratioPercent: 22.5 },
    ];
    const loadIngredients = jest.fn().mockResolvedValue(ingredients);

    await service.generate({
      recipeName: '青口贝虾仁鸡胸',
      loadIngredients,
      layout: 'COVER_16_9',
    });

    expect(visualBriefService.buildForms).toHaveBeenCalledTimes(1);
    const loader = visualBriefService.buildForms.mock.calls[0][0];
    await expect(loader()).resolves.toEqual(ingredients);
  });

  it('variants=3 时并发出三张，三份提示词互不相同', async () => {
    const ingredients = [
      { name: '牛霖', preparationMethod: '整块', ratioPercent: 42 },
      { name: '南瓜', preparationMethod: '切块', ratioPercent: 18 },
    ];
    visualBriefService.buildForms.mockResolvedValue({
      牛霖: '整块平放，表面朝上',
      南瓜: '带皮切块',
    });

    const result = await service.generate({
      recipeName: '牛肉南瓜糙米',
      ingredients,
      layout: 'COVER_16_9',
      variants: 3,
      dedupeKey: 'draft:abc',
    });

    expect(result.candidates).toHaveLength(3);
    expect(new Set(result.candidates.map((item) => item.preset)).size).toBe(3);
    expect(result.candidates[0].presetLabel).toBeTruthy();

    const prompts = fetchMock.mock.calls
      .filter(([url]) => String(url).includes('/images/generations'))
      .map(([, init]) => JSON.parse(init.body).prompt as string);
    expect(prompts).toHaveLength(3);
    expect(new Set(prompts).size).toBe(3);
    for (const prompt of prompts) {
      expect(prompt).toContain('牛霖、南瓜');
      expect(prompt).toContain('正俯拍 90° 垂直向下');
      expect(prompt).toContain('四边各留 10% 的空白');
    }
  });

  it('三张里失败一张时，返回其余两张，不整体报错', async () => {
    const ingredients = [
      { name: '牛霖', preparationMethod: '整块', ratioPercent: 100 },
    ];
    let call = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/images/generations')) {
        call += 1;
        if (call === 1) {
          return {
            ok: false,
            status: 500,
            text: async () => JSON.stringify({ message: '模型繁忙' }),
          };
        }
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              data: [{ url: 'https://ark-temp.example.com/ok.jpg' }],
            }),
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    });

    const result = await service.generate({
      recipeName: '牛肉南瓜糙米',
      ingredients,
      layout: 'COVER_16_9',
      variants: 3,
    });

    expect(result.candidates).toHaveLength(2);
  });

  it('三张全失败时抛出生图错误', async () => {
    visualBriefService.buildForms.mockResolvedValue({});
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/images/generations')) {
        return {
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ message: '模型繁忙' }),
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    });

    await expect(
      service.generate({
        recipeName: '牛肉南瓜糙米',
        ingredients: [{ name: '牛霖', ratioPercent: 100 }],
        variants: 2,
      }),
    ).rejects.toThrow('生图失败');
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

    expect(visualBriefService.buildForms).not.toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.prompt).toContain('鸡肉');
    expect(body.size).toBe('2048x1152');
  });
});
