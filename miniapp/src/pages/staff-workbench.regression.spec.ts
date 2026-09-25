import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'staff-workbench/index.vue'), 'utf8')
const staffOrdersSource = readFileSync(resolve(__dirname, 'staff-orders/index.vue'), 'utf8')
const iconNames = [
  'purchasing',
  'production',
  'orders',
  'supplement-orders',
  'customers',
  'inventory',
  'recipes',
  'reimbursement',
  'recipe-designer',
]

describe('staff workbench compact icon grid', () => {
  it('surfaces admin refund reviews from aftersale orders without a separate refund route', () => {
    expect(staffOrdersSource).toContain("{ label: '售后中', value: 'AFTERSALE'")
    expect(staffOrdersSource).toContain('aftersaleType?: string | null')
    expect(staffOrdersSource).toContain('function getStoredStaffUser()')
    expect(staffOrdersSource).toContain("getStoredStaffUser()?.role === 'ADMIN'")
    expect(staffOrdersSource).toContain("order.status === 'AFTERSALE' && order.aftersaleType === 'REFUND'")
    expect(staffOrdersSource).toContain('退款待审核')
    expect(staffOrdersSource).not.toContain('/pages/staff-refunds/index')
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

  it('uses the nine approved icon modules in the required order', () => {
    const moduleConfig = source.match(/const workbenchModules[\s\S]*?\n\]\)/)?.[0] || ''

    // 2026-09-25：补剂订单独立成一个入口，紧跟在「订单管理」之后。
    // 两者的作业方式差别太大（鲜食是生产+冷链，补剂是分装+贴标），
    // 混在一个列表里现场容易看串，所以是并列而不是合并。
    expect([...moduleConfig.matchAll(/title: '([^']+)'/g)].map((match) => match[1])).toEqual([
      '采购管理',
      '生产管理',
      '订单管理',
      '补剂订单',
      '客户与狗狗',
      '库存管理',
      '食谱管理',
      '报销管理',
      '食谱设计器',
    ])
    for (const badgeKey of [
      'purchasing',
      'production',
      'orders',
      'supplementOrders',
      'inventory',
      'reimbursement',
    ]) {
      expect(moduleConfig).toContain(`badgeKey: '${badgeKey}'`)
    }
    expect(source).toContain('badgeCount(module.badgeKey)')
  })

  it('补剂订单入口指向已注册的页面，且角标键与后端返回一致', () => {
    const pagesConfig = JSON.parse(
      readFileSync(resolve(__dirname, '../pages.json'), 'utf8'),
    )

    expect(source).toContain("url: '/pages/staff-supplement-orders/index'")
    // 角标来自 /staff/workbench/summary 的 badges 映射，键名必须对得上，
    // 对不上就是"永远显示 0"这种静默失效
    expect(source).toContain("badgeKey: 'supplementOrders'")

    // 分包在 pages.json 里是 root + path 分开写的，解析出来断言，别整串匹配
    const subPackage = pagesConfig.subPackages.find(
      (item: { root: string }) => item.root === 'pages/staff-supplement-orders',
    )
    expect(subPackage).toBeTruthy()
    expect(subPackage.pages.map((page: { path: string }) => page.path)).toEqual(
      expect.arrayContaining(['index', 'detail']),
    )
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
