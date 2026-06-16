import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPendingPublishStages,
  getRecipePublishRowKey,
} from '../src/utils/recipeMultiStagePublish.ts';

const RecipeStatus = {
  DRAFT: 'DRAFT',
  PUBLIC: 'PUBLIC',
} as const;

test('getPendingPublishStages returns every pending draft stage from a recipe series row', () => {
  const stages = getPendingPublishStages({
    id: 'series-row',
    seriesId: 'series-1',
    name: '牛肉南瓜',
    version: 2,
    status: RecipeStatus.PUBLIC,
    applicableLifeStages: [],
    targetHealthTags: [],
    energyDensityKcalPerKg: 1200,
    salesCount: 0,
    diyGenCount: 0,
    likeCount: 0,
    favoriteCount: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    seriesStages: [
      {
        lifeStage: 'HIGH_ACTIVITY_ADULT',
        label: '普通成年犬',
        status: 'SUBMITTED',
        recipeVersionId: 'adult-draft-v2',
        recipeId: 'adult-recipe',
        version: 2,
        pendingDraftVersion: {
          id: 'adult-draft-v2',
          recipeId: 'adult-recipe',
          name: '牛肉南瓜',
          version: 2,
          status: RecipeStatus.DRAFT,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      },
      {
        lifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        label: '低能量成年犬 / 老年犬',
        status: 'SUBMITTED',
        recipeVersionId: 'senior-draft-v1',
        recipeId: 'senior-recipe',
        version: 1,
        pendingDraftVersion: {
          id: 'senior-draft-v1',
          recipeId: 'senior-recipe',
          name: '牛肉南瓜',
          version: 1,
          status: RecipeStatus.DRAFT,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      },
      {
        lifeStage: 'REPRODUCTION',
        label: '繁殖期',
        status: 'PUBLISHED',
        recipeVersionId: 'reproduction-public-v1',
        recipeId: 'reproduction-recipe',
        version: 1,
      },
    ],
  });

  assert.deepEqual(
    stages.map((stage) => ({
      publishRecipeId: stage.publishRecipeId,
      label: stage.label,
      version: stage.version,
    })),
    [
      {
        publishRecipeId: 'adult-draft-v2',
        label: '普通成年犬',
        version: 2,
      },
      {
        publishRecipeId: 'senior-draft-v1',
        label: '低能量成年犬 / 老年犬',
        version: 1,
      },
    ],
  );
});

test('getPendingPublishStages falls back to the row pending draft for legacy non-series rows', () => {
  const stages = getPendingPublishStages({
    id: 'public-row',
    name: '鸡肉饭',
    version: 2,
    status: RecipeStatus.PUBLIC,
    applicableLifeStages: ['HIGH_ACTIVITY_ADULT'] as any,
    targetHealthTags: [],
    energyDensityKcalPerKg: 1100,
    salesCount: 0,
    diyGenCount: 0,
    likeCount: 0,
    favoriteCount: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    pendingDraftVersion: {
      id: 'legacy-draft-v3',
      recipeId: 'legacy-recipe',
      name: '鸡肉饭',
      version: 3,
      status: RecipeStatus.DRAFT,
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    },
  });

  assert.deepEqual(stages, [
    {
      lifeStage: 'LEGACY_RECIPE',
      label: '当前食谱',
      publishRecipeId: 'legacy-draft-v3',
      version: 3,
    },
  ]);
});

test('getRecipePublishRowKey uses the stable series id before the display row id', () => {
  assert.equal(
    getRecipePublishRowKey({
      id: 'display-row',
      seriesId: 'series-1',
      name: '牛肉南瓜',
      version: 1,
      status: RecipeStatus.PUBLIC,
      applicableLifeStages: [],
      targetHealthTags: [],
      energyDensityKcalPerKg: 1200,
      salesCount: 0,
      diyGenCount: 0,
      likeCount: 0,
      favoriteCount: 0,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }),
    'series-1',
  );
});
