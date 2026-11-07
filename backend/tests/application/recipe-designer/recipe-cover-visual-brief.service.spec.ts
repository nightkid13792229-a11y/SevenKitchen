import { BadRequestException } from '@nestjs/common';

const callDeepSeekTools = jest.fn();

jest.mock('src/application/recipe-designer/deepseek-tools-chat', () => ({
  callDeepSeekTools: (...args: unknown[]) => callDeepSeekTools(...args),
}));

import { RecipeCoverVisualBriefService } from 'src/application/recipe-designer/recipe-cover-visual-brief.service';

const systemPrompt = [
  '你是高端鲜食狗粮品牌的商业食物摄影师兼食物造型师。',
  '',
  '先调用 get_recipe_ingredients 读取这份食谱的食材。',
  '',
  '然后为每一种食材写一句「形态说明」。',
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

const formsReply = [
  '鸡胸｜两块并排平放，表面朝上',
  '牛肝｜两片平铺，切面朝上',
  '大米｜堆成边缘干净的圆锥',
  '红薯｜去皮切滚刀块',
  '火麻籽｜一小堆',
  '食用盐｜白色小瓷碗盛装',
  '南美对虾虾仁｜六只等距排成一行，灰白色半透明',
].join('\n');

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

function mockToolFlow(content: string | null = formsReply) {
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

describe('RecipeCoverVisualBriefService · 工具取食材 + 形态说明', () => {
  beforeEach(() => {
    callDeepSeekTools.mockReset();
  });

  it('先强制调用 get_recipe_ingredients，再拿食材让模型写形态', async () => {
    mockToolFlow();
    const loadIngredients = jest.fn().mockResolvedValue(ingredients);
    const { service } = createService();

    const forms = await service.buildForms(loadIngredients);

    expect(forms).toEqual({
      鸡胸: '两块并排平放，表面朝上',
      牛肝: '两片平铺，切面朝上',
      大米: '堆成边缘干净的圆锥',
      红薯: '去皮切滚刀块',
      火麻籽: '一小堆',
      食用盐: '白色小瓷碗盛装',
      南美对虾虾仁: '六只等距排成一行，灰白色半透明',
    });
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
          {
            role: 'assistant',
            content: null,
            reasoning_content: '',
            tool_calls: [toolCall],
          },
          {
            role: 'tool',
            tool_call_id: 'call-1',
            content: expectedToolResult,
          },
        ],
        toolChoice: 'none',
        // 2026-11-07：写形态不需要长思考，关掉更快也更稳
        thinking: 'disabled',
        temperature: 0.4,
        maxTokens: 1200,
      }),
    );
  });

  it('工具结果只给名称和处理方式：不给占比，熟/生/干只保留切割部位信息', async () => {
    mockToolFlow();
    const { service } = createService();

    await service.buildForms(jest.fn().mockResolvedValue(ingredients));

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

    await expect(service.buildForms(loadIngredients)).rejects.toThrow(
      '模型没有读取食材',
    );
    expect(loadIngredients).not.toHaveBeenCalled();
    expect(callDeepSeekTools).toHaveBeenCalledTimes(1);
  });

  it('食材为空时在工具结果处报错，不再调用第二次模型', async () => {
    mockToolFlow();
    const { service } = createService();

    await expect(
      service.buildForms(jest.fn().mockResolvedValue([])),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(callDeepSeekTools).toHaveBeenCalledTimes(1);
  });

  it('模型返回空内容时退回空对象，由模板用处理方式兜底', async () => {
    mockToolFlow('   ');
    const { service } = createService();

    await expect(
      service.buildForms(jest.fn().mockResolvedValue(ingredients)),
    ).resolves.toEqual({});
  });

  it('模型没有按「名称｜形态」输出时也退回空对象，不阻断生图', async () => {
    mockToolFlow('一张顶尖杂志级的食物照片，鸡胸、牛肝、大米放在木桌上。');
    const { service } = createService();

    await expect(
      service.buildForms(jest.fn().mockResolvedValue(ingredients)),
    ).resolves.toEqual({});
  });

  it('码块、序号、全角竖线都能解析', async () => {
    mockToolFlow(
      ['```text', '1. 鸡胸｜两块并排平放', '- 大米：堆成圆锥', '```'].join(
        '\n',
      ),
    );
    const { service } = createService();

    await expect(
      service.buildForms(jest.fn().mockResolvedValue(ingredients)),
    ).resolves.toEqual({
      鸡胸: '两块并排平放',
      大米: '堆成圆锥',
    });
  });

  it('不做缓存：同一份食材连续生成两次，会重新取数、重新调用模型', async () => {
    mockToolFlow();
    mockToolFlow();
    const loadIngredients = jest.fn().mockResolvedValue(ingredients);
    const { service } = createService();

    await service.buildForms(loadIngredients);
    await service.buildForms(loadIngredients);

    expect(loadIngredients).toHaveBeenCalledTimes(2);
    expect(callDeepSeekTools).toHaveBeenCalledTimes(4);
  });

  it('文本模型未配置时给出可操作的错误', async () => {
    const { service, provider } = createService();
    provider.getEnabledDeepSeekRuntimeConfig.mockRejectedValue(
      new Error('未启用'),
    );

    await expect(
      service.buildForms(jest.fn().mockResolvedValue(ingredients)),
    ).rejects.toThrow('封面提示词生成失败');
  });
});
