import { describe, expect, it } from 'vitest'
import fieldSource from '@/views/RecipeDesigner/components/AiNameField.vue?raw'
import apiSource from '@/api/recipeNaming.ts?raw'

describe('AI 命名字段', () => {
  it('输入框旁有 AI 生成按钮与 12 字计数器', () => {
    expect(fieldSource).toContain('AI 生成')
    expect(fieldSource).toContain('/ {{ RECIPE_NAME_MAX_LENGTH }}')
  })

  it('超长的候选被丢弃，不是截断', () => {
    expect(fieldSource).toContain(
      'countLength(item.name) <= RECIPE_NAME_MAX_LENGTH'
    )
    expect(fieldSource).not.toContain('candidate.name.slice')
  })

  it('命中禁用词的候选保留，但提示合规存疑', () => {
    expect(fieldSource).toContain('complianceWarning')
    expect(fieldSource).toContain('合规存疑')
  })

  it('只有后端明确说不可用才置灰，拿不到答案时保持可点', () => {
    expect(fieldSource).toContain(':disabled="!available || !seriesId"')
    expect(fieldSource).toContain('AI 命名服务未配置')
    // 401/网络错误不能把人挡在一个不解释原因的灰按钮外面
    expect(fieldSource).toContain('available.value = true')
  })

  it('生成失败会恢复按钮并可重试', () => {
    expect(fieldSource).toContain('finally')
    expect(fieldSource).toContain('generating.value = false')
  })



  it('候选只显示名字，不再显示"依据"那一行', () => {
    expect(fieldSource).not.toContain('cand-reason')
    expect(fieldSource).toContain('.slice(0, 2)')
  })

  it('点「采用」直接落库，不再要求二次点保存', () => {
    expect(fieldSource).toContain('recipeDesignerApi.renameSeries')
    expect(fieldSource).toContain("emit('saved', name)")
    expect(fieldSource).not.toContain('再点一次保存')
  })

  it('接口路径与后端一致，且只生成不落库', () => {
    expect(apiSource).toContain("'/admin/recipe-designer/naming/availability'")
    expect(apiSource).toContain(
      '`/admin/recipe-designer/series/${seriesId}/name-candidates`'
    )
    expect(apiSource).not.toContain('updateSeries')
  })
})

import drawerSource from '@/views/RecipeDesigner/components/LaunchReadinessDrawer.vue?raw'
import quickSource from '@/views/RecipeDesigner/components/QuickTaxonomyPicker.vue?raw'
import releaseDrawerSource from '@/views/RecipeDesigner/components/SeriesReleaseDrawer.vue?raw'

describe('系列级资料的维护入口', () => {
  it('产品线的命名与归类只在发布 / 更新里维护', () => {
    // 2026-10-31：上线检查是阶段门槛，不再提供系列级编辑
    expect(drawerSource).not.toContain('QuickTaxonomyPicker')
    expect(releaseDrawerSource).toContain('QuickTaxonomyPicker')
    expect(quickSource).toContain('快速归类')
    expect(quickSource).toContain('replaceLinks')
    expect(quickSource).toContain('双拼')
  })

  it('定制设计没有发布抽屉，名称仍在检查抽屉里改', () => {
    expect(drawerSource).toContain('AiNameField')
    expect(drawerSource).toContain(
      "v-if=\"readiness.seriesId && readiness.designMode === 'ORDER'\""
    )
    expect(drawerSource).toContain(':series-id="readiness.seriesId"')
  })

  it('上线检查的系列资料只读展示，并给出去发布 / 更新的入口', () => {
    expect(drawerSource).toContain('系列资料（共用）')
    expect(drawerSource).toContain('去发布 / 更新')
    expect(drawerSource).toContain('go-to-series-list')
  })
})

describe('系列发布抽屉里的命名与归类', () => {
  it('发布设置里有「食谱名称」，用的是同一个 AI 字段', () => {
    expect(releaseDrawerSource).toContain('食谱名称')
    expect(releaseDrawerSource).toContain('AiNameField')
    expect(releaseDrawerSource).toContain(':series-id="seriesId"')
  })

  it('采用或失焦即写库，不再有「保存名称」按钮', () => {
    expect(releaseDrawerSource).not.toContain('保存名称')
    expect(releaseDrawerSource).toContain("emit('saved')")
    expect(releaseDrawerSource).toContain('@saved="onNameAdopted"')
  })

  it('快速归类放在发布设置里，保存后重算整系列门槛', () => {
    expect(releaseDrawerSource).toContain('<QuickTaxonomyPicker')
    expect(releaseDrawerSource).toContain(':show-title="false"')
    expect(releaseDrawerSource).toContain('@saved="refreshReadiness"')
  })
})
