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
