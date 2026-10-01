import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 健康时间线 + 就诊前摘要（2026-10-01，第二期）。
 *
 * 老板需求 7、8：
 *   · 时间线汇总所有健康记录，**放在健康管理页内，不以新的板块标签形式存在**；
 *   · 带狗看病前，最想看到的是过往病史的摘要。
 */
describe('健康时间线', () => {
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

describe('就诊前摘要', () => {
  function readPage() {
    return readFileSync(
      resolve(process.cwd(), 'src/pages/dog-health/summary.vue'),
      'utf-8',
    )
  }

  it('排序按医生问诊的顺序：过敏 → 没结束的问题 → 就诊 → 体检 → 疫苗 → 体重 → 饮食', () => {
    const page = readPage()

    const order = [
      '过敏',
      '还没结束的问题',
      '最近就诊',
      '最近体检',
      '疫苗',
      '体重',
      '饮食偏好',
    ]
    let cursor = -1
    for (const title of order) {
      const index = page.indexOf(title)
      expect(index).toBeGreaterThan(cursor)
      cursor = index
    }
  })

  it('过敏永远排在最前（安全底线）', () => {
    const page = readPage()

    const allergyIndex = page.indexOf('{{ item.allergen }}')
    const conditionIndex = page.indexOf('ongoingConditions')
    expect(allergyIndex).toBeGreaterThan(-1)
    // 过敏渲染在"还没结束的问题"之前
    expect(page.indexOf('过敏</text>')).toBeLessThan(page.indexOf('还没结束的问题'))
    expect(conditionIndex).toBeGreaterThan(-1)
  })

  it('逾期疫苗给红色提示', () => {
    const page = readPage()

    expect(page).toContain('hasOverdueVaccine')
    expect(page).toContain('notice--danger')
  })

  it('摘要底部有免责声明与生成时间', () => {
    const page = readPage()

    expect(page).toContain('不构成诊断')
    expect(page).toContain('生成时间')
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
      'summary',
      'timeline',
    ])

    const mainPages = config.pages.map((page: { path: string }) => page.path)
    expect(mainPages).not.toContain('pages/dog-health/timeline')
    expect(mainPages).not.toContain('pages/dog-health/summary')
    expect(mainPages).not.toContain('pages/dog-health/share')
  })

  it('免登录的分享落地页在主包（从分享卡片冷启动不该再等分包下载）', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8'),
    )
    const mainPages = config.pages.map((page: { path: string }) => page.path)

    expect(mainPages).toContain('pages/shared-health/index')
  })

  it('入口在健康管理页内，且**不是**第六个书签', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('goHealthTimeline')
    expect(page).toContain('goVisitSummary')
    expect(page).toContain('health-shortcuts')

    // 老板明确：时间线不以新的板块标签形式存在 —— 书签仍然是五个
    const tabsBlock = page.slice(
      page.indexOf('const HEALTH_TABS'),
      page.indexOf('const RECORD_TAB_KEYS'),
    )
    expect((tabsBlock.match(/key: '/g) || []).length).toBe(5)
    expect(tabsBlock).not.toContain('timeline')
  })

  it('API 层两个聚合接口都在', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

    expect(api).toContain('/dogs/${dogId}/health/timeline')
    expect(api).toContain('/dogs/${dogId}/health/visit-summary')
  })
})
