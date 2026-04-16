import {
  estimatePackagePlanDays,
  normalizePackagePlan,
  summarizePackagePlan,
} from '../../../src/domain/order/order-package-plan';

describe('order-package-plan', () => {
  it('normalizes rows and summarizes total quantity/count', () => {
    const plan = normalizePackagePlan([
      { packageSpecG: 100.4, packageCount: 2.9 },
      { packageSpecG: 200, packageCount: 3 },
    ]);

    expect(plan).toEqual([
      { packageSpecG: 100, packageCount: 2 },
      { packageSpecG: 200, packageCount: 3 },
    ]);
    expect(summarizePackagePlan(plan)).toEqual({
      totalQuantityG: 800,
      totalPackageCount: 5,
      primaryPackageSpecG: 200,
      packageSpecSummary: '100g×2袋，200g×3袋',
    });
  });

  it('rejects empty or non-positive rows', () => {
    expect(() => normalizePackagePlan([])).toThrow(
      'packagePlan must contain at least one row',
    );
    expect(() =>
      normalizePackagePlan([{ packageSpecG: 0, packageCount: 1 }]),
    ).toThrow('packageSpecG must be >= 1');
    expect(() =>
      normalizePackagePlan([{ packageSpecG: 100, packageCount: 0 }]),
    ).toThrow('packageCount must be >= 1');
  });

  it('estimates days from total quantity and daily intake', () => {
    expect(estimatePackagePlanDays(4500, 300)).toBe(15);
    expect(estimatePackagePlanDays(4400, 300)).toBeCloseTo(14.7, 1);
    expect(estimatePackagePlanDays(4400, 0)).toBeNull();
  });
});
