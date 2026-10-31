import { NUTRITION_FIELD_CATALOG } from '../../../src/domain/ingredient/nutrition-field-catalog';
import { computeCatalogCoverage } from '../../../src/domain/ingredient/nutrition-coverage';

describe('computeCatalogCoverage', () => {
  it('0 值不算已填', () => {
    const coverage = computeCatalogCoverage({
      macros: { crudeProtein: 11.6, crudeFat: 0, moisture: 84.4 },
    });

    expect(coverage.filled).toBe(2);
    expect(coverage.percent).toBeGreaterThan(0);
  });

  it('全 0 记录覆盖率为 0，不出现 NaN', () => {
    expect(
      computeCatalogCoverage({ macros: { crudeProtein: 0 } }).percent,
    ).toBe(0);
  });

  it('null / 空对象不报错', () => {
    expect(computeCatalogCoverage(null).percent).toBe(0);
    expect(computeCatalogCoverage({}).filled).toBe(0);
  });

  it('分母是目录字段数', () => {
    const coverage = computeCatalogCoverage({
      macros: { crudeProtein: 10 },
    });

    expect(coverage.total).toBe(NUTRITION_FIELD_CATALOG.length);
    expect(coverage.percent).toBeCloseTo(
      Math.round((1 / coverage.total) * 1000) / 10,
      1,
    );
  });
});
