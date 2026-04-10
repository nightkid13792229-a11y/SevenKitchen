import {
  buildFavoriteRepairPlan,
  type FavoriteFamilyVersion,
  type FavoriteRecord,
} from 'src/support/favorite-recipe-repair';

function makeVersion(
  overrides: Partial<FavoriteFamilyVersion> = {},
): FavoriteFamilyVersion {
  return {
    id: 'recipe-v1',
    businessRecipeId: 'recipe-business',
    version: 1,
    status: 'PUBLIC',
    ...overrides,
  };
}

function makeFavorite(
  overrides: Partial<FavoriteRecord> = {},
): FavoriteRecord {
  return {
    id: 'favorite-1',
    userId: 'user-1',
    recipeId: 'recipe-v1',
    createdAt: new Date('2026-04-10T08:00:00.000Z'),
    ...overrides,
  };
}

describe('favorite recipe repair plan', () => {
  it('keeps already-correct favorites on the target version', () => {
    const plan = buildFavoriteRepairPlan(
      [
        makeVersion({
          id: 'recipe-v2',
          version: 2,
          status: 'PUBLIC',
        }),
        makeVersion({
          id: 'recipe-v1',
          version: 1,
          status: 'PUBLIC',
        }),
      ],
      [
        makeFavorite({
          id: 'favorite-target',
          recipeId: 'recipe-v2',
        }),
      ],
    );

    expect(plan.targetRecipeId).toBe('recipe-v2');
    expect(plan.moveOperations).toHaveLength(0);
    expect(plan.deleteFavoriteIds).toHaveLength(0);
    expect(plan.expectedCounts).toEqual({
      'recipe-v2': 1,
      'recipe-v1': 0,
    });
  });

  it('moves legacy favorites to the latest PUBLIC version', () => {
    const plan = buildFavoriteRepairPlan(
      [
        makeVersion({
          id: 'recipe-v3',
          version: 3,
          status: 'DRAFT',
        }),
        makeVersion({
          id: 'recipe-v2',
          version: 2,
          status: 'PUBLIC',
        }),
        makeVersion({
          id: 'recipe-v1',
          version: 1,
          status: 'PUBLIC',
        }),
      ],
      [
        makeFavorite({
          id: 'favorite-legacy',
          recipeId: 'recipe-v1',
        }),
      ],
    );

    expect(plan.targetRecipeId).toBe('recipe-v2');
    expect(plan.moveOperations).toEqual([
      {
        favoriteId: 'favorite-legacy',
        toRecipeId: 'recipe-v2',
      },
    ]);
    expect(plan.deleteFavoriteIds).toHaveLength(0);
    expect(plan.expectedCounts).toEqual({
      'recipe-v3': 0,
      'recipe-v2': 1,
      'recipe-v1': 0,
    });
  });

  it('deduplicates favorites per user while preserving the earliest favorite record', () => {
    const plan = buildFavoriteRepairPlan(
      [
        makeVersion({
          id: 'recipe-v2',
          version: 2,
          status: 'PUBLIC',
        }),
        makeVersion({
          id: 'recipe-v1',
          version: 1,
          status: 'PUBLIC',
        }),
      ],
      [
        makeFavorite({
          id: 'favorite-earliest',
          recipeId: 'recipe-v1',
          createdAt: new Date('2026-04-10T08:00:00.000Z'),
        }),
        makeFavorite({
          id: 'favorite-later',
          recipeId: 'recipe-v2',
          createdAt: new Date('2026-04-10T09:00:00.000Z'),
        }),
        makeFavorite({
          id: 'favorite-other-user',
          userId: 'user-2',
          recipeId: 'recipe-v2',
          createdAt: new Date('2026-04-10T10:00:00.000Z'),
        }),
      ],
    );

    expect(plan.moveOperations).toEqual([
      {
        favoriteId: 'favorite-earliest',
        toRecipeId: 'recipe-v2',
      },
    ]);
    expect(plan.deleteFavoriteIds).toEqual(['favorite-later']);
    expect(plan.expectedCounts).toEqual({
      'recipe-v2': 2,
      'recipe-v1': 0,
    });
  });

  it('falls back to the latest overall version when no PUBLIC version exists', () => {
    const plan = buildFavoriteRepairPlan(
      [
        makeVersion({
          id: 'recipe-v3',
          version: 3,
          status: 'DRAFT',
        }),
        makeVersion({
          id: 'recipe-v2',
          version: 2,
          status: 'ARCHIVED',
        }),
      ],
      [
        makeFavorite({
          id: 'favorite-legacy',
          recipeId: 'recipe-v2',
        }),
      ],
    );

    expect(plan.targetRecipeId).toBe('recipe-v3');
    expect(plan.moveOperations).toEqual([
      {
        favoriteId: 'favorite-legacy',
        toRecipeId: 'recipe-v3',
      },
    ]);
    expect(plan.expectedCounts).toEqual({
      'recipe-v3': 1,
      'recipe-v2': 0,
    });
  });
});
