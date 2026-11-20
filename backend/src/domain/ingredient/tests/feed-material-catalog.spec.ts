import { FeedMaterialCatalogService } from '../feed-material-catalog.service';

describe('FeedMaterialCatalogService', () => {
  const service = new FeedMaterialCatalogService();

  it('目录里能查到鱼油，并带大类', () => {
    const match = service.lookup('鱼油')[0];
    expect(match?.name).toBe('鱼油');
    expect(match?.category).toContain('水生');
    expect(match?.exact).toBe(true);
  });

  it('从标签原文里认已列名的原料', () => {
    const hits = service.findMentioned('Fish Oil Concentrate 2000 mg（鱼油）');
    expect(hits[0].name).toBe('鱼油');
  });

  it('查不到就返回空，不猜', () => {
    expect(service.lookup('不存在的原料xyz')).toEqual([]);
  });

  it('目录规模合理（600+ 条）', () => {
    expect(service.getSummary().total).toBeGreaterThan(500);
  });
});
