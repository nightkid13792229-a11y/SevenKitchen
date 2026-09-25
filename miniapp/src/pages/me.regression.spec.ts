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
    // 笔数要**数两类订单**：后端 orderCount 只数鲜食（它的语义不能动 ——
    // 账号迁移拿它判断"有没有需要搬的数据"），补剂另有 supplementOrderCount。
    // 模板里必须用两者相加的那个，否则会出现"写着 3 笔、列表里 5 条"。
    expect(templateSource).toContain('totalOrderCount')
    expect(source).toContain('userInfo.value.orderCount || 0')
    expect(source).toContain('userInfo.value.supplementOrderCount || 0')
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
