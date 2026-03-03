<template>
  <view class="shared-photos-page">
    <!-- 加载状态 -->
    <view v-if="loading" class="loading-container">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 错误状态 -->
    <view v-else-if="error" class="error-container">
      <text class="error-icon">!</text>
      <text class="error-text">{{ error }}</text>
    </view>

    <!-- 照片列表 -->
    <view v-else-if="photos.length > 0" class="photos-container">
      <view class="header">
        <text class="title">SevenKitchen原料照片</text>
        <text class="subtitle">来自SevenKitchen的新鲜食材照片</text>
      </view>

      <view class="photos-grid">
        <image
          v-for="(photo, idx) in photos"
          :key="idx"
          :src="photo"
          mode="aspectFill"
          class="photo-item"
          @tap="previewPhoto(idx)"
        />
      </view>

      <view class="footer">
        <text class="footer-text">照片来自SevenKitchen，仅供查看</text>
        <text class="footer-time">上传时间：{{ formatDateTime(uploadedAt) }}</text>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-container">
      <text class="empty-text">暂无照片</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import { formatDateTime } from '../../utils/date'

const loading = ref(true)
const error = ref('')
const photos = ref<string[]>([])
const uploadedAt = ref('')

// 页面加载时获取token参数
onLoad((options: any) => {
  const token = options.token
  if (!token) {
    loading.value = false
    error.value = '链接无效，缺少访问令牌'
    return
  }

  loadPhotos(token)
})

// 加载照片
async function loadPhotos(token: string) {
  try {
    loading.value = true
    error.value = ''

    const response = await request({
      url: `/shared-photos/${token}`,
      method: 'GET',
    })

    if (response.code === 0 && response.data) {
      photos.value = response.data.photos || []
      uploadedAt.value = response.data.uploadedAt || ''
    } else if (response.code === 404) {
      error.value = '链接已失效，请联系分享者重新获取'
    } else if (response.code === 410) {
      error.value = '分享链接已过期，请联系分享者重新获取'
    } else {
      error.value = response.message || '加载照片失败'
    }
  } catch (err: any) {
    console.error('Load photos error:', err)
    error.value = err.message || '加载照片失败，请检查网络连接'
  } finally {
    loading.value = false
  }
}

// 预览照片
function previewPhoto(index: number) {
  uni.previewImage({
    current: index,
    urls: photos.value,
  })
}
</script>

<style scoped>
.shared-photos-page {
  min-height: 100vh;
  background-color: #f5f5f5;
}

/* 加载状态 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
}

.loading-text {
  font-size: 28rpx;
  color: #999;
}

/* 错误状态 */
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 40rpx;
}

.error-icon {
  width: 120rpx;
  height: 120rpx;
  line-height: 120rpx;
  text-align: center;
  font-size: 80rpx;
  color: #fff;
  background-color: #ff3b30;
  border-radius: 50%;
  margin-bottom: 32rpx;
}

.error-text {
  font-size: 28rpx;
  color: #666;
  text-align: center;
  line-height: 1.6;
}

/* 照片容器 */
.photos-container {
  padding: 32rpx;
}

.header {
  margin-bottom: 32rpx;
}

.title {
  display: block;
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
}

.subtitle {
  display: block;
  font-size: 26rpx;
  color: #999;
}

/* 照片网格 */
.photos-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
  margin-bottom: 32rpx;
}

.photo-item {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12rpx;
  background-color: #e0e0e0;
}

/* 底部信息 */
.footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 24rpx 0;
}

.footer-text {
  font-size: 24rpx;
  color: #999;
}

.footer-time {
  font-size: 22rpx;
  color: #ccc;
}

/* 空状态 */
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
}

.empty-text {
  font-size: 28rpx;
  color: #999;
}
</style>
