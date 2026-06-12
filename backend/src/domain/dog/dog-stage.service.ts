import {
  LIFE_STAGE_FACTORS,
  SIZE_CLASS_ADULT_THRESHOLDS,
  SIZE_CLASS_SENIOR_THRESHOLDS,
} from './constants';
import {
  ActivityLevel,
  DogGender,
  DogSizeCategory,
  LifeStageOverride,
} from './enums';

export type RecipeSeriesLifeStage =
  | 'PUPPY_UNDER_14_WEEKS'
  | 'PUPPY_14_WEEKS_PLUS'
  | 'HIGH_ACTIVITY_ADULT'
  | 'LOW_ACTIVITY_ADULT_OR_SENIOR'
  | 'REPRODUCTION';

export type FediafDogScenarioForStage =
  | 'EARLY_GROWTH_REPRODUCTION'
  | 'REPRODUCTION'
  | 'LATE_GROWTH'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110';

export type DogEnergyStage =
  | 'PUPPY'
  | 'ADULT'
  | 'SENIOR'
  | 'PREGNANCY'
  | 'LACTATION';

export type DogEnergyFactorKey = keyof typeof LIFE_STAGE_FACTORS;

export interface DogProfileStageInput {
  birthday?: Date | string | null;
  gender?: DogGender | string | null;
  activityLevel?: ActivityLevel | string | null;
  lifeStageOverride?: LifeStageOverride | string | null;
  sizeClassOverride?: DogSizeCategory | string | null;
  adultAgeMonths?: number | null;
  seniorAgeYears?: number | null;
  breed?: {
    sizeCategory?: DogSizeCategory | string | null;
    adultAgeMonths?: number | null;
    seniorAgeYears?: number | null;
  } | null;
  now?: Date;
}

export interface ResolvedDogProfileStage {
  ageWeeks: number | null;
  ageMonths: number | null;
  sizeClass: DogSizeCategory;
  autoLifeStage: Exclude<LifeStageOverride, LifeStageOverride.NONE>;
  overrideLifeStage: LifeStageOverride;
  effectiveLifeStage: Exclude<LifeStageOverride, LifeStageOverride.NONE>;
  energyStage: DogEnergyStage;
  energyFactorKey: DogEnergyFactorKey;
  recipeLifeStage: RecipeSeriesLifeStage;
  fediafScenario: FediafDogScenarioForStage;
  activityBasis: ActivityLevel;
  isManualLifeStageOverride: boolean;
  warnings: string[];
}

const SCENARIO_BY_RECIPE_STAGE: Record<
  RecipeSeriesLifeStage,
  FediafDogScenarioForStage
> = {
  PUPPY_UNDER_14_WEEKS: 'EARLY_GROWTH_REPRODUCTION',
  PUPPY_14_WEEKS_PLUS: 'LATE_GROWTH',
  LOW_ACTIVITY_ADULT_OR_SENIOR: 'ADULT_MER_95',
  HIGH_ACTIVITY_ADULT: 'ADULT_MER_110',
  REPRODUCTION: 'REPRODUCTION',
};

const VALID_LIFE_STAGE_OVERRIDES = new Set<string>(
  Object.values(LifeStageOverride),
);
const VALID_ACTIVITY_LEVELS = new Set<string>(Object.values(ActivityLevel));
const VALID_SIZE_CLASSES = new Set<string>(Object.values(DogSizeCategory));

export function resolveDogProfileStage(
  input: DogProfileStageInput,
  breed?: DogProfileStageInput['breed'],
  now: Date = input.now ?? new Date(),
): ResolvedDogProfileStage {
  const normalizedBreed = breed ?? input.breed ?? null;
  const sizeClass = resolveSizeClass(input, normalizedBreed);
  const ageMonths = getAgeMonths(input.birthday, now);
  const ageWeeks = getAgeWeeks(input.birthday, now);
  const adultAgeMonths = resolveAdultAgeMonths(
    sizeClass,
    input,
    normalizedBreed,
  );
  const seniorAgeYears = resolveSeniorAgeYears(
    sizeClass,
    input,
    normalizedBreed,
  );
  const autoLifeStage = resolveAutoLifeStage(
    ageMonths,
    adultAgeMonths,
    seniorAgeYears,
  );
  const overrideLifeStage = normalizeLifeStageOverride(
    input.lifeStageOverride,
  );
  const isManualLifeStageOverride = overrideLifeStage !== LifeStageOverride.NONE;
  const effectiveLifeStage = (
    isManualLifeStageOverride ? overrideLifeStage : autoLifeStage
  ) as Exclude<LifeStageOverride, LifeStageOverride.NONE>;
  const activityBasis = normalizeActivityLevel(input.activityLevel);
  const energyStage = mapLifeStageToEnergyStage(effectiveLifeStage);
  const recipeLifeStage = resolveRecipeLifeStage(
    effectiveLifeStage,
    activityBasis,
    ageWeeks,
  );
  const warnings = resolveStageWarnings(
    input,
    autoLifeStage,
    overrideLifeStage,
    isManualLifeStageOverride,
  );

  if (!input.birthday) {
    warnings.push('MISSING_BIRTHDAY_FOR_STAGE');
  }

  return {
    ageWeeks,
    ageMonths,
    sizeClass,
    autoLifeStage,
    overrideLifeStage,
    effectiveLifeStage,
    energyStage,
    energyFactorKey: resolveEnergyFactorKey(
      energyStage,
      ageMonths,
      sizeClass,
      activityBasis,
    ),
    recipeLifeStage,
    fediafScenario: SCENARIO_BY_RECIPE_STAGE[recipeLifeStage],
    activityBasis,
    isManualLifeStageOverride,
    warnings,
  };
}

