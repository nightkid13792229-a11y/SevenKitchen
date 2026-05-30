import {
  buildRecipeSeriesBackfillPlan,
  inferSeriesLifeStageFromRecipe,
  runRecipeSeriesBackfill,
} from '../../scripts/backfill-recipe-series';

function createPrismaMock(recipes: any[]) {
  const prisma: any = {
    recipe: {
      findMany: jest.fn().mockResolvedValue(recipes),
      update: jest.fn().mockResolvedValue({}),
    },
    recipeSeries: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
  return prisma;
}

describe('recipe series backfill', () => {
  it('infers adult fallback when legacy recipe has no explicit stage', () => {
    expect(
      inferSeriesLifeStageFromRecipe({
        applicableLifeStages: [],
        nutritionDetailedData: null,
      }),
    ).toBe('HIGH_ACTIVITY_ADULT');
  });

  it('creates one series per legacy recipe family', () => {
    const plan = buildRecipeSeriesBackfillPlan([
      {
        recipeId: 'recipe-a',
        name: '牛肉南瓜鲜食',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      },
      {
        recipeId: 'recipe-a',
        name: '牛肉南瓜鲜食',
        version: 2,
        seriesId: null,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      },
    ]);

    expect(plan.seriesToCreate).toHaveLength(1);
    expect(plan.recipeUpdates).toHaveLength(2);
    expect(plan.recipeUpdates[0]).toEqual(
      expect.objectContaining({
        recipeId: 'recipe-a',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      }),
    );
  });

  it('normalizes stringified applicable stages and uses product stage order', () => {
    expect(
      inferSeriesLifeStageFromRecipe({
        applicableLifeStages: JSON.stringify([
          'LOW_ACTIVITY_ADULT_OR_SENIOR',
          'PUPPY_14_WEEKS_PLUS',
        ]),
        nutritionDetailedData: null,
      }),
    ).toBe('PUPPY_14_WEEKS_PLUS');
  });

  it('keeps dry-run read-only and prints the planned summary', async () => {
    const prisma = createPrismaMock([
      {
        recipeId: 'recipe-a',
        name: '牛肉南瓜鲜食',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
        nutritionDetailedData: null,
      },
    ]);
    const messages: string[] = [];

    const plan = await runRecipeSeriesBackfill({
      prisma,
      apply: false,
      logger: {
        info: (message) => messages.push(message),
        error: (message) => messages.push(`ERROR ${message}`),
      },
      disconnect: false,
    });

    expect(plan.seriesToCreate).toHaveLength(1);
    expect(plan.recipeUpdates).toHaveLength(1);
    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seriesId: null },
        orderBy: [{ recipeId: 'asc' }, { version: 'asc' }],
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(messages.join('\n')).toContain('"apply": false');
  });

  it('applies series creates and recipe updates by recipeId/version', async () => {
    const prisma = createPrismaMock([
      {
        recipeId: 'recipe-a',
        name: '牛肉南瓜鲜食',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
        nutritionDetailedData: null,
      },
      {
        recipeId: 'recipe-a',
        name: '牛肉南瓜鲜食',
        version: 2,
        seriesId: null,
        applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        nutritionDetailedData: null,
      },
    ]);

    const plan = await runRecipeSeriesBackfill({
      prisma,
      apply: true,
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
      disconnect: false,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.recipeSeries.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: plan.seriesToCreate[0].id,
        name: '牛肉南瓜鲜食',
        createdBy: 'recipe-series-backfill',
      }),
    });
    expect(prisma.recipe.update).toHaveBeenNthCalledWith(1, {
      where: {
        recipeId_version: {
          recipeId: 'recipe-a',
          version: 1,
        },
      },
      data: {
        seriesId: plan.seriesToCreate[0].id,
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      },
    });
    expect(prisma.recipe.update).toHaveBeenNthCalledWith(2, {
      where: {
        recipeId_version: {
          recipeId: 'recipe-a',
          version: 2,
        },
      },
      data: {
        seriesId: plan.seriesToCreate[0].id,
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      },
    });
  });
});
