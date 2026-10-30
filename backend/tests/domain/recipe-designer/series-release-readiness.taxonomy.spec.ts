import {
  buildSeriesReleaseReadiness,
  type BuildSeriesReleaseReadinessInput,
} from 'src/domain/recipe-designer/series-release-readiness';

const stage = {
  stageCode: 'HIGH_ACTIVITY_ADULT',
  status: 'READY' as const,
  draftId: 'd1',
  latestRecipeVersion: 1,
  publishedRecipeVersion: null,
};

function input(
  taxonomyLinkCount: number,
  overrides: Partial<BuildSeriesReleaseReadinessInput> = {},
): BuildSeriesReleaseReadinessInput {
  return {
    seriesId: 's1',
    designMode: 'CATALOG',
    businessStatus: 'DRAFT',
    requiredLifeStages: ['HIGH_ACTIVITY_ADULT'],
    presentation: {
      coverImageUrl: 'https://x/a.png',
      coverTitle: '封面',
      sellingPoint: '卖点',
    },
    stages: [stage],
    taxonomyLinkCount,
    ...overrides,
  };
}

function hasTaxonomyBlocker(seed: BuildSeriesReleaseReadinessInput): boolean {
  return buildSeriesReleaseReadiness(seed).blockers.some(
    (item) => item.code === 'TAXONOMY_REQUIRED',
  );
}

describe('发布门禁 · 已归类', () => {
  it('一条归属都没有时阻断', () => {
    expect(hasTaxonomyBlocker(input(0))).toBe(true);
  });

  it('挂了一个分类就放行', () => {
    expect(hasTaxonomyBlocker(input(1))).toBe(false);
  });

  it('只挂场景、没有主蛋白也算已归类（双拼菜）', () => {
    // 归属数只看条数，不看分类种类：只挂「场景」也是 1 条
    expect(hasTaxonomyBlocker(input(1))).toBe(false);
  });

  it('定制系列不计算这条门禁', () => {
    expect(
      hasTaxonomyBlocker(input(0, { businessStatus: 'PRIVATE_CUSTOM' })),
    ).toBe(false);
    expect(hasTaxonomyBlocker(input(0, { designMode: 'ORDER' }))).toBe(false);
  });

  it('阻断项属于系列级，并带一句人话', () => {
    const blocker = buildSeriesReleaseReadiness(input(0)).blockers.find(
      (item) => item.code === 'TAXONOMY_REQUIRED',
    );
    expect(blocker?.scope).toBe('SERIES');
    expect(blocker?.message).toContain('需求分类');
  });
});
