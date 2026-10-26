import { describe, expect, it } from 'vitest'
import type {
  SeriesReleaseIssue,
  SeriesReleaseReadiness
} from '@/types/recipeDesigner'
import {
  buildSeriesReleaseForm,
  buildSeriesReleaseSettingsPatch,
  canUnpublishSeries,
  cloneSeriesReleaseForm,
  emptySeriesReleaseForm,
  formatSeriesReleaseLatestVersion,
  formatSeriesReleaseStageVersion,
  groupSeriesReleaseIssues,
  isSeriesReleaseBadgesDirty,
  isSeriesReleaseFormDirty,
  isSeriesReleasePrimaryActionAvailable,
  isSeriesReleaseStagePendingUpdate,
  resolveSeriesReleaseActionableStages,
  resolveSeriesReleaseDefaultSelectedStageCodes,
  resolveSeriesReleasePendingStageCount,
  resolveSeriesReleaseState,
  seriesReleasePrimaryActionVerb,
  seriesReleaseProgress,
  seriesReleaseStageHint,
  seriesReleaseStageScopeLabel,
  seriesReleaseStageStatusLabel,
  seriesReleaseStageTagType,
  seriesReleaseStateLabel,
  seriesReleaseStateTagType
} from './seriesRelease'

const readiness: SeriesReleaseReadiness = {
  seriesId: 'series-1',
  designMode: 'CATALOG',
  businessStatus: 'PUBLIC',
  releaseState: 'NEEDS_UPDATE',
  ready: false,
  canRelease: false,
  hasPendingUpdates: true,
  pendingStageCodes: ['HIGH_ACTIVITY_ADULT'],
  stages: [
    {
      stageCode: 'PUPPY_UNDER_14_WEEKS',
      label: '小于 14 周幼犬',
      status: 'READY',
      latestRecipeId: 'recipe-1',
      latestRecipeVersion: 3,
      publishedRecipeVersion: null,
      hasPendingUpdate: false,
      designDraftId: 'draft-1',
      actionable: true
    },
    {
      stageCode: 'PUPPY_14_WEEKS_PLUS',
      label: '14 周以上幼犬',
      status: 'EMPTY',
      latestRecipeId: null,
      latestRecipeVersion: null,
      publishedRecipeVersion: null,
      hasPendingUpdate: false,
      designDraftId: null,
      actionable: false
    },
    {
      stageCode: 'HIGH_ACTIVITY_ADULT',
      label: '普通成年犬',
      status: 'PUBLIC',
      latestRecipeId: 'recipe-2',
      latestRecipeVersion: 5,
      publishedRecipeVersion: 4,
      hasPendingUpdate: true,
      designDraftId: null,
      actionable: true
    }
  ],
  presentation: {
    coverImageUrl: 'https://cdn.example.com/cover.jpg',
    coverTitle: '旧标题',
    sellingPoint: '旧卖点',
    targetHealthTags: ['tag-1'],
    coverBadges: ['低脂']
  },
  blockers: [
    {
      code: 'COVER_IMAGE_REQUIRED',
      message: '请上传产品线封面图后再发布',
      scope: 'PRESENTATION',
      field: 'coverImageUrl'
    },
    {
      code: 'SELLING_POINT_REQUIRED',
      message: '请填写一句话卖点',
      scope: 'PRESENTATION',
      field: 'sellingPoint'
    }
  ],
  warnings: [
    {
      code: 'COVER_BADGE_MISSING',
      message: '未设置封面角标',
      scope: 'PRESENTATION',
      field: 'coverBadges'
    }
  ],
  summary: {
    totalStageCount: 3,
    publishableStageCount: 1,
    pendingStageCount: 1,
    publishedStageCount: 1,
    upToDateStageCount: 0,
    designedStageCount: 2,
    actionableStageCount: 2
  }
}

