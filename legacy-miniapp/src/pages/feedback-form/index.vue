<template>
  <view class="feedback-form">
    <!-- 反馈类型 -->
    <view class="form-section">
      <view class="section-label">反馈类型</view>
      <view class="type-options">
        <view
          v-for="item in typeOptions"
          :key="item.value"
          class="type-option"
          :class="{ active: form.type === item.value }"
          @tap="form.type = item.value"
        >
          <text>{{ item.icon }} {{ item.label }}</text>
        </view>
      </view>
    </view>

    <!-- 反馈内容 -->
    <view class="form-section">
      <view class="section-label">反馈内容</view>
      <view class="textarea-wrapper">
        <textarea
          v-model="form.content"
          placeholder="请详细描述您遇到的问题或建议..."
          maxlength="500"
          class="content-textarea"
        />
        <text class="char-count">{{ form.content.length }}/500</text>
      </view>
    </view>

    <!-- 图片上传 -->
    <view class="form-section">
      <view class="section-label">上传图片（选填，最多3张）</view>
      <view class="image-list">
        <view
          v-for="(img, index) in imageList"
          :key="index"
          class="image-item"
        >
          <image :src="img.url" mode="aspectFill" class="preview-image" @tap="previewImage(index)" />
          <view class="remove-btn" @tap="removeImage(index)">
            <text class="remove-icon">×</text>
          </view>
        </view>
        <view v-if="imageList.length < 3" class="image-add" @tap="chooseImage">
          <text class="add-icon">+</text>
          <text class="add-text">添加图片</text>
        </view>
      </view>
    </view>

    <!-- 提交按钮 -->
    <button class="submit-btn" :disabled="!canSubmit || submitting" @tap="handleSubmit">
      {{ submitting ? '提交中...' : '提交反馈' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { uploadFeedbackImage, deleteFeedbackImage, createFeedback } from '../../utils/api'

const typeOptions = [
  { value: 'BUG', label: '问题反馈', icon: '🐛' },
  { value: 'SUGGESTION', label: '功能建议', icon: '💡' },
  { value: 'OTHER', label: '其他', icon: '📝' },
]

const form = ref({
  type: 'BUG',
  content: '',
})

interface ImageItem {
  url: string
  key: string
}

const imageList = ref<ImageItem[]>([])
const submitting = ref(false)

const canSubmit = computed(() => {
  return form.value.type && form.value.content.trim().length > 0
})

const chooseImage = () => {
  const remaining = 3 - imageList.value.length
  if (remaining <= 0) return

  uni.chooseImage({
    count: remaining,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res: any) => {
      for (const tempPath of res.tempFilePaths) {
        if (imageList.value.length >= 3) break
        try {
          uni.showLoading({ title: '上传中...' })
          const result = await uploadFeedbackImage(tempPath)
          imageList.value.push({ url: result.url, key: result.key })
        } catch (err: any) {
          console.error('[FeedbackForm] Upload failed:', err)
          uni.showToast({ title: '图片上传失败', icon: 'none' })
        } finally {
          uni.hideLoading()
        }
      }
    },
  })
}

const removeImage = async (index: number) => {
  const img = imageList.value[index]
  try {
    await deleteFeedbackImage(img.key)
  } catch (err) {
    console.error('[FeedbackForm] Delete COS image failed:', err)
  }
  imageList.value.splice(index, 1)
}

const previewImage = (index: number) => {
  const urls = imageList.value.map(img => img.url)
  uni.previewImage({
    current: urls[index],
    urls,
  })
}

const handleSubmit = async () => {
  if (!canSubmit.value || submitting.value) return

  submitting.value = true
  try {
    await createFeedback({
      type: form.value.type,
      content: form.value.content.trim(),
      imageUrls: imageList.value.map(img => img.url),
      imageKeys: imageList.value.map(img => img.key),
    })

    uni.showToast({ title: '提交成功，感谢反馈！', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  } catch (err: any) {
    console.error('[FeedbackForm] Submit failed:', err)
    uni.showToast({ title: err.message || '提交失败，请重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.feedback-form {
  padding: 20rpx 30rpx;
  min-height: 100vh;
  background: #f5f5f5;
}

.form-section {
  background: white;
  border-radius: 16rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.section-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 20rpx;
}

.type-options {
  display: flex;
  gap: 20rpx;
}

.type-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx 0;
  border-radius: 12rpx;
  background: #f5f5f5;
  font-size: 26rpx;
  color: #666;
  transition: all 0.2s;
}

.type-option.active {
  background: #e8f4fd;
  color: #1890ff;
  font-weight: 600;
}

.textarea-wrapper {
  position: relative;
}

.content-textarea {
  width: 100%;
  min-height: 200rpx;
  font-size: 28rpx;
  line-height: 1.6;
  padding: 20rpx;
  box-sizing: border-box;
  background: #f9f9f9;
  border-radius: 12rpx;
}

.char-count {
  position: absolute;
  right: 20rpx;
  bottom: 20rpx;
  font-size: 22rpx;
  color: #999;
}

.image-list {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.image-item {
  position: relative;
  width: 180rpx;
  height: 180rpx;
  border-radius: 12rpx;
  overflow: visible;
}

.preview-image {
  width: 100%;
  height: 100%;
  border-radius: 12rpx;
}

.remove-btn {
  position: absolute;
  top: -16rpx;
  right: -16rpx;
  width: 40rpx;
  height: 40rpx;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-icon {
  color: white;
  font-size: 28rpx;
  line-height: 1;
}

.image-add {
  width: 180rpx;
  height: 180rpx;
  border-radius: 12rpx;
  border: 2rpx dashed #ccc;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.add-icon {
  font-size: 48rpx;
  color: #ccc;
}

.add-text {
  font-size: 22rpx;
  color: #999;
}

.submit-btn {
  margin-top: 40rpx;
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background: #1890ff;
  color: white;
  font-size: 32rpx;
  font-weight: 600;
  border-radius: 44rpx;
  border: none;
}

.submit-btn[disabled] {
  background: #b3d9ff;
  color: white;
}
</style>
