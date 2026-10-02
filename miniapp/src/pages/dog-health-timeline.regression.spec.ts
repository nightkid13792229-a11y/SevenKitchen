import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 健康记录（时间线页，2026-10-01，第二期）。
 *
 * 老板需求 7：汇总所有健康记录，**放在健康管理页内，不以新的板块标签形式存在**。
 * 2026-10-01 二次调整：
 *   · 入口名称由「健康时间线」改为「健康记录」；
 *   · 「就诊前摘要」整块删除（老板：不需要给医生看摘要），页面与入口一并去掉。
 */
describe('健康记录（原健康时间线）', () => {
  function readPage() {
    return readFileSync(
      resolve(process.cwd(), 'src/pages/dog-health/timeline.vue'),
      'utf-8',
    )
  }

  it('五类记录排成一条时间线，按日期从新到旧由后端给', () => {
    const page = readPage()

    // 数据来自后端聚合接口，前端不自己拼
    expect(page).toContain('dogApi.healthTimeline(dogId.value)')
    expect(page).not.toContain('mergeHealth')
    for (const label of ['就诊', '体检', '过敏', '疫苗', '体重']) {
      expect(page).toContain(label)
    }
  })

  it('疫苗逾期与即将到期有醒目标记', () => {
    const page = readPage()

    expect(page).toContain("event.flag === 'overdue' ? '已逾期' : '即将到期'")
    expect(page).toContain('timeline__flag--overdue')
  })

  it('无记录时给引导而不是空白页', () => {
    const page = readPage()

    expect(page).toContain('还没有健康记录')
    expect(page).toContain('goHealth')
  })

  it('页面底部有"不构成诊断"的固定说明', () => {
    const page = readPage()

    expect(page).toContain('不构成诊断')
  })
})

describe('两个页面的注册与入口', () => {
  it('注册在 pages/dog-health 分包里（重页面不进主包）', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8'),
    )
    const subPackage = config.subPackages.find(
      (item: { root: string }) => item.root === 'pages/dog-health',
    )

    expect(subPackage).toBeTruthy()
    expect(subPackage.pages.map((page: { path: string }) => page.path).sort()).toEqual([
      'analysis',
      'share',
      'timeline',
    ])

    // 就诊前摘要整块已删除：分包里不该再有这个页面
    expect(subPackage.pages.map((page: { path: string }) => page.path)).not.toContain('summary')

    const mainPages = config.pages.map((page: { path: string }) => page.path)
    expect(mainPages).not.toContain('pages/dog-health/timeline')
    expect(mainPages).not.toContain('pages/dog-health/share')
  })

  it('免登录的分享落地页在主包（从分享卡片冷启动不该再等分包下载）', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8'),
    )
    const mainPages = config.pages.map((page: { path: string }) => page.path)

    expect(mainPages).toContain('pages/shared-health/index')
  })

  it('入口在健康管理页内，且**不占**板块书签的位置', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('goHealthTimeline')
    expect(page).toContain('goHealthAnalysis')
    // 入口已搬出五个板块那张卡，独立成两块（见 dog-profile-health.regression.spec.ts）
    expect(page).toContain('health-entries')
    expect(page).not.toContain('goVisitSummary')

    // 老板明确：时间线不以新的板块标签形式存在
    // （2026-10-02：就诊/体检拆开后是 6 个，随后饮食标签下线 → 5 个）
    const tabsBlock = page.slice(
      page.indexOf('const HEALTH_TABS'),
      page.indexOf('const RECORD_TAB_KEYS'),
    )
    expect((tabsBlock.match(/key: '/g) || []).length).toBe(5)
    expect(tabsBlock).not.toContain('timeline')
  })

  it('API 层保留时间线聚合接口，摘要接口随页面一起删掉', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

    expect(api).toContain('/dogs/${dogId}/health/timeline')
    expect(api).not.toContain('healthVisitSummary')
    expect(api).not.toContain('/dogs/${dogId}/health/visit-summary')
  })
})

/**
 * 时间线不再有饮食偏好事件（2026-10-02 老板定）。
 *
 * 第五期把"饮食偏好变更"放进健康记录，是因为那时它属于健康管理；
 * 后来饮食标签下线（只在定制食谱时填），时间线上再混着
 * "新增/去掉某样食材"就不合逻辑了。变更历史本身仍在库里。
 */
describe('健康记录 · 饮食事件已下线', () => {
  it('时间线页里没有 diet 这个类型（标签、配色都清掉）', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-health/timeline.vue'),
      'utf-8',
    )

    expect(page).toContain("type HealthEventType = 'visit' | 'checkup' | 'allergy' | 'vaccine' | 'weight'")
    expect(page).not.toContain("diet: '饮食'")
    expect(page).not.toContain('.timeline__dot--diet')
    expect(page).not.toContain('.timeline__badge--diet')
  })

  it('后端时间线不再查饮食偏好变更表', () => {
    const service = readFileSync(
      resolve(process.cwd(), '../backend/src/application/health/health-timeline.service.ts'),
      'utf-8',
    )

    expect(service).not.toContain('dogDietPreferenceChange')
    expect(service).not.toContain("type: 'diet'")
    // 事件类型联合与排序表里也没有 diet 了
    expect(service).not.toContain("| 'diet'")
    expect(service).not.toContain('diet: 5')
  })
})
