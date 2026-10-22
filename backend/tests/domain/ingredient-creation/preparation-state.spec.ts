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
    expect(classifyCookingMethod('roast')).toBe('GRILLED');
    expect(classifyCookingMethod('焼き')).toBe('GRILLED');
    expect(classifyCookingMethod('烤')).toBe('GRILLED');
  });

  it('denies grilled or fried when the source also mentions gentle cooking', () => {
    expect(classifyCookingMethod('蒸し焼き')).toBe('GRILLED');
    expect(classifyCookingMethod('boiled & fried')).toBe('FRIED');
    expect(classifyCookingMethod('steamed then pan-fried')).toBe('FRIED');
    expect(classifyCookingMethod('水煮然后烤')).toBe('GRILLED');
  });

  it('matches Latin keywords on word boundaries only', () => {
    expect(classifyCookingMethod('parboiled')).toBeNull();
    expect(classifyCookingMethod('par-boiled')).toBeNull();
    expect(classifyCookingMethod('unfried')).toBeNull();
    expect(classifyCookingMethod('hard-boiled')).toBe('BOILED');
  });

  it('covers cooking-method stems in veto keywords', () => {
    expect(classifyCookingMethod('boiled then pan-fry')).toBe('FRIED');
    expect(classifyCookingMethod('boiled then grill')).toBe('GRILLED');
    expect(classifyCookingMethod('steamed then broil')).toBe('GRILLED');
    expect(classifyCookingMethod('水煮后炸')).toBe('FRIED');
  });

  it('recognizes Chinese boiled and steamed wording', () => {
    expect(classifyCookingMethod('清蒸鱼')).toBe('STEAMED');
    expect(classifyCookingMethod('煮鸡胸')).toBe('BOILED');
  });

  it('recognizes oven-baked, barbecued, and seared veto methods', () => {
    expect(classifyCookingMethod('baked')).toBe('GRILLED');
    expect(classifyCookingMethod('oven-baked')).toBe('GRILLED');
    expect(classifyCookingMethod('barbecued')).toBe('GRILLED');
    expect(classifyCookingMethod('pan-seared')).toBe('FRIED');
    expect(classifyCookingMethod('sautéed')).toBe('FRIED');
    expect(classifyCookingMethod('烘烤')).toBe('GRILLED');
  });

  it('leaves unknown cooked wording null while keeping 水煮 recognised', () => {
    expect(classifyCookingMethod('cooked, simmered')).toBeNull();
    expect(classifyCookingMethod('水煮')).toBe('BOILED');
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

  it('rejects every source where grilled or fried appears alongside a gentle method', () => {
    const vetoedSources = [
      '蒸し焼き',
      'boiled & fried',
      'steamed then pan-fried',
      '水煮然后烤',
    ];

    for (const source of vetoedSources) {
      expect(isCookedSourceAcceptable(classifyCookingMethod(source))).toBe(
        false,
      );
    }
  });

  it('rejects stemmed veto sources but accepts Chinese gentle wording', () => {
    const vetoedSources = [
      'boiled then pan-fry',
      'boiled then grill',
      'steamed then broil',
      '水煮后炸',
    ];

    for (const source of vetoedSources) {
      expect(isCookedSourceAcceptable(classifyCookingMethod(source))).toBe(
        false,
      );
    }

    expect(isCookedSourceAcceptable(classifyCookingMethod('清蒸鱼'))).toBe(
      true,
    );
    expect(isCookedSourceAcceptable(classifyCookingMethod('煮鸡胸'))).toBe(
      true,
    );
    // 否决优先的回归：中文“蒸”加入后，蒸し焼き 仍必须判为烤
    expect(isCookedSourceAcceptable(classifyCookingMethod('蒸し焼き'))).toBe(
      false,
    );
  });

  it('rejects baked, barbecued, and seared sources', () => {
    const vetoedSources = [
      'baked',
      'oven-baked',
      'barbecued',
      'pan-seared',
      'sautéed',
      '烘烤',
    ];

    for (const source of vetoedSources) {
      const method = classifyCookingMethod(source);
      expect(method).not.toBeNull();
      expect(isCookedSourceAcceptable(method)).toBe(false);
    }
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
