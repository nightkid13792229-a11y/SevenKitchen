import {
  getSearchMatch,
  rankSearchCandidates,
} from '../../../src/domain/search-governance/search-matcher';

describe('search matcher', () => {
  it('scores exact, prefix, contains, reverse contains, and near CJK matches', () => {
    expect(getSearchMatch('鸡胸', '鸡胸')?.type).toBe('EXACT');
    expect(getSearchMatch('鸡胸', '鸡')?.type).toBe('PREFIX');
    expect(getSearchMatch('去皮鸡胸', '鸡胸')?.type).toBe('CONTAINS');
    expect(getSearchMatch('鸡胸', '鸡胸肉')?.type).toBe('REVERSE_CONTAINS');
    expect(getSearchMatch('西兰花', '西蓝花')?.type).toBe('NEAR_CJK');
  });

  it('ranks primary field matches ahead of aliases and secondary fields', () => {
    const ranked = rankSearchCandidates(
      [
        {
          id: 'brand-match',
          label: 'A',
          primaryTexts: ['鸭胸'],
          aliasTexts: [],
          secondaryTexts: ['鸡胸肉品牌'],
        },
        {
          id: 'alias-match',
          label: 'B',
          primaryTexts: ['鸡胸'],
          aliasTexts: ['鸡胸肉'],
          secondaryTexts: [],
        },
        {
          id: 'exact-match',
          label: 'C',
          primaryTexts: ['鸡胸肉'],
          aliasTexts: [],
          secondaryTexts: [],
        },
      ],
      '鸡胸肉',
    );

    expect(ranked.map((item) => item.id)).toEqual([
      'exact-match',
      'alias-match',
      'brand-match',
    ]);
    expect(ranked[0].match?.type).toBe('EXACT');
  });

  it('keeps secondary prefix and contains matches at secondary priority', () => {
    expect(getSearchMatch('鸡胸肉品牌', '鸡胸肉', 'SECONDARY')).toEqual({
      type: 'SECONDARY',
      score: 60,
      matchedText: '鸡胸肉品牌',
      query: '鸡胸肉',
    });

    const ranked = rankSearchCandidates(
      [
        {
          id: 'secondary-brand',
          label: 'A',
          primaryTexts: ['鸭胸'],
          secondaryTexts: ['鸡胸肉品牌'],
        },
        {
          id: 'primary-reverse',
          label: 'B',
          primaryTexts: ['鸡胸'],
          secondaryTexts: [],
        },
      ],
      '鸡胸肉',
    );

    expect(ranked.map((item) => item.id)).toEqual([
      'primary-reverse',
      'secondary-brand',
    ]);
    expect(ranked[0].match?.type).toBe('REVERSE_CONTAINS');
    expect(ranked[1].match?.type).toBe('SECONDARY');
    expect(ranked[1].match?.score).toBe(60);
  });

  it('scores alias exact matches above primary partial matches', () => {
    const ranked = rankSearchCandidates(
      [
        {
          id: 'primary-prefix',
          label: 'A',
          primaryTexts: ['鸡胸肉品牌'],
          aliasTexts: [],
          secondaryTexts: [],
        },
        {
          id: 'alias-exact',
          label: 'B',
          primaryTexts: ['鸭胸'],
          aliasTexts: ['鸡胸肉'],
          secondaryTexts: [],
        },
      ],
      '鸡胸肉',
    );

    expect(ranked.map((item) => item.id)).toEqual([
      'alias-exact',
      'primary-prefix',
    ]);
    expect(ranked[0].match?.type).toBe('ALIAS_EXACT');
    expect(ranked[0].match?.score).toBe(116);
  });

  it('keeps alias partial matches at their real match priority', () => {
    const aliasPartial = rankSearchCandidates(
      [
        {
          id: 'alias-partial',
          label: 'A',
          primaryTexts: ['鸭胸'],
          aliasTexts: ['鸡胸肉品牌'],
          secondaryTexts: [],
        },
      ],
      '鸡胸肉',
    );

    expect(aliasPartial[0].match?.type).toBe('PREFIX');
    expect(aliasPartial[0].match?.score).toBe(105);

    const ranked = rankSearchCandidates(
      [
        {
          id: 'alias-partial',
          label: 'A',
          primaryTexts: ['鸭胸'],
          aliasTexts: ['鸡胸肉品牌'],
          secondaryTexts: [],
        },
        {
          id: 'primary-exact',
          label: 'B',
          primaryTexts: ['鸡胸肉'],
          aliasTexts: [],
          secondaryTexts: [],
        },
      ],
      '鸡胸肉',
    );

    expect(ranked.map((item) => item.id)).toEqual([
      'primary-exact',
      'alias-partial',
    ]);
    expect(ranked[0].match?.type).toBe('EXACT');
    expect(ranked[1].match?.type).not.toBe('ALIAS_EXACT');
  });
});
