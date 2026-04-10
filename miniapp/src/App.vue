<template>
  <view id="app">
    <!-- Uni-app root -->
  </view>
</template>

<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { getToken, markTokenReady } from './utils/api'
import { getBaseUrl, getDefaultBaseUrl, setBaseUrl } from './utils/config'
import { migrateLegacyDevBaseUrl } from './utils/runtime-base-url'

onLaunch(() => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('SevenKitchen Miniapp - App Launch')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Log configuration state
  try {
    // Debug: Check platform using getDeviceInfo (替代已废弃的 getSystemInfoSync)
    const deviceInfo = uni.getDeviceInfo()
    const platform = deviceInfo?.platform || 'unknown'
    const platformLower = platform.toLowerCase()
    console.log('[App Debug] Platform:', platform)
    console.log('[App Debug] Platform lowercased:', platformLower)

    // Auto-fix: Migrate legacy local dev ports in storage
    const storedBaseUrl = uni.getStorageSync('api_base_url')
    if (storedBaseUrl) {
      const migratedBaseUrl = migrateLegacyDevBaseUrl(storedBaseUrl)
      if (migratedBaseUrl && migratedBaseUrl !== storedBaseUrl) {
        console.warn('⚠️  Detected legacy dev BASE_URL in storage, migrating...')
        setBaseUrl(migratedBaseUrl)
        console.log('✓ Legacy configuration migrated to:', migratedBaseUrl)
      }
    }

    // Auto-configure for real device debugging: use production URL
    // 如果是真机调试模式，且Storage中没有配置baseUrl，自动设置生产环境URL
    const isRealDevice = platformLower === 'android' || platformLower === 'ios'
    if (isRealDevice && !uni.getStorageSync('api_base_url')) {
      const prodUrl = 'https://api.sevenkitchen.cloud/api/v1'
      console.log('🔧 Real device detected, auto-setting production URL:', prodUrl)
      setBaseUrl(prodUrl)
    }

    const currentBaseUrl = getBaseUrl()
    const defaultBaseUrl = getDefaultBaseUrl()
    const token = getToken()

    console.log('📡 BASE_URL:', currentBaseUrl)
    if (currentBaseUrl !== defaultBaseUrl) {
      console.log('   (overridden from storage, default:', defaultBaseUrl + ')')
    }
    console.log('🔑 Token:', token ? 'Present ✓' : 'Not found (guest mode)')

    // Detect build mode (dev vs build)
    // Check if running in devtools
    const isDevtools = platformLower === 'devtools'
    // @ts-ignore - uni compilation mode
    const isDev = isDevtools || (typeof process !== 'undefined' && process.env.NODE_ENV === 'development')
    console.log('🔧 Build Mode:', isDev ? 'Development (watch)' : 'Production')
    console.log('🔧 Platform:', platform)
  } catch (err) {
    console.warn('Failed to log startup config:', err)
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 游客模式：不再自动登录
  // 只检查是否有token，不执行登录逻辑
  const token = getToken()
  if (token) {
    console.log('✓ 已登录用户，标记token ready')
    markTokenReady()
  } else {
    console.log('→ 游客模式，等待用户主动登录')
    // 即使没有token也标记为ready，让页面可以正常加载
    markTokenReady()
  }
})

onShow(() => {
  console.log('App Show')
})

onHide(() => {
  console.log('App Hide')
})
</script>

<style>
/* App全局样式 */
page {
  background-color: #f5f5f5;
  font-size: 14px;
}
</style>

