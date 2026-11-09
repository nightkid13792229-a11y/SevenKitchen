import { isUsableSection } from '../../../src/application/knowledge-base/section-quality';

describe('isUsableSection', () => {
  it('正常主题节保留', () => {
    expect(isUsableSection({ title: '2a. Substaging by Proteinuria' })).toBe(true);
    expect(isUsableSection({ title: '慢性肾病的膳食管理' })).toBe(true);
  });

  it('文档开头/RESULTS/REFERENCES 剔除', () => {
    for (const title of ['(文档开头)', 'RESULTS', 'references', 'Appendix']) {
      expect(isUsableSection({ title })).toBe(false);
    }
  });

  it('目录行（点线）剔除', () => {
    expect(
      isUsableSection({ title: '2.2.1.1.3 犬腹腔镜子宫切除术.....................' }),
    ).toBe(false);
  });

  it('图表编号/纯页码剔除', () => {
    expect(isUsableSection({ title: 'Table 37-9' })).toBe(false);
    expect(isUsableSection({ title: '812' })).toBe(false);
  });

  it('太短的标题剔除', () => {
    expect(isUsableSection({ title: 'A' })).toBe(false);
    expect(isUsableSection({ title: '' })).toBe(false);
  });
});
