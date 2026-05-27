import {
  buildLatestRecipeDesignerBackfillPlan,
  parseLatestRecipeDesignerBackfillArgs,
  runLatestRecipeDesignerBackfill,
  selectLatestRecipeVersions,
} from '../../scripts/backfill-latest-recipes-to-designer';

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  ingredientId: 'ingredient-1',
  nutritionFoodId: 'food-1',
  ingredient: {
    id: 'ingredient-1',
    name: '鸡胸肉',
    type: 'FOOD',
    brand: null,
    productModel: null,
    unitDisplayLabel: null,
    nutritionProfile: {
      meta: { rawBasisType: 'PER_100_G' },
      macros: { energyKcal: 120 },
      minerals: {},
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    },
    nutritionFoodMappings: [],
  },
  preparationMethod: '蒸熟',
  ratioPercent: 100,
  nutrientTargetKey: null,
  nutrientTargetValue: null,
  supplementTargets: null,
  sortOrder: 0,
  exampleWeight: 120,
  ...overrides,
});

const recipe = (overrides: Record<string, unknown> = {}) => ({
  id: 'recipe-row-1',
  recipeId: 'recipe-series-1',
  version: 1,
  name: '鸡肉成犬维护',
  status: 'PUBLIC',
  energyDensityKcalPerKg: 1320,
  applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
  targetHealthTags: ['skin'],
  description: '稳定生产食谱',
  nutritionDetailedData: { source: 'legacy-report' },
  nutritionStandard: 'FEDIAF_2025',
  updatedAt: new Date('2026-05-20T00:00:00.000Z'),
  items: [item()],
  ...overrides,
});

function createPrismaMock(recipes: any[], existingDesignRecipes: any[] = []) {
  const prisma: any = {
    recipe: {
      findMany: jest.fn().mockResolvedValue(recipes),
    },
    designRecipe: {
      findMany: jest.fn().mockResolvedValue(existingDesignRecipes),
      aggregate: jest.fn().mockResolvedValue({ _max: { version: null } }),
      create: jest.fn().mockResolvedValue({ id: 'design-created-1' }),
    },
    designRecipePublishSnapshot: {
      create: jest.fn().mockResolvedValue({ id: 'snapshot-1' }),
    },
    nutritionFood: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'food-created-from-legacy' }),
    },
    nutritionFoodMapping: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'mapping-created' }),
    },
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
  };
  return prisma;
}

