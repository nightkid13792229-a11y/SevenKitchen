<template>
  <view class="container">
    <view class="dog-list">
      <view
        v-for="dog in dogs"
        :key="dog.id"
        class="dog-card"
        @tap="viewDog(dog.id)"
      >
        <view class="dog-card-content">
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
        <view class="dog-card-footer">
          <text class="card-tip">点击卡片可编辑档案</text>
          <button
            class="btn-delete"
            :disabled="deletingDogId === dog.id"
            :loading="deletingDogId === dog.id"
            @tap.stop="confirmDeleteDog(dog)"
          >
            {{ deletingDogId === dog.id ? '删除中' : '删除' }}
          </button>
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
import { getCachedDogs, removeDogFromCache, setCachedDogs } from '../../utils/dog-cache'
import { resolveDogProfileEntryRoute } from '../../utils/dog-profile-form'

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
const deletingDogId = ref('')

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
  uni.navigateTo({
    url: resolveDogProfileEntryRoute(dogId)
  })
}

function createDog() {
  uni.navigateTo({
    url: resolveDogProfileEntryRoute()
  })
}

function confirmDeleteDog(dog: DogProfile) {
  if (deletingDogId.value) {
    return
  }

  uni.showModal({
    title: '删除爱犬档案',
    content: `确定要删除“${dog.name}”的档案吗？删除后不可恢复。`,
    confirmText: '删除',
    confirmColor: '#fa5151',
    success: (res) => {
      if (res.confirm) {
        void deleteDogProfile(dog)
      }
    }
  })
}

async function deleteDogProfile(dog: DogProfile) {
  if (deletingDogId.value === dog.id) {
    return
  }

  deletingDogId.value = dog.id
  uni.showLoading({ title: '删除中...' })

  try {
    await request({
      url: `/dogs/${dog.id}`,
      method: 'DELETE'
    })

    dogs.value = dogs.value.filter(item => item.id !== dog.id)
    removeDogFromCache(dog.id)
    loadError.value = false

    uni.showToast({
      title: '删除成功',
      icon: 'success'
    })
  } catch (err: any) {
    console.error('[DogList] Failed to delete dog:', err)
    uni.showToast({
      title: err?.message || '删除失败',
      icon: 'none'
    })
  } finally {
    deletingDogId.value = ''
    uni.hideLoading()
  }
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
  flex-direction: column;
  transition: all 0.3s ease;
}

.dog-card:active {
  transform: scale(0.98);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1);
}

.dog-card-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.dog-card-footer {
  width: 100%;
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1px solid #f5f5f5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
}

.card-tip {
  font-size: 24rpx;
  color: #999;
}

.btn-delete {
  min-width: 140rpx;
  height: 64rpx;
  line-height: 64rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 999rpx;
  border: 1px solid #ffd6d2;
  background-color: #fff1f0;
  color: #fa5151;
  font-size: 26rpx;
}

.btn-delete::after {
  border: none;
}

.btn-delete[disabled] {
  opacity: 0.7;
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
