import {
  buildRecipePresentationMediaPatch,
  parseRecipePresentationMediaBackfillArgs,
  runRecipePresentationMediaBackfill,
} from '../../scripts/backfill-recipe-presentation-media';

const mediaSource = {
  id: 'recipe-source',
  recipeId: 'adult-stage-recipe',
  version: 5,
  name: '燕麦鳕鱼猪肉',
  status: 'PUBLIC',
  seriesId: 'series-oat-cod-pork',
  seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
  coverImageUrl:
    'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-cover.jpg',
  coverTitle: '燕麦鳕鱼猪肉',
  detailImages: [
    'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-detail.jpg',
  ],
  videoUrl: null,
  updatedAt: new Date('2026-06-08T16:22:47.322Z'),
};

const missingCoverRecipe = {
  id: 'recipe-target',
  recipeId: 'adult-stage-recipe',
  version: 6,
  name: '燕麦鳕鱼猪肉 修订',
  status: 'PUBLIC',
  seriesId: 'series-oat-cod-pork',
  seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
  coverImageUrl: null,
  coverTitle: null,
  detailImages: null,
  videoUrl: null,
  updatedAt: new Date('2026-06-09T02:13:13.564Z'),
};

function createPrismaMock(recipes: any[]) {
  return {
    recipe: {
      findMany: jest.fn().mockResolvedValue(recipes),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('recipe presentation media backfill', () => {
  it('parses dry-run and scoped apply arguments', () => {
    expect(
      parseRecipePresentationMediaBackfillArgs([
        '--apply',
        '--series-id',
        'series-oat-cod-pork',
      ]),
    ).toEqual({
      apply: true,
      seriesId: 'series-oat-cod-pork',
    });
  });

  it('builds a patch without overwriting existing target media fields', () => {
    expect(
      buildRecipePresentationMediaPatch(
        {
          ...missingCoverRecipe,
          coverTitle: '保留标题',
          detailImages: [],
        },
        mediaSource,
      ),
    ).toEqual({
      coverImageUrl:
        'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-cover.jpg',
      coverTitle: undefined,
      detailImages: [
        'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-detail.jpg',
      ],
      videoUrl: undefined,
    });
  });

  it('keeps dry-run read-only while reporting eligible recipes', async () => {
    const prisma = createPrismaMock([mediaSource, missingCoverRecipe]);
    const messages: string[] = [];

    const counters = await runRecipePresentationMediaBackfill({
      prisma,
      apply: false,
      seriesId: 'series-oat-cod-pork',
      logger: {
        info: (message) => messages.push(message),
        error: (message) => messages.push(`ERROR ${message}`),
      },
    });

    expect(counters).toEqual({
      scanned: 2,
      eligible: 1,
      applied: 0,
      skipped: 1,
      blocked: 0,
      errors: 0,
    });
    expect(prisma.recipe.update).not.toHaveBeenCalled();
    expect(messages.join('\n')).toContain('[DRY-RUN]');
  });

  it('updates missing-cover recipes from a same-series source when apply is enabled', async () => {
    const prisma = createPrismaMock([mediaSource, missingCoverRecipe]);

    const counters = await runRecipePresentationMediaBackfill({
      prisma,
      apply: true,
      seriesId: 'series-oat-cod-pork',
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
    });

    expect(counters.applied).toBe(1);
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: 'recipe-target' },
      data: {
        coverImageUrl:
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-cover.jpg',
        coverTitle: '燕麦鳕鱼猪肉',
        detailImages: [
          'https://img.sevenkitchen.cloud/recipes/oat-cod-pork-detail.jpg',
        ],
      },
    });
  });
});
