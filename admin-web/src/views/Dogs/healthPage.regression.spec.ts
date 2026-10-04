import { describe, expect, it } from 'vitest'
// 用 Vite 的 `?raw` 读源码，而不是 node 的 fs：
// admin-web 的 tsconfig 只带 `vite/client` 类型（没有 node 类型），
// 用 fs/process 会让 `npm run build` 的类型检查直接失败。
import page from '@/views/Dogs/Health.vue?raw'
import dogsList from '@/views/Dogs/index.vue?raw'
import routerSource from '@/router/index.ts?raw'

/**
 * 营养师端「健康档案」页的接线回归（2026-10-01 自查补）。
 *
 * 为什么用"读源码断言"而不是挂载组件：
 *   admin-web 的 vitest 是 node 环境、只跑纯函数 spec（没有 jsdom / test-utils），
 *   Element Plus 的页面挂不起来。所以分工是：
 *     · **算法**（标签纠错、时间格式）抽到 `utils/dogHealthTags`，由那份 spec 真跑；
 *     · **接线**（路由、接口、按钮、四个板块）用这份 spec 锁住，防止改别处时被删掉。
 *
 * 对应老板第 22–25 条：
 *   22 独立健康分析页 · 23 报告原件可见 · 24 健康标签纠错 · 25 顾客改了信息要能看出来
 */
describe('营养师端健康档案页', () => {

  it('按路由上的狗 id 取数，并在切换狗时重新加载', () => {
    expect(page).toContain('const dogId = computed(() => String(route.params.id || ""));')
    expect(page).toContain('watch(dogId, load);')
    expect(page).toContain('onMounted(load);')
  })

  it('两个接口都用对了（看档案 / 存标签修正）', () => {
    expect(page).toContain('overview.value = await dogApi.getHealthOverview(dogId.value);')
    expect(page).toContain('const result = await dogApi.setHealthTags(dogId.value, {')
    expect(page).toContain('added: overrides.value.added,')
    expect(page).toContain('removed: overrides.value.removed,')
  })

  it('顶部能看到"最近更新"并能手动刷新（第 25 条：一眼看出有没有新东西）', () => {
    expect(page).toContain('健康信息最近更新：{{ formatTime(overview?.lastHealthUpdatedAt) }}')
    expect(page).toContain('@click="load"')
    expect(page).toContain('const formatTime = formatHealthUpdatedAt;')
  })

  it('标签纠错的算法走 utils（那份有真跑的测试），页面只负责呈现', () => {
    expect(page).toContain('buildEffectiveHealthTags(overview.value?.derivedTags || [], overrides.value)')
    expect(page).toContain('listAddableHealthTags(')
    expect(page).toContain('applyAddHealthTag(overrides.value, tagToAdd.value)')
    expect(page).toContain('applyRemoveHealthTag(overrides.value, tag)')
    expect(page).toContain('applyRemoveAddedHealthTag(overrides.value, tag)')
    expect(page).toContain('cloneHealthTagOverrides(overview.value?.tagOverrides)')
  })

  it('保存成功与失败都有反馈，且保存中会锁住按钮', () => {
    expect(page).toContain('ElMessage.success("已保存，下次生成配方会按新标签检索");')
    expect(page).toContain('ElMessage.error(error?.message || "保存失败");')
    expect(page).toContain(':loading="savingTags"')
  })

  it('四个板块都在：分析（含引用编号）、报告原件、健康标签、健康记录', () => {
    expect(page).toContain('AI 健康分析')
    expect(page).toContain('overview?.analysis?.items')
    expect(page).toContain('依据')
    expect(page).toContain('顾客上传的报告原件')
    expect(page).toContain('preview-src-list')
    expect(page).toContain('健康标签')
    expect(page).toContain('健康记录')
  })

  it('分析失败时不隐藏记录（只提示分析失败）', () => {
    expect(page).toContain('overview?.analysis?.error')
    expect(page).toContain('分析生成失败：')
    expect(page).toContain('记录本身仍然可以看，分析可以稍后重试。')
  })

  it('这一页能从犬只列表点进来', () => {
    const list = dogsList
    expect(list).toContain('健康档案')
    expect(list).toContain('@click="handleHealth(row)"')
    expect(list).toContain('router.push(`/dogs/${row.id}/health`)')
  })

  it('路由已注册到 dogs/:id/health', () => {
    const router = routerSource
    expect(router).toContain('path: "dogs/:id/health"')
    expect(router).toContain('name: "DogHealth"')
    expect(router).toContain('import("@/views/Dogs/Health.vue")')
    expect(router).toContain('title: "健康档案"')
  })
})
