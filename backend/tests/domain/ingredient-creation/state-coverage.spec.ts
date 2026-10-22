import type { PreparationState } from '../../../src/domain/ingredient-creation/preparation-state';
import {
  resolveDefaultPrimaryState,
  resolveStateCoverage,
} from '../../../src/domain/ingredient-creation/state-coverage';
import type { CoverageCategory } from '../../../src/domain/ingredient-creation/state-coverage';

const CATEGORIES: CoverageCategory[] = [
  'MEAT_ORGAN',
  'STARCHY_VEGETABLE',
  'OTHER',
];

describe('resolveStateCoverage', () => {
  it('requires RAW and suggests COOKED for meat, organs, seafood and eggs', () => {
    expect(resolveStateCoverage('MEAT_ORGAN')).toEqual({
      required: ['RAW'],
      suggested: ['COOKED'],
    });
  });

  it('requires COOKED and suggests RAW for starchy vegetables', () => {
    expect(resolveStateCoverage('STARCHY_VEGETABLE')).toEqual({
      required: ['COOKED'],
      suggested: ['RAW'],
    });
  });

  it('presets nothing for other categories', () => {
    expect(resolveStateCoverage('OTHER')).toEqual({
      required: [],
      suggested: [],
    });
  });

  it('narrows both lists to PreparationState', () => {
    const coverage: {
      required: PreparationState[];
      suggested: PreparationState[];
    } = resolveStateCoverage('MEAT_ORGAN');

    expect(coverage.required).toEqual(['RAW']);
    expect(coverage.suggested).toEqual(['COOKED']);
  });

  it('never lists the same state as both required and suggested', () => {
    for (const category of CATEGORIES) {
      const { required, suggested } = resolveStateCoverage(category);
      expect(required.filter((state) => suggested.includes(state))).toEqual([]);
    }
  });

  it('returns fresh arrays on every call so callers cannot leak mutations', () => {
    const first = resolveStateCoverage('MEAT_ORGAN');
    first.required.push('COOKED');
    first.suggested.push('RAW');

    const second = resolveStateCoverage('MEAT_ORGAN');
    expect(second).toEqual({ required: ['RAW'], suggested: ['COOKED'] });
    expect(second.required).not.toBe(first.required);
    expect(second.suggested).not.toBe(first.suggested);

    const empty = resolveStateCoverage('OTHER');
    empty.required.push('RAW');
    empty.suggested.push('COOKED');
    expect(resolveStateCoverage('OTHER')).toEqual({
      required: [],
      suggested: [],
    });
  });

  it('does not share arrays between required and suggested', () => {
    for (const category of CATEGORIES) {
      const { required, suggested } = resolveStateCoverage(category);
      expect(required).not.toBe(suggested);
    }
  });
});

describe('resolveDefaultPrimaryState', () => {
  it('defaults to RAW for meat, organs, seafood and eggs', () => {
    expect(resolveDefaultPrimaryState('MEAT_ORGAN')).toBe('RAW');
  });

  it('defaults to COOKED for starchy vegetables', () => {
    expect(resolveDefaultPrimaryState('STARCHY_VEGETABLE')).toBe('COOKED');
  });

  it('defaults to RAW for other categories', () => {
    expect(resolveDefaultPrimaryState('OTHER')).toBe('RAW');
  });

  it('follows the required state whenever the category presets one', () => {
    for (const category of CATEGORIES) {
      const { required } = resolveStateCoverage(category);
      if (required.length > 0) {
        expect(resolveDefaultPrimaryState(category)).toBe(required[0]);
      }
    }
  });
});

describe('state coverage is advisory, not a save gate', () => {
  // `required` 只表达「这份档案建议一定要有」，**不阻断保存**：
  // 缺失时只提醒、可登记例外，是否拦截由终检决定（设计文档决定 #5，2026-10-22）。
  it('exposes only required and suggested lists, with no blocking flag', () => {
    for (const category of CATEGORIES) {
      expect(Object.keys(resolveStateCoverage(category)).sort()).toEqual([
        'required',
        'suggested',
      ]);
    }
  });

  it('is a deterministic pure mapping of the category argument', () => {
    for (const category of CATEGORIES) {
      expect(resolveStateCoverage(category)).toEqual(
        resolveStateCoverage(category),
      );
      expect(resolveDefaultPrimaryState(category)).toBe(
        resolveDefaultPrimaryState(category),
      );
    }
  });
});
