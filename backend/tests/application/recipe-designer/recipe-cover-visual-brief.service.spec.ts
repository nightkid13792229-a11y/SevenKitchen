import { BadRequestException } from '@nestjs/common';

const callDeepSeekTools = jest.fn();

jest.mock('src/application/recipe-designer/deepseek-tools-chat', () => ({
  callDeepSeekTools: (...args: unknown[]) => callDeepSeekTools(...args),
}));

import { RecipeCoverVisualBriefService } from 'src/application/recipe-designer/recipe-cover-visual-brief.service';

const systemPrompt = [
  '你是一名顶尖的商业食物摄影师兼食物造型师，服务于一个高端鲜食狗粮品牌。',
  '',
  '先调用 get_recipe_ingredients 读取当前食谱的食材。',
  '',
  '再用中文写一段用于让文生图模型生成食谱封面的提示词。',
  '',
  '画面中不要出现任何文字、标签或 LOGO。',
  '',
  '只需要返回提示词即可。',
].join('\n');

const ingredients = [
  { name: '鸡胸', preparationMethod: '生/去骨', ratioPercent: 22.5 },
  {
    name: '牛肝',
    preparationMethod: '去油、生重、打碎、充分搅拌',
    ratioPercent: 4.5,
  },
  { name: '大米', preparationMethod: '熟', ratioPercent: 0 },
  { name: '红薯', preparationMethod: '熟/去皮', ratioPercent: 0 },
  { name: '火麻籽', preparationMethod: '火麻仁/干/去壳', ratioPercent: 0 },
  { name: '食用盐', preparationMethod: '干重、充分搅拌', ratioPercent: 0 },
  { name: '南美对虾虾仁', preparationMethod: '', ratioPercent: 0 },
];

const expectedToolResult = [
  '鸡胸（去骨）',
  '牛肝（去油、打碎、充分搅拌）',
  '大米',
  '红薯（去皮）',
  '火麻籽（火麻仁、去壳）',
  '食用盐（充分搅拌）',
  '南美对虾虾仁',
].join('\n');

const toolCall = {
  id: 'call-1',
  type: 'function' as const,
  function: {
    name: 'get_recipe_ingredients',
    arguments: '{}',
  },
};

const finalPrompt =
  '一块去骨鸡胸、少量牛肝、大米、去皮红薯、去壳火麻籽、一点盐和虾仁，' +
  '放在一张干净的木桌上，拍成顶尖杂志级的商业食物照片。';

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
    getPromptTemplate: jest.fn().mockResolvedValue(systemPrompt),
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

function mockToolFlow(content = finalPrompt) {
  callDeepSeekTools
    .mockResolvedValueOnce({
      content: null,
      toolCalls: [toolCall],
      usage: null,
    })
    .mockResolvedValueOnce({
      content,
      toolCalls: [],
      usage: null,
    });
}

