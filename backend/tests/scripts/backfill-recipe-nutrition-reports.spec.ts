import {
  hasStructuredNutritionReport,
  parseRecipeNutritionReportBackfillArgs,
  runRecipeNutritionReportBackfill,
} from '../../scripts/backfill-recipe-nutrition-reports';

const logger = () => {
  const messages: string[] = [];
  return {
    messages,
    logger: {
      info: (message: string) => messages.push(message),
      error: (message: string) => messages.push(`ERROR ${message}`),
    },
  };
};

const recipe = (overrides: Record<string, unknown> = {}) => ({
  id: 'recipe-row-1',
  recipeId: 'recipe-business-1',
  version: 5,
  name: '燕麦鳕鱼猪肉',
  status: 'PUBLIC',
  isCustomRecipe: false,
  nutritionStandard: 'FEDIAF_2021',
  nutritionDetailedData: {
    protein_dm_pct: 48.45,
  },
  ...overrides,
});

const designRecipe = (overrides: Record<string, unknown> = {}) => ({
  id: 'design-1',
  name: '燕麦鳕鱼猪肉',
  status: 'PUBLISHED',
  publishedRecipeId: 'recipe-business-1',
  publishedRecipeVersion: 5,
  seriesId: 'series-1',
  seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
  fediafDogScenario: 'ADULT_MER_95',
  items: [
    {
      id: 'design-item-1',
      nutritionFoodId: 'food-1',
      weightG: 100,
      includeInAssessment: true,
      nutritionFood: {
        id: 'food-1',
        name: '鳕鱼',
        nutritionData: {
          macros: {
            energyKcal: 80,
            moisture: 80,
            crudeProtein: 18,
            crudeFat: 1,
          },
        },
      },
    },
  ],
  ...overrides,
});

function createPrismaMock({
  recipes = [recipe()],
  designRecipes = [designRecipe()],
}: {
  recipes?: any[];
  designRecipes?: any[];
} = {}) {
  return {
    recipe: {
      findMany: jest.fn().mockResolvedValue(recipes),
      update: jest.fn().mockResolvedValue({ id: 'recipe-row-1' }),
    },
    designRecipe: {
      findMany: jest.fn().mockResolvedValue(designRecipes),
    },
  } as any;
}

const generatedNutritionData = {
  source: 'SETAR_RECIPE_DESIGNER',
  schemaVersion: 1,
  standard: 'FEDIAF_2025',
  scenario: 'ADULT_MER_95',
  generatedAt: '2026-06-08T00:00:00.000Z',
  summary: {
    protein_dm_pct: 42,
  },
  report: {
    ingredientRows: [{ ingredientName: '鳕鱼', amountLabel: '100g' }],
    macroRows: [{ key: 'crudeProtein', name: '蛋白质' }],
    energyDensityRows: [{ label: '每公斤配方', value: '1500 kcal/kg' }],
    nutrientSections: {
      minerals: {
        key: 'minerals',
        title: '微量元素',
        dryMatterHeader: '/100gDM',
        rows: [{ key: 'calcium', name: '钙' }],
      },
    },
  },
};

describe('recipe nutrition report backfill', () => {
  it('detects structured nutrition report data', () => {
    expect(hasStructuredNutritionReport(null)).toBe(false);
    expect(hasStructuredNutritionReport({ report: { macroRows: [] } })).toBe(false);
    expect(
      hasStructuredNutritionReport({
        report: {
          macroRows: [],
          nutrientSections: {
            minerals: { rows: [{ name: '钙' }] },
          },
        },
      }),
    ).toBe(true);
    expect(
      hasStructuredNutritionReport({
        report: {
          macroRows: [{ name: '蛋白质' }],
        },
      }),
    ).toBe(true);
  });

  it('keeps dry-run read-only while reporting missing public recipe versions', async () => {
    const prisma = createPrismaMock();
    const reportBuilder = {
      buildNutritionDetailedData: jest.fn().mockResolvedValue(generatedNutritionData),
    };
    const output = logger();

    const counters = await runRecipeNutritionReportBackfill({
      prisma,
      reportBuilder,
      apply: false,
      logger: output.logger,
    });

    expect(counters).toEqual({
      scanned: 1,
      alreadyComplete: 0,
      eligible: 1,
      applied: 0,
      blocked: 0,
      errors: 0,
    });
    expect(reportBuilder.buildNutritionDetailedData).not.toHaveBeenCalled();
    expect(prisma.recipe.update).not.toHaveBeenCalled();
    expect(output.messages.join('\n')).toContain('Dry run');
    expect(output.messages.join('\n')).toContain('燕麦鳕鱼猪肉');
  });

  it('applies generated Setar report data only to recipes missing reports', async () => {
    const prisma = createPrismaMock({
      recipes: [
        recipe({ id: 'missing-report', recipeId: 'recipe-missing' }),
        recipe({
          id: 'complete-report',
          recipeId: 'recipe-complete',
          nutritionStandard: 'FEDIAF_2025',
          nutritionDetailedData: {
            report: {
              macroRows: [{ name: '蛋白质' }],
            },
          },
        }),
      ],
      designRecipes: [
        designRecipe({
          id: 'design-missing',
          publishedRecipeId: 'recipe-missing',
          publishedRecipeVersion: 5,
        }),
      ],
    });
    const reportBuilder = {
      buildNutritionDetailedData: jest.fn().mockResolvedValue(generatedNutritionData),
    };

    const counters = await runRecipeNutritionReportBackfill({
      prisma,
      reportBuilder,
      apply: true,
      logger: logger().logger,
    });

    expect(counters).toEqual({
      scanned: 2,
      alreadyComplete: 1,
      eligible: 1,
      applied: 1,
      blocked: 0,
      errors: 0,
    });
    expect(reportBuilder.buildNutritionDetailedData).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'design-missing' }),
    );
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: 'missing-report' },
      data: {
        nutritionDetailedData: generatedNutritionData,
        nutritionStandard: 'FEDIAF_2025',
      },
    });
  });

  it('blocks recipes missing an exact published design source', async () => {
    const prisma = createPrismaMock({
      recipes: [recipe()],
      designRecipes: [],
    });
    const output = logger();

    const counters = await runRecipeNutritionReportBackfill({
      prisma,
      reportBuilder: {
        buildNutritionDetailedData: jest.fn(),
      },
      apply: true,
      logger: output.logger,
    });

    expect(counters).toEqual({
      scanned: 1,
      alreadyComplete: 0,
      eligible: 0,
      applied: 0,
      blocked: 1,
      errors: 0,
    });
    expect(prisma.recipe.update).not.toHaveBeenCalled();
    expect(output.messages.join('\n')).toContain('missing exact published design source');
  });

  it('parses dry-run and apply arguments', () => {
    expect(parseRecipeNutritionReportBackfillArgs([])).toEqual({
      apply: false,
      recipeId: null,
    });
    expect(
      parseRecipeNutritionReportBackfillArgs([
        '--apply',
        '--recipe-id',
        'recipe-business-1',
      ]),
    ).toEqual({
      apply: true,
      recipeId: 'recipe-business-1',
    });
  });
});
