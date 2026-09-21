import { LifeStage as RecipeLifeStage } from './enums';
import {
  resolveDogProfileStage,
  type FediafDogScenarioForStage,
  type RecipeSeriesLifeStage as ResolvedRecipeSeriesLifeStage,
} from '../dog/dog-stage.service';

export type RecipeSeriesLifeStage = ResolvedRecipeSeriesLifeStage;

export type RecipeSeriesStageStatus =
  | 'NOT_DESIGNED'
  | 'MODIFIED'
  | 'SUBMITTED'
  | 'PUBLISHED'
  | 'PRIVATE_CUSTOM';

export const RECIPE_SERIES_BUSINESS_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PUBLIC: '已发布',
  PRIVATE_CUSTOM: '私密定制',
};

export type FediafDogScenarioForSeries = FediafDogScenarioForStage;

export const ORDERED_RECIPE_SERIES_LIFE_STAGES: RecipeSeriesLifeStage[] = [
  RecipeLifeStage.PUPPY_UNDER_14_WEEKS,
  RecipeLifeStage.PUPPY_14_WEEKS_PLUS,
  RecipeLifeStage.HIGH_ACTIVITY_ADULT,
  RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR,
  RecipeLifeStage.REPRODUCTION,
];

export const SERIES_LIFE_STAGE_LABELS: Record<RecipeSeriesLifeStage, string> = {
  PUPPY_UNDER_14_WEEKS: '小于 14 周幼犬',
  PUPPY_14_WEEKS_PLUS: '14 周以上幼犬',
  HIGH_ACTIVITY_ADULT: '普通成年犬',
  LOW_ACTIVITY_ADULT_OR_SENIOR: '低能量成年犬 / 老年犬',
  REPRODUCTION: '繁殖期',
};

export const SCENARIO_TO_SERIES_LIFE_STAGE: Record<
  FediafDogScenarioForSeries,
  RecipeSeriesLifeStage
> = {
  EARLY_GROWTH_REPRODUCTION: RecipeLifeStage.PUPPY_UNDER_14_WEEKS,
  REPRODUCTION: RecipeLifeStage.REPRODUCTION,
  LATE_GROWTH: RecipeLifeStage.PUPPY_14_WEEKS_PLUS,
  ADULT_MER_95: RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR,
  ADULT_MER_110: RecipeLifeStage.HIGH_ACTIVITY_ADULT,
};

interface DogBreedLifeStageThresholds {
  sizeCategory?: string | null;
  adultAgeMonths?: number | null;
  seniorAgeYears?: number | null;
}

export function mapScenarioToSeriesLifeStage(
  scenario: FediafDogScenarioForSeries,
): RecipeSeriesLifeStage {
  return SCENARIO_TO_SERIES_LIFE_STAGE[scenario];
}

export function mapSeriesLifeStageToScenario(
  lifeStage: RecipeSeriesLifeStage,
): FediafDogScenarioForSeries {
  const pair = Object.entries(SCENARIO_TO_SERIES_LIFE_STAGE).find(
    ([, candidate]) => candidate === lifeStage,
  );
  return (pair?.[0] ?? 'ADULT_MER_110') as FediafDogScenarioForSeries;
}

export function mapDogProfileToSeriesLifeStage(dog: {
  birthday?: Date | string | null;
  gender?: string | null;
  lifeStageOverride?: string | null;
  activityLevel?: string | null;
  sizeClassOverride?: string | null;
  adultAgeMonths?: number | null;
  seniorAgeYears?: number | null;
  breed?: DogBreedLifeStageThresholds | null;
  now?: Date;
}): RecipeSeriesLifeStage {
  return resolveDogProfileStage(dog).recipeLifeStage;
}

export function resolveDefaultSeriesLifeStage(
  configuredStages: string[],
): RecipeSeriesLifeStage | null {
  const configured = new Set(configuredStages);
  if (configured.has(RecipeLifeStage.HIGH_ACTIVITY_ADULT)) {
    return RecipeLifeStage.HIGH_ACTIVITY_ADULT;
  }
  return (
    ORDERED_RECIPE_SERIES_LIFE_STAGES.find((stage) => configured.has(stage)) ??
    null
  );
}

export type SeriesLifeStageVersionCandidate = {
  id?: string | null;
  seriesLifeStage?: string | null;
  version?: number | null;
  createdAt?: Date | string | null;
};

/**
 * 正式食谱版本的发布时间（毫秒时间戳）。
 *
 * 每条正式版本记录都是在「发布」那一刻新建的，所以 createdAt 就是该版本的发布时间。
 * 不能用 updatedAt：后台的批量维护（封面、角标、媒体等）会刷新 updatedAt，
 * 会让发布时间失去可比性。
 */
export function resolvePublishedVersionTimeMs(
  recipe: SeriesLifeStageVersionCandidate,
): number {
  const raw = recipe.createdAt ?? null;
  if (raw === null || raw === undefined) {
    return 0;
  }
  const time = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * 同一系列、同一生命阶段下，哪一条正式版本更新。
 *
 * 版本号只在同一条版本链（同一个 recipeId）内单调递增；历史导入的旧食谱可能带着
 * 很高的版本号（例如导入时整批写成了 v17），后来用设计器重新发布的版本号却更小。
 * 因此跨链比较版本号会长期选到过期版本，必须按「发布时间」判断新旧，
 * 版本号只作为同一时刻的稳定排序兜底。
 */
export function compareSeriesLifeStageVersionRecency(
  left: SeriesLifeStageVersionCandidate,
  right: SeriesLifeStageVersionCandidate,
): number {
  const timeDiff =
    resolvePublishedVersionTimeMs(left) - resolvePublishedVersionTimeMs(right);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  const versionDiff = (left.version ?? 0) - (right.version ?? 0);
  if (versionDiff !== 0) {
    return versionDiff;
  }

  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
}

/**
 * 取每个生命阶段「最近发布」的正式版本，并按产品约定的生命阶段顺序返回。
 */
export function selectLatestPublishedSeriesLifeStageVersions<
  T extends SeriesLifeStageVersionCandidate,
>(recipes: T[]): T[] {
  const latestByStage = new Map<string, T>();

  for (const recipe of recipes) {
    const stage = recipe.seriesLifeStage;
    if (!stage) {
      continue;
    }

    const existing = latestByStage.get(stage);
    if (
      !existing ||
      compareSeriesLifeStageVersionRecency(recipe, existing) > 0
    ) {
      latestByStage.set(stage, recipe);
    }
  }

  return Array.from(latestByStage.values()).sort((left, right) => {
    const leftIndex = ORDERED_RECIPE_SERIES_LIFE_STAGES.indexOf(
      left.seriesLifeStage as RecipeSeriesLifeStage,
    );
    const rightIndex = ORDERED_RECIPE_SERIES_LIFE_STAGES.indexOf(
      right.seriesLifeStage as RecipeSeriesLifeStage,
    );
    return leftIndex - rightIndex;
  });
}