describe('seriesRelease 表单与差异', () => {
  it('hydrates cover, selling point and badge ids', () => {
    const form = buildSeriesReleaseForm(
      {
        presentation: {
          coverImageUrl: ' x ',
          sellingPoint: ' 卖点 ',
          coverBadges: ['低脂']
        }
      } as any,
      ['tag-1']
    )
    expect(form).toEqual({
      coverImageUrl: 'x',
      sellingPoint: '卖点',
      coverBadgeHealthTagIds: ['tag-1']
    })
  })

  it('角标 id 缺省时回落到空数组，不再带必填阶段 / 标题 / 目标标签', () => {
    const form = buildSeriesReleaseForm({
      presentation: { coverImageUrl: null, sellingPoint: null }
    } as any)
    expect(form.coverBadgeHealthTagIds).toEqual([])
    expect(form).not.toHaveProperty('requiredLifeStages')
    expect(form).not.toHaveProperty('coverTitle')
    expect(form).not.toHaveProperty('targetHealthTags')
  })

  it('空白表单只含三个展示字段', () => {
    expect(emptySeriesReleaseForm()).toEqual({
      coverImageUrl: '',
      sellingPoint: '',
      coverBadgeHealthTagIds: []
    })
  })

  it('没有改动时 patch 为空、dirty 为 false', () => {
    const baseline = buildSeriesReleaseForm(readiness, ['tag-1'])
    const form = cloneSeriesReleaseForm(baseline)
    expect(buildSeriesReleaseSettingsPatch(form, baseline)).toEqual({})
    expect(isSeriesReleaseBadgesDirty(form, baseline)).toBe(false)
    expect(isSeriesReleaseFormDirty(form, baseline)).toBe(false)
  })

  it('patches only cover and selling point', () => {
    const patch = buildSeriesReleaseSettingsPatch(
      { coverImageUrl: 'new', sellingPoint: '', coverBadgeHealthTagIds: [] },
      { coverImageUrl: 'old', sellingPoint: 'old', coverBadgeHealthTagIds: [] }
    )
    expect(patch).toEqual({ coverImageUrl: 'new', sellingPoint: null })
  })

  it('文本 trim 后只提交真正变化的字段', () => {
    const baseline = {
      coverImageUrl: 'https://old.example.com/cover.jpg',
      sellingPoint: '旧卖点',
      coverBadgeHealthTagIds: ['tag-1']
    }
    const form = {
      ...cloneSeriesReleaseForm(baseline),
      coverImageUrl: '  https://new.example.com/cover.jpg  '
    }
    expect(buildSeriesReleaseSettingsPatch(form, baseline)).toEqual({
      coverImageUrl: 'https://new.example.com/cover.jpg'
    })
  })

  it('清空展示文本时显式发 null，而不是空字符串', () => {
    const baseline = buildSeriesReleaseForm(readiness, ['tag-1'])
    const form = {
      ...cloneSeriesReleaseForm(baseline),
      coverImageUrl: '   ',
      sellingPoint: ''
    }

    expect(buildSeriesReleaseSettingsPatch(form, baseline)).toEqual({
      coverImageUrl: null,
      sellingPoint: null
    })
  })

  it('角标顺序变化不算修改（按集合比较）', () => {
    const baseline = buildSeriesReleaseForm(readiness, ['tag-1', 'tag-2'])
    const form = {
      ...cloneSeriesReleaseForm(baseline),
      coverBadgeHealthTagIds: ['tag-2', 'tag-1']
    }
    expect(isSeriesReleaseBadgesDirty(form, baseline)).toBe(false)
    expect(isSeriesReleaseFormDirty(form, baseline)).toBe(false)
  })

  it('counts badge changes as dirty', () => {
    const a = { coverImageUrl: '', sellingPoint: '', coverBadgeHealthTagIds: [] }
    const b = { ...a, coverBadgeHealthTagIds: ['tag-1'] }
    expect(isSeriesReleaseBadgesDirty(b, a)).toBe(true)
    expect(buildSeriesReleaseSettingsPatch(b, a)).toEqual({})
    expect(isSeriesReleaseFormDirty(a, b)).toBe(true)
  })

  it('封面或卖点单独变化也算 dirty', () => {
    const baseline = {
      coverImageUrl: 'https://old.example.com/cover.jpg',
      sellingPoint: '旧卖点',
      coverBadgeHealthTagIds: []
    }
    expect(
      isSeriesReleaseFormDirty(
        { ...baseline, coverImageUrl: 'https://new.example.com/cover.jpg' },
        baseline
      )
    ).toBe(true)
    expect(
      isSeriesReleaseFormDirty({ ...baseline, sellingPoint: '新卖点' }, baseline)
    ).toBe(true)
  })
})

