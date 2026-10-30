import {
  DeepSeekWebTools,
  MAX_WEB_FETCH_CONTENT_CHARS,
  RecipeAgentWebError,
} from 'src/application/recipe-designer/agent/deepseek-web-tools';

type Lookup = (hostname: string) => Promise<Array<{ address: string }>>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function publicLookup(): jest.MockedFunction<Lookup> {
  return jest
    .fn<ReturnType<Lookup>, Parameters<Lookup>>()
    .mockResolvedValue([{ address: '93.184.216.34' }]);
}

function makeTools(
  overrides: Partial<{
    baseUrl: string;
    requestTimeoutMs: number;
    retryCount: number;
    lookup: Lookup;
  }> = {},
) {
  return new DeepSeekWebTools({
    baseUrl: 'https://api.deepseek.test',
    apiKey: 'test-key',
    requestTimeoutMs: 90_000,
    retryCount: 2,
    lookup: publicLookup(),
    ...overrides,
  });
}

describe('DeepSeekWebTools', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('web_search', () => {
    it('调用 DeepSeek /v1/tools/search，带 Bearer、查询和可选参数', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          data: {
            results: [
              {
                title: '鸭肉时令',
                url: 'https://a.test/1',
                summary: '秋补',
                content: '正文',
                published_at: '2026-10-01',
              },
              {
                name: '补剂替代',
                link: 'https://b.test/2',
                snippet: '可用其他来源',
              },
            ],
          },
        }),
      );

      const tools = makeTools();
      const result = await tools.search({
        query: '  鸭肉 时令  ',
        count: 5,
        needContent: true,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.deepseek.test/v1/tools/search',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: '鸭肉 时令',
            count: 5,
            need_content: true,
          }),
        }),
      );
      expect(result).toEqual({
        query: '鸭肉 时令',
        results: [
          {
            title: '鸭肉时令',
            url: 'https://a.test/1',
            summary: '秋补',
            content: '正文',
            publishedAt: '2026-10-01',
          },
          {
            title: '补剂替代',
            url: 'https://b.test/2',
            summary: '可用其他来源',
            publishedAt: null,
          },
        ],
      });
    });

    it('不限制查询内容、域名或营养词，count 最大 50', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [] }));
      const tools = makeTools();
      const query = 'site:example.com 鸡肉 营养 补剂替代 regulatory';

      await tools.search({ query, count: 50 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body).toEqual({ query, count: 50 });
    });

    it('count / query 非法时返回 INVALID_ARGUMENT，不发请求', async () => {
      const tools = makeTools();

      await expect(
        tools.search({ query: '鸭肉', count: 0 }),
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      await expect(
        tools.search({ query: '鸭肉', count: 51 }),
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      await expect(
        tools.search({ query: '鸭肉', count: 1.5 }),
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      await expect(tools.search({ query: '   ' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
      await expect(
        tools.search({ query: 'x'.repeat(129) }),
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('上游没有结果时返回空数组，不编造摘要', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));
      const tools = makeTools();

      await expect(tools.search({ query: '鸭肉' })).resolves.toEqual({
        query: '鸭肉',
        results: [],
      });
    });

    it('网络错误按 retryCount 重试后成功', async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(jsonResponse({ results: [] }));
      const tools = makeTools({ retryCount: 2 });

      await tools.search({ query: '鸭肉' });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('429 / 5xx 自动重试，金额与响应体不外泄', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ error: 'secret' }, 429))
        .mockResolvedValueOnce(jsonResponse({ error: 'secret' }, 500))
        .mockResolvedValueOnce(jsonResponse({ results: [] }));
      const tools = makeTools({ retryCount: 2 });

      await tools.search({ query: '鸭肉' });

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('重试耗尽后返回安全错误（只带状态码）', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'secret-token' }, 500));
      const tools = makeTools({ retryCount: 2 });

      const error = await tools.search({ query: '鸭肉' }).catch((e) => e);

      expect(error).toMatchObject({
        code: 'WEB_SEARCH_FAILED',
        message: expect.stringContaining('HTTP 500'),
      });
      expect(error.message).not.toContain('secret-token');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retryCount=0 时 5xx 不重试', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 500));
      const tools = makeTools({ retryCount: 0 });

      await expect(tools.search({ query: '鸭肉' })).rejects.toMatchObject({
        code: 'WEB_SEARCH_FAILED',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('4xx（除 429）不重试', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 400));
      const tools = makeTools({ retryCount: 2 });

      await expect(tools.search({ query: '鸭肉' })).rejects.toMatchObject({
        code: 'WEB_SEARCH_FAILED',
        message: expect.stringContaining('HTTP 400'),
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('超时立即失败且不重试', async () => {
      fetchMock.mockImplementation((_url, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });
      const tools = makeTools({ requestTimeoutMs: 10, retryCount: 2 });

      await expect(tools.search({ query: '鸭肉' })).rejects.toMatchObject({
        code: 'WEB_SEARCH_FAILED',
        message: expect.stringContaining('超时'),
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('baseUrl 已带 /v1 时不会拼成 /v1/v1', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [] }));
      const tools = makeTools({ baseUrl: 'https://api.deepseek.test/v1/' });

      await tools.search({ query: '鸭肉' });

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.deepseek.test/v1/tools/search',
      );
    });

    it('baseUrl 是 /api/v1 时保留原有路径前缀', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [] }));
      const tools = makeTools({ baseUrl: 'https://gateway.test/api/v1' });

      await tools.search({ query: '鸭肉' });

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://gateway.test/api/v1/tools/search',
      );
    });
  });

  describe('web_fetch', () => {
    it('公开 URL：只把 URL 交给 DeepSeek Fetch API，不本地抓页面', async () => {
      const lookup = publicLookup();
      fetchMock.mockResolvedValue(
        jsonResponse({ data: { title: '鸭肉季', content: '正文内容' } }),
      );
      const tools = makeTools({ lookup });

      const result = await tools.fetch({
        url: '  https://example.com/article  ',
      });

      expect(lookup).toHaveBeenCalledWith('example.com');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.deepseek.test/v1/tools/fetch',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: 'https://example.com/article' }),
        }),
      );
      expect(result).toEqual({
        url: 'https://example.com/article',
        title: '鸭肉季',
        content: '正文内容',
      });
    });

    it.each([
      ['http://127.0.0.1/'],
      ['http://10.1.2.3/'],
      ['http://172.16.0.1/'],
      ['http://192.168.1.1/'],
      ['http://169.254.169.254/latest/meta-data'],
      ['http://100.64.0.1/'],
      ['http://0.0.0.0/'],
      ['http://224.0.0.1/'],
      ['http://240.0.0.1/'],
      ['http://[::1]/'],
      ['http://[fc00::1]/'],
      ['http://[fe80::1]/'],
      ['http://[::ffff:127.0.0.1]/'],
      ['http://[2002:7f00:1::]/'],
      ['http://[64:ff9b::127.0.0.1]/'],
      ['http://localhost/'],
      ['http://localhost./'],
      ['http://foo.local/'],
      ['http://foo.localhost/'],
      ['ftp://example.com/file'],
      ['http://user:pass@example.com/'],
    ])('拒绝私有/本机/非法 URL：%s', async (url) => {
      const tools = makeTools();

      await expect(tools.fetch({ url })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['192.168.0.10', '::1', 'fc00::1', '::ffff:127.0.0.1'])(
      '域名解析到私有 IP %s 时拒绝',
      async (address) => {
        const lookup = jest
          .fn<ReturnType<Lookup>, Parameters<Lookup>>()
          .mockResolvedValue([{ address }]);
        const tools = makeTools({ lookup });

        await expect(
          tools.fetch({ url: 'https://internal.example/article' }),
        ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        expect(lookup).toHaveBeenCalledWith('internal.example');
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it('域名解析失败时返回 WEB_FETCH_FAILED', async () => {
      const lookup = jest
        .fn<ReturnType<Lookup>, Parameters<Lookup>>()
        .mockRejectedValue(new Error('ENOTFOUND'));
      const tools = makeTools({ lookup });

      await expect(
        tools.fetch({ url: 'https://missing.example/' }),
      ).rejects.toMatchObject({ code: 'WEB_FETCH_FAILED' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('内容超过 40k 字符时截断并加明确说明', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ content: '营'.repeat(MAX_WEB_FETCH_CONTENT_CHARS + 1) }),
      );
      const tools = makeTools();

      const result = await tools.fetch({ url: 'https://example.com/long' });

      expect(result.content).toHaveLength(
        MAX_WEB_FETCH_CONTENT_CHARS +
          '\n\n[内容已截断：仅保留前 40000 字符]'.length,
      );
      expect(result.content.startsWith('营'.repeat(40_000))).toBe(true);
      expect(result.content).toContain('内容已截断');
      expect(result.title).toBeNull();
    });

    it('DeepSeek Fetch 失败返回 WEB_FETCH_FAILED，不泄露响应体', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'secret-token' }, 500));
      const tools = makeTools({ retryCount: 0 });

      const error = await tools
        .fetch({ url: 'https://example.com/a' })
        .catch((e) => e);

      expect(error).toMatchObject({
        code: 'WEB_FETCH_FAILED',
        message: expect.stringContaining('HTTP 500'),
      });
      expect(error.message).not.toContain('secret-token');
    });

    it('抓取结果为空时返回安全错误', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ data: {} }));
      const tools = makeTools();

      await expect(
        tools.fetch({ url: 'https://example.com/blank' }),
      ).rejects.toMatchObject({
        code: 'WEB_FETCH_FAILED',
        message: expect.stringContaining('空'),
      });
    });
  });

  it('RecipeAgentWebError 保留错误码', () => {
    const error = new RecipeAgentWebError(
      'WEB_FETCH_FAILED',
      '网页抓取失败：网络错误',
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('WEB_FETCH_FAILED');
    expect(error.message).toBe('网页抓取失败：网络错误');
  });
});
