<template>
  <view id="app">
    <!-- Uni-app root -->
  </view>
</template>

<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { getToken, performLogin, markTokenReady } from './utils/api'

onLaunch(() => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('SevenKitchen Miniapp - App Launch')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Log configuration state
  try {
    // Debug: Check platform using new API
    // @ts-ignore - getAppBaseInfo may not exist in all platforms
    const appBaseInfo = uni.getAppBaseInfo?.() || uni.getSystemInfoSync?.()
    const platform = (appBaseInfo?.platform || '').toLowerCase()
    console.log('[App Debug] Platform:', appBaseInfo?.platform)
    console.log('[App Debug] Platform lowercased:', platform)

    // Auto-fix: If in devtools and storage has old IP, clear it
    if (platform === 'devtools') {
      const storedBaseUrl = uni.getStorageSync('api_base_url')
      if (storedBaseUrl && storedBaseUrl.includes('192.168.')) {
        console.warn('⚠️  Detected old IP in storage, clearing...')
        uni.removeStorageSync('api_base_url')
        console.log('✓ Storage cleared. Please restart to use correct BASE_URL')
      }
    }

    const { getBaseUrl, getDefaultBaseUrl } = require('./utils/config')
    const { getToken } = require('./utils/api')
    const currentBaseUrl = getBaseUrl()
    const defaultBaseUrl = getDefaultBaseUrl()
    const token = getToken()

    console.log('📡 BASE_URL:', currentBaseUrl)
    if (currentBaseUrl !== defaultBaseUrl) {
      console.log('   (overridden from storage, default:', defaultBaseUrl + ')')
    }
    console.log('🔑 Token:', token ? 'Present ✓' : 'Not found (guest mode)')

    // Detect build mode (dev vs build)
    // @ts-ignore - uni compilation mode
    const isDev = typeof __UNI_PLATFORM__ !== 'undefined' && process.env.NODE_ENV === 'development'
    console.log('🔧 Build Mode:', isDev ? 'Development (watch)' : 'Production')
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


