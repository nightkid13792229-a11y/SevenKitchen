import {
  rankNutritionSourceCandidates,
  type NutritionSourceCandidate,
  type NutritionStateTag,
} from 'src/application/standard-ingredient-import/source-policy';

const primaryOfficialSources = [
  'USDA_FDC',
  'NZFCD',
  'NEVO',
  'MEXT',
  'AFCD',
  'AUSNUT',
  'CNF',
  'COFID',
  'CIQUAL',
];

const supportedStateTags: NutritionStateTag[] = [
  'raw',
  'cooked',
  'dried',
  'peeled',
  'unpeeled',
  'oil',
  'powder',
  'prepared',
];

describe('rankNutritionSourceCandidates', () => {
  it('accepts primary approved official sources as primary candidates', () => {
    const candidates = primaryOfficialSources.map((source) =>
      makeCandidate({ source }),
    );

    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });

    expect(ranked.map((candidate) => candidate.source)).toEqual(
      primaryOfficialSources,
    );
    expect(ranked.every((candidate) => candidate.fallbackOnly === false)).toBe(
      true,
    );
  });

  it('filters out CFCT when a primary official source meets the default coverage threshold', () => {
    const candidates: NutritionSourceCandidate[] = [
      makeCandidate({ source: 'CFCT', essentialCoveragePercent: 91 }),
      makeCandidate({ source: 'USDA_FDC', essentialCoveragePercent: 82 }),
    ];

    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });

    expect(ranked.map((candidate) => candidate.source)).toEqual(['USDA_FDC']);
  });

  it('accepts CFCT as fallback when no primary candidate is available', () => {
    const candidates: NutritionSourceCandidate[] = [
      makeCandidate({ source: 'CFCT', essentialCoveragePercent: 89 }),
      makeCandidate({ source: 'MARKETPLACE_VENDOR_NUTRITION' }),
    ];

    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });

    expect(ranked).toEqual([
      expect.objectContaining({
        source: 'CFCT',
        fallbackOnly: true,
      }),
    ]);
  });

  it('allows CFCT when matching primary official coverage is below the default threshold', () => {
    const candidates: NutritionSourceCandidate[] = [
      makeCandidate({ source: 'USDA_FDC', essentialCoveragePercent: 59 }),
      makeCandidate({ source: 'CFCT', essentialCoveragePercent: 90 }),
    ];

    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });

    expect(ranked[0].source).toBe('CFCT');
    expect(ranked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'CFCT',
          fallbackOnly: true,
        }),
      ]),
    );
  });

  it('uses custom minimum primary coverage when deciding whether CFCT is blocked', () => {
    const candidates: NutritionSourceCandidate[] = [
      makeCandidate({ source: 'USDA_FDC', essentialCoveragePercent: 72 }),
      makeCandidate({ source: 'CFCT', essentialCoveragePercent: 90 }),
    ];
    const customThresholdInput = {
      requestedState: 'raw' as const,
      candidates,
      minimumPrimaryCoveragePercent: 75,
    };

    const defaultRanked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });
    const customThresholdRanked = rankNutritionSourceCandidates(
      customThresholdInput,
    );

    expect(defaultRanked.map((candidate) => candidate.source)).toEqual([
      'USDA_FDC',
    ]);
    expect(
      customThresholdRanked.map((candidate) => candidate.source),
    ).toContain('CFCT');
  });

  it('rejects unofficial scraped pages, marketplaces, blogs, and LLM nutrient summaries', () => {
    const candidates: NutritionSourceCandidate[] = [
      makeCandidate({ source: 'SCRAPED_WEB_PAGE' }),
      makeCandidate({ source: 'MARKETPLACE_VENDOR_NUTRITION' }),
      makeCandidate({ source: 'BLOG_NUTRITION_TABLE' }),
      makeCandidate({ source: 'LLM_GENERATED_NUTRIENT_SUMMARY' }),
      makeCandidate({ source: 'NZFCD' }),
    ];

    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });

    expect(ranked.map((candidate) => candidate.source)).toEqual(['NZFCD']);
  });

  it('requires candidates to declare state tags', () => {
    const candidates: NutritionSourceCandidate[] = [
      makeCandidate({ source: 'USDA_FDC', stateTags: undefined }),
      makeCandidate({ source: 'NEVO', stateTags: [] }),
      makeCandidate({ source: 'MEXT', stateTags: ['raw'] }),
    ];

    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });

    expect(ranked.map((candidate) => candidate.source)).toEqual(['MEXT']);
  });

  it('rejects candidates with contradictory state tags', () => {
    const rawRanked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates: [
        makeCandidate({
          source: 'USDA_FDC',
          stateTags: ['raw', 'cooked'],
        }),
        makeCandidate({
          source: 'NZFCD',
          stateTags: ['raw'],
        }),
      ],
    });
    const peeledRanked = rankNutritionSourceCandidates({
      requestedState: 'peeled',
      candidates: [
        makeCandidate({
          source: 'NEVO',
          stateTags: ['peeled', 'unpeeled'],
        }),
        makeCandidate({
          source: 'COFID',
          stateTags: ['peeled'],
        }),
      ],
    });

    expect(rawRanked.map((candidate) => candidate.source)).toEqual(['NZFCD']);
    expect(peeledRanked.map((candidate) => candidate.source)).toEqual([
      'COFID',
    ]);
  });

  it('accepts candidates declaring supported state tags', () => {
    const rankedSources = supportedStateTags.map((stateTag) => {
      const ranked = rankNutritionSourceCandidates({
        requestedState: stateTag,
        candidates: [
          makeCandidate({
            source: 'AFCD',
            stateTags: [stateTag],
          }),
        ],
      });

      return ranked[0]?.source;
    });

    expect(rankedSources).toEqual(
      supportedStateTags.map(() => 'AFCD'),
    );
  });

  it('prefers same-source raw and cooked pair availability among semantic matches', () => {
    const candidates: NutritionSourceCandidate[] = [
      makeCandidate({
        source: 'USDA_FDC',
        stateTags: ['raw'],
        essentialCoveragePercent: 80,
      }),
      makeCandidate({
        source: 'USDA_FDC',
        stateTags: ['cooked'],
        essentialCoveragePercent: 80,
      }),
      makeCandidate({
        source: 'NEVO',
        stateTags: ['raw'],
        essentialCoveragePercent: 80,
      }),
    ];

    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });

    expect(ranked.map((candidate) => candidate.source)).toEqual([
      'USDA_FDC',
      'NEVO',
    ]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('does not let raw and cooked pair availability override a semantic mismatch', () => {
    const candidates: NutritionSourceCandidate[] = [
      makeCandidate({
        source: 'USDA_FDC',
        stateTags: ['cooked'],
        essentialCoveragePercent: 100,
      }),
      makeCandidate({
        source: 'NEVO',
        stateTags: ['raw'],
        essentialCoveragePercent: 72,
      }),
    ];

    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });

    expect(ranked.map((candidate) => candidate.source)).toEqual(['NEVO']);
  });

  it('allows CFCT when a high-coverage primary official source has the wrong state', () => {
    const candidates: NutritionSourceCandidate[] = [
      makeCandidate({
        source: 'USDA_FDC',
        stateTags: ['cooked'],
        essentialCoveragePercent: 100,
      }),
      makeCandidate({
        source: 'CFCT',
        stateTags: ['raw'],
        essentialCoveragePercent: 88,
      }),
    ];

    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });

    expect(ranked.map((candidate) => candidate.source)).toEqual(['CFCT']);
  });

  it('requires an explicit requested state change before using a cooked profile for a raw request', () => {
    const cookedCandidate = makeCandidate({
      source: 'CIQUAL',
      stateTags: ['cooked'],
      essentialCoveragePercent: 100,
    });

    const rawRanked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates: [cookedCandidate],
    });
    const cookedRanked = rankNutritionSourceCandidates({
      requestedState: 'cooked',
      candidates: [cookedCandidate],
    });

    expect(rawRanked).toEqual([]);
    expect(cookedRanked[0].source).toBe('CIQUAL');
  });
});

function makeCandidate(
  overrides: Partial<NutritionSourceCandidate> = {},
): NutritionSourceCandidate {
  return {
    source: 'USDA_FDC',
    matchedName: 'Chicken breast',
    stateTags: ['raw'],
    essentialCoveragePercent: 90,
    ...overrides,
  };
}
