import type {
  RecipeSeriesStageSummary,
  RecipeSummary,
} from '../types/recipe';

export interface PendingPublishStage {
  lifeStage: string;
  label: string;
  publishRecipeId: string;
  version?: number;
}

const DRAFT_RECIPE_STATUS: RecipeSummary['status'] = 'DRAFT' as RecipeSummary['status'];

export function getRecipePublishRowKey(row: Pick<RecipeSummary, 'id' | 'seriesId'>) {
  return row.seriesId || row.id;
}

export function getPendingPublishStages(row: RecipeSummary): PendingPublishStage[] {
  const seriesStages = (row.seriesStages || [])
    .map(toPendingPublishStage)
    .filter((stage): stage is PendingPublishStage => Boolean(stage));

  if (seriesStages.length > 0) {
    return seriesStages;
  }

  const fallbackTarget =
    row.pendingDraftVersion ||
    (row.status === DRAFT_RECIPE_STATUS
      ? {
          id: row.id,
          version: row.version,
        }
      : undefined);

  if (!fallbackTarget?.id || fallbackTarget.id === row.seriesId) {
    return [];
  }

  return [
    {
      lifeStage: row.seriesLifeStage || 'LEGACY_RECIPE',
      label: row.seriesLifeStageLabel || '当前食谱',
      publishRecipeId: fallbackTarget.id,
      version: fallbackTarget.version,
    },
  ];
}

function toPendingPublishStage(
  stage: RecipeSeriesStageSummary,
): PendingPublishStage | undefined {
  const publishRecipeId =
    stage.pendingDraftVersion?.id ||
    (stage.status === 'SUBMITTED' ? stage.recipeVersionId : undefined);

  if (!publishRecipeId) {
    return undefined;
  }

  return {
    lifeStage: stage.lifeStage,
    label: stage.label,
    publishRecipeId,
    version: stage.pendingDraftVersion?.version ?? stage.version,
  };
}
