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

  it('prefers the larger spec when package counts tie', () => {
    const summary = summarizePackagePlan([
      { packageSpecG: 100, packageCount: 2 },
      { packageSpecG: 200, packageCount: 2 },
    ]);

    expect(summary.primaryPackageSpecG).toBe(200);
  });

  it('rejects empty or non-positive rows', () => {
    expect(() => normalizePackagePlan([])).toThrow(
      'packagePlan must contain at least one row',
    );
    expect(() => normalizePackagePlan(null)).toThrow(
      'packagePlan must contain at least one row',
    );
    expect(() => normalizePackagePlan(undefined)).toThrow(
      'packagePlan must contain at least one row',
    );
    expect(() =>
      normalizePackagePlan('not-an-array' as unknown as Array<
        Partial<{ packageSpecG: number; packageCount: number }>
      >),
    ).toThrow('packagePlan must contain at least one row');
    expect(() =>
      normalizePackagePlan([{ packageSpecG: 0, packageCount: 1 }]),
    ).toThrow('packageSpecG must be >= 1');
    expect(() =>
      normalizePackagePlan([{ packageSpecG: 100, packageCount: 0 }]),
    ).toThrow('packageCount must be >= 1');
    expect(() => normalizePackagePlan([null as unknown as never])).toThrow(
      'packagePlan[0] must be an object with packageSpecG and packageCount',
    );
    expect(() => normalizePackagePlan([123 as unknown as never])).toThrow(
      'packagePlan[0] must be an object with packageSpecG and packageCount',
    );
  });

  it('estimates days from total quantity and daily intake', () => {
    expect(estimatePackagePlanDays(4500, 300)).toBe(15);
    expect(estimatePackagePlanDays(4400, 300)).toBe(14.7);
    expect(estimatePackagePlanDays(4400, 0)).toBeNull();
    expect(estimatePackagePlanDays(4400, Infinity)).toBeNull();
  });
});