describe('RecipeCoverVisualBriefService · 工具取食材', () => {
  beforeEach(() => {
    callDeepSeekTools.mockReset();
  });

  it('先强制调用 get_recipe_ingredients，拿到食材后再写提示词', async () => {
    mockToolFlow();
    const loadIngredients = jest.fn().mockResolvedValue(ingredients);
    const { service } = createService();

    const prompt = await service.build(loadIngredients);

    expect(prompt).toBe(finalPrompt);
    expect(loadIngredients).toHaveBeenCalledTimes(1);

    expect(callDeepSeekTools).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: expect.any(String) },
        ],
        tools: [
          expect.objectContaining({
            type: 'function',
            function: expect.objectContaining({
              name: 'get_recipe_ingredients',
            }),
          }),
        ],
        toolChoice: {
          type: 'function',
          function: { name: 'get_recipe_ingredients' },
        },
        thinking: 'disabled',
        temperature: 0.3,
        maxTokens: 1000,
      }),
    );

    expect(callDeepSeekTools).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: expect.any(String) },
          { role: 'assistant', content: null, reasoning_content: '', tool_calls: [toolCall] },
          {
            role: 'tool',
            tool_call_id: 'call-1',
            content: expectedToolResult,
          },
        ],
        toolChoice: 'none',
        thinking: 'enabled',
        temperature: 0.7,
        maxTokens: 8000,
      }),
    );
  });

  it('工具结果只给名称和处理方式：不给占比，熟/生/干只保留切割部位信息', async () => {
    mockToolFlow();
    const { service } = createService();

    await service.build(jest.fn().mockResolvedValue(ingredients));

    const secondCall = callDeepSeekTools.mock.calls[1][0];
    const toolMessage = secondCall.messages[3];
    expect(toolMessage.content).toBe(expectedToolResult);
    expect(toolMessage.content).not.toMatch(/\d/);
    expect(toolMessage.content).not.toContain('熟');
    expect(toolMessage.content).not.toContain('生/');
    expect(toolMessage.content).not.toContain('22.5');
  });

  it('模型没有调用工具时直接报错，不拿空数据去写', async () => {
    callDeepSeekTools.mockResolvedValueOnce({
      content: '我直接写一段',
      toolCalls: [],
      usage: null,
    });
    const loadIngredients = jest.fn().mockResolvedValue(ingredients);
    const { service } = createService();

    await expect(service.build(loadIngredients)).rejects.toThrow(
      '模型没有读取食材',
    );
    expect(loadIngredients).not.toHaveBeenCalled();
    expect(callDeepSeekTools).toHaveBeenCalledTimes(1);
  });

  it('食材为空时在工具结果处报错，不再调用第二次模型', async () => {
    mockToolFlow();
    const { service } = createService();

    await expect(
      service.build(jest.fn().mockResolvedValue([])),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(callDeepSeekTools).toHaveBeenCalledTimes(1);
  });

  it('模型没有返回提示词时报错', async () => {
    mockToolFlow('   ');
    const { service } = createService();

    await expect(
      service.build(jest.fn().mockResolvedValue(ingredients)),
    ).rejects.toThrow('没有返回提示词');
  });

  it('中文保留，只去掉代码块、提示词前缀和包裹引号', async () => {
    mockToolFlow(
      '```text\n提示词：鸡胸、牛肝、虾仁，放在一张木桌上。\n```',
    );
    const { service } = createService();

    const prompt = await service.build(
      jest.fn().mockResolvedValue(ingredients),
    );

    expect(prompt).toBe('鸡胸、牛肝、虾仁，放在一张木桌上。');
  });

  it('只取正文：去掉“中文封面提示词”标题和“负面提示词”整段', async () => {
    mockToolFlow(
      '**中文封面提示词：**\n\n一张顶尖杂志级的食物照片，鸡胸、牛肝、大米。\n\n**负面提示词：**\n熟食、文字、logo、水印。',
    );
    const { service } = createService();

    const prompt = await service.build(
      jest.fn().mockResolvedValue(ingredients),
    );

    expect(prompt).toBe('一张顶尖杂志级的食物照片，鸡胸、牛肝、大米。');
    expect(prompt).not.toContain('负面提示词');
    expect(prompt).not.toContain('**');
  });

  it('长提示词不再按字数截断', async () => {
    const longPrompt = `顶尖杂志级食物照片，${'食材丰富、光线柔和。'.repeat(120)}`;
    mockToolFlow(longPrompt);
    const { service } = createService();

    const prompt = await service.build(
      jest.fn().mockResolvedValue(ingredients),
    );

    expect(prompt.length).toBeGreaterThan(1000);
    expect(prompt).toBe(longPrompt.trim());
  });

  it('不做缓存：同一份食材连续生成两次，会重新取数、重新调用模型', async () => {
    mockToolFlow();
    mockToolFlow();
    const loadIngredients = jest.fn().mockResolvedValue(ingredients);
    const { service } = createService();

    await service.build(loadIngredients);
    await service.build(loadIngredients);

    expect(loadIngredients).toHaveBeenCalledTimes(2);
    expect(callDeepSeekTools).toHaveBeenCalledTimes(4);
  });

  it('文本模型未配置时给出可操作的错误', async () => {
    const { service, provider } = createService();
    provider.getEnabledDeepSeekRuntimeConfig.mockRejectedValue(
      new Error('未启用'),
    );

    await expect(
      service.build(jest.fn().mockResolvedValue(ingredients)),
    ).rejects.toThrow('封面提示词生成失败');
  });
});
