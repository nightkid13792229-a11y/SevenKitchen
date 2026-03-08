// utils/config.ts
// 环境配置 - 根据构建类型自动选择 API 地址
// 可通过 Network Settings 页面手动覆盖（存储在 uni storage）

// ========================================
// 环境说明
// ========================================
// 开发环境（npm run dev:mp-weixin）:
//   - DevTools: localhost:3001（本地后端）
//   - 真机调试: 局域网IP（如 192.168.31.43:3001）
//
// 生产环境（npm run build:mp-weixin）:
//   - 始终使用 api.sevenkitchen.cloud

// 使用条件编译来区分开发和生产环境
// #ifdef APP-PLUS||MP-WEIXIN-DEV
// 开发环境：默认使用本地开发服务器
const DEFAULT_BASE_URL = 'http://localhost:3001/api/v1'
const DEV_BASE_URL = 'http://localhost:3001/api/v1'     // DevTools 使用
const LAN_BASE_URL = 'http://192.168.31.43:3001/api/v1' // 真机调试使用（可修改为你的局域网IP）
const PROD_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1'
// #endif

// #ifdef MP-WEIXIN
// 生产环境：强制使用生产域名
const DEFAULT_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1'
const DEV_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1'
const LAN_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1'
const PROD_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1'
// #endif

const STORAGE_KEY = 'api_base_url'

// 检测是否为生产构建
// 在生产构建中，所有 URL 都指向 api.sevenkitchen.cloud
// #ifdef MP-WEIXIN
const IS_PRODUCTION_BUILD = true
// #endif

// #ifndef MP-WEIXIN
const IS_PRODUCTION_BUILD = false
// #endif

/**
 * Detect if running on real device (Android/iOS)
 * Returns true if platform is 'android' or 'ios', false otherwise
 */
function isRealDevice(): boolean {
  try {
    // 使用 getDeviceInfo 获取设备信息（替代已废弃的 getSystemInfoSync）
    const deviceInfo = uni.getDeviceInfo()
    const platform = deviceInfo?.platform?.toLowerCase() || ''
    console.log('[Config Debug] Platform:', deviceInfo?.platform, 'Lowercased:', platform)

    // 检测是否为真机：android 或 ios
    const result = platform === 'android' || platform === 'ios'
    console.log('[Config Debug] isRealDevice result:', result)

    // 保守策略：如果无法明确识别为开发者工具，假设是真机
    if (platform === '' || platform === 'devtools') {
      if (platform === 'devtools') {
        console.log('[Config Debug] Detected DevTools')
        return false
      }
      // platform 为空，无法确定，保守策略：假设是真机
      console.log('[Config Debug] Platform empty, assuming real device')
      return true
    }

    return result
  } catch (err) {
    console.log('[Config Debug] getSystemInfo error:', err)
    // 如果检测失败，保守策略：假设是真机（使用局域网地址更安全）
    console.log('[Config Debug] Platform detection failed, assuming real device')
    return true
  }
}

/**
 * Detect if running in WeChat Developer Tools
 * Returns true if platform is 'devtools', false otherwise
 */
function isDevTools(): boolean {
  try {
    // 使用 getDeviceInfo 获取设备信息（替代已废弃的 getSystemInfoSync）
    const deviceInfo = uni.getDeviceInfo()
    const platform = deviceInfo?.platform?.toLowerCase() || ''
    const result = platform === 'devtools'
    console.log('[Config Debug] isDevTools result:', result, 'platform:', platform)
    return result
  } catch (err) {
    // If getDeviceInfo fails, assume not in devtools
    console.log('[Config Debug] isDevTools check failed, assuming not devtools')
    return false
  }
}

/**
 * Get the API base URL with automatic dev/prod switching
 * Priority order:
 * 1. Production build → use production domain (api.sevenkitchen.cloud)
 * 2. Storage override (manual config from Network Settings page)
 * 3. Real device → use LAN IP
 * 4. DevTools → use localhost
 *
 * Production build always uses PROD_BASE_URL to ensure domain whitelist compliance
 */
