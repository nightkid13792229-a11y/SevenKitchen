<template>
  <view class="container">
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
      <view v-if="dogs.length === 0" class="empty-state">
        <text>暂无狗狗档案</text>
      </view>
    </view>
    
    <view class="bottom-bar">
      <button class="btn-add" @tap="createDog">创建狗狗档案</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import { getCachedDogs, setCachedDogs, type DogDto } from '../../utils/dog-cache'

interface DogProfile {
  id: string
  name: string
  currentWeightKg?: number
}

const dogs = ref<DogProfile[]>([])

onMounted(() => {
  loadDogs()
})

// Reload when page is shown (e.g., navigating back from create page)
onShow(() => {
  loadDogs()
})

function loadDogs() {
  // Load from cache first (immediate display)
  const cachedDogs = getCachedDogs()
  if (cachedDogs.length > 0) {
    dogs.value = cachedDogs
    console.info(`[DogList] Loaded ${cachedDogs.length} dogs from cache`)
  }
  
  // Try to fetch from backend if endpoint exists
  // If it fails (404/501/etc), silently keep using cache
  uni.showLoading({ title: '加载中...' })
  
  request({
    url: '/dogs',
    method: 'GET'
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      // Backend returned a list - update cache and display
      const backendDogs = Array.isArray(res.data) ? res.data : []
      setCachedDogs(backendDogs)
      dogs.value = backendDogs
      console.info(`[DogList] Loaded ${backendDogs.length} dogs from backend`)
    }
  }).catch((err: any) => {
    // Backend endpoint doesn't exist or failed - keep using cache
    // This is expected for MVP when GET /dogs is not implemented
    const errMsg = err?.message || String(err)
    if (errMsg.includes('404') || errMsg.includes('501') || errMsg.includes('Not Found')) {
      console.info('[DogList] GET /dogs endpoint not available, using cache only')
    } else {
      console.warn('[DogList] Failed to fetch from backend, using cache:', errMsg)
    }
    // Keep existing cache-based dogs.value (already set above)
  }).finally(() => {
    uni.hideLoading()
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
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-bottom: 120rpx;
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
</style>


