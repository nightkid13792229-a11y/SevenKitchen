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

  it('reuses an existing family series for remaining null-series recipe versions', () => {
    const plan = buildRecipeSeriesBackfillPlan([
      {
        recipeId: 'recipe-a',
        name: '牛肉南瓜鲜食',
        version: 1,
        seriesId: 'existing-series',
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      },
      {
        recipeId: 'recipe-a',
        name: '牛肉南瓜鲜食',
        version: 2,
        seriesId: null,
        applicableLifeStages: ['SENIOR'],
      },
    ]);

    expect(plan.seriesToCreate).toHaveLength(0);
    expect(plan.recipeUpdates).toEqual([
      {
        recipeId: 'recipe-a',
        version: 2,
        seriesId: 'existing-series',
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      },
    ]);
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

  it.each([
    ['PUPPY', 'PUPPY_14_WEEKS_PLUS'],
    ['SENIOR', 'LOW_ACTIVITY_ADULT_OR_SENIOR'],
    ['PREGNANCY', 'REPRODUCTION'],
    ['LACTATION', 'REPRODUCTION'],
    ['ADULT', 'HIGH_ACTIVITY_ADULT'],
  ] as const)('maps legacy life stage %s to %s', (legacyStage, expected) => {
    expect(
      inferSeriesLifeStageFromRecipe({
        applicableLifeStages: [legacyStage],
        nutritionDetailedData: null,
      }),
    ).toBe(expected);
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
    expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(1, {
      where: { seriesId: null },
      select: { recipeId: true },
      orderBy: [{ recipeId: 'asc' }],
    });
    expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { recipeId: { in: ['recipe-a'] } },
        orderBy: [{ recipeId: 'asc' }, { version: 'asc' }],
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(messages.join('\n')).toContain('"apply": false');
  });

  it('loads full recipe families for recipe ids with missing series metadata', async () => {
    const prisma = createPrismaMock([]);
    prisma.recipe.findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          recipeId: 'recipe-a',
        },
      ])
      .mockResolvedValueOnce([
        {
          recipeId: 'recipe-a',
          name: '牛肉南瓜鲜食',
          version: 1,
          seriesId: 'existing-series',
          applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
          nutritionDetailedData: null,
        },
        {
          recipeId: 'recipe-a',
          name: '牛肉南瓜鲜食',
          version: 2,
          seriesId: null,
          applicableLifeStages: ['PUPPY'],
          nutritionDetailedData: null,
        },
      ]);

    const plan = await runRecipeSeriesBackfill({
      prisma,
      apply: false,
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
      disconnect: false,
    });

    expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(1, {
      where: { seriesId: null },
      select: { recipeId: true },
      orderBy: [{ recipeId: 'asc' }],
    });
    expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { recipeId: { in: ['recipe-a'] } },
        orderBy: [{ recipeId: 'asc' }, { version: 'asc' }],
      }),
    );
    expect(plan.seriesToCreate).toHaveLength(0);
    expect(plan.recipeUpdates).toEqual([
      {
        recipeId: 'recipe-a',
        version: 2,
        seriesId: 'existing-series',
        seriesLifeStage: 'PUPPY_14_WEEKS_PLUS',
      },
    ]);
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
