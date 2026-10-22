import type { CandidateRow } from '../../../src/application/ingredient-creation/ingredient-creation.types';
import {
  classifyCookingMethod,
  isCookedSourceAcceptable,
  normalizePreparationState,
} from '../../../src/domain/ingredient-creation/preparation-state';
import type { CookingMethod } from '../../../src/domain/ingredient-creation/preparation-state';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

describe('normalizePreparationState', () => {
  it('maps raw synonyms to RAW', () => {
    expect(normalizePreparationState('raw')).toBe('RAW');
    expect(normalizePreparationState('Raw')).toBe('RAW');
    expect(normalizePreparationState('生')).toBe('RAW');
  });

  it('maps cooked synonyms to COOKED', () => {
    expect(normalizePreparationState('cooked')).toBe('COOKED');
    expect(normalizePreparationState('Cooked')).toBe('COOKED');
    expect(normalizePreparationState('熟')).toBe('COOKED');
  });

  it('normalizes full-width characters before matching', () => {
    expect(normalizePreparationState('Ｃｏｏｋｅｄ')).toBe('COOKED');
  });

  it('returns null for empty, missing, or unknown values', () => {
    expect(normalizePreparationState('')).toBeNull();
    expect(normalizePreparationState(null)).toBeNull();
    expect(normalizePreparationState(undefined)).toBeNull();
    expect(normalizePreparationState('unknown')).toBeNull();
  });
});

describe('classifyCookingMethod', () => {
  it('classifies boiled sources to BOILED', () => {
    expect(classifyCookingMethod('boiled, drained')).toBe('BOILED');
    expect(classifyCookingMethod('水煮')).toBe('BOILED');
    expect(classifyCookingMethod('ゆで')).toBe('BOILED');
    expect(classifyCookingMethod('茹で')).toBe('BOILED');
  });

  it('classifies steamed sources to STEAMED', () => {
    expect(classifyCookingMethod('steamed')).toBe('STEAMED');
    expect(classifyCookingMethod('蒸し')).toBe('STEAMED');
  });

  it('classifies grilled or roasted sources to GRILLED', () => {
    expect(classifyCookingMethod('broiled')).toBe('GRILLED');
    expect(classifyCookingMethod('grilled')).toBe('GRILLED');
    expect(classifyCookingMethod('roasted')).toBe('GRILLED');
    expect(classifyCookingMethod('焼き')).toBe('GRILLED');
    expect(classifyCookingMethod('烤')).toBe('GRILLED');
  });

  it('classifies fried sources to FRIED', () => {
    expect(classifyCookingMethod('fried')).toBe('FRIED');
    expect(classifyCookingMethod('pan-fried')).toBe('FRIED');
    expect(classifyCookingMethod('deep-fried')).toBe('FRIED');
    expect(classifyCookingMethod('揚げ')).toBe('FRIED');
    expect(classifyCookingMethod('煎')).toBe('FRIED');
  });

  it('normalizes full-width characters and case before matching', () => {
    expect(classifyCookingMethod('ＢＯＩＬＥＤ')).toBe('BOILED');
  });

  it('returns null when the method is missing or unknown', () => {
    expect(classifyCookingMethod(null)).toBeNull();
    expect(classifyCookingMethod(undefined)).toBeNull();
    expect(classifyCookingMethod('')).toBeNull();
    expect(classifyCookingMethod('unknown')).toBeNull();
    expect(classifyCookingMethod('raw')).toBeNull();
  });
});

describe('isCookedSourceAcceptable', () => {
  it('accepts boiled and steamed sources', () => {
    expect(isCookedSourceAcceptable('BOILED')).toBe(true);
    expect(isCookedSourceAcceptable('STEAMED')).toBe(true);
  });

  it('rejects grilled, fried, other, and unknown methods', () => {
    expect(isCookedSourceAcceptable('GRILLED')).toBe(false);
    expect(isCookedSourceAcceptable('FRIED')).toBe(false);
    expect(isCookedSourceAcceptable('OTHER')).toBe(false);
    expect(isCookedSourceAcceptable(null)).toBe(false);
  });
});

describe('CandidateRow.cookingMethod', () => {
  it('carries a classified cooking method on a candidate row', () => {
    const candidate = {
      sourceRecordId: 'src-usda-05025',
      sourceType: 'USDA',
      foodName: 'Chicken, liver, cooked, boiled',
      foodNameEn: null,
      preparationState: 'COOKED',
      cookingMethod: classifyCookingMethod('boiled, drained'),
      coveragePercent: 82,
      missingFields: [],
      matchScore: 0.91,
      notes: [],
    } satisfies CandidateRow;

    expect(candidate.cookingMethod).toBe('BOILED');
  });

  it('types cookingMethod as CookingMethod | null, not a loose string', () => {
    const isNarrowed: Equal<
      CandidateRow['cookingMethod'],
      CookingMethod | null
    > = true;
    // @ts-expect-error 任意字符串不得直接塞进 CandidateRow
    const looseString: CandidateRow['cookingMethod'] = 'steamed';
    expect(isNarrowed).toBe(true);
    expect(looseString).toBe('steamed');
  });
});
