import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'staff-workbench/index.vue'), 'utf8')
const staffOrdersSource = readFileSync(resolve(__dirname, 'staff-orders/index.vue'), 'utf8')
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

  it('uses the approved icon modules in the required order', () => {
    const moduleConfig = source.match(/const workbenchModules[\s\S]*?\n\]\)/)?.[0] || ''

    // 2026-10-21：鲜食 / 定制 / 补剂收口到「订单中心」一个入口；
    // 补剂侧再拆出「分装备料」与「补剂售后」两个现场高频动作。
    // 旧的「订单管理」「补剂订单」两个并列入口随之撤掉。
    expect([...moduleConfig.matchAll(/title: '([^']+)'/g)].map((match) => match[1])).toEqual([
      '采购管理',
      '生产管理',
      '订单中心',
      '分装备料',
      '补剂售后',
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
      'inventory',
      'reimbursement',
    ]) {
      expect(moduleConfig).toContain(`badgeKey: '${badgeKey}'`)
    }
    expect(source).toContain('badgeCount(module.badgeKey)')
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
    expect(source).toContain("badgeKey: 'orders'")
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
