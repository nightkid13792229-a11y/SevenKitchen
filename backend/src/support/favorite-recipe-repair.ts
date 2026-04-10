export interface FavoriteFamilyVersion {
  id: string;
  businessRecipeId: string;
  version: number;
  status: string;
}

export interface FavoriteRecord {
  id: string;
  userId: string;
  recipeId: string;
  createdAt: Date;
}

export interface FavoriteMoveOperation {
  favoriteId: string;
  toRecipeId: string;
}

export interface FavoriteRepairPlan {
  targetRecipeId: string;
  deleteFavoriteIds: string[];
  moveOperations: FavoriteMoveOperation[];
  expectedCounts: Record<string, number>;
}

export function buildFavoriteRepairPlan(
  versions: FavoriteFamilyVersion[],
  favorites: FavoriteRecord[],
): FavoriteRepairPlan {
  if (versions.length === 0) {
    throw new Error('versions must not be empty');
  }

  const sortedVersions = [...versions].sort((left, right) => right.version - left.version);
  const targetRecipeId =
    sortedVersions.find((version) => version.status === 'PUBLIC')?.id ??
    sortedVersions[0].id;

  const groupedFavorites = new Map<string, FavoriteRecord[]>();
  for (const favorite of favorites) {
    const existing = groupedFavorites.get(favorite.userId) ?? [];
    existing.push(favorite);
    groupedFavorites.set(favorite.userId, existing);
  }

  const deleteFavoriteIds: string[] = [];
  const moveOperations: FavoriteMoveOperation[] = [];
  const expectedCounts: Record<string, number> = Object.fromEntries(
    sortedVersions.map((version) => [version.id, 0]),
  );

  for (const userFavorites of groupedFavorites.values()) {
    const sortedFavorites = [...userFavorites].sort((left, right) => {
      const timeDiff = left.createdAt.getTime() - right.createdAt.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return left.id.localeCompare(right.id);
    });

    const canonicalFavorite = sortedFavorites[0];
    const duplicates = sortedFavorites.slice(1);

    if (canonicalFavorite.recipeId !== targetRecipeId) {
      moveOperations.push({
        favoriteId: canonicalFavorite.id,
        toRecipeId: targetRecipeId,
      });
    }

    deleteFavoriteIds.push(...duplicates.map((favorite) => favorite.id));
    expectedCounts[targetRecipeId] += 1;
  }

  return {
    targetRecipeId,
    deleteFavoriteIds,
    moveOperations,
    expectedCounts,
  };
}
