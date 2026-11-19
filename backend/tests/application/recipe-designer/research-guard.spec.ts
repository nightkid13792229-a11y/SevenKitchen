import {
  countFindHits,
  findQueryKey,
  nextZeroHitStreak,
} from '../../../src/application/recipe-designer/agent/research-guard';

describe('research guard', () => {
  describe('findQueryKey', () => {
    it('normalizes case and whitespace', () => {
      expect(findQueryKey({ query: '  OMEGA-3   fatty acids ' })).toBe(
        findQueryKey({ query: 'omega-3 fatty acids' }),
      );
      expect(findQueryKey({ query: 'OMEGA-3, fatty acids.' })).toBe(
        findQueryKey({ query: 'omega-3 fatty acids' }),
      );
    });

    it('keeps filters in the key', () => {
      const all = findQueryKey({ query: 'fat' });
      const scoped = findQueryKey({
        query: 'fat',
        collections: ['SACN5'],
        documentIds: ['doc-1'],
      });
      expect(all).not.toBe(scoped);
    });

    it('returns null when there is no query', () => {
      expect(findQueryKey({})).toBeNull();
      expect(findQueryKey(null)).toBeNull();
    });
  });

  describe('countFindHits', () => {
    it('returns the number of hits', () => {
      expect(countFindHits({ ok: true, data: { hits: [{}, {}] } })).toBe(2);
      expect(countFindHits({ ok: true, data: { hits: [] } })).toBe(0);
    });

    it('returns null for failures or non-find shapes', () => {
      expect(
        countFindHits({
          ok: false,
          error: { code: 'X', message: 'x' },
        }),
      ).toBeNull();
      expect(countFindHits({ ok: true, data: {} })).toBeNull();
    });
  });

  describe('nextZeroHitStreak', () => {
    it('increments on zero hits and resets on hits', () => {
      expect(nextZeroHitStreak(0, 0)).toBe(1);
      expect(nextZeroHitStreak(2, 0)).toBe(3);
      expect(nextZeroHitStreak(2, 1)).toBe(0);
    });

    it('preserves the streak when hits are unknown', () => {
      expect(nextZeroHitStreak(2, null)).toBe(2);
    });
  });
});
