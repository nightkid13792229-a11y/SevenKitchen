import { describe, expect, it } from 'vitest'
// 用 Vite 的 `?raw` 读源码：admin-web 的 vitest 是 node 环境，
// 没有 jsdom/test-utils，页面接线只能锁源码（与 designerMultiProgress 同一做法）。
import designer from '@/views/RecipeDesigner/index.vue?raw'
import releaseDrawer from '@/views/RecipeDesigner/components/SeriesReleaseDrawer.vue?raw'

describe('食谱设计器 · 新建食谱（一键创建 + 临时名称）', () => {
  it('按钮叫「新建食谱」，不再有创建弹窗', () => {
    expect(designer).toContain('新建食谱')
    expect(designer).not.toContain('新建设计系列')
    expect(designer).not.toContain('label="参考爱犬"')
    expect(designer).not.toContain('label="默认阶段"')
    expect(designer).not.toContain('openCreateDialog')
    expect(designer).not.toContain('createDialogVisible')
    expect(designer).toContain('@click="createSeries"')
  })

  it('从订单入口带入参考爱犬，但不弹窗', () => {
    expect(designer).toContain('pendingReferenceDogId')
    expect(designer).toContain('await dogApi.getDetail(dogId)')
    expect(designer).toContain('resolveDogScenarioFromDetail')
    expect(designer).not.toContain('createDialogVisible')
  })

  it('创建时自动生成可识别的临时名称', () => {
    expect(designer).toContain('buildTemporarySeriesName')
    expect(designer).toContain('isTemporarySeriesName(card.name)')
  })
})

describe('系列发布 · 临时系列名称守卫', () => {
  // 2026-10-27：原来这条守卫挂在 Publish.vue 上，而那个页面没有任何入口、
  // 从来没被打开过 —— 等于规则从未生效。现在搬到真正在用的「系列发布」抽屉。
  it('临时名称会显示警告', () => {
    expect(releaseDrawer).toContain('isTemporaryName')
    expect(releaseDrawer).toContain('还是临时名称，不能发布')
  })

  it('保存名称时不允许继续保存未命名名称（后端也会拦）', () => {
    expect(releaseDrawer).toContain('saveName')
  })
})
