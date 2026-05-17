import { NotFoundException } from '@nestjs/common';
import { IngredientReadinessService } from '../../../src/application/nutrition-calculation/ingredient-readiness.service';

describe('IngredientReadinessService', () => {
  const prisma = {
    ingredient: {
      findMany: jest.fn(),
    },
    nutritionStandardVersion: {
      findUnique: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('classifies ingredients by FEDIAF nutrient coverage', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      entries: [
        {
          nutrient: {
            code: 'crudeProtein',
            fieldPath: 'macros.crudeProtein',
            defaultStandardUnit: 'g',
            expression: null,
          },
        },
        {
          nutrient: {
            code: 'calcium',
            fieldPath: 'minerals.calcium',
            defaultStandardUnit: 'g',
            expression: null,
          },
        },
      ],
    });
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-1',
        name: '鸡胸肉',
        type: 'FOOD',
        nutritionProfile: {
          meta: { rawBasisType: 'PER_100_G' },
          macros: { energyKcal: 120, moisture: 70, crudeProtein: 22 },
          minerals: { calcium: 12 },
          vitamins: {},
          fattyAcids: {},
          aminoAcids: {},
          customItems: [],
        },
        nutritionFoodMappings: [{ id: 'mapping-1' }],
      },
      {
        id: 'ingredient-2',
        name: '缺数据原料',
        type: 'FOOD',
        nutritionProfile: null,
        nutritionFoodMappings: [],
      },
    ]);

    const service = new IngredientReadinessService(prisma);
    const result = await service.listIngredientReadiness();

    expect(result.summary).toEqual({
      totalIngredients: 2,
      readyFull: 1,
      readyBasic: 0,
      partial: 0,
      notReady: 1,
    });
    expect(result.items[0]).toMatchObject({
      ingredientId: 'ingredient-1',
      ingredientName: '鸡胸肉',
      readinessLevel: 'READY_FULL',
      coverageRatio: 1,
      hasEnergy: true,
      hasMoisture: true,
      hasNutritionFoodMapping: true,
    });
    expect(result.items[1]).toMatchObject({
      ingredientId: 'ingredient-2',
      readinessLevel: 'NOT_READY',
      missingNutrients: ['crudeProtein', 'calcium'],
    });
  });

  it('requires all source fields for combination nutrient expressions', async () => {
    mockStandard([
      {
        code: 'epaDha',
        fieldPath: null,
        expression: {
          op: 'sum',
          fields: ['fattyAcids.epa', 'fattyAcids.dha'],
        },
      },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      ingredient({
        nutritionProfile: {
          macros: { energyKcal: 100, moisture: 60 },
          fattyAcids: { epa: 1 },
        },
      }),
    ]);

    const result = await new IngredientReadinessService(
      prisma,
    ).listIngredientReadiness();

    expect(result.items[0]).toMatchObject({
      readinessLevel: 'NOT_READY',
      coverageRatio: 0,
      resolvedNutrients: [],
      missingNutrients: ['epaDha'],
    });
  });

  it('uses numerator and denominator fields for divide expressions', async () => {
    mockStandard([
      {
        code: 'calciumPhosphorusRatio',
        fieldPath: null,
        expression: {
          op: 'divide',
          numerator: 'minerals.calcium',
          denominator: 'minerals.phosphorus',
        },
      },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      ingredient({
        nutritionProfile: {
          macros: { energyKcal: 100, moisture: 60 },
          minerals: { calcium: 1.2, phosphorus: 0.9 },
        },
      }),
    ]);

    const result = await new IngredientReadinessService(
      prisma,
    ).listIngredientReadiness();

    expect(result.items[0]).toMatchObject({
      readinessLevel: 'READY_FULL',
      coverageRatio: 1,
      resolvedNutrients: ['calciumPhosphorusRatio'],
      missingNutrients: [],
    });
  });

  it('does not resolve unsupported expressions even when source fields exist', async () => {
    mockStandard([
      {
        code: 'unsupportedMultiplier',
        fieldPath: null,
        expression: {
          op: 'multiply',
          fields: ['minerals.calcium'],
        },
      },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      ingredient({
        nutritionProfile: {
          macros: { energyKcal: 100, moisture: 60 },
          minerals: { calcium: 1.2 },
        },
      }),
    ]);

    const result = await new IngredientReadinessService(
      prisma,
    ).listIngredientReadiness();

    expect(result.items[0]).toMatchObject({
      readinessLevel: 'NOT_READY',
      coverageRatio: 0,
      resolvedNutrients: [],
      missingNutrients: ['unsupportedMultiplier'],
    });
    expect(result.missingNutrientRanking).toEqual([
      { nutrientCode: 'unsupportedMultiplier', count: 1 },
    ]);
  });

  it('classifies READY_BASIC when coverage is at least half and energy and moisture exist', async () => {
    mockStandard([
      { code: 'protein', fieldPath: 'macros.crudeProtein' },
      { code: 'calcium', fieldPath: 'minerals.calcium' },
      { code: 'phosphorus', fieldPath: 'minerals.phosphorus' },
      { code: 'zinc', fieldPath: 'minerals.zinc' },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      ingredient({
        nutritionProfile: {
          macros: { energyKcal: 100, moisture: 60, crudeProtein: 20 },
          minerals: { calcium: 1.2 },
        },
      }),
    ]);

    const result = await new IngredientReadinessService(
      prisma,
    ).listIngredientReadiness();

    expect(result.items[0]).toMatchObject({
      readinessLevel: 'READY_BASIC',
      coverageRatio: 0.5,
      resolvedNutrients: ['protein', 'calcium'],
      missingNutrients: ['phosphorus', 'zinc'],
    });
  });

  it('classifies PARTIAL when nutrients resolve but energy or moisture is missing', async () => {
    mockStandard([
      { code: 'protein', fieldPath: 'macros.crudeProtein' },
      { code: 'calcium', fieldPath: 'minerals.calcium' },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      ingredient({
        nutritionProfile: {
          macros: { moisture: 60, crudeProtein: 20 },
          minerals: { calcium: 1.2 },
        },
      }),
    ]);

    const result = await new IngredientReadinessService(
      prisma,
    ).listIngredientReadiness();

    expect(result.items[0]).toMatchObject({
      readinessLevel: 'PARTIAL',
      coverageRatio: 1,
      hasEnergy: false,
      hasMoisture: true,
    });
  });

  it('throws NotFoundException when the FEDIAF standard is missing', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue(null);

    await expect(
      new IngredientReadinessService(prisma).listIngredientReadiness(),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts missing nutrients across ingredients in ranking order', async () => {
    mockStandard([
      { code: 'zinc', fieldPath: 'minerals.zinc' },
      { code: 'calcium', fieldPath: 'minerals.calcium' },
      { code: 'protein', fieldPath: 'macros.crudeProtein' },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      ingredient({
        id: 'ingredient-a',
        name: 'A',
        nutritionProfile: {
          macros: { energyKcal: 100, moisture: 60, crudeProtein: 20 },
        },
      }),
      ingredient({
        id: 'ingredient-b',
        name: 'B',
        nutritionProfile: {
          macros: { energyKcal: 100, moisture: 60 },
        },
      }),
      ingredient({
        id: 'ingredient-c',
        name: 'C',
        nutritionProfile: {
          macros: { energyKcal: 100, moisture: 60 },
          minerals: { zinc: 3 },
        },
      }),
    ]);

    const result = await new IngredientReadinessService(
      prisma,
    ).listIngredientReadiness();

    expect(result.missingNutrientRanking).toEqual([
      { nutrientCode: 'calcium', count: 3 },
      { nutrientCode: 'protein', count: 2 },
      { nutrientCode: 'zinc', count: 2 },
    ]);
  });

  function mockStandard(
    nutrients: Array<{
      code: string;
      fieldPath: string | null;
      expression?: unknown;
    }>,
  ) {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      entries: nutrients.map((nutrient) => ({
        nutrient: {
          defaultStandardUnit: 'g',
          expression: null,
          ...nutrient,
        },
      })),
    });
  }

  function ingredient(input: {
    id?: string;
    name?: string;
    type?: string;
    nutritionProfile: Record<string, unknown> | null;
    nutritionFoodMappings?: Array<{ id: string }>;
  }) {
    return {
      id: input.id ?? 'ingredient-1',
      name: input.name ?? 'Ingredient',
      type: input.type ?? 'FOOD',
      nutritionProfile:
        input.nutritionProfile === null
          ? null
          : {
              meta: { rawBasisType: 'PER_100_G' },
              macros: {},
              minerals: {},
              vitamins: {},
              fattyAcids: {},
              aminoAcids: {},
              customItems: [],
              ...input.nutritionProfile,
            },
      nutritionFoodMappings: input.nutritionFoodMappings ?? [],
    };
  }
});
