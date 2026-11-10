import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'staff-workbench/index.vue'), 'utf8')
const iconNames = [
  'purchasing',
  'production',
  'orders',
  'customers',
  'inventory',
  'recipes',
  'reimbursement',
  'recipe-designer',
]

describe('staff workbench compact icon grid', () => {
  it('surfaces aftersale orders from the order center without a separate refund route', () => {
    // 2026-11-10：旧「后台订单」列表页删掉后，售后统一看「订单中心」的售后标签
    const orderCenterSource = readFileSync(
      resolve(__dirname, 'staff-order-center/index.vue'),
      'utf8',
    )
    expect(orderCenterSource).toContain('aftersaleLabel')
    expect(orderCenterSource).toContain('hasOpenAftersale')
    expect(orderCenterSource).toContain('只看售后')
    expect(orderCenterSource).not.toContain('/pages/staff-refunds/index')
  })

  it('renders the three-column module grid directly without the retired overview stats', () => {
    expect(source).toContain('const workbenchModules')
    expect(source).toContain('workbench-grid')
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(source).not.toContain('今日概览')
    expect(source).not.toContain('今日订单')
    expect(source).not.toContain('todayOrders')
    expect(source).not.toContain('pendingTasks')
    expect(source).not.toContain('shippingCount')
  })

  it('uses the approved icon modules in the required order', () => {
    const moduleConfig = source.match(/const workbenchModules[\s\S]*?\n\]\)/)?.[0] || ''

    // 2026-10-21：鲜食 / 定制 / 补剂收口到「订单中心」一个入口；
    // 补剂侧再拆出「分装备料」这个现场高频动作。
    // 2026-10-30：补剂售后也收进订单中心（勾「只看售后」+ 订单详情的售后记录），
    // 工作台从 10 个格子回到 9 个，正好三行。
    // 2026-11-07：分装备料并进「生产管理」（里面再分鲜食 / 补剂），
    // 鲜食和补剂同属生产环节，不再各占一个格子。
    expect([...moduleConfig.matchAll(/title: '([^']+)'/g)].map((match) => match[1])).toEqual([
      '采购管理',
      '生产管理',
      '订单中心',
      '客户与狗狗',
      '库存管理',
      '食谱管理',
      '报销管理',
      '食谱设计器',
    ])
    for (const badgeKey of ['purchasing', 'orders', 'inventory', 'reimbursement']) {
      expect(moduleConfig).toContain(`badgeKeys: ['${badgeKey}']`)
    }
    // 补剂待办不再单独占格子，但红点要挂在生产管理上，否则员工看不到补剂待办
    expect(moduleConfig).toContain("badgeKeys: ['production', 'supplementOrders']")
    expect(source).toContain('moduleBadge(module)')
  })

  it('订单中心入口已注册，补剂订单从订单中心仍能进详情', () => {
    const pagesConfig = JSON.parse(
      readFileSync(resolve(__dirname, '../pages.json'), 'utf8'),
    )
    const orderCenterSource = readFileSync(
      resolve(__dirname, 'staff-order-center/index.vue'),
      'utf8',
    )

    expect(source).toContain("url: '/pages/staff-order-center/index'")
    expect(source).toContain("badgeKeys: ['orders']")
    expect(orderCenterSource).toContain("item.type === 'SUPPLEMENT'")
    expect(orderCenterSource).toContain('/pages/staff-supplement-orders/detail?id=')

    // 分包在 pages.json 里是 root + path 分开写的，解析出来断言，别整串匹配
    const subPackage = pagesConfig.subPackages.find(
      (item: { root: string }) => item.root === 'pages/staff-supplement-orders',
    )
    expect(subPackage).toBeTruthy()
    expect(subPackage.pages.map((page: { path: string }) => page.path)).toEqual(
      expect.arrayContaining(['index', 'detail']),
    )
  })

  it('★ 补剂售后不再单独占格子：页面和路由一起撤掉，售后统一从订单中心看', () => {
    const pagesConfig = JSON.parse(
      readFileSync(resolve(__dirname, '../pages.json'), 'utf8'),
    )
    const moduleConfig = source.match(/const workbenchModules[\s\S]*?\n\]\)/)?.[0] || ''

    expect(moduleConfig).not.toContain('supplementAftersales')
    expect(moduleConfig).not.toContain('补剂售后')
    expect(source).not.toContain('/pages/staff-supplement-aftersales')

    // 页面文件也必须一起删掉，别留一个没有入口的死页面
    expect(
      existsSync(resolve(__dirname, 'staff-supplement-aftersales/index.vue')),
    ).toBe(false)
    expect(
      pagesConfig.pages.map((page: { path: string }) => page.path),
    ).not.toContain('pages/staff-supplement-aftersales/index')
  })

  it('★ 分装备料已并入生产管理：工作台不再有独立入口，旧页面和路由一起撤掉', () => {
    const pagesConfig = JSON.parse(
      readFileSync(resolve(__dirname, '../pages.json'), 'utf8'),
    )
    const moduleConfig = source.match(/const workbenchModules[\s\S]*?\n\]\)/)?.[0] || ''

    expect(moduleConfig).not.toContain('分装备料')
    expect(moduleConfig).not.toContain('supplementSummary')
    expect(source).not.toContain('/pages/staff-supplement-summary')

    expect(
      existsSync(resolve(__dirname, 'staff-supplement-summary/index.vue')),
    ).toBe(false)
    expect(
      pagesConfig.pages.map((page: { path: string }) => page.path),
    ).not.toContain('pages/staff-supplement-summary/index')
  })

  it('uses bundled image assets instead of the retired header and module UI', () => {
    for (const name of iconNames) {
      expect(source).toContain(`/static/ui-icons/${name}.png`)
      expect(existsSync(resolve(__dirname, `../static/ui-icons/${name}.png`))).toBe(true)
    }

    expect(source).not.toContain('class="header"')
    expect(source).not.toContain('欢迎，')
    expect(source).not.toContain('退款管理')
    expect(source).not.toContain('goToRefunds')
    expect(source).not.toContain('/pages/staff-refunds/index')
    for (const emoji of ['🛒', '🏭', '📦', '🧾', '📚', '📋']) {
      expect(source).not.toContain(emoji)
    }
    expect(source).not.toContain('module-icon-symbol')
    expect(source).not.toContain('font-size: 48rpx')
  })

  it('preserves permission and summary loading', () => {
    expect(source).toContain('checkPermission()')
    expect(source).toContain('loadStats()')
    expect(source).toContain('/staff/workbench/summary')
  })

  it('preserves customer and recipe designer navigation', () => {
    expect(source).toContain('/pages/staff-customer-service/customers')
    expect(source).toContain('/pages/recipe-designer/list')
  })
})
