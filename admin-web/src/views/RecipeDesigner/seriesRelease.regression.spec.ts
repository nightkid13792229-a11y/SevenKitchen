import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/SeriesReleaseDrawer.vue?raw'
import indexSource from '@/views/RecipeDesigner/index.vue?raw'
import apiSource from '@/api/recipeDesigner.ts?raw'
import typeSource from '@/types/recipeDesigner.ts?raw'

describe('产品线发布 · 草稿化契约（2026-11-08）', () => {
  it('接口路径与后端 controller 一致，新增草稿接口', () => {
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/release-readiness`'
    )
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/release-draft`'
    )
    expect(apiSource).toContain('`/recipe-designer/series/${seriesId}/release`')
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/unpublish`'
    )
    expect(apiSource).toContain('saveSeriesReleaseDraft')
  })

  it('类型里带上草稿状态与字段口径', () => {
    expect(typeSource).toContain('releaseDraft: {')
    expect(typeSource).toContain('exists: boolean')
    expect(typeSource).toContain('changedFields: SeriesReleaseDraftField[]')
    expect(typeSource).toContain('export type SeriesReleaseDraftField')
    expect(typeSource).toContain('SaveSeriesReleaseDraftPayload')
  })

  it('打开抽屉只拉门槛，不再走「保存发布设置」', () => {
    expect(drawerSource).toContain('getSeriesReleaseReadiness')
    expect(drawerSource).not.toContain('updateSeriesReleaseSettings')
  })

  it('编辑资料写的是草稿接口', () => {
    expect(drawerSource).toContain('saveSeriesReleaseDraft')
    expect(drawerSource).toContain('改完自动存成草稿')
  })

  it('发布是整版发：不再带 stageCodes，只带草稿并发锁', () => {
    expect(drawerSource).toContain('releaseSeries(props.seriesId, {')
    expect(drawerSource).toContain('expectedDraftUpdatedAt')
    expect(drawerSource).not.toContain('stageCodes')
    expect(drawerSource).not.toContain('selectedStageCodes')
  })

  it('发布按钮只在 canRelease 为真时可用，已是最新时换成关闭', () => {
    expect(drawerSource).toContain(':disabled="!readiness.canRelease"')
    expect(drawerSource).toContain('v-else @click="visible = false"')
    expect(drawerSource).toContain("hasLive ? '发布这一版' : '上线这条产品线'")
  })

  it('草稿实时保存，所以关闭不拦截', () => {
    expect(drawerSource).toContain('草稿是实时保存的，关闭不需要拦截')
    expect(drawerSource).not.toContain('有未保存的修改')
  })

  it('差什么只显示一行，不铺阻断项 / 提醒项两块', () => {
    expect(drawerSource).toContain('还差 {{ readiness.blockers.length }} 项')
    expect(drawerSource).not.toContain('阻断项')
    expect(drawerSource).not.toContain('提醒项')
  })

  it('还没设计的阶段给一个去设计入口', () => {
    expect(drawerSource).toContain("emit('design-stage', stage.stageCode)")
    expect(indexSource).toContain('@design-stage="handleDesignStage"')
    expect(indexSource).toContain('function handleDesignStage')
  })

  it('保存排队合并，失败明确提示，发布前等队列 flush', () => {
    expect(drawerSource).toContain('saveQueue.push')
    expect(drawerSource).toContain('Object.assign(mergedPatch, item.patch)')
    expect(drawerSource).toContain('await flushDraftSaves()')
    expect(drawerSource).toContain('草稿保存失败，请重试')
    expect(drawerSource).toContain('expectedUpdatedAt: expectedUpdatedAt.value')
  })

  it('封面只有草稿保存成功后才提示「已存进草稿」', () => {
    expect(drawerSource).toContain(
      'await enqueueDraftPatch({ coverImageUrl: result.url })'
    )
    expect(drawerSource).toContain('封面已存进草稿，发布后生效')
    expect(drawerSource).toContain('UPLOAD_DISCARDED')
  })

  it('「只看有草稿」下推到后端分页，不再只过滤当前页', () => {
    expect(indexSource).toContain(
      'hasReleaseDraft: onlyDraft.value || undefined'
    )
    expect(indexSource).not.toContain('visibleSeries')
    expect(apiSource).toContain('hasReleaseDraft?: boolean')
  })

  it('卡片入口按状态显示「查看 / 上线」', () => {
    expect(indexSource).toContain(
      "card.businessStatus === 'PUBLIC' ? '查看' : '上线'"
    )
  })
})
