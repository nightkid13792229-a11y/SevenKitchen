import { RecipeCoverImageService } from 'src/application/recipe-designer/recipe-cover-image.service';

/**
 * 生图布局（2026-10-27）：
 *  · 默认（SQUARE）= 旧单食谱入口：1280x1280、原图直传，行为一点都不能变；
 *  · COVER_16_9 = 新的系列封面：1728x960，再走 recipe-cover 压缩成 750x422 / ≤160KB。
 *
 * 用真实的 callZhipuImage + 假 fetch 跑整条链路，断言的是「实际发出去的请求」，
 * 不是「mock 被调用过」。
 */
describe('RecipeCoverImageService · cover layout', () => {
  const configService = {
    getEnabledProviderRuntimeConfig: jest.fn().mockResolvedValue({
      provider: 'ZHIPU',
      model: 'glm-image',
      baseUrl: 'https://open.bigmodel.cn',
      apiKey: 'key',
      requestTimeoutMs: 90000,
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
      'a generous hero portion of pale-pink poultry breast, skin removed',
    ),
  };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: RecipeCoverImageService;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest
      .fn()
      // ① 智谱生图：返回临时链接
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ data: [{ url: 'https://temp.example.com/a.jpg' }] }),
      })
      // ② 下载临时图：返回 3 字节
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    // 通过 any 构造：让 RED 是行为失败（尺寸 / 压缩），不是 TS 参数个数报错
    visualBriefService.build.mockClear();
    visualBriefService.build.mockResolvedValue(
      'a generous hero portion of pale-pink poultry breast, skin removed',
    );
    service = new (RecipeCoverImageService as any)(
      configService,
      cosService,
      imageOptimizationService,
      visualBriefService,
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('默认方图：1280x1280、原图直传、不走压缩', async () => {
    const result = await service.generate({ recipeName: '鸡肉南瓜餐' });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://open.bigmodel.cn/api/paas/v4/images/generations',
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.size).toBe('1280x1280');
    expect(body.watermark_enabled).toBe(false);
    expect(visualBriefService.build).not.toHaveBeenCalled();
    expect(imageOptimizationService.optimizeForUpload).not.toHaveBeenCalled();
    expect(cosService.uploadImage).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      expect.stringContaining('ai-cover-'),
      'recipes/covers',
    );
    expect(result.url).toBe('https://cos.example.com/recipes/covers/ai.jpg');
  });

  it('16:9 封面：1728x960、先走 recipe-cover 压缩再上传', async () => {
    await service.generate({
      recipeName: '鸡肉南瓜餐',
      layout: 'COVER_16_9',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.size).toBe('1728x960');
    expect(body.watermark_enabled).toBe(false);
    expect(visualBriefService.build).not.toHaveBeenCalled();
    expect(imageOptimizationService.optimizeForUpload).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      'recipe-cover',
    );
    expect(cosService.uploadImage).toHaveBeenCalledWith(
      Buffer.from('optimized'),
      'ai-cover-miniapp-cover.jpg',
      'recipes/covers',
    );
  });

  it('有食材时先翻成画面描述：提示词不含原始中文名/百分比，水印关闭', async () => {
    const ingredients = [
      {
        name: '鸭胸',
        preparationMethod: '鸭胸/熟/去皮',
        ratioPercent: 100,
      },
    ];

    await service.generate({
      recipeName: '鸭肉南瓜燕麦',
      layout: 'COVER_16_9',
      ingredients,
    });

    expect(visualBriefService.build).toHaveBeenCalledWith(ingredients);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.prompt).toContain(
      'a generous hero portion of pale-pink poultry breast, skin removed',
    );
    expect(body.prompt).not.toContain('鸭胸');
    expect(body.prompt).not.toContain('100%');
    expect(body.watermark_enabled).toBe(false);
  });
});
