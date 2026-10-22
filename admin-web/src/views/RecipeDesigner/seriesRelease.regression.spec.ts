import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/SeriesReleaseDrawer.vue?raw'
import indexSource from '@/views/RecipeDesigner/index.vue?raw'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'
import apiSource from '@/api/recipeDesigner.ts?raw'
import typeSource from '@/types/recipeDesigner.ts?raw'
import utilsSource from '@/utils/recipeDesigner/seriesRelease.ts?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('系列发布 · API 与类型契约', () => {
  it('三个接口路径与后端 controller 一致', () => {
    expect(apiSource).toContain('getSeriesReleaseReadiness')
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/release-readiness`'
    )
    expect(apiSource).toContain('updateSeriesReleaseSettings')
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/release-settings`'
    )
    expect(apiSource).toContain('releaseSeries')
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/release`'
    )
  })

  it('下架接口与后端 POST /series/:id/unpublish 一致', () => {
    expect(apiSource).toContain('unpublishSeries')
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/unpublish`'
    )
    expect(typeSource).toContain('SeriesUnpublishResult')
    expect(typeSource).toContain('unpublishedRecipeCount')
    expect(typeSource).toContain('remainingPublicRecipeCount')
  })

  it('类型覆盖四档阶段状态、问题归属与设置 payload', () => {
    for (const status of ["'EMPTY'", "'DRAFT'", "'READY'", "'PUBLIC'"]) {
      expect(typeSource).toContain(status)
    }
    expect(typeSource).toContain(
      "export type SeriesReleaseStageStatus ="
    )
    expect(typeSource).toContain('SeriesReleaseBlockerCode')
    expect(typeSource).toContain('REQUIRED_STAGE_NOT_READY')
    expect(typeSource).toContain('SeriesReleaseWarningCode')
    expect(typeSource).toContain('TARGET_HEALTH_TAGS_MISSING')
    for (const field of [
      'requiredLifeStages?: string[]',
      'coverImageUrl?: string | null',
      'coverTitle?: string | null',
      'sellingPoint?: string | null',
      'targetHealthTags?: string[]'
    ]) {
      expect(typeSource).toContain(field)
    }
    expect(typeSource).toContain('latestRecipeVersion?: number | null')
    expect(typeSource).toContain('requiredStages: SeriesReleaseStageReadiness[]')
    expect(typeSource).toContain('blockers: SeriesReleaseBlocker[]')
    expect(typeSource).toContain('warnings: SeriesReleaseWarning[]')
  })

  it('类型覆盖重新发布 / 下架新增字段', () => {
    expect(typeSource).toContain(
      "export type SeriesReleaseState ="
    )
    for (const state of [
      "'UNPUBLISHED'",
      "'PUBLISHED'",
      "'NEEDS_UPDATE'"
    ]) {
      expect(typeSource).toContain(state)
    }
    for (const field of [
      'businessStatus: string',
      'releaseState: SeriesReleaseState',
      'hasPendingUpdates: boolean',
      'pendingStageCodes: string[]',
      'pendingStageCount: number',
      'publishedRecipeVersion?: number | null',
      'hasPendingUpdate?: boolean'
    ]) {
      expect(typeSource).toContain(field)
    }
  })
})

