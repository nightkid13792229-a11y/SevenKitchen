import {
  buildSeriesReleaseReadiness,
  type BuildSeriesReleaseReadinessInput,
  type SeriesReleaseStageSnapshot,
} from '../../../src/domain/recipe-designer/series-release-readiness';

/**
 * 产品线整系列发布门槛（2026-10-22 · 两阶段发布）。
 *
 * 覆盖：
 *  · 必填阶段为空 / 缺失设计 / 只有设计稿 / 已有阶段食谱 / 已公开；
 *  · 展示资料（封面图 / 封面标题 / 卖点）阻断，健康标签只提醒；
 *  · 阻断项 scope 必须是 SERIES / PRESENTATION / STAGE；
 *  · 未勾选的已设计阶段不阻断发布，但仍出现在全量 stages 里。
 */

function stage(
  overrides: Partial<SeriesReleaseStageSnapshot> &
    Pick<SeriesReleaseStageSnapshot, 'stageCode' | 'label'>,
): SeriesReleaseStageSnapshot {
  return {
    status: 'EMPTY',
    latestRecipeId: null,
    latestRecipeVersion: null,
    designDraftId: null,
    ...overrides,
  };
}

function baseStages(): SeriesReleaseStageSnapshot[] {
  return [
    stage({
      stageCode: 'PUPPY_UNDER_14_WEEKS',
      label: '小于 14 周幼犬',
    }),
    stage({
      stageCode: 'PUPPY_14_WEEKS_PLUS',
      label: '14 周以上幼犬',
    }),
    stage({
      stageCode: 'HIGH_ACTIVITY_ADULT',
      label: '普通成年犬',
    }),
    stage({
      stageCode: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      label: '低能量成年犬 / 老年犬',
    }),
    stage({
      stageCode: 'REPRODUCTION',
      label: '繁殖期',
    }),
  ];
}

function withStage(
  stageCode: string,
  overrides: Partial<SeriesReleaseStageSnapshot>,
): SeriesReleaseStageSnapshot[] {
  return baseStages().map((entry) =>
    entry.stageCode === stageCode ? { ...entry, ...overrides } : entry,
  );
}

function readyStages(): SeriesReleaseStageSnapshot[] {
  return withStage('HIGH_ACTIVITY_ADULT', {
    status: 'READY',
    latestRecipeId: 'recipe-adult',
    latestRecipeVersion: 2,
    designDraftId: 'draft-adult',
  }).map((entry) =>
    entry.stageCode === 'LOW_ACTIVITY_ADULT_OR_SENIOR'
      ? {
          ...entry,
          status: 'PUBLIC' as const,
          latestRecipeId: 'recipe-senior',
          latestRecipeVersion: 1,
        }
      : entry,
  );
}

function baseInput(
  overrides: Partial<BuildSeriesReleaseReadinessInput> = {},
): BuildSeriesReleaseReadinessInput {
  return {
    seriesId: 'series-1',
    designMode: 'CATALOG',
    requiredLifeStages: ['HIGH_ACTIVITY_ADULT', 'LOW_ACTIVITY_ADULT_OR_SENIOR'],
    presentation: {
      coverImageUrl: 'https://img.example.com/series-cover.jpg',
      coverTitle: '鲜肉双阶段',
      sellingPoint: '两种能量，一套配方',
      targetHealthTags: ['JOINT'],
    },
    stages: readyStages(),
    ...overrides,
  };
}

const codes = (issues: Array<{ code: string }>) =>
  issues.map((issue) => issue.code);

