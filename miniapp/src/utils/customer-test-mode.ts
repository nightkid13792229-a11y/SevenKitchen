export const CUSTOMER_TEST_MODE_ACTIVE_KEY = 'customer_test_mode_active'
export const CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY =
  'customer_test_mode_admin_session_backup'

type StoredUser = Record<string, any> | null

interface CustomerTestModePayload {
  token: string
  user: Record<string, any>
}

function readStorage<T = any>(key: string): T | undefined {
  try {
    return uni.getStorageSync(key)
  } catch (error) {
    return undefined
  }
}

function writeStorage(key: string, value: any) {
  try {
    uni.setStorageSync(key, value)
  } catch (error) {
    console.warn('[CustomerTestMode] failed to write storage:', key, error)
  }
}

function removeStorage(key: string) {
  try {
    uni.removeStorageSync(key)
  } catch (error) {
    console.warn('[CustomerTestMode] failed to remove storage:', key, error)
  }
}

function normalizeStoredUser(value: any): StoredUser {
  if (!value) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

export function clearCustomerTestUserCaches() {
  ;[
    'dogs_cache',
    'home_recipe_stats_dirty',
    'home_recipe_cover_original_only_urls_v2',
    'userLoginTrigger',
  ].forEach(removeStorage)
}

export function getCustomerTestModeState() {
  const activeMarker = readStorage<boolean>(CUSTOMER_TEST_MODE_ACTIVE_KEY)
  const backup = readStorage(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)
  return {
    active: activeMarker === true && Boolean(backup),
    backup: backup || null,
  }
}

export function applyCustomerTestModeSession(payload: CustomerTestModePayload) {
  const existingBackup = readStorage(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)
  if (!existingBackup) {
    writeStorage(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY, {
      token: readStorage('token') || '',
      user: normalizeStoredUser(readStorage('user')) || null,
      userInfo: normalizeStoredUser(readStorage('userInfo')) || null,
    })
  }

  clearCustomerTestUserCaches()
  writeStorage('token', payload.token)
  writeStorage('user', payload.user)
  writeStorage('userInfo', payload.user)
  writeStorage(CUSTOMER_TEST_MODE_ACTIVE_KEY, true)
  writeStorage('userLoginTrigger', Date.now())
}

export function restoreAdminSessionFromCustomerTestMode() {
  const backup = readStorage<{
    token?: string
    user?: StoredUser
    userInfo?: StoredUser
  }>(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)

  if (!backup?.token) {
    return false
  }

  clearCustomerTestUserCaches()
  writeStorage('token', backup.token)
  if (backup.user) writeStorage('user', backup.user)
  else removeStorage('user')
  if (backup.userInfo) writeStorage('userInfo', backup.userInfo)
  else removeStorage('userInfo')
  removeStorage(CUSTOMER_TEST_MODE_ACTIVE_KEY)
  removeStorage(CUSTOMER_TEST_MODE_ADMIN_BACKUP_KEY)
  writeStorage('userLoginTrigger', Date.now())
  return true
}
