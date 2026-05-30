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
    designRecipe: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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

  it('groups distinct legacy recipe ids by normalized series name', () => {
    const plan = buildRecipeSeriesBackfillPlan([
      {
        recipeId: 'beef-puppy',
        name: '牛肉南瓜鲜食（幼犬）',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['PUPPY'],
      },
      {
        recipeId: 'beef-adult',
        name: '牛肉南瓜鲜食 - ADULT',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['ADULT'],
      },
    ]);

    expect(plan.seriesToCreate).toHaveLength(1);
    expect(plan.seriesToCreate[0].name).toBe('牛肉南瓜鲜食');
    expect(plan.recipeUpdates).toHaveLength(2);
    expect(
      new Set(plan.recipeUpdates.map((update) => update.seriesId)).size,
    ).toBe(1);
  });

  it('uses case-insensitive normalized names when grouping legacy families', () => {
    const plan = buildRecipeSeriesBackfillPlan([
      {
        recipeId: 'english-puppy',
        name: 'Beef Bowl PUPPY',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['PUPPY'],
      },
      {
        recipeId: 'english-adult',
        name: 'beef bowl - ADULT',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['ADULT'],
      },
    ]);

    expect(plan.seriesToCreate).toHaveLength(1);
    expect(plan.recipeUpdates).toHaveLength(2);
    expect(
      new Set(plan.recipeUpdates.map((update) => update.seriesId)).size,
    ).toBe(1);
  });

  it('groups legacy Chinese pregnancy and lactation suffixes into one reproduction family', () => {
    const plan = buildRecipeSeriesBackfillPlan([
      {
        recipeId: 'repro-pregnancy',
        name: '牛肉南瓜鲜食 妊娠期',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['PREGNANCY'],
      },
      {
        recipeId: 'repro-lactation',
        name: '牛肉南瓜鲜食 哺乳期',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['LACTATION'],
      },
    ]);

    expect(plan.seriesToCreate).toHaveLength(1);
    expect(plan.seriesToCreate[0].name).toBe('牛肉南瓜鲜食');
    expect(
      new Set(plan.recipeUpdates.map((update) => update.seriesId)).size,
    ).toBe(1);
  });

  it('does not reuse non-public same-name recipes as backfill series candidates', () => {
    const plan = buildRecipeSeriesBackfillPlan([
      {
        recipeId: 'private-adult',
        name: '牛肉南瓜鲜食 成犬',
        version: 1,
        status: 'DRAFT',
        seriesId: 'private-series',
        applicableLifeStages: ['ADULT'],
      },
      {
        recipeId: 'public-puppy',
        name: '牛肉南瓜鲜食 幼犬',
        version: 1,
        status: 'PUBLIC',
        seriesId: null,
        applicableLifeStages: ['PUPPY'],
      },
    ]);

    expect(plan.seriesToCreate).toHaveLength(1);
    expect(plan.recipeUpdates).toEqual([
      {
        recipeId: 'public-puppy',
        version: 1,
        seriesId: plan.seriesToCreate[0].id,
        seriesLifeStage: 'PUPPY_14_WEEKS_PLUS',
      },
    ]);
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

  it('reuses an existing normalized-name series for a new distinct recipe id', () => {
    const plan = buildRecipeSeriesBackfillPlan([
      {
        recipeId: 'beef-adult',
        name: '牛肉南瓜鲜食（普通成年犬）',
        version: 1,
        seriesId: 'existing-series',
        applicableLifeStages: ['ADULT'],
      },
      {
        recipeId: 'beef-reproduction',
        name: '牛肉南瓜鲜食 - REPRODUCTION',
        version: 1,
        seriesId: null,
        applicableLifeStages: ['PREGNANCY'],
      },
    ]);

    expect(plan.seriesToCreate).toHaveLength(0);
    expect(plan.recipeUpdates).toEqual([
      {
        recipeId: 'beef-reproduction',
        version: 1,
        seriesId: 'existing-series',
        seriesLifeStage: 'REPRODUCTION',
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
      where: { status: 'PUBLIC', seriesId: null },
      select: { recipeId: true },
      orderBy: [{ recipeId: 'asc' }],
    });
    expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          status: 'PUBLIC',
          OR: [{ recipeId: { in: ['recipe-a'] } }, { seriesId: { not: null } }],
        },
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
      where: { status: 'PUBLIC', seriesId: null },
      select: { recipeId: true },
      orderBy: [{ recipeId: 'asc' }],
    });
    expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          status: 'PUBLIC',
          OR: [{ recipeId: { in: ['recipe-a'] } }, { seriesId: { not: null } }],
        },
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

  it('loads migrated series candidates so distinct recipe ids can reuse existing normalized series', async () => {
    const prisma = createPrismaMock([]);
    prisma.recipe.findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          recipeId: 'beef-reproduction',
        },
      ])
      .mockResolvedValueOnce([
        {
          recipeId: 'beef-adult',
          name: '牛肉南瓜鲜食（成犬）',
          version: 1,
          seriesId: 'existing-series',
          applicableLifeStages: ['ADULT'],
          nutritionDetailedData: null,
        },
        {
          recipeId: 'beef-reproduction',
          name: '牛肉南瓜鲜食 - REPRODUCTION',
          version: 1,
          seriesId: null,
          applicableLifeStages: ['PREGNANCY'],
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

    expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          status: 'PUBLIC',
          OR: [
            { recipeId: { in: ['beef-reproduction'] } },
            { seriesId: { not: null } },
          ],
        },
      }),
    );
    expect(plan.seriesToCreate).toHaveLength(0);
    expect(plan.recipeUpdates).toEqual([
      {
        recipeId: 'beef-reproduction',
        version: 1,
        seriesId: 'existing-series',
        seriesLifeStage: 'REPRODUCTION',
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

  it('syncs published design recipes when applying recipe series updates', async () => {
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

    const plan = await runRecipeSeriesBackfill({
      prisma,
      apply: true,
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
      disconnect: false,
    });

    expect(prisma.designRecipe.updateMany).toHaveBeenCalledWith({
      where: {
        publishedRecipeId: 'recipe-a',
        publishedRecipeVersion: 1,
        seriesId: null,
      },
      data: {
        seriesId: plan.seriesToCreate[0].id,
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      },
    });
  });
});
