import { describe, expect, it } from 'vitest';
import {
  buildLifeStageReminderText,
  getLifeStageLabel,
  isRecipeLifeStageMatch,
  normalizeLifeStages,
  resolveDogLifeStage,
} from './life-stage-match';

describe('life-stage match helpers', () => {
  it('normalizes configured recipe life stages before matching', () => {
    expect(normalizeLifeStages([' adult ', 'puppy', '', null])).toEqual(['ADULT', 'PUPPY']);
    expect(isRecipeLifeStageMatch([' adult '], 'ADULT')).toBe(true);
    expect(isRecipeLifeStageMatch([' adult '], 'PUPPY')).toBe(false);
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
