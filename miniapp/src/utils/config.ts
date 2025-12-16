// utils/config.ts
// Base URL configuration - defaults to 127.0.0.1 for WeChat DevTools compatibility
// Can be overridden at runtime via Network Settings page (stored in uni storage)

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000/api/v1'
const STORAGE_KEY = 'api_base_url'

/**
 * Get the API base URL from storage, or return the default
 * Storage takes precedence to allow runtime configuration
 */
export function getBaseUrl(): string {
  try {
    const stored = uni.getStorageSync(STORAGE_KEY)
    if (stored && typeof stored === 'string' && stored.trim()) {
      return stored.trim()
    }
  } catch (err) {
    console.warn('Failed to read BASE_URL from storage:', err)
  }
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

