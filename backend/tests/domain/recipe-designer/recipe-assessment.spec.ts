import {
  assessRecipeDraft,
  type DesignRecipeAssessmentInput,
} from '../../../src/domain/recipe-designer/recipe-assessment';
import type { AssessmentCategory } from '../../../src/domain/recipe-designer/types';

const adultProteinTarget = {
  nutrientKey: 'crudeProtein',
  label: '粗蛋白',
  category: 'MACRO' satisfies AssessmentCategory,
  expressionBasis: 'PER_1000_KCAL_ME',
  unit: 'g',
  minValue: 45,
  maxValue: null,
  fieldPaths: ['macros.crudeProtein'],
} as const;

function makeInput(weightMultiplier = 1): DesignRecipeAssessmentInput {
  return {
    scenario: 'ADULT_MER_95',
    items: [
      {
        id: 'item-beef',
        name: '牛肉',
        weightG: 400 * weightMultiplier,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: {
            energyKcal: 200,
            moisture: 65,
            crudeProtein: 20,
            crudeFat: 10,
            ash: 1,
            carbohydrate: 0,
            fiber: 0,
            solubleFiber: null,
            insolubleFiber: null,
          },
          minerals: {
            calcium: 10,
            phosphorus: 180,
            potassium: null,
            sodium: null,
            magnesium: null,
            chloride: null,
            iron: null,
            zinc: null,
            copper: null,
            manganese: null,
            selenium: null,
            iodine: null,
          },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        },
      },
      {
        id: 'item-rice',
        name: '米饭',
        weightG: 500 * weightMultiplier,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: {
            energyKcal: 130,
            moisture: 70,
            crudeProtein: 2.5,
            crudeFat: 0.3,
            ash: 0.2,
            carbohydrate: 28,
            fiber: 0.4,
            solubleFiber: null,
            insolubleFiber: null,
          },
          minerals: {
            calcium: 10,
            phosphorus: 180,
          },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        },
      },
    ],
    targets: [adultProteinTarget],
  };
}