describe('系列发布抽屉', () => {
  const drawer = clean(drawerSource)

  it('打开即拉门槛，并展示阶段清单 / 最新版本 / 阻断与提醒', () => {
    expect(drawer).toContain('recipeDesignerApi.getSeriesReleaseReadiness(')
    expect(drawer).toContain('v-for="stage in readiness.stages"')
    expect(drawer).toContain('seriesReleaseStageStatusLabel(stage.status)')
    expect(drawer).toContain('formatSeriesReleaseStageVersion(stage)')
    expect(drawer).toContain('blockerGroups')
    expect(drawer).toContain('warningGroups')
    expect(drawer).toContain('readiness.blockers.length')
    expect(drawer).toContain('readiness.warnings.length')
    expect(drawer).toContain('seriesReleaseProgress(readiness.value)')
  })

  it('可编辑必填阶段 / 封面图 / 标题 / 卖点 / 健康标签', () => {
    expect(drawer).toContain('v-model="form.requiredLifeStages"')
    expect(drawer).toContain(':value="stage.stageCode"')
    expect(drawer).toContain('const result = await recipeApi.uploadImage(file)')
    expect(drawer).toContain('v-model="form.coverTitle"')
    expect(drawer).toContain('v-model="form.sellingPoint"')
    expect(drawer).toContain('v-model="form.targetHealthTags"')
    expect(drawer).toContain('recipeHealthTagApi.list()')
    expect(drawer).toContain(':key="tag.id"')
    expect(drawer).toContain(':value="tag.id"')
    expect(drawer).toContain('RECIPE_PRESENTATION_LIMITS.coverTitle')
    expect(drawer).toContain('RECIPE_PRESENTATION_LIMITS.sellingPoint')
  })

  it('保存走 PATCH，成功后重新拉门槛', () => {
    expect(drawer).toContain('buildSeriesReleaseSettingsPatch(form, baseline.value)')
    expect(drawer).toContain('recipeDesignerApi.updateSeriesReleaseSettings(')
    const saveFn = drawer.slice(
      drawer.indexOf('async function saveSettings'),
      drawer.indexOf('async function handleRelease')
    )
    expect(saveFn).toContain('await loadReadiness(true)')
  })

  it('只有管理员、且门槛就绪时才出现发布按钮', () => {
    expect(drawer).toContain('useIsAdmin')
    expect(drawer).toContain('isAdmin')
    expect(drawer).toContain('ADMIN_ONLY_TIP')
    expect(drawer).toContain(
      'v-if="isAdmin && readiness.ready && releaseActionAvailable"'
    )
    expect(drawer).toContain(':disabled="dirty || unpublishing"')
    expect(drawer).toContain('recipeDesignerApi.releaseSeries(')
    expect(drawer).toContain('releaseActionLabel')
    expect(drawer).toContain("emit('released', result)")
  })

  it('头部 / 概览展示 未上线 / 待重新发布 / 已上线（最新）', () => {
    expect(drawer).toContain('releaseStateLabel')
    expect(drawer).toContain('releaseStateTagType')
    expect(drawer).toContain('seriesReleaseStateLabel(')
    expect(drawer).toContain('resolveSeriesReleaseState(')
    expect(drawer).toContain('pendingStageCount')
    expect(drawer).toContain('resolveSeriesReleasePendingStageCount(')
    expect(drawer).toContain('待更新 {{ pendingStageCount }} 个阶段')
  })

  it('阶段清单展示「有更新」与最新 / 已发布版本', () => {
    expect(drawer).toContain('isSeriesReleaseStagePendingUpdate(stage)')
    expect(drawer).toContain('有更新')
    expect(drawer).toContain('formatSeriesReleaseStageVersion(stage)')
    expect(drawer).toContain('seriesReleaseStageHint(stage)')
  })

  it('发布按钮文案随状态切换，已上线（最新）不显示', () => {
    expect(utilsSource).toContain("UNPUBLISHED: '未上线'")
    expect(utilsSource).toContain("NEEDS_UPDATE: '待重新发布'")
    expect(utilsSource).toContain("PUBLISHED: '已上线（最新）'")
    expect(utilsSource).toContain("'发布系列'")
    expect(utilsSource).toContain("'重新发布系列'")
    expect(drawer).toContain('isSeriesReleasePrimaryActionAvailable(')
    expect(drawer).toContain('seriesReleasePrimaryActionLabel(')
  })

  it('管理员可下架已上线 / 待重新发布系列，确认后调用下架接口', () => {
    expect(drawer).toContain('canUnpublishSeries(')
    expect(drawer).toContain('v-if="isAdmin && canUnpublish"')
    expect(drawer).toContain('下架整个系列')
    expect(drawer).toContain('recipeDesignerApi.unpublishSeries(')
    expect(drawer).toContain("emit('updated', result)")
    // 下架后重新拉门槛，保证抽屉里「未上线」状态与列表一致
    const unpublishFn = drawer.slice(
      drawer.indexOf('async function handleUnpublish'),
      drawer.indexOf('async function handleBeforeClose')
    )
    expect(unpublishFn).toContain('await loadReadiness(')
  })
})

describe('食谱设计器列表 · 系列发布入口', () => {
  const index = clean(indexSource)

  it('CATALOG 卡片有「系列发布」动作并挂载抽屉', () => {
    expect(index).toContain(
      "import SeriesReleaseDrawer from './components/SeriesReleaseDrawer.vue'"
    )
    expect(index).toContain('系列发布')
    expect(index).toContain('@click="openSeriesReleaseDrawer(card)"')
    expect(index).toContain(':series-id="releaseDrawerSeriesId"')
    expect(index).toContain('@released="handleSeriesReleased"')
  })

  it('卡片直接显示阶段进度（已发布 x/y），发布成功刷新列表', () => {
    expect(index).toContain('stageProgressLabel(card)')
    expect(index).toContain('card.publishedStageCount')
    expect(index).toContain('card.stages.length')
    const releasedFn = index.slice(
      index.indexOf('async function handleSeriesReleased'),
      index.indexOf('}', index.indexOf('async function handleSeriesReleased'))
    )
    expect(releasedFn).toContain('await loadSeries(true)')
  })

  it('卡片入口按 businessStatus 切换文案，有数据时才显示待更新数量', () => {
    expect(index).toContain('seriesReleaseEntryLabel(card)')
    expect(index).toContain("card.businessStatus === 'PUBLIC'")
    expect(index).toContain('cardPendingStageCount(card)')
    expect(index).toContain('hasCardPendingUpdates(card)')
    expect(index).toContain('待重新发布')
    expect(index).toContain('@updated="handleSeriesUpdated"')
    const updatedFn = index.slice(
      index.indexOf('async function handleSeriesUpdated'),
      index.indexOf('async function handleSeriesUpdated') + 200
    )
    expect(updatedFn).toContain('await loadSeries(true)')
  })

  it('不破坏现有阶段打开 / 复制 / 重命名 / 删除', () => {
    expect(index).toContain('@click="openStage(card, stage)"')
    expect(index).toContain("handleCardCommand('duplicate', card)")
    expect(index).toContain("handleCardCommand('rename', card)")
    expect(index).toContain("handleCardCommand('delete', card)")
    expect(index).toContain('command="duplicateStage"')
    expect(index).toContain('handleStageCommand(cmd, card, stage)')
  })
})

describe('编辑器 · 产品线主按钮', () => {
  const editor = clean(editorSource)

  it('单阶段入仓动作移入上线检查，编辑器头部不再直接入仓', () => {
    expect(editor).not.toContain('保存到系列仓库')
    expect(editor).not.toContain('发布到产品线')
  })
})
