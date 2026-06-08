import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('custom tab bar runtime regressions', () => {
  it('uses page show lifecycles instead of route polling to sync tab state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/custom-tab-bar/index.js'),
      'utf-8',
    )

    expect(source).toContain('pageLifetimes:')
    expect(source).toContain('show()')
    expect(source).toContain('this.refresh();')
    expect(source).not.toContain('setInterval(')
    expect(source).not.toContain('userLoginTrigger')
    expect(source).not.toContain("console.log('[TabBar] refresh() called'")
    expect(source).not.toContain("console.log('[TabBar] User from storage:'")
    expect(source).not.toContain("console.log('[TabBar] Current page route:'")
  })

  it('normalizes stored user data before deciding staff tab visibility', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/custom-tab-bar/index.js'),
      'utf-8',
    )

    expect(source).toContain('getStoredUser()')
    expect(source).toContain("wx.getStorageSync('userInfo')")
    expect(source).toContain('JSON.parse(trimmed)')
    expect(source).toContain('isStoredStaffUser()')
  })

  it('keeps the mine tab selected icon in sync for staff and non-staff layouts', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/custom-tab-bar/index.wxml'),
      'utf-8',
    )

    expect(source).toContain('(isStaff && selected === 2) || (!isStaff && selected === 1)')
  })

  it('does not place customer service in the global tab bar', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/custom-tab-bar/index.wxml'),
      'utf-8',
    )

    expect(source).not.toContain('customer-service-tab')
    expect(source).not.toContain('bindtap="openCustomerService"')
    expect(source).not.toContain('问Seven爸')
  })

  it('keeps customer service workflow out of the global tab bar script', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/custom-tab-bar/index.js'),
      'utf-8',
    )

    expect(source).not.toContain("require('../utils/customer-service.js')")
    expect(source).not.toContain('openCustomerServiceChat')
    expect(source).not.toContain('openCustomerService()')
  })

  it('keeps the staff tab configured with icons in the native tabBar list', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages.json'),
      'utf-8',
    )

    expect(source).toContain('"pagePath": "pages/staff-workbench/index"')
    expect(source).toContain('"iconPath": "static/tabbar/staff.png"')
    expect(source).toContain('"selectedIconPath": "static/tabbar/staff-active.png"')
  })

  it('uses switchTab when staff login enters a tabBar page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/login/staff.vue'),
      'utf-8',
    )

    expect(source).toContain("uni.switchTab({ url: '/pages/home/index' })")
    expect(source).not.toContain("uni.redirectTo({ url: '/pages/home/index' })")
  })

  it('does not rewrite the primary user cache as a JSON string', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain("uni.setStorageSync('user', res.data)")
    expect(source).not.toContain("uni.setStorageSync('user', JSON.stringify(res.data))")
  })

  it('actively refreshes the custom tab bar from each tab page on show', () => {
    const tabPagePaths = [
      'src/pages/home/index.vue',
      'src/pages/staff-workbench/index.vue',
      'src/pages/me/index.vue',
    ]

    for (const pagePath of tabPagePaths) {
      const source = readFileSync(resolve(process.cwd(), pagePath), 'utf-8')
      expect(source).toContain("import { refreshCurrentTabBar } from '../../utils/tabbar'")
      expect(source).toContain('refreshCurrentTabBar()')
    }
  })

  it('uses the current page getTabBar bridge to refresh the custom tab bar instance', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/utils/tabbar.ts'),
      'utf-8',
    )

    expect(source).toContain('getCurrentPages()')
    expect(source).toContain('$scope?.getTabBar?.()')
    expect(source).toContain('tabBar.refresh()')
  })
})
