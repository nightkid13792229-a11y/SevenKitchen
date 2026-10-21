import { describe, expect, it } from 'vitest'
import {
  INTERNAL_CUSTOMER_ACCOUNT_BADGE,
  INTERNAL_CUSTOMER_BADGE,
  isInternalCustomerRole,
  normalizeCustomerRole,
} from '@/utils/customerRole'

/**
 * 顾客角色口径（2026-10-21）
 *
 * 「内部账号」和「内部测试」必须由同一套判断得出：
 * 代客下单页决定要不要二次确认，订单中心/详情决定要不要打标。
 * 两边各写一遍 `role !== 'CUSTOMER'` 迟早会分叉。
 */
describe('顾客角色', () => {
  it('真实顾客不算内部账号', () => {
    expect(isInternalCustomerRole('CUSTOMER')).toBe(false)
    expect(isInternalCustomerRole(' customer ')).toBe(false)
  })

  it('员工 / 管理员都算内部账号', () => {
    expect(isInternalCustomerRole('STAFF')).toBe(true)
    expect(isInternalCustomerRole('ADMIN')).toBe(true)
    expect(isInternalCustomerRole('admin')).toBe(true)
  })

  it('角色缺失按真实顾客处理，不在页面上乱标', () => {
    expect(isInternalCustomerRole(null)).toBe(false)
    expect(isInternalCustomerRole(undefined)).toBe(false)
    expect(isInternalCustomerRole('')).toBe(false)
    expect(normalizeCustomerRole('')).toBe('CUSTOMER')
  })

  it('徽标文案固定，页面不各写各的', () => {
    expect(INTERNAL_CUSTOMER_BADGE).toBe('内部测试')
    expect(INTERNAL_CUSTOMER_ACCOUNT_BADGE).toBe('内部账号')
  })
})
