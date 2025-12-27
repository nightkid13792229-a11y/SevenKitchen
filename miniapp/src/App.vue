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

  // IMPORTANT: Start auto-login immediately WITHOUT delay
  // The delay was causing race conditions where pages would load
  // before authentication was ready, resulting in 401 errors.
  // By starting login immediately, we ensure pages can wait via waitForToken()
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
 * 
 * NOTE: This function is intentionally delayed on app launch to allow
 * page rendering and diagnostic features (like health check) to work
 * without interference. Login failures do not block UI.
 */
let loginRetryCount = 0
const MAX_LOGIN_RETRIES = 1
let isLoginInProgress = false // Prevent concurrent login attempts

function ensureAuthenticated() {
  // Prevent concurrent login attempts
  if (isLoginInProgress) {
    console.log('→ Auto-login already in progress, skipping duplicate call')
    return
  }

  const token = getToken()

  // If token exists, we're already authenticated
  if (token) {
    console.log('✓ Token found in storage, skipping login')
    markTokenReady() // Mark token ready for waiting pages
    return
  }

  // No token - attempt to login
  isLoginInProgress = true
  console.log('→ No token found, attempting auto-login (attempt ' + (loginRetryCount + 1) + '/' + (MAX_LOGIN_RETRIES + 1) + ')')
  const customerId = 'mvp-user-001' // MVP hardcoded customer ID

  performLogin(customerId).then(() => {
    console.log('✓ Auto-login successful')
    loginRetryCount = 0 // Reset retry count on success
    isLoginInProgress = false
    // Mark token ready for waiting pages
    markTokenReady()
    // Token is now stored via setToken() in performLogin()
  }).catch((err: any) => {
    loginRetryCount++
    isLoginInProgress = false
    
    // Log error but don't crash the app
    console.error('✗ Auto-login failed (attempt ' + loginRetryCount + '):', err)
    
    // Retry once if we haven't exceeded max retries
    // Use longer delay to avoid interfering with user interactions
    if (loginRetryCount <= MAX_LOGIN_RETRIES) {
      console.log('→ Retrying auto-login in 3 seconds...')
      setTimeout(() => {
        ensureAuthenticated()
      }, 3000) // Increased from 2s to 3s to reduce interference
      return
    }
    
    // After max retries, gracefully degrade
    // Do not show toast immediately - let user interact with app first
    // Toast will be shown only if user tries to use a feature that requires auth
    console.warn('⚠ Auto-login failed after retries - app will continue but API calls may fail')
    console.warn('   User can still navigate the app. Login will be retried on next API call (401 handling)')
    console.warn('   Diagnostic features (health check) are not affected by login status')
    
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


