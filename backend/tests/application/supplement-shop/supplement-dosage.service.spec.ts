import { BadRequestException } from '@nestjs/common';
import { SupplementDosageService } from '../../../src/application/supplement-shop/supplement-dosage.service';

function profile(overrides: Record<string, any> = {}) {
  return {
    meta: { rawBasisType: 'PER_1_G' },
    macros: {},
    minerals: {},
    vitamins: {},
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
    ...overrides,
  };
}

function ingredient(overrides: Record<string, any> = {}) {
  return {
    id: 'ing-1',
    name: '测试补剂',
    baseUnit: 'G',
    unitDisplayLabel: 'g',
    purchaseUnit: 'g',
    nutritionProfile: profile({ minerals: { calcium: 353 } }),
    properties: {},
    ...overrides,
  };
}

function target(overrides: Record<string, any> = {}) {
  return {
    fieldPath: 'minerals.calcium',
    label: '钙',
    unit: 'mg',
    targetValuePerKg: 2192,
    ...overrides,
  };
}

describe('SupplementDosageService', () => {
  const service = new SupplementDosageService();

  it('computes grams per gram from PER_1_G profile', () => {
    const result = service.computeDosage({
      ingredient: ingredient(),
      targets: [target()],
      totalWeightG: 3000,
    });

    expect(result.status).toBe('OK');
    // 2192 mg/kg × 3 kg = 6576 mg；353 mg/g → 18.629 g
    expect(result.amount).toBeCloseTo(18.629, 3);
    expect(result.unit).toBe('g');
    expect(result.concentrations).toEqual([
      { fieldPath: 'minerals.calcium', value: 353, unit: 'mg' },
    ]);
  });

  it('divides PER_100_G values by 100', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        nutritionProfile: profile({
          meta: { rawBasisType: 'PER_100_G' },
          minerals: { calcium: 35300 },
        }),
      }),
      targets: [target()],
      totalWeightG: 3000,
    });

    expect(result.status).toBe('OK');
    // 35300 mg/100g = 353 mg/g；6576 mg ÷ 353 = 18.629 g
    expect(result.amount).toBeCloseTo(18.629, 3);
  });

  it('computes tablets from PER_SERVING profile', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        name: '葡萄糖酸锌片',
        baseUnit: 'PCS',
        unitDisplayLabel: '片',
        nutritionProfile: profile({
          meta: { rawBasisType: 'PER_SERVING' },
          minerals: { zinc: 50 },
        }),
      }),
      targets: [
        target({ fieldPath: 'minerals.zinc', label: '锌', unit: 'mg', targetValuePerKg: 75 }),
      ],
      totalWeightG: 2000,
    });

    expect(result.status).toBe('OK');
    expect(result.amount).toBeCloseTo(3, 6);
    expect(result.unit).toBe('片');
  });

  it('sums derived EPA + DHA from the profile', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        name: '鱼油胶囊',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        nutritionProfile: profile({
          meta: { rawBasisType: 'PER_SERVING' },
          fattyAcids: { epa: 500, dha: 250 },
        }),
        properties: {
          active_nutrients: {
            'EPA+DHA': { value: 300, unit: 'g' },
          },
        },
      }),
      targets: [
        target({
          fieldPath: 'derived.epaDha',
          label: 'EPA + DHA',
          unit: 'mg',
          targetValuePerKg: 1000,
        }),
      ],
      totalWeightG: 1000,
    });

    expect(result.status).toBe('OK');
    expect(result.amount).toBeCloseTo(1.3333, 3);
    expect(result.concentrations).toEqual([
      { fieldPath: 'derived.epaDha', value: 750, unit: 'mg' },
    ]);
  });

  it('reads custom nutrient items', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        name: '关节胶囊',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        nutritionProfile: profile({
          meta: { rawBasisType: 'PER_SERVING' },
          customItems: [
            { name: '氨糖', value: 500, unit: 'mg', rawBasisType: 'PER_SERVING' },
          ],
        }),
      }),
      targets: [
        target({
          fieldPath: 'custom:氨糖',
          label: '氨糖',
          unit: 'mg',
          targetValuePerKg: 1000,
        }),
      ],
      totalWeightG: 1000,
    });

    expect(result.status).toBe('OK');
    expect(result.amount).toBeCloseTo(2, 6);
  });

  it('takes the max amount when a supplement has multiple targets', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        name: '骨粉',
        nutritionProfile: profile({
          meta: { rawBasisType: 'PER_1_G' },
          minerals: { calcium: 217, phosphorus: 73 },
        }),
      }),
      targets: [
        target({ fieldPath: 'minerals.calcium', targetValuePerKg: 2192 }),
        target({
          fieldPath: 'minerals.phosphorus',
          label: '磷',
          unit: 'mg',
          targetValuePerKg: 1000,
        }),
      ],
      totalWeightG: 3000,
    });

    expect(result.status).toBe('OK');
    // 钙 6576/217=30.304；磷 3000/73=41.096 → 取 41.096
    expect(result.amount).toBeCloseTo(41.096, 3);
  });

  it('refuses to dose when one target has no concentration', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        nutritionProfile: profile({ minerals: { calcium: 353 } }),
      }),
      targets: [
        target(),
        target({
          fieldPath: 'minerals.zinc',
          label: '锌',
          unit: 'mg',
          targetValuePerKg: 75,
        }),
      ],
      totalWeightG: 1000,
    });

    expect(result.status).toBe('MISSING_CONCENTRATION');
    expect(result.amount).toBeNull();
    expect(result.missingFieldPaths).toEqual(['minerals.zinc']);
  });

  it('reports a unit mismatch instead of guessing', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        nutritionProfile: profile({ minerals: { calcium: 353 } }),
      }),
      targets: [target({ unit: 'μg' })],
      totalWeightG: 1000,
    });

    expect(result.status).toBe('UNIT_MISMATCH');
    expect(result.amount).toBeNull();
  });

  it('normalizes mcg/ug/μg spellings', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        name: '海藻粉',
        baseUnit: 'PCS',
        unitDisplayLabel: '平勺',
        nutritionProfile: profile({
          meta: { rawBasisType: 'PER_SERVING' },
          minerals: { iodine: 450 },
        }),
      }),
      targets: [
        target({ fieldPath: 'minerals.iodine', label: '碘', unit: 'ug', targetValuePerKg: 660 }),
      ],
      totalWeightG: 1000,
    });

    expect(result.status).toBe('OK');
    expect(result.amount).toBeCloseTo(1.4667, 3);
  });

  it('does not convert 亿CFU to CFU', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        name: '益生菌',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        nutritionProfile: profile({
          meta: { rawBasisType: 'PER_SERVING' },
          customItems: [
            { name: '益生菌', value: 100, unit: '亿CFU', rawBasisType: 'PER_SERVING' },
          ],
        }),
      }),
      targets: [
        target({ fieldPath: 'custom:益生菌', label: '益生菌', unit: 'CFU', targetValuePerKg: 1 }),
      ],
      totalWeightG: 1000,
    });

    expect(result.status).toBe('UNIT_MISMATCH');
  });

  it('falls back to legacy active_nutrients only when the unit matches', () => {
    const ok = service.computeDosage({
      ingredient: ingredient({
        nutritionProfile: null,
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        properties: { active_nutrients: { 钙: { value: 250, unit: 'mg' } } },
      }),
      targets: [target({ targetValuePerKg: 500 })],
      totalWeightG: 1000,
    });
    expect(ok.status).toBe('OK');
    expect(ok.amount).toBeCloseTo(2, 6);

    const bad = service.computeDosage({
      ingredient: ingredient({
        nutritionProfile: null,
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        properties: {
          active_nutrients: { 'EPA+DHA': { value: 300, unit: 'g' } },
        },
      }),
      targets: [
        target({
          fieldPath: 'derived.epaDha',
          label: 'EPA + DHA',
          unit: 'mg',
          targetValuePerKg: 1000,
        }),
      ],
      totalWeightG: 1000,
    });
    expect(bad.status).toBe('UNIT_MISMATCH');
  });

  it('converts PER_SERVING to grams when servingWeightG is present', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        baseUnit: 'G',
        unitDisplayLabel: 'g',
        nutritionProfile: {
          meta: { rawBasisType: 'PER_SERVING', servingWeightG: 5 },
          minerals: { calcium: 500 },
        },
      }),
      targets: [target({ targetValuePerKg: 1000 })],
      totalWeightG: 1000,
    });

    expect(result.status).toBe('OK');
    // 500mg/5g = 100mg/g；1000mg ÷ 100 = 10g
    expect(result.amount).toBeCloseTo(10, 6);
  });

  it('rejects PER_SERVING data on a gram-based ingredient', () => {
    const result = service.computeDosage({
      ingredient: ingredient({
        baseUnit: 'G',
        unitDisplayLabel: 'g',
        nutritionProfile: profile({
          meta: { rawBasisType: 'PER_SERVING' },
          minerals: { calcium: 500 },
        }),
      }),
      targets: [target({ targetValuePerKg: 1000 })],
      totalWeightG: 1000,
    });

    expect(result.status).toBe('UNIT_MISMATCH');
  });

  it('returns NO_TARGETS when the recipe has no supplement targets', () => {
    const result = service.computeDosage({
      ingredient: ingredient(),
      targets: [],
      totalWeightG: 1000,
    });

    expect(result.status).toBe('NO_TARGETS');
    expect(result.amount).toBeNull();
  });

  it('rejects a non-positive batch weight', () => {
    expect(() =>
      service.computeDosage({
        ingredient: ingredient(),
        targets: [target()],
        totalWeightG: 0,
      }),
    ).toThrow(BadRequestException);
  });
});
