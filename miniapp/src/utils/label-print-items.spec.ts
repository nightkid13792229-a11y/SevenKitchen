import { describe, expect, it } from 'vitest';
import {
  expandOrderPrintLabels,
  getPackagePlanTotalWeight,
} from './label-print-items';

describe('label print item expansion', () => {
  it('splits one custom package plan into one label item per package spec', () => {
    const labels = expandOrderPrintLabels([
      {
        orderItemId: 'item-1',
        orderId: 'order-1',
        dogName: 'setar',
        packageSpecG: 80,
        packageCount: 24,
        packagePlan: [
          { packageSpecG: 80, packageCount: 10 },
          { packageSpecG: 160, packageCount: 8 },
          { packageSpecG: 240, packageCount: 6 },
        ],
      },
    ]);

    expect(labels).toHaveLength(3);
    expect(labels.map((label) => label.packageLabelTitle)).toEqual([
      '80g×10袋',
      '160g×8袋',
      '240g×6袋',
    ]);
    expect(labels.map((label) => label.packageTotalWeightG)).toEqual([
      800,
      1280,
      1440,
    ]);
    expect(labels.every((label) => label.packageLabelCount === 3)).toBe(true);
    expect(labels.every((label) => label.isSplitPackageLabel)).toBe(true);
    expect(labels[1].packagePlan).toEqual([{ packageSpecG: 160, packageCount: 8 }]);
  });

  it('keeps a non-custom package as one label item', () => {
    const labels = expandOrderPrintLabels([
      {
        orderItemId: 'item-1',
        packageSpecG: 208,
        packageCount: 60,
      },
    ]);

    expect(labels).toHaveLength(1);
    expect(labels[0].packageLabelTitle).toBe('208g×60袋');
    expect(labels[0].packageTotalWeightG).toBe(12480);
    expect(labels[0].isSplitPackageLabel).toBe(false);
  });

  it('calculates weight from the single split label spec instead of the original order total', () => {
    const [label] = expandOrderPrintLabels([
      {
        orderItemId: 'item-1',
        packageSpecG: 80,
        packageCount: 24,
        packagePlan: [
          { packageSpecG: 80, packageCount: 10 },
          { packageSpecG: 160, packageCount: 8 },
        ],
      },
    ]);

    expect(getPackagePlanTotalWeight(label)).toBe(800);
  });
});
