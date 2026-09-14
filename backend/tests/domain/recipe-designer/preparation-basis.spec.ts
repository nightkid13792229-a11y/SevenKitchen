import {
  alignPreparationMethodBasis,
  isPreparationBasisConsistent,
} from 'src/domain/recipe-designer/preparation-basis';

describe('preparation basis alignment', () => {
  describe('alignPreparationMethodBasis', () => {
    it('keeps an already consistent raw basis', () => {
      expect(
        alignPreparationMethodBasis('去皮、生重、打碎、充分搅拌', 'RAW'),
      ).toBe('去皮、生重、打碎、充分搅拌');
    });

    it('replaces a cooked-weighing phrase when the profile is raw', () => {
      expect(alignPreparationMethodBasis('煮熟后称重、充分搅拌', 'RAW')).toBe(
        '生重、充分搅拌',
      );
      expect(
        alignPreparationMethodBasis('去瓤、去皮、煮熟后沥水、称重、打碎、充分搅拌', 'RAW'),
      ).toBe('去瓤、去皮、生重、打碎、充分搅拌');
    });

    it('keeps the blending step when replacing 「煮熟后打碎」', () => {
      expect(alignPreparationMethodBasis('煮熟后打碎', 'RAW')).toBe('生重、打碎');
    });

    it('replaces 熟重 with 生重 for a raw profile', () => {
      expect(
        alignPreparationMethodBasis('去皮、熟重、打碎、充分搅拌', 'RAW'),
      ).toBe('去皮、生重、打碎、充分搅拌');
    });

    it('inserts 生重 when the raw-profile text had no basis', () => {
      expect(alignPreparationMethodBasis('去皮、打碎、充分搅拌', 'RAW')).toBe(
        '去皮、生重、打碎、充分搅拌',
      );
    });

    it('turns 生重 into 熟重 for a cooked profile', () => {
      expect(alignPreparationMethodBasis('生重、打碎、充分搅拌', 'COOKED')).toBe(
        '熟重、打碎、充分搅拌',
      );
    });

    it('keeps a cooked-weighing phrase for a cooked profile', () => {
      expect(
        alignPreparationMethodBasis('煮熟后称重、打碎、充分搅拌', 'COOKED'),
      ).toBe('煮熟后称重、打碎、充分搅拌');
    });

    it('inserts 熟重 before 打碎 for a cooked profile without basis', () => {
      expect(alignPreparationMethodBasis('去皮、打碎、充分搅拌', 'COOKED')).toBe(
        '去皮、熟重、打碎、充分搅拌',
      );
    });

    it('uses 干重 for dried profiles', () => {
      expect(alignPreparationMethodBasis('生重、打粉、充分搅拌', 'DRIED')).toBe(
        '干重、打粉、充分搅拌',
      );
    });

    it('removes basis words for oil / powder / supplements', () => {
      expect(alignPreparationMethodBasis('生重、充分搅拌', 'OIL')).toBe('充分搅拌');
      expect(alignPreparationMethodBasis('熟重、充分搅拌', 'POWDER')).toBe('充分搅拌');
    });

    it('leaves unknown states and empty text untouched', () => {
      expect(alignPreparationMethodBasis('生重、打碎', 'MYSTERY_STATE')).toBe('生重、打碎');
      expect(alignPreparationMethodBasis('生重、打碎', null)).toBe('生重、打碎');
      expect(alignPreparationMethodBasis(null, 'COOKED')).toBeNull();
      expect(alignPreparationMethodBasis('', 'COOKED')).toBeNull();
    });

    it('turns a bare 称重 into the target basis word in place', () => {
      expect(
        alignPreparationMethodBasis('焯水沥干、称重、充分搅拌', 'COOKED'),
      ).toBe('焯水沥干、熟重、充分搅拌');
      expect(
        alignPreparationMethodBasis('焯水沥干、称重、充分搅拌', 'RAW'),
      ).toBe('焯水沥干、生重、充分搅拌');
    });

    it('keeps an existing 「…后称重」 wording for cooked profiles', () => {
      expect(
        alignPreparationMethodBasis('沥干后称重、称重、充分搅拌', 'COOKED'),
      ).toBe('沥干后称重、称重、充分搅拌');
    });
  });

  describe('isPreparationBasisConsistent', () => {
    it('accepts cooked profiles with 熟重 or a cooked-weighing phrase', () => {
      expect(isPreparationBasisConsistent('熟重、打碎', 'COOKED')).toBe(true);
      expect(isPreparationBasisConsistent('煮熟后称重、打碎', 'COOKED')).toBe(true);
    });

    it('rejects cooked profiles that say 生重', () => {
      expect(isPreparationBasisConsistent('生重、打碎', 'COOKED')).toBe(false);
    });

    it('rejects raw profiles that say 熟重 or 煮熟后称重', () => {
      expect(isPreparationBasisConsistent('熟重、打碎', 'RAW')).toBe(false);
      expect(isPreparationBasisConsistent('煮熟后称重、打碎', 'RAW')).toBe(false);
    });

    it('accepts raw profiles with 生重 and dried profiles with 干重', () => {
      expect(isPreparationBasisConsistent('生重、打碎', 'RAW')).toBe(true);
      expect(isPreparationBasisConsistent('干重、打粉', 'DRIED')).toBe(true);
    });

    it('rejects basis words on oil / powder profiles', () => {
      expect(isPreparationBasisConsistent('生重、充分搅拌', 'OIL')).toBe(false);
      expect(isPreparationBasisConsistent('充分搅拌', 'OIL')).toBe(true);
    });

    it('treats missing text or unknown state as consistent', () => {
      expect(isPreparationBasisConsistent('', 'COOKED')).toBe(true);
      expect(isPreparationBasisConsistent('生重、打碎', 'MYSTERY_STATE')).toBe(true);
    });
  });
});