export function isLowActivity(activityLevel?: string | null): boolean {
  return (
    activityLevel === ActivityLevel.RESTING || activityLevel === ActivityLevel.LOW
  );
}

function resolveAutoLifeStage(
  ageMonths: number | null,
  adultAgeMonths: number,
  seniorAgeYears: number,
): Exclude<LifeStageOverride, LifeStageOverride.NONE> {
  if (ageMonths === null) {
    return LifeStageOverride.ADULT;
  }

  if (ageMonths < adultAgeMonths) {
    return LifeStageOverride.PUPPY;
  }

  if (ageMonths >= seniorAgeYears * 12) {
    return LifeStageOverride.SENIOR;
  }

  return LifeStageOverride.ADULT;
}

function resolveRecipeLifeStage(
  lifeStage: Exclude<LifeStageOverride, LifeStageOverride.NONE>,
  activityLevel: ActivityLevel,
  ageWeeks: number | null,
): RecipeSeriesLifeStage {
  if (
    lifeStage === LifeStageOverride.PREGNANCY ||
    lifeStage === LifeStageOverride.LACTATION
  ) {
    return 'REPRODUCTION';
  }

  if (lifeStage === LifeStageOverride.PUPPY) {
    return ageWeeks !== null && ageWeeks < 14
      ? 'PUPPY_UNDER_14_WEEKS'
      : 'PUPPY_14_WEEKS_PLUS';
  }

  if (lifeStage === LifeStageOverride.SENIOR) {
    return 'LOW_ACTIVITY_ADULT_OR_SENIOR';
  }

  return isLowActivity(activityLevel)
    ? 'LOW_ACTIVITY_ADULT_OR_SENIOR'
    : 'HIGH_ACTIVITY_ADULT';
}

function mapLifeStageToEnergyStage(
  lifeStage: Exclude<LifeStageOverride, LifeStageOverride.NONE>,
): DogEnergyStage {
  if (lifeStage === LifeStageOverride.PREGNANCY) return 'PREGNANCY';
  if (lifeStage === LifeStageOverride.LACTATION) return 'LACTATION';
  if (lifeStage === LifeStageOverride.SENIOR) return 'SENIOR';
  if (lifeStage === LifeStageOverride.PUPPY) return 'PUPPY';
  return 'ADULT';
}

function resolveEnergyFactorKey(
  energyStage: DogEnergyStage,
  ageMonths: number | null,
  sizeClass: DogSizeCategory,
  activityLevel: ActivityLevel,
): DogEnergyFactorKey {
  if (energyStage === 'PREGNANCY') return 'PREGNANCY';
  if (energyStage === 'LACTATION') return 'LACTATION';
  if (energyStage === 'SENIOR') return 'SENIOR';
  if (energyStage === 'ADULT') {
    return isLowActivity(activityLevel) ? 'ADULT_MER_95' : 'ADULT_MER_110';
  }

  const months = ageMonths ?? 9;
  if (months < 4) return 'PUPPY_0_4_MONTHS';
  if (months < 6) {
    return sizeClass === DogSizeCategory.LARGE ||
      sizeClass === DogSizeCategory.GIANT
      ? 'PUPPY_4_6_MONTHS_LARGE_GIANT'
      : 'PUPPY_4_6_MONTHS_GENERIC';
  }
  if (months < 9) {
    if (sizeClass === DogSizeCategory.GIANT) return 'PUPPY_6_9_MONTHS_GIANT';
    if (sizeClass === DogSizeCategory.LARGE) return 'PUPPY_6_9_MONTHS_LARGE';
    return 'PUPPY_6_9_MONTHS_GENERIC';
  }
  if (months < 12) {
    if (sizeClass === DogSizeCategory.GIANT) return 'PUPPY_9_12_MONTHS_GIANT';
    if (sizeClass === DogSizeCategory.LARGE) return 'PUPPY_9_12_MONTHS_LARGE';
    return 'PUPPY_9_12_MONTHS_GENERIC';
  }
  if (sizeClass === DogSizeCategory.GIANT) {
    return months < 18
      ? 'JUNIOR_GIANT_12_18_MONTHS'
      : 'JUNIOR_GIANT_18_24_MONTHS';
  }
  if (sizeClass === DogSizeCategory.LARGE) return 'JUNIOR_LARGE_12_18_MONTHS';
  return 'ADULT_INTACT';
}