describe('latest recipe designer backfill', () => {
  it('selects only the latest version for each business recipe id', () => {
    const recipes = [
      recipe({ id: 'old-a', recipeId: 'recipe-a', version: 1 }),
      recipe({ id: 'new-a', recipeId: 'recipe-a', version: 3 }),
      recipe({ id: 'mid-a', recipeId: 'recipe-a', version: 2 }),
      recipe({ id: 'only-b', recipeId: 'recipe-b', version: 1 }),
    ];

    expect(selectLatestRecipeVersions(recipes).map((entry) => entry.id)).toEqual([
      'new-a',
      'only-b',
    ]);
  });

  it('builds a blocking plan for recipes that cannot become designer drafts', () => {
    const plan = buildLatestRecipeDesignerBackfillPlan(
      recipe({
        items: [
          item({
            id: 'missing-food',
            nutritionFoodId: null,
            ingredient: {
              id: 'ingredient-empty',
              name: '空营养原料',
              type: 'FOOD',
              nutritionProfile: null,
              nutritionFoodMappings: [],
            },
          }),
          item({
            id: 'missing-weight',
            exampleWeight: null,
            ingredient: {
              id: 'ingredient-food',
              name: '鸡胸肉',
              type: 'FOOD',
              nutritionProfile: {},
              nutritionFoodMappings: [],
            },
          }),
        ],
      }),
      null,
    );

    expect(plan.action).toBe('block');
    expect(plan.issues).toEqual([
      'item missing-food 缺少 nutritionFoodId 且原料没有可回填营养档案',
      'item missing-weight 缺少有效 exampleWeight',
    ]);
  });

  it('allows legacy recipe items when nutrition food ids can be backfilled from ingredient profiles', () => {
    const plan = buildLatestRecipeDesignerBackfillPlan(
      recipe({
        items: [
          item({
            id: 'legacy-item',
            nutritionFoodId: null,
            exampleWeight: 88,
          }),
        ],
      }),
      null,
    );

    expect(plan.action).toBe('create');
  });

  it('keeps dry-run read-only and reports eligible latest public recipes', async () => {
    const prisma = createPrismaMock([
      recipe({ id: 'old-a', recipeId: 'recipe-a', version: 1 }),
      recipe({ id: 'new-a', recipeId: 'recipe-a', version: 2 }),
      recipe({ id: 'only-b', recipeId: 'recipe-b', version: 1 }),
    ]);
    const messages: string[] = [];

    const counters = await runLatestRecipeDesignerBackfill({
      prisma,
      apply: false,
      logger: {
        info: (message) => messages.push(message),
        error: (message) => messages.push(`ERROR ${message}`),
      },
    });

    expect(counters).toEqual({
      scanned: 2,
      eligible: 2,
      applied: 0,
      skipped: 0,
      blocked: 0,
      errors: 0,
    });
    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isCustomRecipe: false,
          status: { in: ['PUBLIC'] },
        }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(messages.join('\n')).toContain('Dry run');
  });

  it('applies eligible latest recipes as published designer source drafts', async () => {
    const prisma = createPrismaMock([
      recipe({
        id: 'recipe-row-v4',
        recipeId: 'recipe-series-1',
        version: 4,
        applicableLifeStages: ['PUPPY_14_WEEKS_PLUS'],
        items: [
          item({
            id: 'item-main',
            ingredientId: 'ingredient-main',
            nutritionFoodId: null,
            exampleWeight: 200,
            ratioPercent: 80,
            sortOrder: 2,
          }),
          item({
            id: 'item-supplement-target',
            ingredientId: 'ingredient-supplement',
            nutritionFoodId: null,
            exampleWeight: null,
            ratioPercent: null,
            nutrientTargetKey: '锌',
            nutrientTargetValue: 20,
            sortOrder: 3,
            ingredient: {
              id: 'ingredient-supplement',
              name: '葡萄糖酸锌片',
              type: 'SUPPLEMENT',
              brand: null,
              productModel: null,
              unitDisplayLabel: '片',
              nutritionProfile: {
                meta: { rawBasisType: 'PER_SERVING' },
                macros: {},
                minerals: { zinc: 20 },
                vitamins: {},
                fattyAcids: {},
                aminoAcids: {},
                customItems: [],
              },
              nutritionFoodMappings: [],
            },
          }),
        ],
      }),
    ]);
    prisma.designRecipe.aggregate.mockResolvedValue({ _max: { version: 6 } });

    const counters = await runLatestRecipeDesignerBackfill({
      prisma,
      apply: true,
      logger: { info: jest.fn(), error: jest.fn() },
    });

    expect(counters.applied).toBe(1);
    expect(prisma.nutritionFood.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dataSource: 'LEGACY_INGREDIENT_PROFILE',
        status: 'VERIFIED',
        nutritionData: expect.objectContaining({
          meta: expect.any(Object),
        }),
      }),
      select: { id: true },
    });
    expect(prisma.nutritionFoodMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nutritionFoodId: 'food-created-from-legacy',
        isPrimary: true,
      }),
    });
    expect(prisma.designRecipe.aggregate).toHaveBeenCalledWith({
      where: { name: '鸡肉成犬维护' },
      _max: { version: true },
    });
    expect(prisma.designRecipe.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '鸡肉成犬维护',
        version: 7,
        status: 'PUBLISHED',
        fediafDogScenario: 'LATE_GROWTH',
        energyDensityKcalPerKg: 1320,
        totalWeightG: 200,
        publishedRecipeId: 'recipe-series-1',
        publishedRecipeVersion: 4,
        createdBy: 'recipe-designer-backfill',
        items: {
          create: [
            expect.objectContaining({
              ingredientId: 'ingredient-main',
              nutritionFoodId: 'food-created-from-legacy',
              weightG: 200,
              ratioPercent: 80,
              sortOrder: 2,
              includeInAssessment: true,
            }),
            expect.objectContaining({
              ingredientId: 'ingredient-supplement',
              nutritionFoodId: 'food-created-from-legacy',
              weightG: 0,
              includeInAssessment: false,
              nutrientTargetKey: '锌',
              nutrientTargetValue: 20,
            }),
          ],
        },
      }),
      select: { id: true },
    });
    expect(prisma.designRecipePublishSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        designRecipeId: 'design-created-1',
        recipeId: 'recipe-series-1',
        recipeVersion: 4,
        publishedBy: 'recipe-designer-backfill',
      }),
    });
  });

  it('skips latest recipes that already have a published designer source draft', async () => {
    const prisma = createPrismaMock(
      [recipe({ recipeId: 'recipe-series-1', version: 3 })],
      [
        {
          id: 'design-existing',
          publishedRecipeId: 'recipe-series-1',
          publishedRecipeVersion: 3,
        },
      ],
    );

    const counters = await runLatestRecipeDesignerBackfill({
      prisma,
      apply: true,
      logger: { info: jest.fn(), error: jest.fn() },
    });

    expect(counters.skipped).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.designRecipe.create).not.toHaveBeenCalled();
  });

  it('parses guarded CLI flags', () => {
    expect(
      parseLatestRecipeDesignerBackfillArgs([
        '--apply',
        '--recipe-id',
        'recipe-series-1',
        '--include-draft-status',
      ]),
    ).toEqual({
      apply: true,
      recipeId: 'recipe-series-1',
      includeDraftStatus: true,
    });
  });
});
