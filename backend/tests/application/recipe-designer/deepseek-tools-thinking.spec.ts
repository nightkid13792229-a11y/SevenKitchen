import { callDeepSeekTools } from '../../../src/application/recipe-designer/deepseek-tools-chat';

describe('callDeepSeekTools · 思考内容', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('读取 reasoning_content，供下一轮 assistant 消息回传', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              reasoning_content: '先比较蛋白和脂肪的优先级',
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'read_draft', arguments: '{}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    }) as any;

    const result = await callDeepSeekTools({
      baseUrl: 'https://example.com',
      model: 'deepseek-test',
      apiKey: 'key',
      requestTimeoutMs: 1000,
      messages: [],
      tools: [],
      thinking: 'enabled',
    });

    expect(result.reasoningContent).toBe('先比较蛋白和脂肪的优先级');
    expect(result.toolCalls[0]?.function.name).toBe('read_draft');
  });
});

  it('思考模式 400 时自动降级关闭思考重试，并记录供应商原因', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({ error: { message: 'thinking is not supported' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'ok', tool_calls: [] } }],
        }),
      });
    global.fetch = fetchMock as any;

    const result = await callDeepSeekTools({
      baseUrl: 'https://example.com',
      model: 'deepseek-test',
      apiKey: 'key',
      requestTimeoutMs: 1000,
      messages: [],
      tools: [],
      thinking: 'enabled',
    });

    expect(result.thinkingFallback).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstBody.thinking).toBeUndefined();
    expect(secondBody.thinking).toEqual({ type: 'disabled' });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('thinking is not supported'),
    );
  });