function resolveStageWarnings(
  input: DogProfileStageInput,
  autoLifeStage: Exclude<LifeStageOverride, LifeStageOverride.NONE>,
  overrideLifeStage: LifeStageOverride,
  isManualLifeStageOverride: boolean,
): string[] {
  const warnings: string[] = [];

  if (
    isManualLifeStageOverride &&
    [LifeStageOverride.PUPPY, LifeStageOverride.ADULT, LifeStageOverride.SENIOR].includes(
      overrideLifeStage,
    ) &&
    overrideLifeStage !== autoLifeStage
  ) {
    warnings.push('LIFE_STAGE_OVERRIDE_CONFLICT');
  }

  if (
    (overrideLifeStage === LifeStageOverride.PREGNANCY ||
      overrideLifeStage === LifeStageOverride.LACTATION) &&
    input.gender &&
    input.gender !== DogGender.FEMALE
  ) {
    warnings.push('REPRODUCTION_STAGE_REQUIRES_FEMALE_DOG');
  }

  return warnings;
}

function resolveSizeClass(
  input: DogProfileStageInput,
  breed?: DogProfileStageInput['breed'],
): DogSizeCategory {
  if (
    input.sizeClassOverride &&
    VALID_SIZE_CLASSES.has(String(input.sizeClassOverride))
  ) {
    return input.sizeClassOverride as DogSizeCategory;
  }
  if (
    breed?.sizeCategory &&
    VALID_SIZE_CLASSES.has(String(breed.sizeCategory))
  ) {
    return breed.sizeCategory as DogSizeCategory;
  }
  return DogSizeCategory.MEDIUM;
}

function resolveAdultAgeMonths(
  sizeClass: DogSizeCategory,
  input: DogProfileStageInput,
  breed?: DogProfileStageInput['breed'],
): number {
  return (
    normalizePositiveNumber(breed?.adultAgeMonths) ??
    normalizePositiveNumber(input.adultAgeMonths) ??
    SIZE_CLASS_ADULT_THRESHOLDS[sizeClass] ??
    12
  );
}

function resolveSeniorAgeYears(
  sizeClass: DogSizeCategory,
  input: DogProfileStageInput,
  breed?: DogProfileStageInput['breed'],
): number {
  return (
    normalizePositiveNumber(breed?.seniorAgeYears) ??
    normalizePositiveNumber(input.seniorAgeYears) ??
    SIZE_CLASS_SENIOR_THRESHOLDS[sizeClass] ??
    10
  );
}

function normalizePositiveNumber(value?: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizeLifeStageOverride(
  value?: LifeStageOverride | string | null,
): LifeStageOverride {
  if (value && VALID_LIFE_STAGE_OVERRIDES.has(String(value))) {
    return value as LifeStageOverride;
  }
  return LifeStageOverride.NONE;
}

function normalizeActivityLevel(
  value?: ActivityLevel | string | null,
): ActivityLevel {
  if (value && VALID_ACTIVITY_LEVELS.has(String(value))) {
    return value as ActivityLevel;
  }
  return ActivityLevel.LOW;
}

function getAgeMonths(
  birthday?: Date | string | null,
  now: Date = new Date(),
): number | null {
  const parsed = parseDate(birthday);
  if (!parsed) return null;
  let months =
    (now.getFullYear() - parsed.getFullYear()) * 12 +
    (now.getMonth() - parsed.getMonth());
  if (now.getDate() < parsed.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

function getAgeWeeks(
  birthday?: Date | string | null,
  now: Date = new Date(),
): number | null {
  const parsed = parseDate(birthday);
  if (!parsed) return null;
  const diffDays = (now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.floor(diffDays / 7));
}

function parseDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
