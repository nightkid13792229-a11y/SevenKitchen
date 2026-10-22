import { describe, expect, it } from 'vitest'
import type { SeriesReleaseReadiness } from '@/types/recipeDesigner'
import {
  buildSeriesReleaseForm,
  buildSeriesReleaseSettingsPatch,
  cloneSeriesReleaseForm,
  formatSeriesReleaseLatestVersion,
  formatSeriesReleaseStageVersion,
  groupSeriesReleaseIssues,
  isSeriesReleaseFormDirty,
  seriesReleaseProgress,
  seriesReleaseStageHint,
  seriesReleaseStageStatusLabel,
  seriesReleaseStageTagType
} from './seriesRelease'

const readiness: SeriesReleaseReadiness = {
  seriesId: 'series-1',
  designMode: 'CATALOG',
  ready: false,
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
      designDraftId: 'draft-1',
      required: true
    },
    {
      stageCode: 'PUPPY_14_WEEKS_PLUS',
      label: '14 周以上幼犬',
      status: 'EMPTY',
      latestRecipeId: null,
      latestRecipeVersion: null,
      designDraftId: null,
      required: false
    },
    {
      stageCode: 'HIGH_ACTIVITY_ADULT',
      label: '普通成年犬',
      status: 'PUBLIC',
      latestRecipeId: 'recipe-2',
      latestRecipeVersion: 5,
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
    designedStageCount: 4
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
          designedStageCount: 0
        }
      })
    ).toEqual({
      ready: 0,
      total: 0,
      percent: 0,
      label: '还没有选择必填生命阶段'
    })
  })

  it('单阶段版本号缺失时显示「暂无阶段食谱」', () => {
    expect(formatSeriesReleaseStageVersion(readiness.stages[0]!)).toBe('v3')
    expect(formatSeriesReleaseStageVersion(readiness.stages[1]!)).toBe(
      '暂无阶段食谱'
    )
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
