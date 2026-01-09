<template>
  <view v-if="visible" class="image-preview-modal" @tap="handleClose">
    <view class="modal-container" @tap.stop>
      <!-- 关闭按钮 -->
      <view class="close-btn" @tap="handleClose">
        <text class="close-icon">×</text>
      </view>

      <!-- 图片预览区域 -->
      <view class="preview-content">
        <image
          v-if="imageUrl"
          :src="imageUrl"
          class="preview-image"
          mode="widthFix"
          @tap="handleImageTap"
        />
        <view v-else class="loading-placeholder">
          <text class="loading-text">加载中...</text>
        </view>
      </view>

      <!-- 底部操作按钮 -->
      <view class="modal-footer">
        <button class="save-btn" @tap="handleSave">
          <text class="save-btn-text">保存到本地</text>
        </button>
        <text class="preview-tip">预览图片，点击图片可查看大图</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  visible: boolean
  imageUrl?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'save': []
}>()

function handleClose() {
  emit('update:visible', false)
}

function handleSave() {
  emit('save')
}

function handleImageTap() {
  if (!props.imageUrl) return

  // 使用微信原生预览功能查看大图
  uni.previewImage({
    urls: [props.imageUrl],
    current: props.imageUrl,
    fail: (err) => {
      console.error('[ImagePreviewModal] 预览图片失败:', err)
      uni.showToast({
        title: '预览失败',
        icon: 'none'
      })
    }
  })
}
</script>

<style scoped>
.image-preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 40rpx;
}

.modal-container {
  width: 100%;
  max-width: 650rpx;
  background-color: #fff;
  border-radius: 24rpx;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.close-btn {
  position: absolute;
  top: 20rpx;
  right: 20rpx;
  width: 60rpx;
  height: 60rpx;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.close-icon {
  font-size: 48rpx;
  color: #fff;
  line-height: 1;
}

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 80rpx 40rpx 20rpx;
  background-color: #f5f5f5;
  min-height: 600rpx;
}

.preview-image {
  width: 100%;
  display: block;
  border-radius: 12rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.1);
}

.loading-placeholder {
  width: 100%;
  height: 600rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fff;
  border-radius: 12rpx;
}

.loading-text {
  font-size: 28rpx;
  color: #999;
}

.modal-footer {
  padding: 24rpx 32rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.save-btn {
  width: 100%;
  height: 88rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.save-btn:active {
  opacity: 0.8;
}

.save-btn-text {
  font-size: 32rpx;
  font-weight: bold;
}

.preview-tip {
  font-size: 24rpx;
  color: #999;
  text-align: center;
}
</style>
