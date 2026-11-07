import { RecipeNamingService, buildRecipeNamingSystemPrompt } from '../../../src/application/recipe-designer/recipe-naming.service';

/**
 * 起名是用户盯着转圈的动作（生产实测 21.6 秒），
 * 这几条锁住三件"提速"的事：
 *   · 请求里必须关掉思考模式，并给输出上限兜底；
 *   · 只让模型写名字（后台界面只显示名字，另外两个字段没人看）；
 *   · 日志要能看出 token 与是否重试，否则下次再慢还是只能猜。
 */

jest.mock('../../../src/application/recipe-designer/deepseek-chat', () => ({
  callDeepSeekJson: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { callDeepSeekJson } = require('../../../src/application/recipe-designer/deepseek-chat');

const runtimeConfig = {
  provider: 'deepseek',
  model: 'deepseek-flash',
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'test-key',
  requestTimeoutMs: 15000,
};

function createService() {
  return new RecipeNamingService({
    getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue(runtimeConfig),
  } as any);
}

const input = {
  foodItems: [
    { name: '鸡胸肉', ratio: 70 },
    { name: '红薯', ratio: 30 },
  ],
  energyDensityKcalPerKg: 1310,
  moisturePercent: 70,
  proteinPercentDm: 66.67,
  fatPercentDm: 10,
  lifeStageLabels: ['普通或高运动量成犬'],
  currentName: '财宝定制 · 青口贝虾仁鸡胸',
  existingNames: ['均衡营养 · 三文鱼南瓜'],
};

describe('RecipeNamingService 提速参数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('请求里关掉思考模式，并给出输出上限', async () => {
    (callDeepSeekJson as jest.Mock).mockResolvedValue({
      candidates: [{ name: '低脂｜红薯鸡胸' }],
    });

    await createService().generate(input);

    expect(callDeepSeekJson).toHaveBeenCalledTimes(1);
    expect(callDeepSeekJson).toHaveBeenCalledWith(
      expect.objectContaining({
        extraBody: { thinking: { type: 'disabled' } },
        maxTokens: 512,
      }),
    );
  });

  it('提示词只要求名字，不再让模型写没人看的字段', () => {
    const prompt = buildRecipeNamingSystemPrompt();

    expect(prompt).toContain('name');
    expect(prompt).not.toContain('valuePoint');
    expect(prompt).not.toContain('ingredients');
  });

  it('日志里带 token 用量与重试次数，慢的时候能一眼看出卡在哪', async () => {
    (callDeepSeekJson as jest.Mock).mockImplementation(async (options: any) => {
      options.onUsage?.({ promptTokens: 912, completionTokens: 38 });
      options.onRetry?.();
      return { candidates: [{ name: '低脂｜红薯鸡胸' }] };
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await createService().generate(input);

    const line = log.mock.calls.map((call) => String(call[0])).join('\n');
    expect(line).toContain('[RecipeNaming]');
    expect(line).toContain('耗时=');
    expect(line).toContain('prompt=912');
    expect(line).toContain('completion=38');
    expect(line).toContain('重试=1');
    log.mockRestore();
  });

  it('模型只回名字时，候选里没用的字段填空字符串（接口形状不变）', async () => {
    (callDeepSeekJson as jest.Mock).mockResolvedValue({
      candidates: [{ name: '低脂｜红薯鸡胸' }, { name: '均衡营养｜鸡胸红薯' }],
    });

    const result = await createService().generate(input);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        name: '低脂｜红薯鸡胸',
        valuePoint: '',
        ingredients: '',
        complianceWarning: false,
        duplicate: false,
      }),
    );
  });
});