export function getBaseUrl(): string {
  // 优先级0：生产构建 → 强制使用生产域名（确保通过域名校验）
  if (IS_PRODUCTION_BUILD) {
    console.debug('[Config] Production build detected, using PROD_BASE_URL:', PROD_BASE_URL)
    return PROD_BASE_URL
  }

  // 优先级1：手动配置的地址（Storage）- 支持真机调试时使用生产环境
  try {
    const stored = uni.getStorageSync(STORAGE_KEY)
    if (stored && typeof stored === 'string' && stored.trim()) {
      console.debug('[Config] Using BASE_URL from storage:', stored.trim())
      return stored.trim()
    }
  } catch (err) {
    console.warn('Failed to read BASE_URL from storage:', err)
  }

  // 优先级2：真机调试 → 强制使用局域网IP（无Storage配置时）
  if (isRealDevice()) {
    console.debug('[Config] Detected real device, using LAN BASE_URL:', LAN_BASE_URL)
    return LAN_BASE_URL
  }

  // 优先级3：开发者工具 → 使用localhost
  if (isDevTools()) {
    console.debug('[Config] Detected DevTools, using dev BASE_URL:', DEV_BASE_URL)
    return DEV_BASE_URL
  }

  // 默认开发环境地址
  console.debug('[Config] Using default dev BASE_URL:', DEFAULT_BASE_URL)
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
 * Use this to switch back to development environment
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

/**
 * Normalize image URL to work in real device debugging mode
 * Replaces HTTP CDN URL with HTTPS CDN URL (for historical data)
 *
 * @param imageUrl - Original image URL from backend
 * @returns Normalized URL with correct protocol and host
 *
 * @example
 * normalizeImageUrl('http://img.sevenkitchen.cloud/recipes/cover.jpg')
 * // Returns: 'https://img.sevenkitchen.cloud/recipes/cover.jpg'
 */
export function normalizeImageUrl(imageUrl: string | undefined | null): string {
  if (!imageUrl) {
    console.warn('[Config] normalizeImageUrl: empty URL')
    return ''
  }

  console.log('[Config] 🔍 normalizeImageUrl called:', imageUrl)

  // Fix historical data: replace HTTP CDN URL with HTTPS
  if (imageUrl.includes('http://img.sevenkitchen.cloud')) {
    const normalized = imageUrl.replace('http://img.sevenkitchen.cloud', 'https://img.sevenkitchen.cloud')
    console.log('[Config] ✅ Normalized HTTP CDN URL to HTTPS:', imageUrl, '→', normalized)
    return normalized
  }

  // If URL is not from localhost, return as-is (already HTTPS or external)
  if (!imageUrl.includes('localhost') && !imageUrl.includes('127.0.0.1')) {
    console.log('[Config] ✅ URL already HTTPS/external, using as-is:', imageUrl)
    return imageUrl
  }

  // Extract the current API server base (without /api/v1)
  const currentBaseUrl = getBaseUrl().replace(/\/api\/v\d+$/, '')

  try {
    // Parse the URL to extract path
    const url = new URL(imageUrl)

    // Replace host with current API server
    const normalized = `${currentBaseUrl}${url.pathname}`
    console.log('[Config] ✅ Normalized localhost URL:', imageUrl, '→', normalized)
    return normalized
  } catch (err) {
    // If URL parsing fails, try simple string replacement
    console.warn('[Config] ⚠️ Failed to parse image URL, using fallback:', err)
    const path = imageUrl.replace(/^https?:\/\/[^\/]+/, '')
    return `${currentBaseUrl}${path}`
  }
}

/**
 * Test image loading with detailed diagnostic information
 * @param imageUrl - Image URL to test
 */
export function testImageLoad(imageUrl: string): void {
  console.log('========== Image Load Diagnostic ==========')
  console.log('Original URL:', imageUrl)

  const normalized = normalizeImageUrl(imageUrl)
  console.log('Normalized URL:', normalized)

  console.log('Current BASE_URL:', getBaseUrl())
  console.log('==========================================')
}

// Export default for backward compatibility (but prefer getBaseUrl())
export const BASE_URL = DEFAULT_BASE_URL

