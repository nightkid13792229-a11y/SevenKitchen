import { buildCatalogQuery, detectSaltNameZh } from '../supplement-salt-name';

describe('detectSaltNameZh', () => {
  it('识别常见盐型', () => {
    expect(detectSaltNameZh('Iron (from Ferrochel® ferrous bisglycinate chelate)')).toBe('甘氨酸');
    expect(detectSaltNameZh('Zinc gluconate 15 mg')).toBe('葡萄糖酸');
    expect(detectSaltNameZh('Copper sulfate')).toBe('硫酸');
    expect(detectSaltNameZh('Magnesium oxide')).toBe('氧化');
  });

  it('认不出就返回 null，不猜', () => {
    expect(detectSaltNameZh('Iron 18 mg')).toBeNull();
    expect(detectSaltNameZh('')).toBeNull();
  });
});

describe('buildCatalogQuery', () => {
  it('有盐名时用「盐名 + 营养素」去查目录', () => {
    expect(buildCatalogQuery('铁', 'ferrous bisglycinate')).toBe('甘氨酸铁');
  });

  it('没有盐名时只查营养素', () => {
    expect(buildCatalogQuery('铁', 'Iron 18 mg')).toBe('铁');
  });
});
