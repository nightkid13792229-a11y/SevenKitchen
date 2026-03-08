// utils/config.ts
// 环境配置 - 根据构建类型自动选择 API 地址
// 可通过 Network Settings 页面手动覆盖（存储在 uni storage)

// ========================================
// 环境说明
// ========================================
// 开发环境（npm run dev:mp-weixin）:
//   - DevTools: localhost:3001（本地后端）
//   - 真机调试: 局域网IP（如 192.168.31.43:3001）
//
// 生产环境（npm run build:mp-weixin）:
//   - 始终使用 api.sevenkitchen.cloud

// ========================================
// 检测是否为生产构建
// ========================================
// 通过 Vite 环境变量来区分
// VITE_ENV 由 vite.config.ts 中的 define 配置注入
// - 'development': 开发环境
// - 'production': 生产环境

declare const VITE_ENV: string;
const IS_PRODUCTION_BUILD = VITE_ENV === 'production';

// ========================================
// API 地址配置
// ========================================
// 开发环境配置
const DEV_DEFAULT_BASE_URL = 'http://localhost:3001/api/v1';
const DEV_DEV_BASE_URL = 'http://localhost:3001/api/v1';
const DEV_LAN_BASE_URL = 'http://192.168.31.43:3001/api/v1';
const DEV_PROD_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1';

// 生产环境配置
const PROD_DEFAULT_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1';
const PROD_DEV_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1';
const PROD_LAN_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1';
const PROD_PROD_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1';

// 根据环境选择配置
const DEFAULT_BASE_URL = IS_PRODUCTION_BUILD ? PROD_DEFAULT_BASE_URL : DEV_DEFAULT_BASE_URL;
const DEV_BASE_URL = IS_PRODUCTION_BUILD ? PROD_DEV_BASE_URL : DEV_DEV_BASE_URL;
const LAN_BASE_URL = IS_PRODUCTION_BUILD ? PROD_LAN_BASE_URL : DEV_LAN_BASE_URL;
const PROD_BASE_URL = IS_PRODUCTION_BUILD ? PROD_PROD_BASE_URL : DEV_PROD_BASE_URL;

const STORAGE_KEY = 'api_base_url';

// ========================================
// 获取 API 地址逻辑
// ========================================
// 优先级：
// 1. 生产构建 → 强制使用生产域名
// 2. Storage 覆盖（手动配置）
// 3. 真机 → 局域网 IP
// 4. DevTools → localhost

/**
 * Detect if running on real device (Android/iOS)
 * Returns true if platform is 'android' or 'ios', false otherwise
 */
function isRealDevice(): boolean {
  try {
    const deviceInfo = uni.getDeviceInfo()
    const platform = deviceInfo?.platform?.toLowerCase() || ''
    console.log('[Config Debug] Platform:', deviceInfo?.platform, 'Lowercased:', platform)

    const result = platform === 'android' || platform === 'ios'
    console.log('[Config Debug] isRealDevice result:', result)

    if (platform === '' || platform === 'devtools') {
      if (platform === 'devtools') {
        console.log('[Config Debug] Detected DevTools')
        return false
      }
      console.log('[Config Debug] Platform empty, assuming real device')
      return true
    }
    return result
  } catch (err) {
    console.log('[Config Debug] getSystemInfo error:', err)
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
    const deviceInfo = uni.getDeviceInfo()
    const platform = deviceInfo?.platform?.toLowerCase() || ''
    const result = platform === 'devtools'
    console.log('[Config Debug] isDevTools result:', result, 'platform:', platform)
    return result
  } catch (err) {
    console.log('[Config Debug] isDevTools check failed, assuming not devtools')
    return false
  }
}

/**
 * Get the API base URL with automatic dev/prod switching
 * Priority order:
 * 1. Production build → use production domain (api.sevenkitchen.cloud)
 * 2. Real device (dev build) → use LAN IP (higher priority than storage)
 * 3. Storage override (manual config from Network Settings page)
 * 4. DevTools → use localhost
 * 5. Default
 */
export function getBaseUrl(): string {
  // 优先级1: 生产构建 → 强制使用生产域名（确保通过域名校验）
  if (IS_PRODUCTION_BUILD) {
    console.debug('[Config] Production build detected, using PROD_BASE_URL:', PROD_BASE_URL)
    return PROD_BASE_URL
  }

  // 优先级2: 真机调试（开发构建）→ 强制使用局域网IP
  // 注意：真机检测优先级高于 Storage，确保真机调试时自动连接本地开发服务器
  if (isRealDevice()) {
    console.debug('[Config] Detected real device, using LAN BASE_URL:', LAN_BASE_URL)
    return LAN_BASE_URL
  }

  // 优先级3: 手动配置的地址（Storage）
  try {
    const stored = uni.getStorageSync(STORAGE_KEY)
    if (stored && typeof stored === 'string' && stored.trim()) {
      console.debug('[Config] Using BASE_URL from storage:', stored.trim())
      return stored.trim()
    }
  } catch (err) {
    console.warn('Failed to read BASE_URL from storage:', err)
  }

  // 优先级4: 开发者工具 → 使用localhost
  if (isDevTools()) {
    console.debug('[Config] Detected DevTools, using dev BASE_URL:', DEV_BASE_URL)
    return DEV_BASE_URL
  }

  // 优先级5: 默认开发环境地址
  console.debug('[Config] Using default dev BASE_URL:', DEFAULT_BASE_URL)
  return DEFAULT_BASE_URL
}

/**
 * Check if current build is production
 */
export function isProductionBuild(): boolean {
  return IS_PRODUCTION_BUILD
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

  // If URL is not from localhost, return as-is
  if (!imageUrl.includes('localhost') && !imageUrl.includes('127.0.0.1')) {
    console.log('[Config] ✅ URL already HTTPS/external, using as-is:', imageUrl)
    return imageUrl
  }

  // Extract the current API server base (without /api/v1)
  const currentBaseUrl = getBaseUrl().replace(/\/api\/v\d+$/, '')

  try {
    const url = new URL(imageUrl)
    const normalized = `${currentBaseUrl}${url.pathname}`
    console.log('[Config] ✅ Normalized localhost URL:', imageUrl, '→', normalized)
    return normalized
  } catch (err) {
    console.warn('[Config] ⚠️ Failed to parse image URL, using fallback:', err)
    const path = imageUrl.replace(/^https?:\/\/[^\/]+/, '')
    return `${currentBaseUrl}${path}`
  }
}

/**
 * Test image loading with detailed diagnostic information
 */
export function testImageLoad(imageUrl: string): void {
  console.log('========== Image Load Diagnostic ==========')
  console.log('Original URL:', imageUrl)
  const normalized = normalizeImageUrl(imageUrl)
  console.log('Normalized URL:', normalized)
  console.log('Current BASE_URL:', getBaseUrl())
  console.log('==========================================')
}

// Export default for backward compatibility
export const BASE_URL = DEFAULT_BASE_URL
