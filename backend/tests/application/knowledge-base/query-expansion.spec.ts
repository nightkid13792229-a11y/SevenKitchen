import { expandQuery } from '../../../src/application/knowledge-base/query-expansion';

describe('expandQuery 中文扩展', () => {
  it('营养评估 → nutritional assessment', () => {
    expect(expandQuery('如何做营养评估')).toContain('nutritional assessment');
  });

  it('体重管理/减重', () => {
    expect(expandQuery('犬猫体重管理')).toContain('weight management');
    expect(expandQuery('减重怎么算热量')).toEqual(
      expect.arrayContaining(['weight loss']),
    );
  });

  it('体况评分与生命阶段', () => {
    expect(expandQuery('体况评分怎么看')).toEqual(
      expect.arrayContaining(['body condition score', 'bcs']),
    );
    expect(expandQuery('体况')).toContain('body condition');
    expect(expandQuery('犬的生命阶段')).toContain('life stage');
  });
});
