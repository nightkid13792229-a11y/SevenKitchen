import { cleanSurface, verifyAgainstPages } from '../supplement-kb-form';

const pages = [
  {
    documentId: 'sacn5-chapters-SACN5-15',
    page: 10,
    text: 'Oxides of iron should not be used as an iron source because they are poorly available.',
  },
];

describe('cleanSurface', () => {
  it('去掉引号与括号注释', () => {
    expect(cleanSurface('“copper oxide” (CuO)')).toBe('copper oxide');
    expect(cleanSurface('  bis-glycinate,  ')).toBe('bis-glycinate');
  });
});

describe('verifyAgainstPages', () => {
  it('词与原句都在该页 → 通过', () => {
    expect(
      verifyAgainstPages(
        {
          surface: 'Oxides of iron',
          quote: 'Oxides of iron should not be used as an iron source',
          documentId: 'sacn5-chapters-SACN5-15',
          page: 10,
        },
        pages,
      ),
    ).toBe(true);
  });

  it('原文里没有这个词 → 丢弃', () => {
    expect(
      verifyAgainstPages(
        {
          surface: 'bisglycinate',
          quote: 'Oxides of iron should not be used as an iron source',
          documentId: 'sacn5-chapters-SACN5-15',
          page: 10,
        },
        pages,
      ),
    ).toBe(false);
  });

  it('引用原句不在该页 → 丢弃', () => {
    expect(
      verifyAgainstPages(
        {
          surface: 'Oxides of iron',
          quote: 'This sentence is not in that page at all',
          documentId: 'sacn5-chapters-SACN5-15',
          page: 10,
        },
        pages,
      ),
    ).toBe(false);
  });

  it('页码对不上 → 丢弃', () => {
    expect(
      verifyAgainstPages(
        {
          surface: 'Oxides of iron',
          quote: 'Oxides of iron should not be used as an iron source',
          documentId: 'sacn5-chapters-SACN5-15',
          page: 11,
        },
        pages,
      ),
    ).toBe(false);
  });

  it('大小写与连字符差异不影响命中', () => {
    expect(
      verifyAgainstPages(
        {
          surface: 'OXIDES-OF-IRON',
          quote: 'oxides of iron should not be used as an iron source',
          documentId: 'sacn5-chapters-SACN5-15',
          page: 10,
        },
        pages,
      ),
    ).toBe(true);
  });

  it('太短的引用不算证据', () => {
    expect(
      verifyAgainstPages(
        { surface: 'iron', quote: 'iron', documentId: 'sacn5-chapters-SACN5-15', page: 10 },
        pages,
      ),
    ).toBe(false);
  });
});
