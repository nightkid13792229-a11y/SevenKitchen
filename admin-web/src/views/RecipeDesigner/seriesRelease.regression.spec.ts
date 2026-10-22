import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/SeriesReleaseDrawer.vue?raw'
import indexSource from '@/views/RecipeDesigner/index.vue?raw'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'
import apiSource from '@/api/recipeDesigner.ts?raw'
import typeSource from '@/types/recipeDesigner.ts?raw'

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
    expect(drawer).toContain('v-if="isAdmin && readiness.ready"')
    expect(drawer).toContain(':disabled="dirty"')
    expect(drawer).toContain('recipeDesignerApi.releaseSeries(')
    expect(drawer).toContain('发布整条产品线')
    expect(drawer).toContain("emit('released', result)")
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

  it('按钮文案改为「保存到系列仓库」，行为仍是 goPublish', () => {
    expect(editor).toContain('保存到系列仓库')
    expect(editor).not.toContain('发布到产品线')
    expect(editor).toContain('@click="goPublish"')
  })
})