describe('buildSeriesReleaseReadiness', () => {
  it('is ready when every required stage has a series warehouse recipe', () => {
    const readiness = buildSeriesReleaseReadiness(baseInput());

    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.warnings).toEqual([]);
    expect(readiness.requiredLifeStages).toEqual([
      'HIGH_ACTIVITY_ADULT',
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
    ]);
    expect(readiness.requiredStages).toEqual([
      expect.objectContaining({
        stageCode: 'HIGH_ACTIVITY_ADULT',
        required: true,
        status: 'READY',
        latestRecipeId: 'recipe-adult',
        latestRecipeVersion: 2,
        designDraftId: 'draft-adult',
      }),
      expect.objectContaining({
        stageCode: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        required: true,
        status: 'PUBLIC',
        latestRecipeId: 'recipe-senior',
        latestRecipeVersion: 1,
      }),
    ]);
    expect(readiness.summary).toEqual({
      requiredStageCount: 2,
      readyStageCount: 2,
      publishedStageCount: 1,
      designedStageCount: 2,
    });
    expect(readiness.stages.every((entry) => entry.required === false)).toBe(
      false,
    );
  });

  it('blocks when no required life stages are configured', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({ requiredLifeStages: [] }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual([
      expect.objectContaining({
        code: 'REQUIRED_LIFE_STAGES_EMPTY',
        scope: 'SERIES',
        field: 'requiredLifeStages',
      }),
    ]);
  });

  it('blocks EMPTY and DRAFT required stages with STAGE scope', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({
        requiredLifeStages: [
          'PUPPY_UNDER_14_WEEKS',
          'PUPPY_14_WEEKS_PLUS',
          'HIGH_ACTIVITY_ADULT',
        ],
        stages: readyStages().map((entry) =>
          entry.stageCode === 'PUPPY_14_WEEKS_PLUS'
            ? {
                ...entry,
                status: 'DRAFT' as const,
                designDraftId: 'draft-puppy',
              }
            : entry,
        ),
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.summary.readyStageCount).toBe(1);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'REQUIRED_STAGE_NOT_READY',
          scope: 'STAGE',
          stageCode: 'PUPPY_UNDER_14_WEEKS',
          field: 'requiredLifeStages',
          message: expect.stringContaining('没有任何设计稿'),
        }),
        expect.objectContaining({
          code: 'REQUIRED_STAGE_NOT_READY',
          scope: 'STAGE',
          stageCode: 'PUPPY_14_WEEKS_PLUS',
          message: expect.stringContaining('尚未保存为系列仓库'),
        }),
      ]),
    );
    expect(
      readiness.blockers.some(
        (blocker) => blocker.stageCode === 'HIGH_ACTIVITY_ADULT',
      ),
    ).toBe(false);
  });

  it('treats a PUBLIC required stage as ready (already released stages are not blocked)', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({
        requiredLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
      }),
    );

    expect(readiness.ready).toBe(true);
    expect(readiness.requiredStages).toHaveLength(1);
    expect(readiness.requiredStages[0].status).toBe('PUBLIC');
  });

  it('does not block on designed stages that are not required', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({
        stages: readyStages().map((entry) =>
          entry.stageCode === 'REPRODUCTION'
            ? {
                ...entry,
                status: 'READY' as const,
                latestRecipeId: 'recipe-repro',
                latestRecipeVersion: 1,
              }
            : entry,
        ),
      }),
    );

    expect(readiness.ready).toBe(true);
    expect(
      readiness.stages.find((entry) => entry.stageCode === 'REPRODUCTION'),
    ).toMatchObject({ required: false, status: 'READY' });
    expect(readiness.summary.designedStageCount).toBe(3);
  });

  it('blocks missing series presentation and only warns on health tags', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({
        presentation: {
          coverImageUrl: '   ',
          coverTitle: null,
          sellingPoint: '',
          targetHealthTags: [],
        },
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'COVER_IMAGE_REQUIRED',
          scope: 'PRESENTATION',
          field: 'coverImageUrl',
        }),
        expect.objectContaining({
          code: 'COVER_TITLE_REQUIRED',
          scope: 'PRESENTATION',
          field: 'coverTitle',
        }),
        expect.objectContaining({
          code: 'SELLING_POINT_REQUIRED',
          scope: 'PRESENTATION',
          field: 'sellingPoint',
        }),
      ]),
    );
    expect(readiness.warnings).toEqual([
      expect.objectContaining({
        code: 'TARGET_HEALTH_TAGS_MISSING',
        scope: 'PRESENTATION',
        field: 'targetHealthTags',
      }),
    ]);
    expect(codes(readiness.blockers)).not.toContain(
      'TARGET_HEALTH_TAGS_MISSING',
    );
  });

  it('blocks unknown required stage codes instead of silently ignoring them', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({
        requiredLifeStages: ['UNKNOWN_STAGE', 'HIGH_ACTIVITY_ADULT'],
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'REQUIRED_LIFE_STAGE_UNKNOWN',
          scope: 'STAGE',
          stageCode: 'UNKNOWN_STAGE',
        }),
      ]),
    );
  });

  it('only uses SERIES / PRESENTATION / STAGE scopes', () => {
    const allowedScopes = new Set(['SERIES', 'PRESENTATION', 'STAGE']);
    const stageAndPresentation = buildSeriesReleaseReadiness(
      baseInput({
        requiredLifeStages: ['PUPPY_UNDER_14_WEEKS', 'UNKNOWN_STAGE'],
        presentation: { targetHealthTags: [] },
      }),
    );
    const seriesAndPresentation = buildSeriesReleaseReadiness(
      baseInput({
        requiredLifeStages: [],
        presentation: { targetHealthTags: [] },
      }),
    );

    const issues = [
      ...stageAndPresentation.blockers,
      ...stageAndPresentation.warnings,
      ...seriesAndPresentation.blockers,
      ...seriesAndPresentation.warnings,
    ];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => allowedScopes.has(issue.scope))).toBe(true);
    expect(
      seriesAndPresentation.blockers.some(
        (blocker) => blocker.scope === 'SERIES',
      ),
    ).toBe(true);
  });
});
