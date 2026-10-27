import { BadRequestException } from '@nestjs/common';

const callDeepSeekJson = jest.fn();

jest.mock('src/application/recipe-designer/deepseek-chat', () => ({
  callDeepSeekJson: (...args: unknown[]) => callDeepSeekJson(...args),
}));

import { RecipeCoverVisualBriefService } from 'src/application/recipe-designer/recipe-cover-visual-brief.service';

const ingredients = [
  { name: '鸭胸', preparationMethod: '鸭胸/熟/去皮', ratioPercent: 50 },
  { name: '燕麦米', preparationMethod: '生', ratioPercent: 25 },
  { name: '南瓜', preparationMethod: '生/去皮切块', ratioPercent: 25 },
];

const descriptors = {
  items: [
    { index: 0, visual: 'a pale-pink duck breast, skin removed' },
    { index: 1, visual: 'a mound of pale oat groats' },
    { index: 2, visual: 'orange pumpkin cubes' },
  ],
};

function createService() {
  const provider = {
    getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://example.invalid',
      model: 'test-model',
      apiKey: 'test-key',
      requestTimeoutMs: 1000,
    }),
  };
  return {
    service: new RecipeCoverVisualBriefService(provider as never),
    provider,
  };
}

describe('RecipeCoverVisualBriefService', () => {
  beforeEach(() => {
    callDeepSeekJson.mockReset();
  });

  it('把食材翻成画面描述，并用 hero / moderate 表达分量，不带数字和中文', async () => {
    callDeepSeekJson.mockResolvedValue(descriptors);
    const { service } = createService();

    const brief = await service.build(ingredients);

    expect(brief).toBe(
      'a generous hero portion of a pale-pink duck breast, skin removed; ' +
        'a moderate amount of a mound of pale oat groats; ' +
        'a moderate amount of orange pumpkin cubes',
    );
    expect(brief).not.toMatch(/[\u4e00-\u9fff]/);
    expect(brief).not.toMatch(/\d/);
    expect(callDeepSeekJson).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.2,
        systemPrompt: expect.stringContaining('raw'),
      }),
    );
  });

  it('同一食材 + 预处理走缓存：第二次不再调用模型', async () => {
    callDeepSeekJson.mockResolvedValue(descriptors);
    const { service, provider } = createService();

    await service.build(ingredients);
    await service.build(ingredients);

    expect(callDeepSeekJson).toHaveBeenCalledTimes(1);
    expect(provider.getEnabledDeepSeekRuntimeConfig).toHaveBeenCalledTimes(1);
  });

  it('把模型带出来的中文、数字、百分号、引号清掉', async () => {
    callDeepSeekJson.mockResolvedValue({
      items: [
        { index: 0, visual: '鸭胸 47% "a pale-pink duck breast"' },
        { index: 1, visual: '燕麦 25% a mound of pale oat groats' },
        { index: 2, visual: '南瓜 25% orange pumpkin cubes' },
      ],
    });
    const { service } = createService();

    const brief = await service.build(ingredients);

    expect(brief).toContain('a pale-pink duck breast');
    expect(brief).not.toMatch(/[\u4e00-\u9fff]/);
    expect(brief).not.toMatch(/\d/);
    expect(brief).not.toContain('%');
    expect(brief).not.toContain('"');
  });

  it('模型少返回一条就报错，不拿残缺描述去生图', async () => {
    callDeepSeekJson.mockResolvedValue({
      items: [{ index: 0, visual: 'a pale-pink duck breast' }],
    });
    const { service } = createService();

    await expect(service.build(ingredients)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('模型调用失败：报“封面画面描述生成失败”，不缓存', async () => {
    callDeepSeekJson.mockRejectedValue(
      new BadRequestException('DeepSeek Agent 设置未启用'),
    );
    const { service } = createService();

    await expect(service.build(ingredients)).rejects.toThrow(
      '封面画面描述生成失败',
    );
    expect(callDeepSeekJson).toHaveBeenCalledTimes(1);
  });

  it('没有食材直接报错', async () => {
    const { service } = createService();
    await expect(service.build([])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(callDeepSeekJson).not.toHaveBeenCalled();
  });
});
