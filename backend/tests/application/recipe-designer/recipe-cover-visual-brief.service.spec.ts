import { BadRequestException } from '@nestjs/common';

const callDeepSeekJson = jest.fn();

jest.mock('src/application/recipe-designer/deepseek-chat', () => ({
  callDeepSeekJson: (...args: unknown[]) => callDeepSeekJson(...args),
}));

import { RecipeCoverVisualBriefService } from 'src/application/recipe-designer/recipe-cover-visual-brief.service';

const ingredients = [
  { name: '鸭胸', preparationMethod: '鸭胸/熟/去皮', ratioPercent: 47 },
  { name: '燕麦米', preparationMethod: '生', ratioPercent: 16 },
  { name: '南瓜', preparationMethod: '生/去皮切块', ratioPercent: 8 },
];

const cleanBrief =
  'A high-end editorial food photograph on a light oak table by a window. ' +
  'A large pale-pink duck breast in the foreground, with oat groats and ' +
  'orange pumpkin cubes behind it; soft side light, warm neutral grade, ' +
  'shallow depth of field.';

const parsed = {
  brief: cleanBrief,
  ingredients: [
    {
      index: 0,
      visual: 'a large pale-pink duck breast',
      placement: 'foreground hero',
    },
    { index: 1, visual: 'a mound of oat groats', placement: 'middle' },
    { index: 2, visual: 'orange pumpkin cubes', placement: 'middle' },
  ],
  missing: [],
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
  const config = {
    getPromptTemplate: jest
      .fn()
      .mockResolvedValue(
        'You are a commercial food photographer and food stylist.',
      ),
  };
  return {
    service: new RecipeCoverVisualBriefService(
      provider as never,
      config as never,
    ),
    provider,
    config,
  };
}

describe('RecipeCoverVisualBriefService', () => {
  beforeEach(() => {
    callDeepSeekJson.mockReset();
  });

  it('让 DeepSeek 写整张照片的 brief：输入带占比，输出是一段摄影描述', async () => {
    callDeepSeekJson.mockResolvedValue(parsed);
    const { service } = createService();

    const brief = await service.build(ingredients);

    expect(brief).toBe(cleanBrief);
    expect(callDeepSeekJson).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.7,
        systemPrompt: expect.stringContaining(
          'commercial food photographer',
        ),
        userPayload: {
          scene: expect.objectContaining({
            mustShowAll: true,
          }),
          ingredients: [
            { index: 0, name: '鸭胸', preparation: '鸭胸/熟/去皮', ratio: 47 },
            { index: 1, name: '燕麦米', preparation: '生', ratio: 16 },
            { index: 2, name: '南瓜', preparation: '生/去皮切块', ratio: 8 },
          ],
        },
      }),
    );
  });

  it('同一组食材 + 占比走缓存：第二次不再调用模型', async () => {
    callDeepSeekJson.mockResolvedValue(parsed);
    const { service } = createService();

    await service.build(ingredients);
    await service.build(ingredients);

    expect(callDeepSeekJson).toHaveBeenCalledTimes(1);
  });

  it('把 brief 里的中文、数字、百分号、引号、冒号清掉', async () => {
    callDeepSeekJson.mockResolvedValue({
      ...parsed,
      brief:
        '现场 47% "a pale-pink duck breast": 在 light oak table, soft light.',
    });
    const { service } = createService();

    const brief = await service.build(ingredients);

    expect(brief).toContain('a pale-pink duck breast');
    expect(brief).toContain('light oak table');
    expect(brief).not.toMatch(/[\u4e00-\u9fff]/);
    expect(brief).not.toMatch(/\d/);
    expect(brief).not.toContain('%');
    expect(brief).not.toContain('"');
    expect(brief).not.toContain(':');
  });

  it('有食材没被安排进画面（missing 非空）就报错', async () => {
    callDeepSeekJson.mockResolvedValue({
      ...parsed,
      missing: [2],
    });
    const { service } = createService();

    await expect(service.build(ingredients)).rejects.toThrow(
      '有食材没被安排进画面',
    );
  });

  it('结构化清单缺一条也报错，不拿残缺 brief 去生图', async () => {
    callDeepSeekJson.mockResolvedValue({
      ...parsed,
      ingredients: parsed.ingredients.slice(0, 2),
    });
    const { service } = createService();

    await expect(service.build(ingredients)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('brief 为空时报错', async () => {
    callDeepSeekJson.mockResolvedValue({
      ...parsed,
      brief: '   ',
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
