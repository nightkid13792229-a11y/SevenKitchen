import { BadRequestException } from '@nestjs/common';

const callDeepSeekJson = jest.fn();

jest.mock('src/application/recipe-designer/deepseek-chat', () => ({
  callDeepSeekJson: (...args: unknown[]) => callDeepSeekJson(...args),
}));

import { RecipeNamingService } from 'src/application/recipe-designer/recipe-naming.service';

function createService() {
  const provider = {
    getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
      baseUrl: 'https://example.invalid',
      model: 'test-model',
      apiKey: 'test-key',
      requestTimeoutMs: 1000,
      provider: 'deepseek',
    }),
  };
  return new RecipeNamingService(provider as never);
}

const input = {
  foodItems: [
    { name: '三文鱼', ratio: 42 },
    { name: '南瓜', ratio: 20 },
    { name: '糙米', ratio: 15 },
  ],
  energyDensityKcalPerKg: 1400,
  moisturePercent: 70,
  proteinPercentDm: 32,
  fatPercentDm: 13,
  lifeStageLabels: ['成犬期'],
  currentName: '十字花科全谷物三文鱼鸡肉',
};

describe('RecipeNamingService.generate', () => {
  beforeEach(() => {
    callDeepSeekJson.mockReset();
  });

  it('超过 12 字的候选被丢弃（不是截断）', async () => {
    callDeepSeekJson.mockResolvedValue({
      candidates: [
        { name: '均衡营养|三文鱼南瓜', valuePoint: '均衡营养', ingredients: '三文鱼南瓜', reason: 'r' },
        { name: '均衡营养|三文鱼南瓜糙米鸡胸肉', valuePoint: '均衡营养', ingredients: '三文鱼南瓜糙米鸡胸肉', reason: 'r' },
      ],
    });

    const result = await createService().generate(input);

    expect(result.candidates.map((item) => item.name)).toEqual([
      '均衡营养|三文鱼南瓜',
    ]);
  });

  it('正好 12 字要保留（边界不能写成 >=）', async () => {
    callDeepSeekJson.mockResolvedValue({
      candidates: [
        { name: '单一动物蛋白|三文鱼牛霖', valuePoint: '单一动物蛋白', ingredients: '三文鱼牛霖', reason: 'r' },
      ],
    });

    const result = await createService().generate(input);
    expect(result.candidates).toHaveLength(1);
  });

  it('命中禁用词时保留候选，但标出合规提醒', async () => {
    callDeepSeekJson.mockResolvedValue({
      candidates: [
        { name: '低敏|三文鱼南瓜', valuePoint: '低敏', ingredients: '三文鱼南瓜', reason: 'r' },
        { name: '均衡营养|三文鱼南瓜', valuePoint: '均衡营养', ingredients: '三文鱼南瓜', reason: 'r' },
      ],
    });

    const result = await createService().generate(input);

    const flagged = result.candidates.find((item) => item.name.includes('低敏'));
    expect(flagged?.complianceWarning).toBe(true);
    const clean = result.candidates.find((item) => item.name.includes('均衡营养'));
    expect(clean?.complianceWarning).toBe(false);
  });

  it('一条可用候选都没有时抛 400，而不是返回空数组', async () => {
    callDeepSeekJson.mockResolvedValue({
      candidates: [
        { name: '这个名字明显超过了十二个字的限制吧', valuePoint: 'x', ingredients: 'y', reason: 'r' },
      ],
    });

    await expect(createService().generate(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('AI 返回结构不对时也抛 400', async () => {
    callDeepSeekJson.mockResolvedValue({ unexpected: true });
    await expect(createService().generate(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
