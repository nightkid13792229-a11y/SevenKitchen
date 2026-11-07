import { FeedAdditiveCatalogService } from '../../../src/domain/ingredient/feed-additive-catalog.service';

/**
 * 目录查询。
 *
 * 这套数据是从《饲料添加剂品种目录》汇总版生成的，所以断言都拿**真实条目**说话：
 * 甘氨酸锌在、适用范围含犬；吡啶甲酸锌确实不在（目录里只有"吡啶甲酸铬"）。
 * 这几条如果哪天变了，说明目录更新了，该重跑生成脚本，而不是改测试。
 */
describe('FeedAdditiveCatalogService', () => {
  const service = new FeedAdditiveCatalogService();

  it('查得到的写法按原名返回，并带上适用范围', () => {
    const [first] = service.lookup('甘氨酸锌');
    expect(first).toMatchObject({
      name: '甘氨酸锌',
      dogAllowed: true,
      exact: true,
    });
    expect(first.scope).toContain('犬');
  });

  it('不在目录里的品种就是查不到，不返回近似名', () => {
    // 目录里只有「吡啶甲酸铬」，没有锌
    expect(service.lookup('吡啶甲酸锌')).toEqual([]);
  });

  it('关键词能搜一片，同名的排最前、允许用于犬的其次', () => {
    const results = service.lookup('锌');
    expect(results.length).toBeGreaterThan(1);
    const firstDogAllowed = results.findIndex((item) => item.dogAllowed);
    const firstNotAllowed = results.findIndex((item) => !item.dogAllowed);
    expect(firstDogAllowed).toBeLessThan(firstNotAllowed === -1 ? Infinity : firstNotAllowed);
  });

  it('空关键词返回空，不把整本目录倒出来', () => {
    expect(service.lookup('   ')).toEqual([]);
  });

  it('summary 说明数据规模与出处，界面用它解释「为什么搜不到」', () => {
    const summary = service.getSummary();
    expect(summary.total).toBeGreaterThan(300);
    expect(summary.dogAllowed).toBeGreaterThan(0);
    expect(summary.sourceUrl).toContain('nahs.org.cn');
    expect(summary.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('精确取值：有就返回，没有就 null', () => {
    expect(service.get('葡萄糖酸锌')?.dogAllowed).toBe(true);
    expect(service.get('随便编的名字')).toBeNull();
  });
});
