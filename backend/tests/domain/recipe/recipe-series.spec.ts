import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  mapDogProfileToSeriesLifeStage,
  mapScenarioToSeriesLifeStage,
  resolveDefaultSeriesLifeStage,
  selectLatestPublishedSeriesLifeStageVersions,
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

describe('selectLatestPublishedSeriesLifeStageVersions', () => {
  const recipe = (
    id: string,
    seriesLifeStage: string,
    version: number,
    createdAt: string,
  ) => ({ id, seriesLifeStage, version, createdAt });

  it('picks the most recently published version per life stage', () => {
    const selected = selectLatestPublishedSeriesLifeStageVersions([
      recipe('old-adult', 'HIGH_ACTIVITY_ADULT', 17, '2026-03-07T10:57:52.414Z'),
      recipe('new-adult', 'HIGH_ACTIVITY_ADULT', 9, '2026-06-15T19:43:27.868Z'),
    ]);

    expect(selected.map((item) => item.id)).toEqual(['new-adult']);
  });

  it('does not let a high legacy version number outrank a newer publish', () => {
    const selected = selectLatestPublishedSeriesLifeStageVersions([
      recipe('imported-senior', 'LOW_ACTIVITY_ADULT_OR_SENIOR', 13, '2026-03-07T10:57:52.414Z'),
      recipe('redesigned-senior', 'LOW_ACTIVITY_ADULT_OR_SENIOR', 9, '2026-06-21T03:36:31.677Z'),
    ]);

    expect(selected.map((item) => item.id)).toEqual(['redesigned-senior']);
  });

  it('keeps the newest version when one chain is published repeatedly', () => {
    const selected = selectLatestPublishedSeriesLifeStageVersions([
      recipe('chain-v7', 'HIGH_ACTIVITY_ADULT', 7, '2026-06-14T19:39:43.000Z'),
      recipe('chain-v9', 'HIGH_ACTIVITY_ADULT', 9, '2026-06-15T19:43:27.868Z'),
      recipe('chain-v6', 'HIGH_ACTIVITY_ADULT', 6, '2026-05-28T06:27:56.000Z'),
    ]);

    expect(selected.map((item) => item.id)).toEqual(['chain-v9']);
  });

  it('uses the version number as a tie-break when publish times are equal', () => {
    const selected = selectLatestPublishedSeriesLifeStageVersions([
      recipe('same-time-low', 'HIGH_ACTIVITY_ADULT', 7, '2026-06-15T19:43:27.868Z'),
      recipe('same-time-high', 'HIGH_ACTIVITY_ADULT', 9, '2026-06-15T19:43:27.868Z'),
    ]);

    expect(selected.map((item) => item.id)).toEqual(['same-time-high']);
  });

  it('returns one entry per configured stage in product order and ignores standalone recipes', () => {
    const selected = selectLatestPublishedSeriesLifeStageVersions([
      recipe('repro', 'REPRODUCTION', 2, '2026-06-16T09:05:09.000Z'),
      recipe('adult', 'HIGH_ACTIVITY_ADULT', 9, '2026-06-15T19:43:27.868Z'),
      recipe('puppy', 'PUPPY_UNDER_14_WEEKS', 2, '2026-06-15T19:50:05.000Z'),
      { id: 'standalone', seriesLifeStage: null, version: 99, createdAt: '2026-09-01T00:00:00.000Z' },
    ]);

    expect(selected.map((item) => item.seriesLifeStage)).toEqual([
      'PUPPY_UNDER_14_WEEKS',
      'HIGH_ACTIVITY_ADULT',
      'REPRODUCTION',
    ]);
  });

  it('treats a missing createdAt as the oldest possible version', () => {
    const selected = selectLatestPublishedSeriesLifeStageVersions([
      recipe('no-timestamp', 'HIGH_ACTIVITY_ADULT', 17, null as unknown as string),
      recipe('has-timestamp', 'HIGH_ACTIVITY_ADULT', 1, '2026-06-15T19:43:27.868Z'),
    ]);

    expect(selected.map((item) => item.id)).toEqual(['has-timestamp']);
  });
});
