import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/SeriesReleaseDrawer.vue?raw'
import apiSource from '@/api/recipeDesigner.ts?raw'
import helperSource from '@/utils/recipeDesigner/seriesAiCover.ts?raw'

/**
 * 源码契约（2026-10-27）：系列 AI 封面。
 *
 * 这里守的是「结构不能回退」：
 *  · 接口路径 / 300 秒超时 / 中文超时提示；
 *  · 按钮只在管理员可见，而且只有人手点才会调；
 *  · 预览「用这张 / 不要」与失败重试入口还在；
 *  · 生成不阻断「保存发布设置」。
 */
describe('系列 AI 封面 · 源码契约', () => {
  it('接口路径、300 秒超时与中文超时提示', () => {
    expect(apiSource).toContain('`/admin/recipe-series/${seriesId}/ai-cover`')
    expect(apiSource).toContain('timeout: SERIES_AI_COVER_TIMEOUT_MS')
    expect(apiSource).toContain(
      'timeoutErrorMessage: SERIES_AI_COVER_TIMEOUT_MESSAGE'
    )
    expect(helperSource).toContain('300_000')
    expect(helperSource).toContain('生成超时（300 秒），请点重试')
  })

  it('按钮只在管理员可见，且只有点击才生成', () => {
    expect(drawerSource).toContain(
      '<div v-if="isAdmin" class="series-release__ai-cover-actions">'
    )
    expect(drawerSource).toContain('@click="handleGenerateAiCover"')
    // 只允许作为点击处理器出现一次（函数定义）；watch / 打开抽屉里不许自动调
    expect(
      (drawerSource.match(/handleGenerateAiCover\(/g) ?? []).length
    ).toBe(1)
  })

  it('预览与重试入口存在', () => {
    expect(drawerSource).toContain('用这张')
    expect(drawerSource).toContain('不要')
    expect(drawerSource).toContain('applyAiCoverPreview')
    expect(drawerSource).toContain('aiCoverError')
    expect(drawerSource).toContain('aiCoverPreviewUrl')
  })

  it('覆盖前确认、只出预览、超时用中文常量', () => {
    expect(drawerSource).toContain('约 0.2 元/张')
    expect(drawerSource).toContain('aiCoverPreviewUrl.value = result.url')
    expect(drawerSource).not.toContain('result.saved')
    expect(drawerSource).toContain("error?.code === 'ECONNABORTED'")
    expect(drawerSource).toContain('SERIES_AI_COVER_TIMEOUT_MESSAGE')
  })

  it('切换系列 / 重新打开时复位 AI 状态', () => {
    const watchBlock = drawerSource.slice(
      drawerSource.indexOf('() => [props.modelValue, props.seriesId]')
    )
    const resetIndex = watchBlock.indexOf("aiCoverPreviewUrl.value = ''")
    const closeIndex = watchBlock.indexOf('if (!open)')
    expect(resetIndex).toBeGreaterThan(-1)
    // 复位必须在 open/close 分支之前：切换系列（open 仍为 true）也要清掉旧预览
    expect(resetIndex).toBeLessThan(closeIndex)
  })

  it('点击封面缩略图看大图，且不触发上传', () => {
    expect(drawerSource).toContain('openCoverPreview')
    expect(drawerSource).toContain('coverPreviewVisible')
    expect(drawerSource).toContain(
      '@click.stop="openCoverPreview(form.coverImageUrl)"'
    )
    expect(drawerSource).toContain('series-release__cover-preview-large')
    expect(drawerSource).toContain('封面图预览')
    // 换图仍然要能走上传：缩略图点击被 stop 后，必须另有一个「更换封面」入口
    expect(drawerSource).toContain('更换封面')
  })

  it('生成不阻断保存发布设置', () => {
    expect(drawerSource).toContain(':disabled="saving || uploading || !dirty"')
    expect(drawerSource).not.toContain('aiCoverGenerating || !dirty')
  })
})
