import { describe, expect, it } from 'vitest';
import {
  buildLifeStageReminderText,
  getLifeStageLabel,
  isRecipeLifeStageMatch,
  normalizeLifeStages,
  resolveDogLifeStage,
  resolveDogRecipeLifeStage,
} from './life-stage-match';

describe('life-stage match helpers', () => {
  it('normalizes configured recipe life stages before matching', () => {
    expect(normalizeLifeStages([' high_activity_adult ', 'puppy_14_weeks_plus', '', null])).toEqual([
      'HIGH_ACTIVITY_ADULT',
      'PUPPY_14_WEEKS_PLUS',
    ]);
    expect(isRecipeLifeStageMatch([' high_activity_adult '], 'ADULT')).toBe(true);
    expect(isRecipeLifeStageMatch([' high_activity_adult '], 'PUPPY')).toBe(false);
  });

  it('treats empty recipe life-stage config as no warning', () => {
    expect(isRecipeLifeStageMatch([], 'ADULT')).toBe(true);
    expect(isRecipeLifeStageMatch(null, 'SENIOR')).toBe(true);
  });

  it('builds reminder copy with all applicable stages and the selected dog stage', () => {
    expect(
      buildLifeStageReminderText({
        applicableStages: ['puppy', ' adult '],
        dogLifeStage: 'SENIOR',
        dogName: 'setar',
      }),
    ).toBe('该食谱适用于：幼犬、成犬。当前选择的狗狗「setar」为老年犬，建议确认后再继续。');
    expect(
      buildLifeStageReminderText({
        applicableStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        dogLifeStage: 'SENIOR',
        dogName: 'setar',
      }),
    ).toBe('该食谱适用于：低运动量成犬或老年犬。当前选择的狗狗「setar」为老年犬，建议确认后再继续。');
  });

  it('labels pregnancy and lactation overrides consistently', () => {
    expect(getLifeStageLabel('PREGNANCY')).toBe('妊娠期');
    expect(getLifeStageLabel('LACTATION')).toBe('哺乳期');
    expect(
      resolveDogLifeStage(
        { name: 'mama', lifeStageOverride: ' pregnancy ', birthday: '2024-01-01', breedId: 'breed-1' },
        [{ id: 'breed-1', adultAgeMonths: 12, seniorAgeYears: 7 }],
      ),
    ).toBe('PREGNANCY');
  });

  it('matches legacy dog life stages against the new precise recipe life stages', () => {
    expect(isRecipeLifeStageMatch(['PUPPY_UNDER_14_WEEKS'], 'PUPPY')).toBe(true);
    expect(isRecipeLifeStageMatch(['PUPPY_14_WEEKS_PLUS'], 'PUPPY')).toBe(true);
    expect(isRecipeLifeStageMatch(['LOW_ACTIVITY_ADULT_OR_SENIOR'], 'SENIOR')).toBe(true);
    expect(isRecipeLifeStageMatch(['LOW_ACTIVITY_ADULT_OR_SENIOR'], 'ADULT')).toBe(true);
    expect(isRecipeLifeStageMatch(['HIGH_ACTIVITY_ADULT'], 'ADULT')).toBe(true);
    expect(isRecipeLifeStageMatch(['REPRODUCTION'], 'LACTATION')).toBe(true);
    expect(isRecipeLifeStageMatch(['REPRODUCTION'], 'PUPPY')).toBe(false);
  });

  it('resolves puppies into the two precise recipe stages by 14 weeks', () => {
    const now = new Date('2026-05-26T00:00:00.000Z');
    const breeds = [{ id: 'breed-1', adultAgeMonths: 12, seniorAgeYears: 7 }];

    expect(
      resolveDogRecipeLifeStage(
        { birthday: '2026-03-31', breedId: 'breed-1', activityLevel: 'NORMAL' },
        breeds,
        now,
      ),
    ).toBe('PUPPY_UNDER_14_WEEKS');
    expect(
      resolveDogRecipeLifeStage(
        { birthday: '2026-01-01', breedId: 'breed-1', activityLevel: 'NORMAL' },
        breeds,
        now,
      ),
    ).toBe('PUPPY_14_WEEKS_PLUS');
  });

  it('resolves adult recipe stages from activity level and senior age', () => {
    const now = new Date('2026-05-26T00:00:00.000Z');
    const breeds = [{ id: 'breed-1', adultAgeMonths: 12, seniorAgeYears: 7 }];

    expect(
      resolveDogRecipeLifeStage(
        { birthday: '2024-01-01', breedId: 'breed-1', activityLevel: 'LOW' },
        breeds,
        now,
      ),
    ).toBe('LOW_ACTIVITY_ADULT_OR_SENIOR');
    expect(
      resolveDogRecipeLifeStage(
        { birthday: '2024-01-01', breedId: 'breed-1', activityLevel: 'NORMAL' },
        breeds,
        now,
      ),
    ).toBe('HIGH_ACTIVITY_ADULT');
    expect(
      resolveDogRecipeLifeStage(
        { birthday: '2016-01-01', breedId: 'breed-1', activityLevel: 'HIGH' },
        breeds,
        now,
      ),
    ).toBe('LOW_ACTIVITY_ADULT_OR_SENIOR');
  });

  it('resolves pregnancy and lactation overrides to the reproduction recipe stage', () => {
    const breeds = [{ id: 'breed-1', adultAgeMonths: 12, seniorAgeYears: 7 }];

    expect(
      resolveDogRecipeLifeStage(
        { lifeStageOverride: 'PREGNANCY', birthday: '2024-01-01', breedId: 'breed-1' },
        breeds,
      ),
    ).toBe('REPRODUCTION');
    expect(
      resolveDogRecipeLifeStage(
        { lifeStageOverride: 'LACTATION', birthday: '2024-01-01', breedId: 'breed-1' },
        breeds,
      ),
    ).toBe('REPRODUCTION');
  });

  it('returns null when the dog life stage cannot be determined safely', () => {
    expect(resolveDogLifeStage({ name: 'unknown', breedId: 'breed-1' }, [])).toBeNull();
    expect(
      resolveDogLifeStage(
        { name: 'unknown', birthday: '2024-01-01', breedId: 'breed-1' },
        [{ id: 'breed-1' }],
      ),
    ).toBeNull();
  });
});
