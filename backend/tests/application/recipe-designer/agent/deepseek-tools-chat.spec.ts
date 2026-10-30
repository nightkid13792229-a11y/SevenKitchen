import { BadRequestException } from '@nestjs/common';
import {
  callDeepSeekTools,
  type DeepSeekToolCall,
  type DeepSeekToolsMessage,
} from 'src/application/recipe-designer/deepseek-tools-chat';

const BASE_OPTIONS = {
  baseUrl: 'https://api.deepseek.com/',
  model: 'deepseek-chat',
  apiKey: 'deepseek-test-key',
  requestTimeoutMs: 5000,
  messages: [
    { role: 'system', content: '你是食谱设计助手' },
    { role: 'user', content: '帮我把主食换成米饭' },
  ] as DeepSeekToolsMessage[],
  tools: [
    {
      type: 'function' as const,
      function: {
        name: 'get_draft',
        description: '读取当前草稿',
        parameters: { type: 'object', properties: {} },
      },
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('callDeepSeekTools', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('解析 content、tool_calls 和 usage，并回调 onUsage', async () => {
    const onUsage = jest.fn();
    const toolCall: DeepSeekToolCall = {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'get_draft',
        arguments: '{"draftId":"draft-1"}',
      },
    };
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: '我先看看当前草稿',
              tool_calls: [toolCall],
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 45 },
      }),
    ) as unknown as typeof fetch;

    const result = await callDeepSeekTools({ ...BASE_OPTIONS, onUsage });

    expect(result.content).toBe('我先看看当前草稿');
    expect(result.toolCalls).toEqual([toolCall]);
    expect(result.usage).toEqual({
      promptTokens: 120,
      completionTokens: 45,
    });
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({
      promptTokens: 120,
      completionTokens: 45,
    });

    const fetchMock = global.fetch as unknown as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer deepseek-test-key',
      'Content-Type': 'application/json',
    });

    const body: unknown = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: 'deepseek-chat',
      messages: BASE_OPTIONS.messages,
      tools: BASE_OPTIONS.tools,
      tool_choice: 'auto',
      thinking: { type: 'disabled' },
      temperature: 0.3,
      max_tokens: 16384,
    });
    expect(body).not.toHaveProperty('response_format');
  });

  it('可以强制指定工具，并显式开启 thinking', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '好了' } }] }),
    ) as unknown as typeof fetch;

    await callDeepSeekTools({
      ...BASE_OPTIONS,
      toolChoice: {
        type: 'function',
        function: { name: 'get_recipe_ingredients' },
      },
      thinking: 'enabled',
    });

    const fetchMock = global.fetch as unknown as jest.Mock;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.tool_choice).toEqual({
      type: 'function',
      function: { name: 'get_recipe_ingredients' },
    });
    // 开启思考 = 不传 thinking 字段，交给 DeepSeek 默认开启
    expect(body).not.toHaveProperty('thinking');
  });

  it('500 后成功：重试一次（共 2 次）', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'internal' } }, 500),
      )
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: '好了' } }] }),
      ) as unknown as typeof fetch;

    const result = await callDeepSeekTools(BASE_OPTIONS);

    expect(result.content).toBe('好了');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('连续 500 两次后成功：最多总 3 次', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: '成功' } }] }),
      ) as unknown as typeof fetch;

    const result = await callDeepSeekTools(BASE_OPTIONS);

    expect(result.content).toBe('成功');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('429 也重试', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: '重试成功' } }] }),
      ) as unknown as typeof fetch;

    const result = await callDeepSeekTools(BASE_OPTIONS);

    expect(result.content).toBe('重试成功');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('400 不重试：只调一次并抛 BadRequest，不泄露响应体', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { message: 'secret-response-body' } }, 400),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    let thrown: unknown;
    try {
      await callDeepSeekTools(BASE_OPTIONS);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as Error).message).toContain('AI 工具调用失败');
    expect((thrown as Error).message).not.toContain('secret-response-body');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('忽略结构不合法的 tool_calls，合法项照常解析', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                null,
                'not-an-object',
                { id: 'missing-function' },
                { id: 'call-2', function: { name: '', arguments: '{}' } },
                {
                  id: 'call-3',
                  function: { name: 'get_draft', arguments: 42 },
                },
                {
                  id: 'call-4',
                  type: 'function',
                  function: {
                    name: 'get_draft',
                    arguments: '{"draftId":"draft-1"}',
                  },
                },
              ],
            },
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await callDeepSeekTools(BASE_OPTIONS);

    expect(result.content).toBeNull();
    expect(result.toolCalls).toEqual([
      {
        id: 'call-4',
        type: 'function',
        function: { name: 'get_draft', arguments: '{"draftId":"draft-1"}' },
      },
    ]);
  });

  it('tool_calls 全部不合法时返回空数组而不抛错', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              tool_calls: [
                { id: '', function: { name: 'get_draft', arguments: '{}' } },
                { id: 'call-1', function: {} },
              ],
            },
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await callDeepSeekTools(BASE_OPTIONS);

    expect(result).toEqual({ content: null, toolCalls: [], usage: null });
  });

  it('content 为 null 且没有 tool_calls 时返回空结果', async () => {
    const onUsage = jest.fn();
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: null } }],
      }),
    ) as unknown as typeof fetch;

    const result = await callDeepSeekTools({ ...BASE_OPTIONS, onUsage });

    expect(result).toEqual({ content: null, toolCalls: [], usage: null });
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('网络错误重试后成功', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: '网络恢复' } }] }),
      ) as unknown as typeof fetch;

    const result = await callDeepSeekTools(BASE_OPTIONS);

    expect(result.content).toBe('网络恢复');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('网络错误连续 3 次后抛 BadRequest', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        new TypeError('fetch failed'),
      ) as unknown as typeof fetch;

    await expect(callDeepSeekTools(BASE_OPTIONS)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('超时中止请求并抛 BadRequest，不重试', async () => {
    global.fetch = jest.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('This operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }) as unknown as typeof fetch;

    await expect(
      callDeepSeekTools({ ...BASE_OPTIONS, requestTimeoutMs: 20 }),
    ).rejects.toThrow('AI 工具调用失败');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
