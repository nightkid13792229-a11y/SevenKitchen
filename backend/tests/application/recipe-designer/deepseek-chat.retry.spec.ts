import { callDeepSeekJson } from '../../../src/application/recipe-designer/deepseek-chat';

/**
 * 空内容重试是"双倍等待"的来源：用户只看到一个更久的转圈。
 * 这里锁住重试要被报出来（`onRetry`），否则日志里只有总耗时，
 * 分不清是模型慢还是重试了。
 */
describe('callDeepSeekJson 空内容重试', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('第一次空内容、第二次成功时，报一次重试并返回结果', async () => {
    const emptyResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '' } }],
        usage: { prompt_tokens: 800, completion_tokens: 0 },
      }),
    };
    const okResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"candidates":[{"name":"低脂｜红薯鸡胸"}]}' } }],
        usage: { prompt_tokens: 800, completion_tokens: 20 },
      }),
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(emptyResponse)
      .mockResolvedValueOnce(okResponse);
    global.fetch = fetchMock as any;

    const onRetry = jest.fn();
    const onUsage = jest.fn();
    const result = await callDeepSeekJson({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKey: 'test-key',
      requestTimeoutMs: 5000,
      systemPrompt: 'sys',
      userPayload: { task: 'generate_recipe_names' },
      onRetry,
      onUsage,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ candidates: [{ name: '低脂｜红薯鸡胸' }] });
  });

  it('第一次就成功时不报重试', async () => {
    const okResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"candidates":[{"name":"低脂｜红薯鸡胸"}]}' } }],
        usage: { prompt_tokens: 800, completion_tokens: 20 },
      }),
    };
    global.fetch = jest.fn().mockResolvedValue(okResponse) as any;

    const onRetry = jest.fn();
    await callDeepSeekJson({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKey: 'test-key',
      requestTimeoutMs: 5000,
      systemPrompt: 'sys',
      userPayload: { task: 'generate_recipe_names' },
      onRetry,
    });

    expect(onRetry).not.toHaveBeenCalled();
  });
});