describe('seriesRelease 进度与版本', () => {
  it('shows published progress over all stages', () => {
    expect(
      seriesReleaseProgress({
        summary: { publishedStageCount: 2, totalStageCount: 5 }
      } as any)
    ).toEqual({
      published: 2,
      total: 5,
      percent: 40,
      label: '已上线 2/5 个阶段'
    })
  })

  it('没有阶段时进度为 0%，不出现 NaN', () => {
    expect(
      seriesReleaseProgress({
        summary: { publishedStageCount: 0, totalStageCount: 0 }
      } as any)
    ).toEqual({
      published: 0,
      total: 0,
      percent: 0,
      label: '已上线 0/0 个阶段'
    })
  })

  it('单阶段版本号同时展示最新与已发布版本', () => {
    expect(formatSeriesReleaseStageVersion(readiness.stages[0]!)).toBe(
      '最新 v3 · 未发布'
    )
    expect(formatSeriesReleaseStageVersion(readiness.stages[1]!)).toBe(
      '暂无阶段食谱'
    )
    // 旧 PUBLIC v4 + 新 DRAFT v5 → 明确告诉后台「有更新」
    expect(formatSeriesReleaseStageVersion(readiness.stages[2]!)).toBe(
      '最新 v5 · 已发布 v4'
    )
  })

  it('没有更新时只显示最新版本，避免重复文案', () => {
    expect(
      formatSeriesReleaseStageVersion({
        latestRecipeVersion: 6,
        publishedRecipeVersion: 6,
        hasPendingUpdate: false
      })
    ).toBe('最新 v6')
  })

  it('系列最新版本取阶段版本最大值', () => {
    expect(formatSeriesReleaseLatestVersion(readiness)).toBe('v5')
    expect(formatSeriesReleaseLatestVersion(null)).toBe('暂无阶段食谱')
  })
})

describe('seriesRelease 状态 / 问题分组', () => {
  it('四档状态都有中文与对应标签色', () => {
    expect(seriesReleaseStageStatusLabel('EMPTY')).toBe('空白')
    expect(seriesReleaseStageStatusLabel('DRAFT')).toBe('草稿')
    expect(seriesReleaseStageStatusLabel('READY')).toBe('待发布')
    expect(seriesReleaseStageStatusLabel('PUBLIC')).toBe('已发布')

    expect(seriesReleaseStageTagType('EMPTY')).toBe('info')
    expect(seriesReleaseStageTagType('DRAFT')).toBe('warning')
    expect(seriesReleaseStageTagType('READY')).toBe('primary')
    expect(seriesReleaseStageTagType('PUBLIC')).toBe('success')
  })

  it('阶段提示说明下一步要做什么', () => {
    expect(seriesReleaseStageHint({ status: 'EMPTY' })).toContain('还没有设计稿')
    expect(seriesReleaseStageHint({ status: 'DRAFT' })).toContain('系列仓库')
    expect(seriesReleaseStageHint({ status: 'READY' })).toContain('可随系列发布')
    expect(seriesReleaseStageHint({ status: 'PUBLIC' })).toContain('已发布')
  })

  it('问题按 系列设置 / 展示资料 / 生命阶段 固定顺序分组', () => {
    const issues: SeriesReleaseIssue[] = [
      {
        code: 'STAGE_ISSUE',
        message: '阶段问题',
        scope: 'STAGE',
        stageCode: 'PUPPY_14_WEEKS_PLUS'
      },
      { code: 'PRESENTATION_ISSUE', message: '展示问题', scope: 'PRESENTATION' },
      { code: 'SERIES_ISSUE', message: '系列问题', scope: 'SERIES' }
    ]
    const groups = groupSeriesReleaseIssues(issues)
    expect(groups.map((group) => group.scope)).toEqual([
      'SERIES',
      'PRESENTATION',
      'STAGE'
    ])
    expect(groups.map((group) => group.label)).toEqual([
      '系列设置',
      '展示资料',
      '生命阶段'
    ])
    expect(groups[2]?.issues[0]?.stageCode).toBe('PUPPY_14_WEEKS_PLUS')
  })
})

