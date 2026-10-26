import {
  buildSeriesReleaseReadiness,
  type BuildSeriesReleaseReadinessInput,
  type SeriesReleaseStageSnapshot,
} from '../../../src/domain/recipe-designer/series-release-readiness';

/**
 * 产品线「发布 / 更新」范围（2026-10-26 · 发布口径改为按阶段状态推导）。
 *
 * 覆盖：
 *  · 可操作阶段（READY / PUBLIC+待更新）与不可操作阶段；
 *  · summary 的全量统计口径与 canRelease；
 *  · 只有 1 个 READY 阶段也能首次发布；
 *  · 封面图 / 卖点仍是阻断，封面标题不再阻断；
 *  · 未设置封面角标只提醒，不阻断；
 *  · 待更新 / releaseState / 版本号归一化等既有能力。
 */

function stage(
  overrides: Partial<SeriesReleaseStageSnapshot> &
    Pick<SeriesReleaseStageSnapshot, 'stageCode' | 'label'>,
): SeriesReleaseStageSnapshot {
  return {
    status: 'EMPTY',
    latestRecipeId: null,
    latestRecipeVersion: null,
    publishedRecipeVersion: null,
    hasPendingUpdate: false,
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
          publishedRecipeVersion: 1,
        }
      : entry,
  );
}

function withReadyStage(
  stageCode: string,
  overrides: Partial<SeriesReleaseStageSnapshot>,
): SeriesReleaseStageSnapshot[] {
  return readyStages().map((entry) =>
    entry.stageCode === stageCode ? { ...entry, ...overrides } : entry,
  );
}

function baseInput(
  overrides: Partial<BuildSeriesReleaseReadinessInput> = {},
): BuildSeriesReleaseReadinessInput {
  return {
    seriesId: 'series-1',
    designMode: 'CATALOG',
    presentation: {
      coverImageUrl: 'https://img.example.com/series-cover.jpg',
      coverTitle: null,
      sellingPoint: '两种能量，一套配方',
      targetHealthTags: ['JOINT'],
      coverBadges: ['低脂'],
    },
    stages: readyStages(),
    ...overrides,
  };
}

const codes = (issues: Array<{ code: string }>) =>
  issues.map((issue) => issue.code);

