<template>
  <view class="container">
    <view class="build-marker">BUILD: 2025-12-22-1501</view>
    
    <!-- Health Check Entry -->
    <view class="health-check-section">
      <view class="health-check-entry" @tap="performHealthCheck">
        <text class="health-check-label">系统状态/健康检查</text>
        <text class="health-check-icon">→</text>
      </view>
      <view v-if="healthCheckStatus" class="health-check-result" :class="healthCheckStatus.type">
        <text>{{ healthCheckStatus.message }}</text>
      </view>
    </view>
    
    <view class="dog-list">
      <view 
        v-for="dog in dogs" 
        :key="dog.id"
        class="dog-item"
        @tap="viewDog(dog.id)"
      >
        <view class="dog-name">{{ dog.name }}</view>
        <view class="dog-info">
          <text>ID: {{ dog.id }}</text>
          <text v-if="dog.currentWeightKg">体重: {{ dog.currentWeightKg }}kg</text>
        </view>
      </view>
      
      <!-- Empty State: No dogs and not loading -->
      <view v-if="dogs.length === 0 && !isLoading && !loadError" class="empty-state">
        <text class="empty-text">暂无狗狗档案</text>
        <button class="btn-empty-action" @tap="createDog">去创建</button>
      </view>
      
      <!-- Error State: Load failed -->
      <view v-if="loadError && dogs.length === 0" class="error-state">
        <text class="error-text">加载失败，可重试</text>
        <button class="btn-retry" @tap="loadDogs">重试</button>
      </view>
    </view>
    
    <view class="bottom-bar">
      <button class="btn-add" @tap="createDog">创建狗狗档案（BUILD:1501）</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import { getBaseUrl } from '../../utils/config'
import { getCachedDogs, setCachedDogs, type DogDto } from '../../utils/dog-cache'

interface DogProfile {
  id: string
  name: string
  currentWeightKg?: number
}

const dogs = ref<DogProfile[]>([])
const isLoading = ref(false)
const loadError = ref(false)

// Health check state
interface HealthCheckStatus {
  type: 'success' | 'error'
  message: string
}
const healthCheckStatus = ref<HealthCheckStatus | null>(null)

onMounted(() => {
  loadDogs()
})

// Reload when page is shown (e.g., navigating back from create page)
onShow(() => {
  loadDogs()
})

function loadDogs() {
  isLoading.value = true
  loadError.value = false
  
  // Load from cache first (immediate display)
  const cachedDogs = getCachedDogs()
  if (cachedDogs.length > 0) {
    dogs.value = cachedDogs
    console.info(`[DogList] Loaded ${cachedDogs.length} dogs from cache`)
  }
  
  // Try to fetch from backend
  request({
    url: '/dogs',
    method: 'GET'
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      // Backend returned a list - update cache and display
      const backendDogs = Array.isArray(res.data) ? res.data : []
      setCachedDogs(backendDogs)
      dogs.value = backendDogs
      loadError.value = false
      console.info(`[DogList] Loaded ${backendDogs.length} dogs from backend`)
    } else {
      // Invalid response format - keep cache if available
      if (dogs.value.length === 0) {
        loadError.value = true
      }
    }
  }).catch((err: any) => {
    // Network or API error
    const errMsg = err?.message || String(err) || ''
    console.warn('[DogList] Failed to fetch from backend:', errMsg)
    
    // If no cache data, show error state
    if (dogs.value.length === 0) {
      loadError.value = true
    }
    // If cache exists, keep showing cache (silent failure)
  }).finally(() => {
    isLoading.value = false
  })
}

function viewDog(dogId: string) {
  // For MVP, just navigate to create page with edit mode
  // In production, would have a detail/edit page
  uni.navigateTo({
    url: `/pages/dog-create/index?dogId=${dogId}`
  })
}

function createDog() {
  uni.navigateTo({
    url: '/pages/dog-create/index'
  })
}

/**
 * Perform health check by calling GET /api/v1/health
 * Non-blocking diagnostic function - does not affect business flows
 * Uses uni.request directly to avoid auth/retry wrapper logic
 */
