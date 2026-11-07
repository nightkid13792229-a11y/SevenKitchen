import { BadRequestException } from '@nestjs/common';
import { SupplementLinkPreviewService } from '../../../src/application/ingredient-creation/supplement-link-preview.service';
import type { AgentProviderConfigService } from '../../../src/application/nutrition-governance/agent-provider-config.service';

/**
 * 补剂抓取：商品标签页与候选搜索，都走 DeepSeek 官方的 Fetch / Search。
 *
 * 为什么换：生产服务器连不上原来的抓取代理（域名解析被劫持、直连超时），
 * 而 api.deepseek.com 是通的。这里钉的是"换了通道，行为不变"：
 * 白名单还在、读不出来还说人话、搜不到还留空。
 */
const LABEL = `# Nordic Naturals, Children's DHA
**Supplement facts**
**Serving Size:** 4 Soft Gels
Calories 10
EPA (Eicosapentaenoic Acid)80 mg`;

function build(handler: () => unknown) {
  const providerConfig = {
    getEnabledDeepSeekRuntimeConfig: jest.fn(async () => ({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'k',
      model: 'deepseek-chat'
    }))
  } as unknown as AgentProviderConfigService;

  const fetchMock = jest.fn(async (url: string, init: { body: string }) => {
    const payload = handler() as Record<string, unknown>;
    return { ok: true, status: 200, json: async () => payload };
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  return { service: new SupplementLinkPreviewService(providerConfig), fetchMock };
}

describe('读商品页', () => {
  it('走 DeepSeek 的 fetch 接口，不是原来的代理域名', async () => {
    const { service, fetchMock } = build(() => ({ title: 'x', content: LABEL }));

    await service.preview('https://www.iherb.com/pr/x/1');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/v1/tools/fetch');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      url: 'https://www.iherb.com/pr/x/1'
    });
  });

  it('读到的正文照样能解析出每份几粒与营养素', async () => {
    const { service } = build(() => ({ title: 'x', content: LABEL }));

    const preview = await service.preview('https://www.iherb.com/pr/x/1');

    expect(preview.servingUnitsPerDose).toBe(4);
    expect(preview.nutrients).toEqual(
      expect.arrayContaining([expect.objectContaining({ fieldPath: 'fattyAcids.epa', value: 80 })])
    );
  });

  it('不在白名单里的网站直接拒，不发请求', async () => {
    const { service, fetchMock } = build(() => ({ content: LABEL }));

    await expect(service.preview('https://example.com/pr/x')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('取不到正文时说人话，并给出「手动填」的出口', async () => {
    const { service } = build(() => ({ title: 'x', content: '   ' }));

    await expect(service.preview('https://www.iherb.com/pr/x/1')).rejects.toThrow(/手动填/);
  });

  it('配置取不到时明确失败，不静默成功', async () => {
    const providerConfig = {
      getEnabledDeepSeekRuntimeConfig: jest.fn(async () => {
        throw new Error('no config');
      })
    } as unknown as AgentProviderConfigService;
    const service = new SupplementLinkPreviewService(providerConfig);

    await expect(service.preview('https://www.iherb.com/pr/x/1')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});

describe('搜候选', () => {
  const results = [
    { title: 'NOW Foods, Zinc Picolinate', url: 'https://www.iherb.com/pr/now-zinc/878' },
    { title: '别家的锌', url: 'https://example.com/pr/zinc' }
  ];

  it('只限定在 iHerb 站内搜，并过滤掉别家链接', async () => {
    const { service, fetchMock } = build(() => ({ results }));

    const candidates = await service.searchCandidates('锌');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.query).toContain('site:iherb.com');
    expect(body.query).toContain('锌');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toContain('Zinc Picolinate');
  });

  it('搜索接口不给价格时留空，不编一个数', async () => {
    const { service } = build(() => ({ results }));

    const [only] = await service.searchCandidates('锌');

    expect(only.priceUsd).toBeNull();
    expect(only.pricePerServingUsd).toBeNull();
  });

  it('空关键词不发请求', async () => {
    const { service, fetchMock } = build(() => ({ results }));

    expect(await service.searchCandidates('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('搜不到时返回空数组，不报错', async () => {
    const { service } = build(() => ({ results: [] }));

    expect(await service.searchCandidates('不存在的营养素')).toEqual([]);
  });
});
