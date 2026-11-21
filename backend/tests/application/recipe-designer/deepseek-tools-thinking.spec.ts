import { callDeepSeekTools } from '../../../src/application/recipe-designer/deepseek-tools-chat';

describe('callDeepSeekTools · 思考内容', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
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