function performHealthCheck() {
  // Clear previous status
  healthCheckStatus.value = null
  
  const baseUrl = getBaseUrl()
  const healthUrl = `${baseUrl}/health`
  
  // Create timeout promise (5 seconds)
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('timeout'))
    }, 5000)
  })
  
  // Create health check request using uni.request directly
  // Health endpoint returns plain { status: 'ok', timestamp: '...' } without wrapper
  const healthCheckPromise = new Promise<{ type: 'success' | 'error'; message: string }>((resolve, reject) => {
    uni.request({
      url: healthUrl,
      method: 'GET',
      header: {
        'Content-Type': 'application/json'
      },
      timeout: 5000,
      success: (res: any) => {
        // Health endpoint returns { status: 'ok', timestamp: '...' } directly
        const data = res.data
        if (res.statusCode === 200 && data && data.status === 'ok' && data.timestamp) {
          // Format timestamp for display
          const date = new Date(data.timestamp)
          const timeStr = date.toLocaleString('zh-CN', { 
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
          resolve({
            type: 'success',
            message: `API OK - ${timeStr}`
          })
        } else {
          resolve({
            type: 'error',
            message: 'API Unreachable - Invalid response'
          })
        }
      },
      fail: (err: any) => {
        // Determine error type for user-friendly message
        const errMsg = err?.errMsg || String(err) || ''
        let errorHint = 'network error'
        
        if (errMsg.includes('timeout') || errMsg.includes('超时')) {
          errorHint = 'timeout'
        } else if (errMsg.includes('CONNECTION') || errMsg.includes('连接')) {
          errorHint = 'connection failed'
        } else if (errMsg.includes('fail')) {
          errorHint = 'request failed'
        }
        
        reject(new Error(errorHint))
      }
    })
  })
  
  // Race between health check and timeout
  Promise.race([healthCheckPromise, timeoutPromise])
    .then((result) => {
      healthCheckStatus.value = result
    })
    .catch((err) => {
      // Timeout or other error
      const errMsg = err?.message || String(err) || ''
      if (errMsg.includes('timeout')) {
        healthCheckStatus.value = {
          type: 'error',
          message: 'API Unreachable - timeout'
        }
      } else {
        healthCheckStatus.value = {
          type: 'error',
          message: `API Unreachable - ${errMsg}`
        }
      }
    })
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-top: 60rpx;
  padding-bottom: 120rpx;
}

.build-marker {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background-color: #f0f0f0;
  color: #666;
  font-size: 20rpx;
  text-align: center;
  padding: 8rpx 0;
  z-index: 9999;
  border-bottom: 1px solid #e0e0e0;
}

.dog-list {
  padding: 20rpx 0;
}

.dog-item {
  background-color: #fff;
  padding: 30rpx;
  margin-bottom: 20rpx;
  border-radius: 8rpx;
}

.dog-name {
  font-size: 32rpx;
  font-weight: bold;
  margin-bottom: 10rpx;
}

.dog-info {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: #999;
}

.empty-state {
  text-align: center;
  padding: 100rpx 0;
  color: #999;
}

.empty-text {
  display: block;
  margin-bottom: 30rpx;
  font-size: 28rpx;
}

.btn-empty-action {
  width: 200rpx;
  height: 70rpx;
  line-height: 70rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 28rpx;
}

.error-state {
  text-align: center;
  padding: 100rpx 0;
}

.error-text {
  display: block;
  margin-bottom: 30rpx;
  font-size: 28rpx;
  color: #fa5151;
}

.btn-retry {
  width: 200rpx;
  height: 70rpx;
  line-height: 70rpx;
  background-color: #fa5151;
  color: #fff;
  border-radius: 8rpx;
  font-size: 28rpx;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 20rpx;
  border-top: 1px solid #eee;
}

.btn-add {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
}

/* Health Check Styles - Minimal, low-emphasis */
.health-check-section {
  margin: 20rpx 0;
  padding: 0;
}

.health-check-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #f8f8f8;
  padding: 20rpx 30rpx;
  border-radius: 8rpx;
  margin-bottom: 10rpx;
  cursor: pointer;
}

.health-check-label {
  font-size: 28rpx;
  color: #666;
}

.health-check-icon {
  font-size: 28rpx;
  color: #999;
}

.health-check-result {
  padding: 10rpx 30rpx;
  font-size: 24rpx;
  border-radius: 4rpx;
}

.health-check-result.success {
  color: #07c160;
  background-color: #f0f9f4;
}

.health-check-result.error {
  color: #fa5151;
  background-color: #fef0f0;
}
</style>