describe('recipe designer assessment', () => {
  it('uses free total grams and does not require a 1kg recipe', () => {
    const result = assessRecipeDraft(makeInput());

    expect(result.totalWeightG).toBe(900);
    expect(result.energyDensityKcalPerKg).toBeCloseTo(1611.111, 3);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'item-beef',
        ratioPercent: 44.44444444444444,
      }),
      expect.objectContaining({
        id: 'item-rice',
        ratioPercent: 55.55555555555556,
      }),
    ]);
    expect(result.normalizedToKg).toBe(false);
  });

  it('keeps per-energy assessment stable when the same recipe is doubled', () => {
    const base = assessRecipeDraft(makeInput(1));
    const doubled = assessRecipeDraft(makeInput(2));

    expect(base.totalWeightG).toBe(900);
    expect(doubled.totalWeightG).toBe(1800);
    expect(doubled.nutrients.crudeProtein.per1000Kcal).toBeCloseTo(
      base.nutrients.crudeProtein.per1000Kcal,
      8,
    );
  });

  it('marks missing data without treating it as zero', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'iodine',
        label: '碘',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'μg',
        minValue: 220,
        maxValue: null,
        fieldPaths: ['minerals.iodine'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'iodine',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('groups repeated FEDIAF expression bases into one mobile assessment row and summary count', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'crudeProtein',
        label: '粗蛋白',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
      {
        nutrientKey: 'crudeProtein',
        label: '粗蛋白',
        category: 'MACRO',
        expressionBasis: 'PER_MJ_ME',
        unit: 'g',
        minValue: 20,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
      {
        nutrientKey: 'crudeProtein',
        label: '粗蛋白',
        category: 'MACRO',
        expressionBasis: 'PER_100G_DRY_MATTER',
        unit: 'g',
        minValue: 18,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries).toHaveLength(3);
    expect(result.rawSummary).toEqual({
      compliant: 2,
      deficient: 1,
      excess: 0,
      missingData: 0,
    });
    expect(result.groupedEntries).toHaveLength(1);
    expect(result.groupedEntries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      label: '粗蛋白',
      status: 'DEFICIENT',
      detailCount: 3,
      expressionBasis: 'PER_MJ_ME',
    });
    expect(result.groupedEntries[0].details.map((entry) => entry.expressionBasis)).toEqual([
      'PER_1000_KCAL_ME',
      'PER_MJ_ME',
      'PER_100G_DRY_MATTER',
    ]);
    expect(result.summary).toEqual({
      compliant: 0,
      deficient: 1,
      excess: 0,
      missingData: 0,
    });
  });

  it('calculates calcium phosphorus ratio as a ratio entry', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'ca_p_ratio',
        label: '钙磷比',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0].status).toBe('DEFICIENT');
    expect(result.entries[0].currentValue).toBeCloseTo(10 / 180, 4);
  });

  it('marks ratio targets with mixed field units as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'energy_protein_ratio',
        label: '能量蛋白比',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['macros.energyKcal', 'macros.crudeProtein'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'energy_protein_ratio',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio targets with duplicate field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'duplicate_ratio_paths',
        label: '重复比例路径',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.calcium'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'duplicate_ratio_paths',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio targets missing when denominator aggregate overflows', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.minerals.calcium = 10;
    profile.minerals.phosphorus = Number.MAX_VALUE;
    input.targets = [
      {
        nutrientKey: 'overflow_ratio',
        label: '溢出比例',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 0,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'overflow_ratio',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio entries missing when numerator or denominator values are negative', () => {
    for (const fieldPath of ['calcium', 'phosphorus']) {
      const input = makeInput();
      const beefProfile = input.items[0].nutritionProfile as any;
      beefProfile.minerals[fieldPath] = -10;
      input.targets = [
        {
          nutrientKey: `negative_${fieldPath}_ratio`,
          label: '负数比例',
          category: 'RATIO',
          expressionBasis: 'RATIO',
          unit: ':1',
          minValue: 1,
          maxValue: 2,
          fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
          calculation: 'RATIO',
        },
      ];

      const result = assessRecipeDraft(input);

      expect(result.entries[0]).toMatchObject({
        nutrientKey: `negative_${fieldPath}_ratio`,
        status: 'MISSING_DATA',
        currentValue: null,
      });
    }
  });

  it('marks a target nutrient missing when any positive-weight item lacks it', () => {
    const input = makeInput();
    const riceProfile = input.items[1].nutritionProfile as any;
    riceProfile.macros.crudeProtein = null;

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('marks negative target nutrient values as missing data', () => {
    const input = makeInput();
    const beefProfile = input.items[0].nutritionProfile as any;
    beefProfile.macros.crudeProtein = -5;

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('marks per-energy targets missing when any positive-weight item lacks energy', () => {
    const input = makeInput();
    const riceProfile = input.items[1].nutritionProfile as any;
    riceProfile.macros.energyKcal = null;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBeNull();
    expect(result.energyDensityKcalPerKg).toBeNull();
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.per1000Kcal).toBeNull();
  });

  it('marks negative energy values as missing denominator data', () => {
    const input = makeInput();
    const beefProfile = input.items[0].nutritionProfile as any;
    beefProfile.macros.energyKcal = -200;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBeNull();
    expect(result.energyDensityKcalPerKg).toBeNull();
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.per1000Kcal).toBeNull();
  });

  it('marks per-energy targets missing when aggregate energy overflows', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.macros.energyKcal = Number.MAX_VALUE;
    profile.macros.moisture = 0;
    profile.macros.crudeProtein = 20;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBeNull();
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.per1000Kcal).toBeNull();
  });

  it('marks dry-matter targets missing when any positive-weight item lacks moisture', () => {
    const input = makeInput();
    const riceProfile = input.items[1].nutritionProfile as any;
    riceProfile.macros.moisture = null;
    input.targets = [
      {
        nutrientKey: 'crudeProteinDm',
        label: '粗蛋白 DM',
        category: 'MACRO',
        expressionBasis: 'PER_100G_DRY_MATTER',
        unit: 'g',
        minValue: 18,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.dryMatterG).toBeNull();
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProteinDm',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('rejects negative and non-finite item weights at the domain boundary', () => {
    for (const weightG of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const input = makeInput();
      input.items[0].weightG = weightG;

      expect(() => assessRecipeDraft(input)).toThrow(
        'Recipe assessment item weightG must be a finite non-negative number',
      );
    }
  });

  it('marks targets with empty field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'empty_target',
        label: '空目标',
        category: 'COMBINATION',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: null,
        maxValue: null,
        fieldPaths: [],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'empty_target',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks non-ratio targets with malformed field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'null_field_paths',
        label: '空路径',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: null as any,
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'null_field_paths',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio targets with malformed field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'null_ratio_paths',
        label: '空比例路径',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: null as any,
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'null_ratio_paths',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks assessments without targets as incomplete', () => {
    const input = makeInput();
    input.targets = [];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries).toEqual([]);
    expect(result.nutrients).toEqual({});
    expect(result.summary).toEqual({
      compliant: 0,
      deficient: 0,
      excess: 0,
      missingData: 0,
    });
  });

  it('marks null target entries as missing data without throwing', () => {
    const input = makeInput();
    input.targets = [null as any];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks targets with malformed expression basis as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'bad_basis',
        label: '异常表达基准',
        category: 'MACRO',
        expressionBasis: 'PER_BOWL' as any,
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'bad_basis',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks targets with malformed category as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'unknown_category',
        label: '未知分类',
        category: 'UNKNOWN' as any,
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'unknown_category',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio calculations with malformed expression basis as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'bad_ratio_basis',
        label: '异常比例表达基准',
        category: 'RATIO',
        expressionBasis: 'PER_BOWL' as any,
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'bad_ratio_basis',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio calculations with non-ratio expression basis as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'inconsistent_ratio_basis',
        label: '不一致比例表达基准',
        category: 'RATIO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'inconsistent_ratio_basis',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.summary.compliant).toBe(0);
  });

  it('marks ratio category targets with non-ratio expression basis as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'ratio_category_normal_basis',
        label: '比例分类普通表达',
        category: 'RATIO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.overallStatus).toBe('INCOMPLETE');
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'ratio_category_normal_basis',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks unbounded targets as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'unbounded_protein',
        label: '无界蛋白',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: null,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'unbounded_protein',
      status: 'MISSING_DATA',
      currentValue: null,
      minValue: null,
      maxValue: null,
    });
    expect(result.summary.compliant).toBe(0);
  });

  it('marks malformed ratio targets as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'malformed_ratio',
        label: '异常比例',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium'],
        calculation: 'RATIO',
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'malformed_ratio',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks ratio targets with extra field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'extra_path_ratio',
        label: '多路径比例',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: [
          'minerals.calcium',
          'minerals.phosphorus',
          'macros.crudeProtein',
        ],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'extra_path_ratio',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('converts per-1g nutrition profiles to per-100g assessment totals', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.meta.rawBasisType = 'PER_1_G';
    profile.macros.energyKcal = 2;
    profile.macros.moisture = 0;
    profile.macros.crudeProtein = 0.2;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBe(200);
    expect(result.nutrients.crudeProtein.total).toBe(20);
  });

  it('treats volume-based profiles without density as missing data', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.meta.rawBasisType = 'PER_100_ML';
    delete profile.meta.densityGPerMl;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBeNull();
    expect(result.energyDensityKcalPerKg).toBeNull();
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
      minValue: 45,
      maxValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('treats structured profiles with missing raw basis as missing data', () => {
    const input = makeInput();
    const profile = input.items[0].nutritionProfile as any;
    delete profile.meta.rawBasisType;

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('treats structured profiles with invalid raw basis as missing data', () => {
    const input = makeInput();
    const profile = input.items[0].nutritionProfile as any;
    profile.meta.rawBasisType = 'PER_BUCKET';

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('treats legacy mixed-basis profiles as missing instead of applying the first item basis globally', () => {
    const input = makeInput();
    input.items = [
      {
        id: 'legacy-item',
        name: '历史数据',
        weightG: 100,
        nutritionProfile: {
          items: [
            {
              nutrientName: '能量',
              value: 2,
              unit: 'kcal',
              basisType: 'PER_1_G',
            },
            {
              nutrientName: '粗蛋白',
              value: 20,
              unit: 'g',
              basisType: 'PER_100_G',
            },
          ],
        },
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.total).toBeNull();
  });

  it('converts per-100ml nutrition profiles with density to per-100g totals', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.meta.rawBasisType = 'PER_100_ML';
    profile.meta.densityGPerMl = 1.2;
    profile.macros.energyKcal = 240;
    profile.macros.moisture = 0;
    profile.macros.crudeProtein = 24;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBe(200);
    expect(result.nutrients.crudeProtein.total).toBe(20);
  });

  it('marks targets with non-finite bounds as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'invalid_bounds',
        label: '异常上下限',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: Number.NaN,
        maxValue: Number.POSITIVE_INFINITY,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'invalid_bounds',
      status: 'MISSING_DATA',
      currentValue: null,
      minValue: null,
      maxValue: null,
    });
  });

  it('marks targets with unknown calculation as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'unknown_calculation',
        label: '未知计算',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
        calculation: 'AVERAGE' as any,
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'unknown_calculation',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks targets with negative bounds as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'negative_bound',
        label: '负数下限',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: -1,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'negative_bound',
      status: 'MISSING_DATA',
      currentValue: null,
      minValue: null,
      maxValue: null,
    });
  });

  it('marks targets with inverted finite bounds as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'inverted_bounds',
        label: '倒置上下限',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 10,
        maxValue: 5,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'inverted_bounds',
      status: 'MISSING_DATA',
      currentValue: null,
      minValue: 10,
      maxValue: 5,
    });
  });

  it('does not add expression-basis ratio targets to nutrient totals', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'ca_p_ratio',
        label: '钙磷比',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        minValue: 1,
        maxValue: 2,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0].currentValue).toBeCloseTo(10 / 180, 4);
    expect(result.nutrients.ca_p_ratio).toBeUndefined();
  });

  it('supports per-MJ energy assessment', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'crudeProteinPerMj',
        label: '粗蛋白 MJ',
        category: 'MACRO',
        expressionBasis: 'PER_MJ_ME',
        unit: 'g',
        minValue: 10,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProteinPerMj',
      status: 'COMPLIANT',
    });
    expect(result.entries[0].currentValue).toBeCloseTo(
      92.5 / (1450 * 0.004184),
      6,
    );
  });

  it('sums multiple field paths for combination targets', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'protein_fat_combo',
        label: '蛋白脂肪组合',
        category: 'COMBINATION',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 80,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein', 'macros.crudeFat'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.nutrients.protein_fat_combo.total).toBeCloseTo(134, 8);
    expect(result.entries[0].currentValue).toBeCloseTo((134 / 1450) * 1000, 8);
  });

  it('marks direct nutrient targets with multiple field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'calcium_phosphorus_direct',
        label: '钙磷直接目标',
        category: 'MINERAL',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 100,
        maxValue: null,
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'calcium_phosphorus_direct',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.calcium_phosphorus_direct.total).toBeNull();
  });

  it('marks duplicate field paths as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'duplicate_protein',
        label: '重复蛋白',
        category: 'COMBINATION',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein', 'macros.crudeProtein'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'duplicate_protein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.duplicate_protein.total).toBeNull();
  });

  it('marks combination targets with incompatible field units as missing data', () => {
    const input = makeInput();
    input.targets = [
      {
        nutrientKey: 'protein_calcium_combo',
        label: '蛋白钙组合',
        category: 'COMBINATION',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 45,
        maxValue: null,
        fieldPaths: ['macros.crudeProtein', 'minerals.calcium'],
      },
    ];

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'protein_calcium_combo',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.protein_calcium_combo.total).toBeNull();
  });

  it('marks non-finite derived current values as missing data', () => {
    const input = makeInput();
    input.items = [input.items[0]];
    input.items[0].weightG = 100;
    const profile = input.items[0].nutritionProfile as any;
    profile.macros.energyKcal = 1;
    profile.macros.moisture = 0;
    profile.macros.crudeProtein = Number.MAX_VALUE;

    const result = assessRecipeDraft(input);

    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
  });

  it('marks per-energy targets missing when total energy is zero', () => {
    const input = makeInput();
    const beefProfile = input.items[0].nutritionProfile as any;
    const riceProfile = input.items[1].nutritionProfile as any;
    beefProfile.macros.energyKcal = 0;
    riceProfile.macros.energyKcal = 0;

    const result = assessRecipeDraft(input);

    expect(result.totalEnergyKcal).toBe(0);
    expect(result.energyDensityKcalPerKg).toBe(0);
    expect(result.entries[0]).toMatchObject({
      nutrientKey: 'crudeProtein',
      status: 'MISSING_DATA',
      currentValue: null,
    });
    expect(result.nutrients.crudeProtein.per1000Kcal).toBeNull();
  });
});