describe('buildSeriesReleaseReadiness', () => {
  it('marks READY and PUBLIC+pending stages as actionable', () => {
    const result = buildSeriesReleaseReadiness({
      seriesId: 's1',
      designMode: 'CATALOG',
      businessStatus: 'PUBLIC',
      presentation: {
        coverImageUrl: 'https://cdn.example.com/c.jpg',
        coverTitle: null,
        sellingPoint: '低脂易消化',
        coverBadges: ['低脂'],
      },
      stages: [
        stage({
          stageCode: 'PUPPY_UNDER_14_WEEKS',
          label: '幼犬',
          status: 'READY',
        }),
        stage({
          stageCode: 'HIGH_ACTIVITY_ADULT',
          label: '成犬',
          status: 'PUBLIC',
          latestRecipeVersion: 4,
          publishedRecipeVersion: 3,
          hasPendingUpdate: true,
        }),
        stage({
          stageCode: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          label: '老年犬',
          status: 'PUBLIC',
          latestRecipeVersion: 2,
          publishedRecipeVersion: 2,
        }),
      ],
    });

    expect(
      result.stages.map((entry) => [entry.stageCode, entry.actionable]),
    ).toEqual([
      ['PUPPY_UNDER_14_WEEKS', true],
      ['HIGH_ACTIVITY_ADULT', true],
      ['LOW_ACTIVITY_ADULT_OR_SENIOR', false],
    ]);
    expect(result.summary).toEqual({
      totalStageCount: 3,
      publishableStageCount: 1,
      pendingStageCount: 1,
      publishedStageCount: 2,
      upToDateStageCount: 1,
      designedStageCount: 3,
      actionableStageCount: 2,
    });
    expect(result.canRelease).toBe(true);
    expect(result.presentation.coverBadges).toEqual(['低脂']);
  });

  it('does not block on a missing cover title; warns when no badge is set', () => {
    const result = buildSeriesReleaseReadiness({
      seriesId: 's1',
      designMode: 'CATALOG',
      presentation: {
        coverImageUrl: 'https://cdn.example.com/c.jpg',
        coverTitle: null,
        sellingPoint: '低脂易消化',
        coverBadges: [],
      },
      stages: [
        stage({
          stageCode: 'HIGH_ACTIVITY_ADULT',
          label: '成犬',
          status: 'READY',
        }),
      ],
    });

    expect(result.blockers.map((blocker) => blocker.code)).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'COVER_BADGE_MISSING',
    ]);
    expect(result.ready).toBe(true);
    expect(result.canRelease).toBe(true);
    expect(result.presentation.coverBadges).toEqual([]);
  });

  it('is ready but not releasable when there is no actionable stage', () => {
    const result = buildSeriesReleaseReadiness({
      seriesId: 's1',
      designMode: 'CATALOG',
      presentation: {
        coverImageUrl: 'https://cdn.example.com/c.jpg',
        sellingPoint: '低脂易消化',
        coverBadges: ['低脂'],
      },
      stages: [
        stage({
          stageCode: 'HIGH_ACTIVITY_ADULT',
          label: '成犬',
          status: 'EMPTY',
        }),
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.canRelease).toBe(false);
    expect(result.summary.actionableStageCount).toBe(0);
  });

  it('allows first release when only one stage is READY', () => {
    const result = buildSeriesReleaseReadiness({
      seriesId: 's1',
      designMode: 'CATALOG',
      presentation: {
        coverImageUrl: 'https://cdn.example.com/c.jpg',
        sellingPoint: '低脂易消化',
        coverBadges: ['低脂'],
      },
      stages: [
        stage({
          stageCode: 'HIGH_ACTIVITY_ADULT',
          label: '成犬',
          status: 'READY',
        }),
        stage({ stageCode: 'PUPPY_UNDER_14_WEEKS', label: '幼犬' }),
        stage({ stageCode: 'PUPPY_14_WEEKS_PLUS', label: '大幼犬' }),
        stage({ stageCode: 'LOW_ACTIVITY_ADULT_OR_SENIOR', label: '低活动' }),
        stage({ stageCode: 'REPRODUCTION', label: '繁殖期' }),
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.canRelease).toBe(true);
    expect(result.summary).toMatchObject({
      totalStageCount: 5,
      publishableStageCount: 1,
      actionableStageCount: 1,
      designedStageCount: 1,
    });
  });

  it('blocks missing cover image and selling point, and no longer requires a cover title', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({
        presentation: {
          coverImageUrl: '   ',
          coverTitle: null,
          sellingPoint: '',
          targetHealthTags: [],
          coverBadges: ['低脂'],
        },
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.canRelease).toBe(false);
    expect(codes(readiness.blockers)).toEqual([
      'COVER_IMAGE_REQUIRED',
      'SELLING_POINT_REQUIRED',
    ]);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'COVER_IMAGE_REQUIRED',
          scope: 'PRESENTATION',
          field: 'coverImageUrl',
        }),
        expect.objectContaining({
          code: 'SELLING_POINT_REQUIRED',
          scope: 'PRESENTATION',
          field: 'sellingPoint',
        }),
      ]),
    );
    expect(readiness.warnings).toEqual([]);
    expect(readiness.presentation.coverTitle).toBeNull();
  });

  it('normalizes series cover badges for previewing', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({
        presentation: {
          ...baseInput().presentation,
          coverBadges: [' 低脂 ', '低脂', '', '  '],
        },
      }),
    );

    expect(readiness.presentation.coverBadges).toEqual(['低脂']);
    expect(readiness.warnings).toEqual([]);
  });

  it('does not block on designed stages that are not actionable', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({
        stages: withReadyStage('REPRODUCTION', {
          status: 'DRAFT',
          designDraftId: 'draft-repro',
        }),
      }),
    );

    expect(readiness.ready).toBe(true);
    expect(readiness.canRelease).toBe(true);
    expect(
      readiness.stages.find((entry) => entry.stageCode === 'REPRODUCTION'),
    ).toMatchObject({ status: 'DRAFT', actionable: false });
    expect(readiness.summary.designedStageCount).toBe(3);
  });

  it('flags a pending update and treats that stage as actionable', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({
        businessStatus: 'PUBLIC',
        stages: withReadyStage('LOW_ACTIVITY_ADULT_OR_SENIOR', {
          status: 'PUBLIC',
          latestRecipeId: 'recipe-senior',
          latestRecipeVersion: 3,
          publishedRecipeVersion: 2,
        }),
      }),
    );

    // 待更新只是提醒，不阻断重新发布。
    expect(readiness.ready).toBe(true);
    expect(readiness.canRelease).toBe(true);
    expect(
      readiness.stages.find(
        (entry) => entry.stageCode === 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      ),
    ).toMatchObject({
      status: 'PUBLIC',
      latestRecipeVersion: 3,
      publishedRecipeVersion: 2,
      hasPendingUpdate: true,
      actionable: true,
    });
    expect(readiness.hasPendingUpdates).toBe(true);
    expect(readiness.pendingStageCodes).toEqual([
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
    ]);
    expect(readiness.summary.pendingStageCount).toBe(1);
    expect(readiness.releaseState).toBe('NEEDS_UPDATE');
    expect(readiness.businessStatus).toBe('PUBLIC');
  });

  it('derives releaseState from series businessStatus and pending updates', () => {
    const published = buildSeriesReleaseReadiness(
      baseInput({ businessStatus: 'PUBLIC' }),
    );
    expect(published.releaseState).toBe('PUBLISHED');
    expect(published.hasPendingUpdates).toBe(false);
    expect(published.pendingStageCodes).toEqual([]);

    const unpublished = buildSeriesReleaseReadiness(
      baseInput({ businessStatus: 'DRAFT' }),
    );
    expect(unpublished.releaseState).toBe('UNPUBLISHED');
    expect(unpublished.businessStatus).toBe('DRAFT');

    const needsUpdate = buildSeriesReleaseReadiness(
      baseInput({
        businessStatus: 'PUBLIC',
        stages: withReadyStage('LOW_ACTIVITY_ADULT_OR_SENIOR', {
          status: 'PUBLIC',
          latestRecipeId: 'recipe-senior',
          latestRecipeVersion: 2,
          publishedRecipeVersion: 1,
        }),
      }),
    );
    expect(needsUpdate.releaseState).toBe('NEEDS_UPDATE');

    // PRIVATE_CUSTOM 等非 PUBLIC 系列一律按未发布展示。
    const privateCustom = buildSeriesReleaseReadiness(
      baseInput({ businessStatus: 'PRIVATE_CUSTOM' }),
    );
    expect(privateCustom.releaseState).toBe('UNPUBLISHED');

    // 未传 businessStatus 时按 DRAFT（兼容旧调用方）。
    const missingStatus = buildSeriesReleaseReadiness(baseInput());
    expect(missingStatus.businessStatus).toBe('DRAFT');
    expect(missingStatus.releaseState).toBe('UNPUBLISHED');
  });

  it('honours an explicit pending flag when version numbers are equal', () => {
    const explicitPending = buildSeriesReleaseReadiness(
      baseInput({
        businessStatus: 'PUBLIC',
        stages: withReadyStage('LOW_ACTIVITY_ADULT_OR_SENIOR', {
          status: 'PUBLIC',
          latestRecipeVersion: 1,
          publishedRecipeVersion: 1,
          hasPendingUpdate: true,
        }),
      }),
    );
    const explicitSenior = explicitPending.stages.find(
      (entry) => entry.stageCode === 'LOW_ACTIVITY_ADULT_OR_SENIOR',
    );
    expect(explicitSenior?.hasPendingUpdate).toBe(true);
    expect(explicitSenior?.actionable).toBe(true);
    expect(explicitPending.releaseState).toBe('NEEDS_UPDATE');

    // 即使调用方漏传 flag，版本号更高也会被兜底识别为待更新。
    const inferred = buildSeriesReleaseReadiness(
      baseInput({
        businessStatus: 'PUBLIC',
        stages: withReadyStage('LOW_ACTIVITY_ADULT_OR_SENIOR', {
          status: 'PUBLIC',
          latestRecipeVersion: 5,
          publishedRecipeVersion: 4,
          hasPendingUpdate: false,
        }),
      }),
    );
    expect(
      inferred.stages.find(
        (entry) => entry.stageCode === 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      )?.hasPendingUpdate,
    ).toBe(true);
  });

  it('normalizes missing versions and never marks an unpublished stage as pending', () => {
    const readiness = buildSeriesReleaseReadiness(
      baseInput({
        businessStatus: 'PUBLIC',
        stages: withReadyStage('LOW_ACTIVITY_ADULT_OR_SENIOR', {
          status: 'PUBLIC',
          latestRecipeVersion: 2,
          publishedRecipeVersion: 2,
        }),
      }),
    );

    const senior = readiness.stages.find(
      (entry) => entry.stageCode === 'LOW_ACTIVITY_ADULT_OR_SENIOR',
    );
    expect(senior).toMatchObject({
      latestRecipeVersion: 2,
      publishedRecipeVersion: 2,
      hasPendingUpdate: false,
      actionable: false,
    });
    expect(
      readiness.stages.find(
        (entry) => entry.stageCode === 'PUPPY_UNDER_14_WEEKS',
      ),
    ).toMatchObject({
      latestRecipeVersion: null,
      publishedRecipeVersion: null,
      hasPendingUpdate: false,
      actionable: false,
    });
  });
});
