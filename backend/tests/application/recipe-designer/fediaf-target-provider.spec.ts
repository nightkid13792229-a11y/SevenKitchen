import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaFediafTargetProvider } from '../../../src/application/recipe-designer/fediaf-target-provider';

describe('PrismaFediafTargetProvider', () => {
  const prisma = {
    nutritionStandardEntry: {
      findMany: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  function entry(overrides: Record<string, unknown> = {}) {
    return {
      id: 'entry-1',
      basis: 'PER_1000_KCAL_ME',
      unit: 'g',
      minValue: 0.5,
      maxValue: 7.1,
      nutrient: {
        code: 'calcium',
        name: '钙',
        category: 'MINERAL',
        fieldPath: 'minerals.calcium',
        expression: null,
      },
      ...overrides,
    };
  }

  it.each([
    ['EARLY_GROWTH_REPRODUCTION', 'EARLY_GROWTH_UNDER_14_WEEKS', 'VII-17a'],
    ['REPRODUCTION', 'REPRODUCTION', 'VII-17a'],
    ['LATE_GROWTH', 'LATE_GROWTH_FROM_14_WEEKS', 'VII-17b'],
    ['ADULT_MER_110', 'ADULT_MER_110', 'VII-17c'],
    ['ADULT_MER_95', 'ADULT_MER_95', 'VII-17d'],
  ] as const)(
    'queries Annex 7.8 targets for %s',
    async (scenario, lifeStage, sourceTable) => {
      prisma.nutritionStandardEntry.findMany.mockResolvedValue([entry()]);

      const provider = new PrismaFediafTargetProvider(prisma);
      await provider.getTargets(scenario);

      expect(prisma.nutritionStandardEntry.findMany).toHaveBeenCalledWith({
        where: {
          version: { code: 'FEDIAF_2025_DOG' },
          sourceType: 'ANNEX_7_8',
          sourceTable,
          lifeStage,
        },
        include: { nutrient: true },
        orderBy: { sortOrder: 'asc' },
      });
    },
  );

  it('keeps calcium standard values in the standard g unit', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        unit: 'g',
        minValue: 0.5,
        maxValue: 7.1,
      }),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const [target] = await provider.getTargets('ADULT_MER_110');

    expect(target).toEqual(
      expect.objectContaining({
        nutrientKey: 'calcium',
        label: '钙',
        category: 'MINERAL',
        fieldPaths: ['minerals.calcium'],
        unit: 'g',
        minValue: 0.5,
        maxValue: 7.1,
      }),
    );
  });

  it('does not apply puppy-only nutritional maximums to the reproduction scenario', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-lysine',
        unit: 'g',
        minValue: 2.2,
        maxValue: 7,
        nutrient: {
          code: 'lysine',
          name: '赖氨酸',
          category: 'AMINO_ACID',
          fieldPath: 'aminoAcids.lysine',
          expression: null,
        },
      }),
      entry({
        id: 'entry-linoleic',
        unit: 'g',
        minValue: 3.25,
        maxValue: 16.25,
        nutrient: {
          code: 'linoleicAcid',
          name: '亚油酸',
          category: 'FATTY_ACID',
          fieldPath: 'fattyAcids.linoleicAcid',
          expression: null,
        },
      }),
      entry({
        id: 'entry-calcium',
        unit: 'g',
        minValue: 2.5,
        maxValue: 4,
        nutrient: {
          code: 'calcium',
          name: '钙',
          category: 'MINERAL',
          fieldPath: 'minerals.calcium',
          expression: null,
        },
      }),
      entry({
        id: 'entry-ca-p',
        basis: 'RATIO',
        unit: 'ratio',
        minValue: 1,
        maxValue: 1.6,
        nutrient: {
          code: 'calciumPhosphorusRatio',
          name: '钙磷比',
          category: 'DERIVED_RATIO',
          fieldPath: null,
          expression: {
            op: 'divide',
            numerator: 'minerals.calcium',
            denominator: 'minerals.phosphorus',
          },
        },
      }),
      entry({
        id: 'entry-vitamin-a',
        unit: 'IU',
        minValue: 500,
        maxValue: 100000,
        nutrient: {
          code: 'vitaminA',
          name: '维生素 A',
          category: 'VITAMIN',
          fieldPath: 'vitamins.vitaminA',
          expression: null,
        },
      }),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const targets = await provider.getTargets('REPRODUCTION');
    const byKey = new Map(targets.map((target) => [target.nutrientKey, target]));

    expect(byKey.get('lysine')).toMatchObject({
      minValue: 2.2,
      maxValue: null,
    });
    expect(byKey.get('linoleicAcid')).toMatchObject({
      minValue: 3.25,
      maxValue: null,
    });
    expect(byKey.get('calcium')).toMatchObject({
      minValue: 2.5,
      maxValue: null,
    });
    expect(byKey.get('calciumPhosphorusRatio')).toMatchObject({
      maxValue: 1.6,
    });
    expect(byKey.get('vitaminA')).toMatchObject({
      maxValue: 100000,
    });
  });

  it('keeps puppy-only nutritional maximums for the under-14-weeks puppy scenario', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-lysine',
        unit: 'g',
        minValue: 2.2,
        maxValue: 7,
        nutrient: {
          code: 'lysine',
          name: '赖氨酸',
          category: 'AMINO_ACID',
          fieldPath: 'aminoAcids.lysine',
          expression: null,
        },
      }),
      entry({
        id: 'entry-calcium',
        unit: 'g',
        minValue: 2.5,
        maxValue: 4,
        nutrient: {
          code: 'calcium',
          name: '钙',
          category: 'MINERAL',
          fieldPath: 'minerals.calcium',
          expression: null,
        },
      }),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const targets = await provider.getTargets('EARLY_GROWTH_REPRODUCTION');

    expect(targets).toEqual([
      expect.objectContaining({ nutrientKey: 'lysine', maxValue: 7 }),
      expect.objectContaining({ nutrientKey: 'calcium', maxValue: 4 }),
    ]);
  });

  it.each([
    'EARLY_GROWTH_REPRODUCTION',
    'REPRODUCTION',
    'LATE_GROWTH',
    'ADULT_MER_110',
    'ADULT_MER_95',
  ] as const)(
    'adds the vitamin D maximum note for the fixed EU legal conversion in %s',
    async (scenario) => {
      prisma.nutritionStandardEntry.findMany.mockResolvedValue([
        entry({
          id: 'entry-vitamin-d',
          unit: 'IU',
          minValue: 138,
          maxValue: 568,
          nutrient: {
            code: 'vitaminD',
            name: '维生素 D',
            category: 'VITAMIN',
            fieldPath: 'vitamins.vitaminD',
            expression: null,
          },
        }),
      ]);

      const provider = new PrismaFediafTargetProvider(prisma);
      const [target] = await provider.getTargets(scenario);

      expect(target).toMatchObject({
        nutrientKey: 'vitaminD',
        minValue: 138,
        maxValue: 568,
        maxValueLabel: '欧盟法定上限',
      });
      expect(target.maxValueNote).toContain('227 IU/100g DM');
      expect(target.maxValueNote).toContain('400 kcal/100g DM');
      expect(target.maxValueNote).toContain('营养上限 800 IU/1000kcal ME');
    },
  );

  it.each(['ADULT_MER_110', 'ADULT_MER_95'] as const)(
    'adds the adult phosphorus footnote h explanation for %s',
    async (scenario) => {
      prisma.nutritionStandardEntry.findMany.mockResolvedValue([
        entry({
          id: 'entry-phosphorus',
          unit: 'g',
          minValue: 1,
          maxValue: 4,
          nutrient: {
            code: 'phosphorus',
            name: '磷',
            category: 'MINERAL',
            fieldPath: 'minerals.phosphorus',
            expression: null,
          },
        }),
      ]);

      const provider = new PrismaFediafTargetProvider(prisma);
      const [target] = await provider.getTargets(scenario);

      expect(target).toEqual(
        expect.objectContaining({
          nutrientKey: 'phosphorus',
          maxValue: 4,
          maxValueNote: expect.stringContaining('脚注 h'),
        }),
      );
      expect(target.maxValueNote).toContain('无机磷');
      expect(target.maxValueNote).toContain('钙磷稳态');
    },
  );

  it('maps EPA plus DHA sums while keeping the standard g unit', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-epa-dha',
        unit: 'g',
        minValue: 0.05,
        maxValue: null,
        nutrient: {
          code: 'epa_dha',
          name: 'EPA + DHA',
          category: 'FATTY_ACID',
          fieldPath: null,
          expression: {
            op: 'sum',
            fields: ['fattyAcids.epa', 'fattyAcids.dha'],
          },
        },
      }),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const [target] = await provider.getTargets('LATE_GROWTH');

    expect(target).toEqual(
      expect.objectContaining({
        nutrientKey: 'epa_dha',
        category: 'FATTY_ACID',
        calculation: 'SUM',
        fieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
        unit: 'g',
        minValue: 0.05,
        maxValue: null,
      }),
    );
  });

  it('keeps arachidonic acid targets in the standard mg unit even when the field is stored as g', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-arachidonic-acid',
        unit: 'mg',
        minValue: 30,
        maxValue: null,
        nutrient: {
          code: 'arachidonicAcid',
          name: '花生四烯酸',
          category: 'FATTY_ACID',
          fieldPath: 'fattyAcids.arachidonicAcid',
          expression: null,
        },
      }),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const [target] = await provider.getTargets('LATE_GROWTH');

    expect(target).toEqual(
      expect.objectContaining({
        nutrientKey: 'arachidonicAcid',
        label: '花生四烯酸',
        category: 'FATTY_ACID',
        fieldPaths: ['fattyAcids.arachidonicAcid'],
        unit: 'mg',
        minValue: 30,
        maxValue: null,
      }),
    );
  });

  it('uses the sodium footnote c safe level as a labelled reference upper bound per energy', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-sodium',
        unit: 'g',
        minValue: 0.22,
        maxValue: null,
        nutrient: {
          code: 'sodium',
          name: '钠',
          category: 'MINERAL',
          fieldPath: 'minerals.sodium',
          expression: null,
        },
      }),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const [target] = await provider.getTargets('EARLY_GROWTH_REPRODUCTION');

    expect(target).toEqual(
      expect.objectContaining({
        nutrientKey: 'sodium',
        unit: 'g',
        minValue: 0.22,
        maxValue: 3.75,
        maxValueLabel: '参考上限',
        maxValueNote: expect.stringContaining('FEDIAF 2025 未设钠的正式最高限值'),
      }),
    );
  });

  it.each([
    'EARLY_GROWTH_REPRODUCTION',
    'LATE_GROWTH',
    'ADULT_MER_110',
    'ADULT_MER_95',
  ] as const)(
    'uses the chloride footnote c safe level as a labelled reference upper bound per energy for %s',
    async (scenario) => {
      prisma.nutritionStandardEntry.findMany.mockResolvedValue([
        entry({
          id: 'entry-chloride',
          unit: 'g',
          minValue: 0.83,
          maxValue: null,
          nutrient: {
            code: 'chloride',
            name: '氯',
            category: 'MINERAL',
            fieldPath: 'minerals.chloride',
            expression: null,
          },
        }),
      ]);

      const provider = new PrismaFediafTargetProvider(prisma);
      const [target] = await provider.getTargets(scenario);

      expect(target).toEqual(
        expect.objectContaining({
          nutrientKey: 'chloride',
          unit: 'g',
          minValue: 0.83,
          maxValue: 5.87,
          maxValueLabel: '参考上限',
          maxValueNote: expect.stringContaining('FEDIAF 2025 未设氯的正式最高限值'),
        }),
      );
    },
  );

  it('maps Ca:P divide expressions as ratio targets without unit conversion', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-ca-p',
        basis: 'RATIO',
        unit: 'ratio',
        minValue: 1,
        maxValue: 2,
        nutrient: {
          code: 'ca_p_ratio',
          name: 'Ca:P',
          category: 'DERIVED_RATIO',
          fieldPath: null,
          expression: {
            op: 'divide',
            numerator: 'minerals.calcium',
            denominator: 'minerals.phosphorus',
          },
        },
      }),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const [target] = await provider.getTargets('ADULT_MER_95');

    expect(target).toEqual(
      expect.objectContaining({
        nutrientKey: 'ca_p_ratio',
        category: 'MINERAL',
        calculation: 'RATIO',
        expressionBasis: 'RATIO',
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        unit: 'ratio',
        minValue: 1,
        maxValue: 2,
      }),
    );
  });

  it('uses the conservative late-growth Ca:P ratio upper bound with an explanatory note', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-late-ca-p',
        basis: 'RATIO',
        unit: 'ratio',
        minValue: 1,
        maxValue: 1.8,
        nutrient: {
          code: 'calciumPhosphorusRatio',
          name: '钙磷比',
          category: 'DERIVED_RATIO',
          fieldPath: null,
          expression: {
            op: 'divide',
            numerator: 'minerals.calcium',
            denominator: 'minerals.phosphorus',
          },
        },
      }),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const [target] = await provider.getTargets('LATE_GROWTH');

    expect(target).toEqual(
      expect.objectContaining({
        nutrientKey: 'calciumPhosphorusRatio',
        maxValue: 1.6,
        maxValueNote: expect.stringContaining('默认按更保守的 1.6:1 评估'),
      }),
    );
  });

  it('uses the conservative late-growth calcium lower bound with an explanatory note', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-late-calcium',
        unit: 'g',
        minValue: 2,
        maxValue: 4.5,
        recommendedValue: 2.5,
        nutrient: {
          code: 'calcium',
          name: '钙',
          category: 'MINERAL',
          fieldPath: 'minerals.calcium',
          expression: null,
        },
      }),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const [target] = await provider.getTargets('LATE_GROWTH');

    expect(target).toEqual(
      expect.objectContaining({
        nutrientKey: 'calcium',
        minValue: 2.5,
        maxValue: 4.5,
        minValueNote: expect.stringContaining('默认按 2.50g/1000kcal ME'),
      }),
    );
    expect(target.minValueNote).toContain('<=15kg');
    expect(target.minValueNote).toContain('2.00g/1000kcal ME');
    expect(target).not.toHaveProperty('referenceBounds');
  });

  it('skips unsupported categories or expressions so assessment treats them as absent', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-unsupported',
        nutrient: {
          code: 'mystery',
          name: 'Mystery',
          category: 'UNKNOWN',
          fieldPath: null,
          expression: { op: 'multiply', fields: ['minerals.calcium'] },
        },
      }),
      entry(),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const targets = await provider.getTargets('ADULT_MER_110');

    expect(targets.map((target) => target.nutrientKey)).toEqual(['calcium']);
  });

  it('keeps Annex entries with no recommendation bounds as reference-only targets', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-vitamin-k-no-recommendation',
        minValue: null,
        maxValue: null,
        nutrient: {
          code: 'vitaminK',
          name: '维生素 K',
          category: 'VITAMIN',
          fieldPath: 'vitamins.vitaminK',
          expression: null,
        },
      }),
      entry({
        id: 'entry-adult-ala-no-recommendation',
        minValue: null,
        maxValue: null,
        nutrient: {
          code: 'alphaLinolenicAcid',
          name: 'α-亚麻酸',
          category: 'FATTY_ACID',
          fieldPath: 'fattyAcids.alphaLinolenicAcid',
          expression: null,
        },
      }),
      entry({
        id: 'entry-adult-epa-dha-no-recommendation',
        minValue: null,
        maxValue: null,
        nutrient: {
          code: 'epaDha',
          name: 'EPA + DHA',
          category: 'FATTY_ACID',
          fieldPath: null,
          expression: {
            op: 'sum',
            fields: ['fattyAcids.epa', 'fattyAcids.dha'],
          },
        },
      }),
      entry(),
    ]);

    const provider = new PrismaFediafTargetProvider(prisma);
    const targets = await provider.getTargets('ADULT_MER_110');

    expect(targets.map((target) => target.nutrientKey)).toEqual([
      'vitaminK',
      'alphaLinolenicAcid',
      'epaDha',
      'calcium',
    ]);
    expect(targets[0]).toMatchObject({
      nutrientKey: 'vitaminK',
      minValue: null,
      maxValue: null,
      excludeFromAttention: true,
    });
    expect(targets[2]).toMatchObject({
      nutrientKey: 'epaDha',
      category: 'FATTY_ACID',
      calculation: 'SUM',
      fieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
      excludeFromAttention: true,
    });
  });

  it('rejects unsupported scenarios and missing target rows', async () => {
    const provider = new PrismaFediafTargetProvider(prisma);

    await expect(provider.getTargets('SENIOR' as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.nutritionStandardEntry.findMany).not.toHaveBeenCalled();

    prisma.nutritionStandardEntry.findMany.mockResolvedValue([]);
    await expect(provider.getTargets('ADULT_MER_110')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
