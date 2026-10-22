import { describe, expect, it } from 'vitest'
import type { SeriesReleaseReadiness } from '@/types/recipeDesigner'
import {
  buildSeriesReleaseForm,
  buildSeriesReleaseSettingsPatch,
  canUnpublishSeries,
  cloneSeriesReleaseForm,
  formatSeriesReleaseLatestVersion,
  formatSeriesReleaseStageVersion,
  groupSeriesReleaseIssues,
  isSeriesReleaseFormDirty,
  isSeriesReleasePrimaryActionAvailable,
  isSeriesReleaseStagePendingUpdate,
  resolveSeriesReleasePendingStageCount,
  resolveSeriesReleaseState,
  seriesReleasePrimaryActionLabel,
  seriesReleaseProgress,
  seriesReleaseStageHint,
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
  hasPendingUpdates: true,
  pendingStageCodes: ['HIGH_ACTIVITY_ADULT'],
  requiredLifeStages: [
    'PUPPY_UNDER_14_WEEKS',
    'HIGH_ACTIVITY_ADULT'
  ],
  requiredStages: [],
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
      required: true
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
      required: false
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
      required: true
    }
  ],
  presentation: {
    coverImageUrl: 'https://cdn.example.com/cover.jpg',
    coverTitle: '旧标题',
    sellingPoint: '旧卖点',
    targetHealthTags: ['tag-1']
  },
  blockers: [
    {
      code: 'REQUIRED_STAGE_NOT_READY',
      message: '「14 周以上幼犬」阶段还不就绪',
      scope: 'STAGE',
      stageCode: 'PUPPY_14_WEEKS_PLUS'
    },
    {
      code: 'COVER_TITLE_REQUIRED',
      message: '请填写封面标题',
      scope: 'PRESENTATION',
      field: 'coverTitle'
    }
  ],
  warnings: [
    {
      code: 'TARGET_HEALTH_TAGS_MISSING',
      message: '未设置目标健康标签',
      scope: 'PRESENTATION',
      field: 'targetHealthTags'
    }
  ],
  summary: {
    requiredStageCount: 5,
    readyStageCount: 3,
    publishedStageCount: 2,
    designedStageCount: 4,
    pendingStageCount: 1
  }
}

describe('seriesRelease 表单与差异', () => {
  it('readiness → 表单：必填阶段与展示资料归一成可编辑值', () => {
    expect(buildSeriesReleaseForm(readiness)).toEqual({
      requiredLifeStages: ['PUPPY_UNDER_14_WEEKS', 'HIGH_ACTIVITY_ADULT'],
      coverImageUrl: 'https://cdn.example.com/cover.jpg',
      coverTitle: '旧标题',
      sellingPoint: '旧卖点',
      targetHealthTags: ['tag-1']
    })
  })

  it('没有改动时 patch 为空、dirty 为 false', () => {
    const baseline = buildSeriesReleaseForm(readiness)
    const form = cloneSeriesReleaseForm(baseline)
    expect(buildSeriesReleaseSettingsPatch(form, baseline)).toEqual({})
    expect(isSeriesReleaseFormDirty(form, baseline)).toBe(false)
  })

  it('只提交真正变化的字段，文本 trim 后保存', () => {
    const baseline = buildSeriesReleaseForm(readiness)
    const form = {
      ...cloneSeriesReleaseForm(baseline),
      requiredLifeStages: [
        'PUPPY_UNDER_14_WEEKS',
        'HIGH_ACTIVITY_ADULT',
        'REPRODUCTION'
      ],
      coverTitle: '  新标题  '
    }

    expect(buildSeriesReleaseSettingsPatch(form, baseline)).toEqual({
      requiredLifeStages: [
        'PUPPY_UNDER_14_WEEKS',
        'HIGH_ACTIVITY_ADULT',
        'REPRODUCTION'
      ],
      coverTitle: '新标题'
    })
    expect(isSeriesReleaseFormDirty(form, baseline)).toBe(true)
  })

  it('清空展示文本时显式发 null，而不是空字符串', () => {
    const baseline = buildSeriesReleaseForm(readiness)
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

  it('健康标签顺序变化不算修改（按集合比较）', () => {
    const baseline = buildSeriesReleaseForm({
      ...readiness,
      presentation: {
        ...readiness.presentation,
        targetHealthTags: ['tag-1', 'tag-2']
      }
    })
    const form = {
      ...cloneSeriesReleaseForm(baseline),
      targetHealthTags: ['tag-2', 'tag-1']
    }
    expect(isSeriesReleaseFormDirty(form, baseline)).toBe(false)
  })
})

describe('seriesRelease 进度与版本', () => {
  it('必填阶段 3/5 → 60%', () => {
    expect(seriesReleaseProgress(readiness)).toEqual({
      ready: 3,
      total: 5,
      percent: 60,
      label: '3/5 个必填阶段就绪'
    })
  })

  it('没有配置必填阶段时明确提示，而不是显示 0% 就绪', () => {
    expect(
      seriesReleaseProgress({
        summary: {
          requiredStageCount: 0,
          readyStageCount: 0,
          publishedStageCount: 0,
          designedStageCount: 0,
          pendingStageCount: 0
        }
      })
    ).toEqual({
      ready: 0,
      total: 0,
      percent: 0,
      label: '还没有选择必填生命阶段'
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
    const groups = groupSeriesReleaseIssues(readiness.blockers)
    expect(groups.map((group) => group.scope)).toEqual([
      'PRESENTATION',
      'STAGE'
    ])
    expect(groups.map((group) => group.label)).toEqual(['展示资料', '生命阶段'])
    expect(groups[1]?.issues[0]?.stageCode).toBe('PUPPY_14_WEEKS_PLUS')
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

  it('主按钮文案随状态切换：发布系列 / 重新发布系列', () => {
    expect(
      seriesReleasePrimaryActionLabel({ releaseState: 'UNPUBLISHED' })
    ).toBe('发布系列')
    expect(
      seriesReleasePrimaryActionLabel({ releaseState: 'NEEDS_UPDATE' })
    ).toBe('重新发布系列')
    expect(
      seriesReleasePrimaryActionLabel({ releaseState: 'PUBLISHED' })
    ).toBe('重新发布系列')
  })

  it('已上线（最新）且没有待更新时隐藏主按钮', () => {
    expect(
      isSeriesReleasePrimaryActionAvailable({
        ready: false,
        releaseState: 'NEEDS_UPDATE'
      })
    ).toBe(false)
    expect(
      isSeriesReleasePrimaryActionAvailable({
        ready: true,
        releaseState: 'UNPUBLISHED'
      })
    ).toBe(true)
    expect(
      isSeriesReleasePrimaryActionAvailable({
        ready: true,
        releaseState: 'NEEDS_UPDATE'
      })
    ).toBe(true)
    expect(
      isSeriesReleasePrimaryActionAvailable({
        ready: true,
        releaseState: 'PUBLISHED'
      })
    ).toBe(false)
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
