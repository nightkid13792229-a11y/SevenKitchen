// utils/config.ts
// Base URL configuration - defaults to production API
// Can be overridden at runtime via Network Settings page (stored in uni storage)
// Automatically uses IP address in WeChat DevTools for stable development

const DEFAULT_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1'
const DEV_BASE_URL = 'http://localhost:3000/api/v1' // 本地开发服务器（开发者工具可用localhost，真机调试需改为局域网IP）
const STORAGE_KEY = 'api_base_url'

/**
 * Detect if running in WeChat Developer Tools
 * Returns true if platform is 'devtools', false otherwise
 */
function isDevTools(): boolean {
  try {
    const systemInfo = uni.getSystemInfoSync()
    const platform = systemInfo.platform?.toLowerCase() || ''
    console.log('[Config Debug] Platform:', systemInfo.platform, 'Lowercased:', platform)
    const result = platform === 'devtools'
    console.log('[Config Debug] isDevTools result:', result)
    return result
  } catch (err) {
    console.log('[Config Debug] getSystemInfoSync error:', err)
    // If getSystemInfoSync fails, assume not in devtools
    return false
  }
}

/**
 * Get the API base URL with automatic dev/prod switching
 * Priority order:
 * 1. Storage override (manual config from Network Settings page)
 * 2. DevTools detection → use IP address
 * 3. Production → use domain
 * 
 * Storage takes precedence to allow runtime configuration
 */
export function getBaseUrl(): string {
  // 开发环境：直接使用localhost，不读取Storage（避免缓存问题）
  if (isDevTools()) {
    console.debug('[Config] Detected DevTools, using dev BASE_URL:', DEV_BASE_URL)
    return DEV_BASE_URL
  }

  // 生产环境：允许使用Storage配置（用于网络设置页面）
  try {
    const stored = uni.getStorageSync(STORAGE_KEY)
    if (stored && typeof stored === 'string' && stored.trim()) {
      console.debug('[Config] Using BASE_URL from storage:', stored.trim())
      return stored.trim()
    }
  } catch (err) {
    console.warn('Failed to read BASE_URL from storage:', err)
  }

  // 默认生产环境地址
  console.debug('[Config] Using production BASE_URL:', DEFAULT_BASE_URL)
  return DEFAULT_BASE_URL
}

/**
 * Set the API base URL in storage (for runtime configuration)
 */
export function setBaseUrl(url: string): void {
  try {
    const trimmed = url.trim()
    if (trimmed) {
      uni.setStorageSync(STORAGE_KEY, trimmed)
      console.log('BASE_URL updated to:', trimmed)
    }
  } catch (err) {
    console.error('Failed to save BASE_URL to storage:', err)
  }
}

/**
 * Reset BASE_URL to default (clears storage)
 */
export function resetBaseUrl(): void {
  try {
    uni.removeStorageSync(STORAGE_KEY)
    console.log('BASE_URL reset to default:', DEFAULT_BASE_URL)
  } catch (err) {
    console.error('Failed to reset BASE_URL:', err)
  }
}

/**
 * Get the default BASE_URL (for display purposes)
 */
export function getDefaultBaseUrl(): string {
  return DEFAULT_BASE_URL
}

// Export default for backward compatibility (but prefer getBaseUrl())
export const BASE_URL = DEFAULT_BASE_URL

