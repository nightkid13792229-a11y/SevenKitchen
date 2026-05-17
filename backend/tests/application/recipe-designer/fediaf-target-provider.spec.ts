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

  it('converts calcium standard values from g to the field mg unit', async () => {
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
        unit: 'mg',
        minValue: 500,
        maxValue: 7100,
      }),
    );
  });

  it('maps EPA plus DHA sums and converts g targets to mg field units', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      entry({
        id: 'entry-epa-dha',
        unit: 'g',
        minValue: 0.05,
        maxValue: null,
        nutrient: {
          code: 'epa_dha',
          name: 'EPA + DHA',
          category: 'DERIVED_RATIO',
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
        category: 'COMBINATION',
        calculation: 'SUM',
        fieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
        unit: 'mg',
        minValue: 50,
        maxValue: null,
      }),
    );
  });

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
        category: 'RATIO',
        calculation: 'RATIO',
        expressionBasis: 'RATIO',
        fieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
        unit: 'ratio',
        minValue: 1,
        maxValue: 2,
      }),
    );
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
