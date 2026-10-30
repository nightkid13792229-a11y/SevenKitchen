import { BadRequestException } from '@nestjs/common';
import { callSeedreamImage } from 'src/application/recipe-designer/seedream-image';

describe('callSeedreamImage', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ data: [{ url: 'https://ark.example.com/a.jpg' }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('请求体带 model/prompt/2048x1152/watermark:false/response_format:url', async () => {
    const result = await callSeedreamImage({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-seedream-5-0-pro-260628',
      apiKey: 'key',
      requestTimeoutMs: 120000,
      prompt: 'prompt',
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'doubao-seedream-5-0-pro-260628',
      prompt: 'prompt',
      size: '2048x1152',
      response_format: 'url',
      watermark: false,
    });
    expect(result.url).toBe('https://ark.example.com/a.jpg');
  });

  it('接口错误时给中文原因', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'invalid key' } }),
    });

    await expect(
      callSeedreamImage({
        baseUrl: 'https://ark.example.com/api/v3',
        model: 'm',
        apiKey: 'key',
        requestTimeoutMs: 1000,
        prompt: 'p',
      }),
    ).rejects.toThrow('生图失败：invalid key');
  });

  it('没有返回图片地址时报错', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ data: [] }),
    });

    await expect(
      callSeedreamImage({
        baseUrl: 'https://ark.example.com/api/v3',
        model: 'm',
        apiKey: 'key',
        requestTimeoutMs: 1000,
        prompt: 'p',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
