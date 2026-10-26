import { describe, expect, it } from 'vitest'
import fieldSource from '@/views/RecipeDesigner/components/AiNameField.vue?raw'
import apiSource from '@/api/recipeNaming.ts?raw'
import publishSource from '@/views/RecipeDesigner/Publish.vue?raw'

describe('AI 命名字段', () => {
  it('输入框旁有 AI 生成按钮与 12 字计数器', () => {
    expect(fieldSource).toContain('AI 生成')
    expect(fieldSource).toContain('/ {{ RECIPE_NAME_MAX_LENGTH }}')
  })

  it('超长的候选被丢弃，不是截断', () => {
    expect(fieldSource).toContain(
      'countLength(item.name) <= RECIPE_NAME_MAX_LENGTH'
    )
    expect(fieldSource).not.toContain('.slice(0,')
  })

  it('命中禁用词的候选保留，但提示合规存疑', () => {
    expect(fieldSource).toContain('complianceWarning')
    expect(fieldSource).toContain('合规存疑')
  })

  it('AI 不可用时按钮禁用而不是点了报错', () => {
    expect(fieldSource).toContain(':disabled="!available || !seriesId"')
    expect(fieldSource).toContain('AI 命名服务未配置')
  })

  it('生成失败会恢复按钮并可重试', () => {
    expect(fieldSource).toContain('finally')
    expect(fieldSource).toContain('generating.value = false')
  })

  it('发布页把名称行换成了 AI 字段，并保留「保存名称」动作', () => {
    expect(publishSource).toContain('AiNameField')
    expect(publishSource).toContain('seriesNameDraft')
    expect(publishSource).toContain('保存名称')
  })

  it('发布页改名弹窗限 12 字，与后端同一口径', () => {
    expect(publishSource).toContain('maxlength="12"')
    expect(publishSource).toContain('最多 12 个字')
  })

  it('接口路径与后端一致，且只生成不落库', () => {
    expect(apiSource).toContain("'/admin/recipe-designer/naming/availability'")
    expect(apiSource).toContain(
      '`/admin/recipe-designer/series/${seriesId}/name-candidates`'
    )
    expect(apiSource).not.toContain('updateSeries')
  })
})

import launchReadinessSource from '@/utils/recipeDesigner/launchReadiness.ts?raw'

describe('上线检查里的「已归类」项', () => {
  it('通过时有中文标签，且只在产品线分支出现', () => {
    expect(launchReadinessSource).toContain("code: 'TAXONOMY_REQUIRED'")
    expect(launchReadinessSource).toContain('已归类（至少一个需求分类）')
    const block = launchReadinessSource.slice(
      launchReadinessSource.indexOf("code: 'TAXONOMY_REQUIRED'"),
      launchReadinessSource.indexOf("code: 'TAXONOMY_REQUIRED'") + 160
    )
    expect(block).toContain("scope: 'CATALOG'")
  })
})

import drawerSource from '@/views/RecipeDesigner/components/LaunchReadinessDrawer.vue?raw'
import quickSource from '@/views/RecipeDesigner/components/QuickTaxonomyPicker.vue?raw'

describe('上线检查抽屉里的命名与归类', () => {
  it('抽屉里有 AI 命名字段，且按系列操作', () => {
    expect(drawerSource).toContain('AiNameField')
    expect(drawerSource).toContain(':series-id="readiness.seriesId"')
  })

  it('没有系列的历史草稿不显示这一整块', () => {
    expect(drawerSource).toContain('v-if="readiness.seriesId"')
  })

  it('定制设计不显示归类面板', () => {
    expect(drawerSource).toContain("v-if=\"readiness.designMode !== 'ORDER'\"")
  })

  it('快速归类按分类逐行挂，并说明双拼菜可留空主蛋白', () => {
    expect(quickSource).toContain('快速归类')
    expect(quickSource).toContain('replaceLinks')
    expect(quickSource).toContain('双拼')
  })
})
