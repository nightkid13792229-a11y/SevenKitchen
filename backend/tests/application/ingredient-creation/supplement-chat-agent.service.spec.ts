import { SupplementChatAgentService } from '../../../src/application/ingredient-creation/supplement-chat-agent.service';
import type { AgentProviderConfigService } from '../../../src/application/nutrition-governance/agent-provider-config.service';

/**
 * 补剂对话的模型层。
 *
 * 这里钉的不是"模型聪不聪明"，而是**我们敢不敢信它**：
 * 它回来的东西必须先过一遍形状与白名单，才允许变成会改数据的动作。
 */
function build(modelContent: string, ok = true) {
  const providerConfig = {
    getEnabledDeepSeekRuntimeConfig: jest.fn(async () => ({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'k',
      model: 'deepseek-chat'
    }))
  } as unknown as AgentProviderConfigService;

  const fetchMock = jest.fn(async (_url: string, _init: { body: string }) => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ choices: [{ message: { content: modelContent } }] })
  }));
  global.fetch = fetchMock as unknown as typeof fetch;

  return { service: new SupplementChatAgentService(providerConfig), fetchMock, providerConfig };
}

const draft = { name: '', servingUnitsPerDose: null, candidateNames: ['A', 'B'] };

describe('SupplementChatAgentService', () => {
  it('模型给的回合同样是 {reply, actions}', async () => {
    const { service } = build(
      JSON.stringify({ reply: '我去找锌的候选', actions: [{ type: 'SEARCH_CANDIDATES', keyword: '锌' }] })
    );

    const result = await service.respond({ message: '加个锌', history: [], draft });

    expect(result.reply).toBe('我去找锌的候选');
    expect(result.actions).toEqual([{ type: 'SEARCH_CANDIDATES', keyword: '锌' }]);
  });

  it('模型编了个不存在的动作 → 丢掉，不执行', async () => {
    const { service } = build(
      JSON.stringify({
        reply: '好的',
        actions: [{ type: 'DELETE_EVERYTHING' }, { type: 'SEARCH_CANDIDATES', keyword: '锌' }]
      })
    );

    const result = await service.respond({ message: '加个锌', history: [], draft });

    expect(result.actions).toEqual([{ type: 'SEARCH_CANDIDATES', keyword: '锌' }]);
  });

  it('每份几粒给了离谱值 → 这个动作不算', async () => {
    const { service } = build(
      JSON.stringify({
        reply: '记下了',
        actions: [{ type: 'SET_FIELD', field: 'servingUnitsPerDose', value: 99 }]
      })
    );

    // 动作全被丢 → 抛错，让规则版来答（它会说"应该是 1–20"）
    await expect(
      service.respond({ message: '每份99粒', history: [], draft })
    ).rejects.toThrow();
  });

  it('选候选给了不存在的字段 → 丢掉', async () => {
    const { service } = build(
      JSON.stringify({ reply: '好', actions: [{ type: 'SET_FIELD', field: 'price', value: 1 }] })
    );

    await expect(
      service.respond({ message: '价格改成1', history: [], draft })
    ).rejects.toThrow();
  });

  it('模型回了不是 JSON → 抛错，交给上层回退', async () => {
    const { service } = build('我觉得应该选第二瓶');
    await expect(service.respond({ message: '第二个', history: [], draft })).rejects.toThrow();
  });

  it('模型 HTTP 失败 → 抛错', async () => {
    const { service } = build('', false);
    await expect(service.respond({ message: '加个锌', history: [], draft })).rejects.toThrow();
  });

  it('把最近几轮对话带上去，并说明现在的草稿状态', async () => {
    const { service, fetchMock } = build(JSON.stringify({ reply: '好', actions: [] }));

    await service.respond({
      message: '那第二个呢',
      history: [
        { role: 'user', text: '加个锌' },
        { role: 'assistant', text: '找到 2 个候选' }
      ],
      draft: { name: '锌', servingUnitsPerDose: 2, candidateNames: ['A', 'B'] }
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const texts = body.messages.map((m: { content: string }) => m.content).join('\n');
    expect(texts).toContain('加个锌');
    expect(texts).toContain('0. A');
    expect(texts).toContain('每份几粒：2');
  });

  it('所有用途都取不到配置时抛错，不静默编一个', async () => {
    const providerConfig = {
      getEnabledDeepSeekRuntimeConfig: jest.fn(async () => {
        throw new Error('no config');
      })
    } as unknown as AgentProviderConfigService;
    const service = new SupplementChatAgentService(providerConfig);

    await expect(service.respond({ message: '加个锌', history: [], draft })).rejects.toThrow();
  });

  it('模型给的候选序号超出范围 → 不执行，且整条回复不算数', async () => {
    const { service } = build(
      JSON.stringify({ reply: '好，就读第二瓶', actions: [{ type: 'PICK_CANDIDATE', index: 7 }] })
    );

    await expect(service.respond({ message: '第二个', history: [], draft })).rejects.toThrow();
  });

  it('READ_LINK 只认用户这句话里真贴了的链接（防注入）', async () => {
    const { service } = build(
      JSON.stringify({ reply: '我读一下', actions: [{ type: 'READ_LINK', url: 'https://www.iherb.com/pr/evil/1' }] })
    );

    await expect(
      service.respond({ message: '加个锌', history: [], draft })
    ).rejects.toThrow();
  });

  it('发请求时关掉思考模式、给足输出预算', async () => {
    const { service, fetchMock } = build(JSON.stringify({ reply: '好', actions: [] }));

    await service.respond({ message: '这瓶和那瓶差在哪', history: [], draft });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.max_tokens).toBeGreaterThanOrEqual(1500);
  });

  it('模型裹了 ```json 也能解析', async () => {
    const { service } = build('```json\n{"reply":"好","actions":[]}\n```');
    expect((await service.respond({ message: '嗯', history: [], draft })).reply).toBe('好');
  });
});
