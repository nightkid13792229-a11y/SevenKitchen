<template>
  <view class="container">
    <!-- 主人信息按钮 -->
    <view class="owner-info-bar">
      <button class="btn-owner-info" @tap="goToOwnerInfo">
        <text class="owner-icon">👤</text>
        <text class="owner-text">主人信息</text>
      </button>
    </view>

    <view class="dog-list">
      <view
        v-for="dog in dogs"
        :key="dog.id"
        class="dog-card"
        @tap="viewDog(dog.id)"
      >
        <view class="dog-main-info">
          <view class="name-row">
            <text class="dog-name">{{ dog.name }}</text>
            <text class="gender-icon" :class="dog.gender === 'MALE' ? 'male' : 'female'">
              {{ dog.gender === 'MALE' ? '♂' : '♀' }}
            </text>
          </view>
          <text class="dog-breed">{{ dog.breedName || '未知品种' }}</text>
        </view>
        <view class="dog-stats">
          <text class="stat-text">{{ dog.currentWeightKg }}kg · {{ calculateAgeText(dog.birthday) }}</text>
          <text class="arrow">›</text>
        </view>
      </view>
      
      <!-- Empty State: No dogs and not loading -->
      <view v-if="dogs.length === 0 && !isLoading && !loadError" class="empty-state">
        <text class="empty-text">暂无爱犬信息</text>
        <button class="btn-empty-action" @tap="createDog">去创建</button>
      </view>
      
      <!-- Error State: Load failed -->
      <view v-if="loadError && dogs.length === 0" class="error-state">
        <text class="error-text">加载失败，可重试</text>
        <button class="btn-retry" @tap="loadDogs">重试</button>
      </view>
    </view>
    
    <view class="bottom-bar">
      <button class="btn-add" @tap="createDog">＋ 添加爱犬</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request, waitForToken } from '../../utils/api'
import { getCachedDogs, setCachedDogs, type DogDto } from '../../utils/dog-cache'

interface DogProfile {
  id: string
  name: string
  gender?: string
  breedName?: string
  birthday: string
  currentWeightKg?: number
}

const dogs = ref<DogProfile[]>([])
const isLoading = ref(false)
const loadError = ref(false)

onMounted(() => {
  loadDogs()
})

// Reload when page is shown (e.g., navigating back from create page)
onShow(async () => {
  // Wait for token to be ready before making API requests
  // This prevents 401 errors from race conditions with auto-login
  await waitForToken()
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

function goToOwnerInfo() {
  // 跳转到主人信息页面（待创建）
  uni.navigateTo({
    url: '/pages/owner-info/index'
  })
}

// 计算年龄文本
function calculateAgeText(birthday: string) {
  const birth = new Date(birthday)
  const now = new Date()
  const months = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30))
  if (months < 12) {
    return `${months}个月`
  }
  const years = Math.floor(months / 12)
  return `${years}岁`
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-bottom: 120rpx;
}

/* 主人信息按钮栏 */
.owner-info-bar {
  margin-bottom: 20rpx;
}

.btn-owner-info {
  width: 100%;
  height: 88rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 12rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.3);
}

.btn-owner-info::after {
  border: none;
}

.owner-icon {
  font-size: 36rpx;
}

.owner-text {
  font-size: 32rpx;
}

.dog-list {
  padding: 20rpx 0;
}

/* 狗狗卡片样式 */
.dog-card {
  background-color: #fff;
  padding: 30rpx;
  margin-bottom: 20rpx;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s ease;
}

.dog-card:active {
  transform: scale(0.98);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1);
}

.dog-main-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.dog-name {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.gender-icon {
  font-size: 28rpx;
  font-weight: bold;
}

.gender-icon.male {
  color: #1890ff;
}

.gender-icon.female {
  color: #ff69b4;
}

.dog-breed {
  font-size: 26rpx;
  color: #999;
}

.dog-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8rpx;
}

.stat-text {
  font-size: 26rpx;
  color: #666;
}

.arrow {
  font-size: 32rpx;
  color: #ccc;
  font-weight: bold;
}

/* 空状态样式 */
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

/* 错误状态样式 */
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

/* 底部按钮栏 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 20rpx;
  border-top: 1px solid #eee;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.btn-add {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 12rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
}

.btn-add::after {
  border: none;
}
</style>