describe('seriesRelease 重新发布 / 下架', () => {
  it('三档系列状态有中文与对应标签色', () => {
    expect(seriesReleaseStateLabel('UNPUBLISHED')).toBe('未上线')
    expect(seriesReleaseStateLabel('NEEDS_UPDATE')).toBe('待重新发布')
    expect(seriesReleaseStateLabel('PUBLISHED')).toBe('已上线（最新）')

    expect(seriesReleaseStateTagType('UNPUBLISHED')).toBe('info')
    expect(seriesReleaseStateTagType('NEEDS_UPDATE')).toBe('warning')
    expect(seriesReleaseStateTagType('PUBLISHED')).toBe('success')
  })

  it('优先采用后端 releaseState', () => {
    expect(resolveSeriesReleaseState(readiness)).toBe('NEEDS_UPDATE')
    expect(
      resolveSeriesReleaseState({
        ...readiness,
        releaseState: 'PUBLISHED',
        hasPendingUpdates: false
      })
    ).toBe('PUBLISHED')
  })

  it('旧后端没有 releaseState 时按 businessStatus + 版本号兜底推断', () => {
    expect(
      resolveSeriesReleaseState({
        ...readiness,
        releaseState: undefined,
        businessStatus: 'DRAFT',
        hasPendingUpdates: undefined,
        summary: { pendingStageCount: undefined }
      })
    ).toBe('UNPUBLISHED')

    // PUBLIC + 旧 v4 / 新 v5 → 待重新发布
    expect(
      resolveSeriesReleaseState({
        ...readiness,
        releaseState: undefined,
        hasPendingUpdates: undefined,
        summary: { pendingStageCount: undefined }
      })
    ).toBe('NEEDS_UPDATE')

    // PUBLIC 但所有阶段都已最新 → 已上线（最新）
    expect(
      resolveSeriesReleaseState({
        businessStatus: 'PUBLIC',
        stages: [
          { latestRecipeVersion: 5, publishedRecipeVersion: 5 },
          { latestRecipeVersion: 2, publishedRecipeVersion: 2 }
        ],
        summary: { pendingStageCount: undefined }
      })
    ).toBe('PUBLISHED')
  })

  it('待更新阶段数优先用 summary，缺失时按阶段兜底', () => {
    expect(resolveSeriesReleasePendingStageCount(readiness)).toBe(1)
    expect(
      resolveSeriesReleasePendingStageCount({
        stages: [
          {
            latestRecipeVersion: 5,
            publishedRecipeVersion: 4,
            hasPendingUpdate: true
          },
          { latestRecipeVersion: 2, publishedRecipeVersion: 2 }
        ]
      })
    ).toBe(1)
    expect(resolveSeriesReleasePendingStageCount(null)).toBe(0)
  })

  it('阶段是否待更新：后端标记优先，否则按版本号比较', () => {
    expect(
      isSeriesReleaseStagePendingUpdate({
        latestRecipeVersion: 5,
        publishedRecipeVersion: 4
      })
    ).toBe(true)
    expect(
      isSeriesReleaseStagePendingUpdate({
        latestRecipeVersion: 4,
        publishedRecipeVersion: 4
      })
    ).toBe(false)
    expect(
      isSeriesReleaseStagePendingUpdate({ hasPendingUpdate: true })
    ).toBe(true)
    expect(isSeriesReleaseStagePendingUpdate(null)).toBe(false)
  })

  it('labels action verb and scope', () => {
    expect(
      seriesReleasePrimaryActionVerb({ releaseState: 'UNPUBLISHED' } as any)
    ).toBe('发布')
    expect(
      seriesReleasePrimaryActionVerb({ releaseState: 'NEEDS_UPDATE' } as any)
    ).toBe('更新')
    expect(
      seriesReleasePrimaryActionVerb({ releaseState: 'PUBLISHED' } as any)
    ).toBe('更新')
    // 旧后端缺少 releaseState 时按 businessStatus 兜底
    expect(
      seriesReleasePrimaryActionVerb({ businessStatus: 'DRAFT' } as any)
    ).toBe('发布')

    expect(seriesReleaseStageScopeLabel({ status: 'READY' } as any)).toBe(
      '待发布'
    )
    expect(
      seriesReleaseStageScopeLabel({
        status: 'PUBLIC',
        hasPendingUpdate: true
      } as any)
    ).toBe('有更新')
    expect(
      seriesReleaseStageScopeLabel({
        status: 'PUBLIC',
        hasPendingUpdate: false
      } as any)
    ).toBe('已是最新')
    expect(seriesReleaseStageScopeLabel({ status: 'DRAFT' } as any)).toBe(
      '未入库'
    )
    expect(seriesReleaseStageScopeLabel({ status: 'EMPTY' } as any)).toBe(
      '未设计'
    )
  })

  it('uses canRelease to decide whether the primary action is available', () => {
    expect(
      isSeriesReleasePrimaryActionAvailable({ canRelease: false } as any)
    ).toBe(false)
    expect(
      isSeriesReleasePrimaryActionAvailable({ canRelease: true } as any)
    ).toBe(true)
    expect(isSeriesReleasePrimaryActionAvailable(null)).toBe(false)
  })

  it('收集可操作阶段（READY / PUBLIC 有更新）', () => {
    const stages = [
      { stageCode: 'A', status: 'READY', actionable: true },
      { stageCode: 'B', status: 'PUBLIC', hasPendingUpdate: false, actionable: false },
      { stageCode: 'C', status: 'PUBLIC', hasPendingUpdate: true, actionable: true }
    ]
    expect(
      resolveSeriesReleaseActionableStages({ stages } as any).map(
        (stage) => stage.stageCode
      )
    ).toEqual(['A', 'C'])
    expect(resolveSeriesReleaseActionableStages(null)).toEqual([])
  })

  it('defaults selection to none for first release and all actionable for update', () => {
    const readiness = {
      releaseState: 'UNPUBLISHED',
      stages: [{ stageCode: 'A', actionable: true }]
    } as any
    expect(resolveSeriesReleaseDefaultSelectedStageCodes(readiness)).toEqual([])
    const update = {
      releaseState: 'PUBLISHED',
      stages: [
        { stageCode: 'A', actionable: true },
        { stageCode: 'B', actionable: false }
      ]
    } as any
    expect(resolveSeriesReleaseDefaultSelectedStageCodes(update)).toEqual(['A'])
    const needsUpdate = {
      releaseState: 'NEEDS_UPDATE',
      stages: [
        { stageCode: 'A', actionable: true },
        { stageCode: 'B', actionable: true }
      ]
    } as any
    expect(resolveSeriesReleaseDefaultSelectedStageCodes(needsUpdate)).toEqual([
      'A',
      'B'
    ])
  })

  it('只有已上线 / 待重新发布的系列可以下架', () => {
    expect(canUnpublishSeries({ releaseState: 'UNPUBLISHED' })).toBe(false)
    expect(canUnpublishSeries({ releaseState: 'PUBLISHED' })).toBe(true)
    expect(canUnpublishSeries({ releaseState: 'NEEDS_UPDATE' })).toBe(true)
    expect(canUnpublishSeries(null)).toBe(false)
  })

  it('待更新阶段的说明会提示需要重新发布', () => {
    const hint = seriesReleaseStageHint(readiness.stages[2]!)
    expect(hint).toContain('待重新发布')
    expect(hint).toContain('v4')
    expect(hint).toContain('v5')
  })
})
