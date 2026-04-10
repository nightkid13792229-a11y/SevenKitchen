import {
  buildRecipeAuditReport,
  parseRecipeStatsAuditArgs,
  sortAuditReportsByRisk,
  type AuditedRecipeVersion,
} from 'src/support/recipe-stats-audit';

function makeVersion(
  overrides: Partial<AuditedRecipeVersion> = {},
): AuditedRecipeVersion {
  return {
    internalId: 'recipe-v1',
    businessRecipeId: 'recipe-1',
    name: '测试食谱',
    version: 1,
    status: 'PUBLIC',
    favoriteCount: 3,
    actualFavoriteRecords: 3,
    viewCount: 12,
    diyGenCount: 4,
    createdAt: new Date('2026-04-10T08:00:00.000Z'),
    updatedAt: new Date('2026-04-10T08:00:00.000Z'),
    ...overrides,
  };
}

describe('recipe stats audit', () => {
  it('returns no flags for a single public version with matching favorite count', () => {
    const report = buildRecipeAuditReport([
      makeVersion(),
    ]);

    expect(report.flags).toHaveLength(0);
    expect(report.latestPublicVersion?.internalId).toBe('recipe-v1');
    expect(report.latestOverallVersion.internalId).toBe('recipe-v1');
  });

  it('flags favorite count mismatch when aggregate count differs from favorite records', () => {
    const report = buildRecipeAuditReport([
      makeVersion({
        favoriteCount: 5,
        actualFavoriteRecords: 3,
      }),
    ]);

    expect(report.flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'favorite_count_mismatch',
          severity: 'high',
        }),
      ]),
    );
  });

  it('flags version drift when latest overall version differs from latest public version', () => {
    const report = buildRecipeAuditReport([
      makeVersion({
        internalId: 'recipe-v2',
        version: 2,
        status: 'DRAFT',
        favoriteCount: 0,
        actualFavoriteRecords: 0,
        viewCount: 20,
        diyGenCount: 8,
      }),
      makeVersion({
        internalId: 'recipe-v1',
        version: 1,
        status: 'PUBLIC',
        favoriteCount: 3,
        actualFavoriteRecords: 3,
        viewCount: 12,
        diyGenCount: 4,
      }),
    ]);

    expect(report.flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'version_drift',
          severity: 'medium',
        }),
        expect.objectContaining({
          code: 'view_count_not_fully_auditable',
          severity: 'info',
        }),
        expect.objectContaining({
          code: 'diy_gen_count_not_fully_auditable',
          severity: 'info',
        }),
      ]),
    );
  });

  it('flags favorite records attached to a non-displayed version', () => {
    const report = buildRecipeAuditReport([
      makeVersion({
        internalId: 'recipe-v2',
        version: 2,
        status: 'DRAFT',
        favoriteCount: 2,
        actualFavoriteRecords: 2,
      }),
      makeVersion({
        internalId: 'recipe-v1',
        version: 1,
        status: 'PUBLIC',
        favoriteCount: 1,
        actualFavoriteRecords: 1,
      }),
    ]);

    expect(report.flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'favorite_records_on_non_displayed_version',
          severity: 'high',
        }),
      ]),
    );
  });

  it('treats missing public version as an informational audit flag', () => {
    const report = buildRecipeAuditReport([
      makeVersion({
        internalId: 'recipe-v2',
        version: 2,
        status: 'PRIVATE',
      }),
    ]);

    expect(report.flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_public_version',
          severity: 'info',
        }),
      ]),
    );
  });

  it('sorts higher risk reports ahead of lower risk reports', () => {
    const okReport = buildRecipeAuditReport([
      makeVersion({
        businessRecipeId: 'recipe-ok',
        internalId: 'recipe-ok-v1',
      }),
    ]);
    const riskyReport = buildRecipeAuditReport([
      makeVersion({
        businessRecipeId: 'recipe-risky',
        internalId: 'recipe-risky-v2',
        version: 2,
        status: 'DRAFT',
        favoriteCount: 2,
        actualFavoriteRecords: 2,
      }),
      makeVersion({
        businessRecipeId: 'recipe-risky',
        internalId: 'recipe-risky-v1',
        version: 1,
        status: 'PUBLIC',
        favoriteCount: 1,
        actualFavoriteRecords: 0,
      }),
    ]);

    expect(sortAuditReportsByRisk([okReport, riskyReport]).map((report) => report.businessRecipeId)).toEqual([
      'recipe-risky',
      'recipe-ok',
    ]);
  });

  it('parses recipe-specific CLI arguments', () => {
    expect(
      parseRecipeStatsAuditArgs([
        '--recipe',
        'recipe-123',
        '--include-ok',
        '--limit',
        '5',
      ]),
    ).toEqual({
      recipeId: 'recipe-123',
      includeOk: true,
      limit: 5,
    });
  });

  it('uses safe defaults for CLI arguments', () => {
    expect(parseRecipeStatsAuditArgs([])).toEqual({
      recipeId: null,
      includeOk: false,
      limit: 20,
    });
  });
});
