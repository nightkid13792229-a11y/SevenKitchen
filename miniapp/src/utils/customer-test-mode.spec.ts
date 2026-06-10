import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyCustomerTestModeSession,
  clearCustomerTestUserCaches,
  CUSTOMER_TEST_MODE_ACTIVE_KEY,
  CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY,
  getCustomerTestModeState,
  restoreAdminSessionFromCustomerTestMode,
} from './customer-test-mode'

const storage = new Map<string, any>()

beforeEach(() => {
  storage.clear()
  ;(globalThis as any).uni = {
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, value: any) => storage.set(key, value)),
    removeStorageSync: vi.fn((key: string) => storage.delete(key)),
  }
})

describe('customer test mode helper', () => {
  it('backs up the current admin session and applies the customer test session globally', () => {
    storage.set('token', 'admin-token')
    storage.set('user', { id: 'admin-1', role: 'ADMIN' })
    storage.set('userInfo', { id: 'admin-1', role: 'ADMIN' })
    storage.set('dogs_cache', [{ id: 'dog-admin' }])

    applyCustomerTestModeSession({
      token: 'customer-token',
      user: {
        id: 'production-experience-customer-test-user',
        role: 'CUSTOMER',
        nickname: '生产体验版普通用户测试号',
        phoneBound: true,
      },
    })

    expect(storage.get(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)).toEqual({
      token: 'admin-token',
      user: { id: 'admin-1', role: 'ADMIN' },
      userInfo: { id: 'admin-1', role: 'ADMIN' },
    })
    expect(storage.get('token')).toBe('customer-token')
    expect(storage.get('user')).toEqual(
      expect.objectContaining({ role: 'CUSTOMER' }),
    )
    expect(storage.get('userInfo')).toEqual(
      expect.objectContaining({ role: 'CUSTOMER' }),
    )
    expect(storage.get(CUSTOMER_TEST_MODE_ACTIVE_KEY)).toBe(true)
    expect(storage.has('dogs_cache')).toBe(false)
  })

  it('restores the backed up admin session and clears test mode markers', () => {
    storage.set(CUSTOMER_TEST_MODE_ACTIVE_KEY, true)
    storage.set(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY, {
      token: 'admin-token',
      user: { id: 'admin-1', role: 'ADMIN' },
      userInfo: { id: 'admin-1', role: 'ADMIN' },
    })
    storage.set('token', 'customer-token')
    storage.set('user', { id: 'customer-test', role: 'CUSTOMER' })

    const restored = restoreAdminSessionFromCustomerTestMode()

    expect(restored).toBe(true)
    expect(storage.get('token')).toBe('admin-token')
    expect(storage.get('user')).toEqual({ id: 'admin-1', role: 'ADMIN' })
    expect(storage.get('userInfo')).toEqual({ id: 'admin-1', role: 'ADMIN' })
    expect(storage.has(CUSTOMER_TEST_MODE_ACTIVE_KEY)).toBe(false)
    expect(storage.has(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)).toBe(false)
  })

  it('reports active mode only when active marker and backup both exist', () => {
    expect(getCustomerTestModeState().active).toBe(false)
    storage.set(CUSTOMER_TEST_MODE_ACTIVE_KEY, true)
    expect(getCustomerTestModeState().active).toBe(false)
    storage.set(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY, { token: 'admin-token' })
    expect(getCustomerTestModeState().active).toBe(true)
  })

  it('clears only user-scoped caches', () => {
    storage.set('dogs_cache', [])
    storage.set('home_recipe_stats_dirty', true)
    storage.set('api_base_url', 'https://api.sevenkitchen.cloud/api/v1')

    clearCustomerTestUserCaches()

    expect(storage.has('dogs_cache')).toBe(false)
    expect(storage.has('home_recipe_stats_dirty')).toBe(false)
    expect(storage.get('api_base_url')).toBe(
      'https://api.sevenkitchen.cloud/api/v1',
    )
  })
})
