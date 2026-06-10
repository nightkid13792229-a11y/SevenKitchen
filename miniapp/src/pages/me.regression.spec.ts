import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('me page regressions', () => {
  it('shows the order list entry on the me page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/me/index.vue'),
      'utf-8',
    )
    const templateSource = source.slice(0, source.indexOf('<script setup'))

    expect(templateSource).toContain('我的订单')
    expect(templateSource).toContain('@tap="goToOrderList"')
    expect(templateSource).toContain('userInfo.orderCount')
    expect(source).toContain("url: '/pages/orders-list/index'")
  })

  it('keeps production customer test mode behind the me page admin panel', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/me/index.vue'),
      'utf-8',
    )
    const homeSource = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('当前为普通用户测试模式')
    expect(source).toContain('进入普通用户测试模式')
    expect(source).toContain('退出普通用户测试模式')
    expect(source).toContain('重置测试用户数据')
    expect(source).toContain('/admin/test-identity/customer-mode')
    expect(source).toContain('/admin/test-identity/customer-mode/reset')
    expect(source).toContain('applyCustomerTestModeSession')
    expect(source).toContain('restoreAdminSessionFromCustomerTestMode')
    expect(source).toContain('handleTestIdentityHiddenTap')
    expect(homeSource).not.toContain('普通用户测试模式')
    expect(homeSource).not.toContain('/admin/test-identity/customer-mode')
  })
})
