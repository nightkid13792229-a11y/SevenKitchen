<template>
  <view id="app">
    <!-- Uni-app root -->
  </view>
</template>

<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { getToken, performLogin } from './utils/api'

onLaunch(() => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('SevenKitchen Miniapp - App Launch')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  // Log configuration state
  try {
    const { getBaseUrl, getDefaultBaseUrl } = require('./utils/config')
    const { getToken } = require('./utils/api')
    const currentBaseUrl = getBaseUrl()
    const defaultBaseUrl = getDefaultBaseUrl()
    const token = getToken()
    
    console.log('📡 BASE_URL:', currentBaseUrl)
    if (currentBaseUrl !== defaultBaseUrl) {
      console.log('   (overridden from storage, default:', defaultBaseUrl + ')')
    }
    console.log('🔑 Token:', token ? 'Present ✓' : 'Not found (will auto-login)')
    
    // Detect build mode (dev vs build)
    // @ts-ignore - uni compilation mode
    const isDev = typeof __UNI_PLATFORM__ !== 'undefined' && process.env.NODE_ENV === 'development'
    console.log('🔧 Build Mode:', isDev ? 'Development (watch)' : 'Production')
  } catch (err) {
    console.warn('Failed to log startup config:', err)
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  // Auto-login on app launch only if no token exists
  // This prevents unnecessary login calls and handles errors gracefully
  ensureAuthenticated()
})

onShow(() => {
  console.log('App Show')
})

onHide(() => {
  console.log('App Hide')
})

/**
 * Ensure user is authenticated - only login if no token exists
 * Handles errors gracefully to prevent app crashes
 * Implements retry logic with graceful degradation
 */
let loginRetryCount = 0
const MAX_LOGIN_RETRIES = 1

function ensureAuthenticated() {
  const token = getToken()
  
  // If token exists, we're already authenticated
  if (token) {
    console.log('✓ Token found in storage, skipping login')
    return
  }
  
  // No token - attempt to login
  console.log('→ No token found, attempting auto-login (attempt ' + (loginRetryCount + 1) + '/' + (MAX_LOGIN_RETRIES + 1) + ')')
  const customerId = 'mvp-user-001' // MVP hardcoded customer ID
  
  performLogin(customerId).then(() => {
    console.log('✓ Auto-login successful')
    loginRetryCount = 0 // Reset retry count on success
    // Token is now stored via setToken() in performLogin()
  }).catch((err: any) => {
    loginRetryCount++
    
    // Log error but don't crash the app
    console.error('✗ Auto-login failed (attempt ' + loginRetryCount + '):', err)
    
    // Retry once if we haven't exceeded max retries
    if (loginRetryCount <= MAX_LOGIN_RETRIES) {
      console.log('→ Retrying auto-login in 2 seconds...')
      setTimeout(() => {
        ensureAuthenticated()
      }, 2000)
      return
    }
    
    // After max retries, gracefully degrade
    console.warn('⚠ Auto-login failed after retries - app will continue but API calls may fail')
    console.warn('   User can still navigate the app. Login will be retried on next API call (401 handling)')
    
    // Show a non-blocking toast if it's a network error (backend not reachable)
    const errorMessage = err?.message || String(err)
    if (errorMessage.includes('网络') || errorMessage.includes('连接') || errorMessage.includes('ERR_CONNECTION')) {
      uni.showToast({
        title: '无法连接到服务器，请检查网络设置',
        icon: 'none',
        duration: 3000
      })
    } else {
      // Other errors (auth, etc.)
      uni.showToast({
        title: '登录失败，部分功能可能不可用',
        icon: 'none',
        duration: 3000
      })
    }
    
    // Reset retry count after showing error (will retry on next app launch or 401)
    loginRetryCount = 0
  })
}
</script>

<style>
/* App全局样式 */
page {
  background-color: #f5f5f5;
  font-size: 14px;
}
</style>


