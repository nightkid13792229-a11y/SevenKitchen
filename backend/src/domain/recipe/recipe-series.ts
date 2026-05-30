import { LifeStage as RecipeLifeStage } from './enums';

export type RecipeSeriesLifeStage =
  | 'PUPPY_UNDER_14_WEEKS'
  | 'PUPPY_14_WEEKS_PLUS'
  | 'HIGH_ACTIVITY_ADULT'
  | 'LOW_ACTIVITY_ADULT_OR_SENIOR'
  | 'REPRODUCTION';

export type RecipeSeriesStageStatus =
  | 'NOT_DESIGNED'
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'PUBLISHED'
  | 'NEEDS_CHANGES';

export type FediafDogScenarioForSeries =
  | 'EARLY_GROWTH_REPRODUCTION'
  | 'REPRODUCTION'
  | 'LATE_GROWTH'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110';

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
  lifeStageOverride?: string | null;
  activityLevel?: string | null;
  now?: Date;
}): RecipeSeriesLifeStage {
  const override =
    dog.lifeStageOverride && dog.lifeStageOverride !== 'NONE'
      ? dog.lifeStageOverride
      : '';

  if (override === 'PREGNANCY' || override === 'LACTATION') {
    return RecipeLifeStage.REPRODUCTION;
  }
  if (override === 'SENIOR') {
    return RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR;
  }
  if (override === 'ADULT') {
    return isLowActivity(dog.activityLevel)
      ? RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR
      : RecipeLifeStage.HIGH_ACTIVITY_ADULT;
  }

  const ageWeeks = getAgeWeeks(dog.birthday, dog.now ?? new Date());
  if (override === 'PUPPY' || (ageWeeks !== null && ageWeeks < 52)) {
    return ageWeeks !== null && ageWeeks < 14
      ? RecipeLifeStage.PUPPY_UNDER_14_WEEKS
      : RecipeLifeStage.PUPPY_14_WEEKS_PLUS;
  }

  return isLowActivity(dog.activityLevel)
    ? RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR
    : RecipeLifeStage.HIGH_ACTIVITY_ADULT;
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

function isLowActivity(activityLevel?: string | null): boolean {
  return activityLevel === 'RESTING' || activityLevel === 'LOW';
}

function getAgeWeeks(
  birthday?: Date | string | null,
  now: Date = new Date(),
): number | null {
  if (!birthday) return null;
  const birthDate = birthday instanceof Date ? birthday : new Date(birthday);
  const birthTime = birthDate.getTime();
  if (!Number.isFinite(birthTime)) return null;
  return (now.getTime() - birthTime) / (1000 * 60 * 60 * 24 * 7);
}
