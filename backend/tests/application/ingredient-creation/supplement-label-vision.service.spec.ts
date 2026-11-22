import { SupplementLabelVisionService } from '../../../src/application/ingredient-creation/supplement-label-vision.service';
import type { AgentProviderConfigService } from '../../../src/application/nutrition-governance/agent-provider-config.service';

/**
 * 标签图识别（走补剂 Agent 自己那条 DeepSeek 多模态配置）。
 *
 * 钉两件真实踩过的事：
 * 1. 必须关掉 thinking——默认开着思考，token 全烧在 reasoning 上，content 是空的；
 * 2. content 空要如实报错，不能把半截文本当标签交出去。
 */
function build(response: unknown) {
  const providerConfig = {
    getEnabledDeepSeekRuntimeConfig: jest.fn(async () => ({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'k',
      model: 'deepseek-v4-flash'
    }))
  } as unknown as AgentProviderConfigService;

  const fetchMock = jest.fn(async (_url: string, _init: { body: string }) => ({
    ok: true,
    status: 200,
    json: async () => response
  }));
  global.fetch = fetchMock as unknown as typeof fetch;

  return { service: new SupplementLabelVisionService(providerConfig), fetchMock };
}

describe('读标签图', () => {
  it('把图片和提示词一起发过去，并显式关掉思考', async () => {
    const { service, fetchMock } = build({
      choices: [{ message: { content: 'SUPPLEMENT FACTS\nIron 25 mg' } }]
    });

    const result = await service.read('https://cos.example.com/label.jpg');

    expect(result.text).toContain('Iron 25 mg');
    expect(result.model).toBe('deepseek-v4-flash');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.messages[0].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://cos.example.com/label.jpg' }
    });
    // 用补剂 Agent 自己的那条配置，不再有单独的 OCR 供应商
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
  });

  it('只回半截（被截断）时如实报错，不把残文当标签', async () => {
    const { service } = build({ choices: [{ finish_reason: 'length', message: { content: '' } }] });

    await expect(service.read('https://cos.example.com/label.jpg')).rejects.toThrow(/没念完/);
  });

  it('不是 http/https 的地址直接拒，不发请求', async () => {
    const { service, fetchMock } = build({ choices: [] });

    await expect(service.read('ftp://x/y.jpg')).rejects.toThrow(/http/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('文本判断', () => {
  it('输出被截断时带 truncated 标记，交给上层说人话', async () => {
    const { service } = build({
      choices: [
        { finish_reason: 'length', message: { content: '{"fields": {"basic.name"' } }
      ]
    });

    const reply = await service.analyze('prompt');

    expect(reply?.truncated).toBe(true);
    expect(reply?.text).toContain('"fields"');
  });

  it('HTTP 失败时返回 null，不把异常抛给整条链路', async () => {
    const providerConfig = {
      getEnabledDeepSeekRuntimeConfig: jest.fn(async () => ({
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'k',
        model: 'deepseek-v4-flash'
      }))
    } as unknown as AgentProviderConfigService;
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => 'rate limited'
    })) as unknown as typeof fetch;

    const service = new SupplementLabelVisionService(providerConfig);
    await expect(service.analyze('prompt')).resolves.toBeNull();
  });
});
