import { BadRequestException } from '@nestjs/common';
import { SupplementLinkPreviewService } from '../../../src/application/ingredient-creation/supplement-link-preview.service';

/**
 * 贴链接读商品页。
 *
 * 真实页面的结构已经由 `supplement-label-parser` 的单测钉住了，这里只钉三件
 * 服务层的事：**只放行白名单域名**、**读不出来时说人话**、**读到了就把每份几粒和
 * 认不出的行一起交回去**（不静默丢）。
 */
const REAL_LABEL = `# Nordic Naturals, Children's DHA, Ages 3-6
**Supplement facts**
**Serving Size:** 4 Soft Gels
**Amount Per Serving**
Calories 10
EPA (Eicosapentaenoic Acid)80 mg††
Proprietary Blend 500 mg
*Daily Value not established.`;

function serviceWithFetch(body: string, status = 200) {
  const fetchMock = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return { service: new SupplementLinkPreviewService(), fetchMock };
}

describe('SupplementLinkPreviewService', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('读 iHerb 链接：每份几粒、营养素、认不出的行一起回来', async () => {
    const { service } = serviceWithFetch(REAL_LABEL);

    const preview = await service.preview(
      'https://www.iherb.com/pr/nordic-naturals-children-s-dha/7053',
    );

    expect(preview.servingUnitsPerDose).toBe(4);
    expect(preview.nutrients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: 'fattyAcids.epa', value: 80, unit: 'mg' }),
        expect.objectContaining({ fieldPath: 'macros.energyKcal', value: 10 }),
      ]),
    );
    expect(preview.unrecognized).toContain('Proprietary Blend');
    expect(preview.productName).toContain("Children's DHA");
    expect(preview.labelText).toContain('Serving Size');
  });

  it('走的是抓取代理，不是直连电商', async () => {
    const { service, fetchMock } = serviceWithFetch(REAL_LABEL);

    await service.preview('https://www.iherb.com/pr/x/1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://r.jina.ai/https://www.iherb.com/pr/x/1',
      expect.anything(),
    );
  });

  it('不在白名单里的网站直接拒，不发请求', async () => {
    const { service, fetchMock } = serviceWithFetch(REAL_LABEL);

    await expect(service.preview('https://example.com/pr/x')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('链接不通时说人话，且给出「换成手动填」的出口', async () => {
    const { service } = serviceWithFetch('blocked', 403);

    await expect(service.preview('https://www.iherb.com/pr/x/1')).rejects.toThrow(
      /手动填/,
    );
  });

  it('页面里没有成分表时，营养素为空但商品名照样回来', async () => {
    const { service } = serviceWithFetch('# 某个商品\n只是一段介绍。');

    const preview = await service.preview('https://www.jd.com/pr/1');

    expect(preview.nutrients).toEqual([]);
    expect(preview.servingUnitsPerDose).toBeNull();
    expect(preview.productName).toBe('某个商品');
  });
});
