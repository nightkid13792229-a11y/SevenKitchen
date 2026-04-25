// utils/config.ts
// 环境配置 - 根据构建类型自动选择 API 地址
// 可通过 Network Settings 页面手动覆盖（存储在 uni storage)

// ========================================
// 环境说明
// ========================================
// 开发环境（npm run dev:mp-weixin）:
//   - DevTools: 127.0.0.1:3011（本地后端）
//   - 真机调试: 局域网IP（如 192.168.31.43:3011）
//
// 生产环境（npm run build:mp-weixin）:
//   - 始终使用 api.sevenkitchen.cloud

// ========================================
// 检测是否为生产构建
// ========================================
// 使用 import.meta.env 来区分环境
// - import.meta.env.DEV: 开发环境
// - import.meta.env.PROD: 生产环境

import { DEVTOOLS_BASE_URL, LAN_DEBUG_BASE_URL, migrateLegacyDevBaseUrl } from './runtime-base-url'

const IS_PRODUCTION_BUILD = import.meta.env.PROD;

// ========================================
// API 地址配置
// ========================================
// 开发环境配置
const DEV_DEFAULT_BASE_URL = DEVTOOLS_BASE_URL;
const DEV_DEV_BASE_URL = DEVTOOLS_BASE_URL;
const DEV_LAN_BASE_URL = LAN_DEBUG_BASE_URL;
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
let cachedDevicePlatform: string | null = null

function getCachedDevicePlatform(): string {
  if (cachedDevicePlatform !== null) {
    return cachedDevicePlatform
  }

  try {
    cachedDevicePlatform = uni.getDeviceInfo()?.platform?.toLowerCase() || ''
  } catch (err) {
    cachedDevicePlatform = ''
  }

  return cachedDevicePlatform
}

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
    const platform = getCachedDevicePlatform()
    if (platform === 'devtools') {
      return false
    }
    if (platform === '') {
      return true
    }
    return platform === 'android' || platform === 'ios'
  } catch (err) {
    return true
  }
}

/**
 * Detect if running in WeChat Developer Tools
 * Returns true if platform is 'devtools', false otherwise
 */
function isDevTools(): boolean {
  try {
    return getCachedDevicePlatform() === 'devtools'
  } catch (err) {
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
    return PROD_BASE_URL
  }

  // 优先级2: 真机调试（开发构建）→ 强制使用局域网IP
  // 注意：真机检测优先级高于 Storage，确保真机调试时自动连接本地开发服务器
  if (isRealDevice()) {
    return LAN_BASE_URL
  }

  // 优先级3: 手动配置的地址（Storage）
  try {
    const stored = uni.getStorageSync(STORAGE_KEY)
    const migratedStored = migrateLegacyDevBaseUrl(stored)
    if (migratedStored) {
      if (migratedStored !== stored) {
        uni.setStorageSync(STORAGE_KEY, migratedStored)
      }
      return migratedStored
    }
  } catch (err) {
    console.warn('Failed to read BASE_URL from storage:', err)
  }

  // 优先级4: 开发者工具 → 使用localhost
  if (isDevTools()) {
    return DEV_BASE_URL
  }

  // 优先级5: 默认开发环境地址
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
    const normalized = migrateLegacyDevBaseUrl(trimmed)
    if (normalized) {
      uni.setStorageSync(STORAGE_KEY, normalized)
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
    return ''
  }

  // Fix historical data: replace HTTP CDN URL with HTTPS
  if (imageUrl.includes('http://img.sevenkitchen.cloud')) {
    return imageUrl.replace('http://img.sevenkitchen.cloud', 'https://img.sevenkitchen.cloud')
  }

  // If URL is not from localhost, return as-is
  if (!imageUrl.includes('localhost') && !imageUrl.includes('127.0.0.1')) {
    return imageUrl
  }

  // Extract the current API server base (without /api/v1)
  const currentBaseUrl = getBaseUrl().replace(/\/api\/v\d+$/, '')

  try {
    const url = new URL(imageUrl)
    return `${currentBaseUrl}${url.pathname}`
  } catch (err) {
    console.warn('[Config] ⚠️ Failed to parse image URL, using fallback:', err)
    const path = imageUrl.replace(/^https?:\/\/[^\/]+/, '')
    return `${currentBaseUrl}${path}`
  }
}

const RECIPE_COVER_THUMBNAIL_TRANSFORM = 'imageMogr2/thumbnail/750x/format/jpg'
const PRODUCT_IMAGE_THUMBNAIL_TRANSFORM = 'imageMogr2/thumbnail/360x/format/jpg'
const KNOWN_STALE_RECIPE_COVER_URLS = new Set([
  'https://img.sevenkitchen.cloud/recipes/covers/1774240957971-2792c7e2.png',
])

export function isKnownStaleRecipeCoverUrl(imageUrl: string | undefined | null): boolean {
  const normalized = normalizeImageUrl(imageUrl)
  return !!(normalized && KNOWN_STALE_RECIPE_COVER_URLS.has(normalized))
}

export function appendRecipeCoverThumbnailParams(imageUrl: string): string {
  if (!imageUrl) {
    return imageUrl
  }

  if (!imageUrl.includes('img.sevenkitchen.cloud/recipes/covers/')) {
    return imageUrl
  }

  if (imageUrl.includes('imageMogr2/')) {
    return imageUrl
  }

  const separator = imageUrl.includes('?') ? '&' : '?'
  return `${imageUrl}${separator}${RECIPE_COVER_THUMBNAIL_TRANSFORM}`
}

export function getOptimizedRecipeCoverUrl(imageUrl: string | undefined | null): string {
  return getRecipeCoverImageUrl(imageUrl)
}

export function getOptimizedProductImageUrl(imageUrl: string | undefined | null): string {
  const normalized = normalizeImageUrl(imageUrl)
  if (!normalized) {
    return normalized
  }

  if (!normalized.includes('img.sevenkitchen.cloud/')) {
    return normalized
  }

  if (normalized.includes('imageMogr2/')) {
    return normalized
  }

  const separator = normalized.includes('?') ? '&' : '?'
  return `${normalized}${separator}${PRODUCT_IMAGE_THUMBNAIL_TRANSFORM}`
}

export function getRecipeCoverImageUrl(
  imageUrl: string | undefined | null,
  options: { skipOptimization?: boolean } = {},
): string {
  const normalized = normalizeImageUrl(imageUrl)
  if (!normalized) {
    return normalized
  }

  if (options.skipOptimization || KNOWN_STALE_RECIPE_COVER_URLS.has(normalized)) {
    return normalized
  }

  return appendRecipeCoverThumbnailParams(normalized)
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

// ========================================
// 微信分享配置
// ========================================
// 图片存储在腾讯云COS，通过CDN加速访问

export const CURRENT_SHARE_CONFIG = {
  defaultImageUrl: 'https://img.sevenkitchen.cloud/share/share-default.png',
  homeImageUrl: 'https://img.sevenkitchen.cloud/share/share-home.png',
  recipeImageUrl: 'https://img.sevenkitchen.cloud/share/share-recipe.png'
}

// Export default for backward compatibility
export const BASE_URL = DEFAULT_BASE_URL
