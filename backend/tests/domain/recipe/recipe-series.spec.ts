import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  mapDogProfileToSeriesLifeStage,
  mapScenarioToSeriesLifeStage,
  resolveDefaultSeriesLifeStage,
} from '../../../src/domain/recipe/recipe-series';

describe('recipe series life-stage helpers', () => {
  it('keeps the five configured stages in product order', () => {
    expect(ORDERED_RECIPE_SERIES_LIFE_STAGES).toEqual([
      'PUPPY_UNDER_14_WEEKS',
      'PUPPY_14_WEEKS_PLUS',
      'HIGH_ACTIVITY_ADULT',
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
      'REPRODUCTION',
    ]);
  });

  it.each([
    ['EARLY_GROWTH_REPRODUCTION', 'PUPPY_UNDER_14_WEEKS'],
    ['LATE_GROWTH', 'PUPPY_14_WEEKS_PLUS'],
    ['ADULT_MER_110', 'HIGH_ACTIVITY_ADULT'],
    ['ADULT_MER_95', 'LOW_ACTIVITY_ADULT_OR_SENIOR'],
    ['REPRODUCTION', 'REPRODUCTION'],
  ] as const)('maps %s to %s', (scenario, expected) => {
    expect(mapScenarioToSeriesLifeStage(scenario)).toBe(expected);
  });

  it('maps reproduction overrides before age and activity rules', () => {
    expect(
      mapDogProfileToSeriesLifeStage({
        birthday: new Date('2024-01-01T00:00:00.000Z'),
        lifeStageOverride: 'LACTATION',
        activityLevel: 'LOW',
        now: new Date('2026-05-31T00:00:00.000Z'),
      }),
    ).toBe('REPRODUCTION');
  });

  it('splits puppies at fourteen weeks and adult activity into two adult stages', () => {
    expect(
      mapDogProfileToSeriesLifeStage({
        birthday: new Date('2026-03-10T00:00:00.000Z'),
        lifeStageOverride: 'NONE',
        activityLevel: 'NORMAL',
        now: new Date('2026-05-31T00:00:00.000Z'),
      }),
    ).toBe('PUPPY_UNDER_14_WEEKS');
    expect(
      mapDogProfileToSeriesLifeStage({
        birthday: new Date('2024-05-31T00:00:00.000Z'),
        lifeStageOverride: 'NONE',
        activityLevel: 'LOW',
        now: new Date('2026-05-31T00:00:00.000Z'),
      }),
    ).toBe('LOW_ACTIVITY_ADULT_OR_SENIOR');
    expect(
      mapDogProfileToSeriesLifeStage({
        birthday: new Date('2024-05-31T00:00:00.000Z'),
        lifeStageOverride: 'NONE',
        activityLevel: 'NORMAL',
        now: new Date('2026-05-31T00:00:00.000Z'),
      }),
    ).toBe('HIGH_ACTIVITY_ADULT');
  });

  it('infers senior dogs by age before adult activity rules', () => {
    expect(
      mapDogProfileToSeriesLifeStage({
        birthday: new Date('2016-05-31T00:00:00.000Z'),
        lifeStageOverride: 'NONE',
        activityLevel: 'NORMAL',
        now: new Date('2026-05-31T00:00:00.000Z'),
      }),
    ).toBe('LOW_ACTIVITY_ADULT_OR_SENIOR');
  });

  it('falls back to adult then first configured stage', () => {
    expect(resolveDefaultSeriesLifeStage(['REPRODUCTION', 'HIGH_ACTIVITY_ADULT'])).toBe(
      'HIGH_ACTIVITY_ADULT',
    );
    expect(resolveDefaultSeriesLifeStage(['REPRODUCTION'])).toBe('REPRODUCTION');
  });
});
