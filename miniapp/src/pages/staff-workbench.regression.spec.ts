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

  it('renders today overview before a three-column module grid', () => {
    expect(source).toContain('今日概览')
    expect(source).toContain('const workbenchModules')
    expect(source).toContain('workbench-grid')
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(source.indexOf('今日概览')).toBeLessThan(source.indexOf('workbench-grid'))
  })

  it('uses the eight approved icon modules in the required order', () => {
    const moduleConfig = source.match(/const workbenchModules[\s\S]*?\n\]\)/)?.[0] || ''

    expect([...moduleConfig.matchAll(/title: '([^']+)'/g)].map((match) => match[1])).toEqual([
      '采购管理',
      '生产管理',
      '订单管理',
      '客户与狗狗',
      '库存管理',
      '食谱管理',
      '报销管理',
      '食谱设计器',
    ])
    for (const badgeKey of ['purchasing', 'production', 'orders', 'inventory', 'reimbursement']) {
      expect(moduleConfig).toContain(`badgeKey: '${badgeKey}'`)
    }
    expect(source).toContain('badgeCount(module.badgeKey)')
  })

  it('uses bundled image assets instead of the retired header and module UI', () => {
    for (const name of iconNames) {
      expect(source).toContain(`/static/ui-icons/${name}.png`)
      expect(existsSync(resolve(__dirname, `../static/ui-icons/${name}.png`))).toBe(true)
    }

    expect(source).not.toContain('class="header"')
    expect(source).not.toContain('欢迎，')
    expect(source).not.toContain('退款管理')
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
