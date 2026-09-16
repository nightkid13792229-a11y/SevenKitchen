import { BadRequestException } from '@nestjs/common';

import { RecipeCopywritingService } from '../../src/application/recipe-designer/recipe-copywriting.service';

/**
 * 服务层编排测试：验证「提示词约束 → 输出校验 → 合规硬校验」三层防护真正生效。
 * 通过 mock 供应商配置与全局 fetch，不产生真实网络调用。
 */
describe('RecipeCopywritingService 编排', () => {
  const runtimeConfig = {
    provider: 'DEEPSEEK',
    baseUrl: 'https://api.example.com/v1',
    model: 'deepseek-v4-pro',
    apiKey: 'test-key',
    requestTimeoutMs: 5000,
  };

  const baseInput = {
    recipeName: '燕麦鳕鱼猪肉',
    nutritionStandard: 'FEDIAF_2025',
    lifeStageLabels: ['成犬'],
    energyDensityKcalPerKg: 1244,
    moisturePercent: 69.2,
    fatPercentDm: 10.5,
    proteinPercentDm: 45.2,
    foodItems: [{ name: '鳕鱼', ratio: 11.2 }],
    supplementItems: [{ name: '碳酸钙粉', targetText: '每kg食材添加2800钙' }],
    currentDescription: null,
    allowedTags: ['含鳕鱼', '含红薯', '成犬维持'],
  };

  function createService() {
    const agentProviderConfigService = {
      getEnabledDeepSeekRuntimeConfig: jest
        .fn()
        .mockResolvedValue(runtimeConfig),
    } as any;
    return new RecipeCopywritingService(agentProviderConfigService);
  }

  function mockFetchOnce(payload: Record<string, unknown>) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(payload) } }],
      }),
    });
    (global as any).fetch = fetchMock;
    return fetchMock;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('合规输出：返回规范化结果，推荐标签限定在白名单内', async () => {
    mockFetchOnce({
      sellingPoint: '含鳕鱼与红薯，符合 FEDIAF 2025 的成犬日常鲜食',
      description: '以鳕鱼提供动物蛋白，搭配红薯与燕麦，低温蒸煮后冷链配送。',
      suggestedTags: ['含鳕鱼', '抗炎', '成犬维持'],
      basis: '依据配方原料与营养标准',
    });

    const service = createService();
    const result = await service.generate(baseInput);

    expect(result.sellingPoint).toContain('含鳕鱼');
    expect(result.description).toContain('鳕鱼');
    // 「抗炎」不在白名单内，必须被剔除
    expect(result.suggestedTags).toEqual(['含鳕鱼', '成犬维持']);
    expect(result.provider).toBe('DEEPSEEK');
  });

  it('AI 输出命中禁用表述：整条拒绝并指出命中的词', async () => {
    mockFetchOnce({
      sellingPoint: '护肾配方，改善肾脏负担',
      description: '适合肾功能不佳的狗狗。',
      suggestedTags: ['含鳕鱼'],
      basis: '',
    });

    const service = createService();
    await expect(service.generate(baseInput)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.generate(baseInput)).rejects.toThrow(/护肾/);
  });

  it('输出不完整（缺卖点或说明）：拒绝', async () => {
    mockFetchOnce({ sellingPoint: '', description: '', suggestedTags: [] });
    const service = createService();
    await expect(service.generate(baseInput)).rejects.toThrow(/不完整/);
  });

  it('调用参数：使用 RECIPE_COPYWRITING 用途，并把白名单与禁用词表传给模型', async () => {
    const fetchMock = mockFetchOnce({
      sellingPoint: '含鳕鱼的成犬鲜食',
      description: '以鳕鱼提供动物蛋白。',
      suggestedTags: ['含鳕鱼'],
      basis: '',
    });

    const service = createService();
    await service.generate(baseInput);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    // 系统提示词内嵌法规红线
    expect(body.messages[0].content).toContain(
      '禁止对宠物饲料作具有预防或者治疗宠物疾病的说明或者宣传',
    );
    const userPayload = JSON.parse(body.messages[1].content);
    expect(userPayload.allowedTags).toEqual(baseInput.allowedTags);
    expect(userPayload.forbiddenPatterns).toContain('护肾');
    expect(userPayload.recipe.name).toBe('燕麦鳕鱼猪肉');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('isAvailable：供应商未配置时返回 false 而不抛错', async () => {
    const agentProviderConfigService = {
      getEnabledDeepSeekRuntimeConfig: jest
        .fn()
        .mockRejectedValue(new Error('未配置')),
    } as any;
    const service = new RecipeCopywritingService(agentProviderConfigService);
    await expect(service.isAvailable()).resolves.toBe(false);
  });
});
