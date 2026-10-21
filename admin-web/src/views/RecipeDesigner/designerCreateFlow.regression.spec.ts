import { describe, expect, it } from 'vitest'
// 用 Vite 的 `?raw` 读源码：admin-web 的 vitest 是 node 环境，
// 没有 jsdom/test-utils，页面接线只能锁源码（与 designerMultiProgress 同一做法）。
import designer from '@/views/RecipeDesigner/index.vue?raw'
import publish from '@/views/RecipeDesigner/Publish.vue?raw'

describe('食谱设计器 · 新建系列（默认阶段 + 临时名称）', () => {
  it('新建对话框不再要求填写系列名称', () => {
    expect(designer).not.toContain('label="系列名称"')
    expect(designer).not.toContain('createForm.name')
    expect(designer).not.toContain("请填写系列名称")
    expect(designer).toContain('label="参考爱犬"')
    expect(designer).toContain('label="默认阶段"')
  })

  it('切换参考爱犬时按犬档案自动带出默认阶段', () => {
    expect(designer).toContain('@change="handleReferenceDogChange"')
    expect(designer).toContain('resolveDogScenarioFromDetail')
    expect(designer).toContain('autoFillScenarioFromDog')
    expect(designer).toContain('dogApi.getDetail(dogId)')
  })

  it('从订单入口进入时也会自动带出默认阶段', () => {
    expect(designer).toContain('await autoFillScenarioFromDog(dogId)')
  })

  it('创建时自动生成可识别的临时名称', () => {
    expect(designer).toContain('buildTemporarySeriesName')
    expect(designer).toContain('未命名系列 · 10-21 22:15')
    expect(designer).toContain('待改名')
    expect(designer).toContain('isTemporarySeriesName(card.name)')
  })
})

describe('发布页 · 临时系列名称守卫', () => {
  it('临时名称会显示警告并拦截发布', () => {
    expect(publish).toContain('seriesNameIsTemporary')
    expect(publish).toContain('if (seriesNameIsTemporary.value)')
    expect(publish).toContain('临时名称')
    expect(publish).toContain('openRenameDialog()')

    const guardIndex = publish.indexOf('if (seriesNameIsTemporary.value)')
    const publishIndex = publish.indexOf('recipeDesignerApi.publishDraft')
    expect(guardIndex).toBeGreaterThan(-1)
    expect(publishIndex).toBeGreaterThan(guardIndex)
  })

  it('改名时也不允许继续保存未命名名称', () => {
    expect(publish).toContain('isTemporarySeriesName(name)')
  })
})
