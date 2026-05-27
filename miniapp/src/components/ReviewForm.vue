<template>
  <view v-if="visible" class="popup-overlay" @tap="onOverlayTap">
    <view class="popup-content" @tap.stop>
      <view class="popup-header">
        <text class="popup-title">写评价</text>
        <view class="btn-close" @tap="close">
          <text class="close-icon">✕</text>
        </view>
      </view>

      <scroll-view scroll-y class="popup-body">
        <!-- 星级评分 -->
        <view class="form-section">
          <text class="section-title">为这个食谱打分</text>
          <DimensionRating v-model="ratings" />
        </view>

        <!-- 评论内容 -->
        <view class="form-section">
          <text class="section-title">分享你的制作体验</text>
          <textarea
            v-model="content"
            class="review-textarea"
            placeholder="说说你的制作感受，小狗爱吃吗？"
            maxlength="500"
            :auto-height="false"
          />
          <text class="char-count">{{ content.length }}/500</text>
        </view>

        <!-- 图片上传 -->
        <view class="form-section">
          <text class="section-title">上传图片（可选）</text>
          <view class="image-upload">
            <view
              v-for="(img, idx) in previewPhotos"
              :key="idx"
              class="image-item"
            >
              <image :src="img" mode="aspectFill" class="uploaded-image" />
              <view class="btn-remove" @tap="removePhoto(idx)">
                <text class="remove-icon">✕</text>
              </view>
            </view>
            <view
              v-if="previewPhotos.length < 6"
              class="btn-add"
              @tap="chooseImage"
            >
              <text class="add-icon">+</text>
              <text class="add-text">添加图片</text>
            </view>
          </view>
          <text class="image-hint">最多可上传6张图片</text>
        </view>
      </scroll-view>

      <!-- 提交按钮 -->
      <view class="popup-footer">
        <button
          class="btn-submit"
          :disabled="!canSubmit || submitting"
          @tap="submit"
        >
          {{ submitting ? '提交中...' : '提交评价' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { reviewApi } from '../utils/api'
import DimensionRating from './DimensionRating.vue'

const props = defineProps({
  recipeId: {
    type: String,
    required: true,
  },
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['submitted', 'update:visible'])

const visible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

const ratings = ref({ ease: 0, value: 0, taste: 0 })
const content = ref('')
const previewPhotos = ref<string[]>([]) // 本地预览路径
const uploadedPhotoUrls = ref<string[]>([]) // 上传后的URL
const submitting = ref(false)

const canSubmit = computed(() => {
  return ratings.value.ease > 0
    && ratings.value.value > 0
    && ratings.value.taste > 0
    && content.value.trim().length > 0
})

function close() {
  visible.value = false
  resetForm()
}

function onOverlayTap(e: any) {
  // 只有点击遮罩层本身才关闭（e.target === e.currentTarget）
  // uni-app 中通过判断点击坐标是否在 popup-content 区域外来判断
  close()
}

function resetForm() {
  ratings.value = { ease: 0, value: 0, taste: 0 }
  content.value = ''
  previewPhotos.value = []
  uploadedPhotoUrls.value = []
  submitting.value = false
}

function chooseImage() {
  uni.chooseImage({
    count: 6 - previewPhotos.value.length,
    success: (res: any) => {
      previewPhotos.value.push(...res.tempFilePaths)
    },
  })
}

function removePhoto(index: number) {
  previewPhotos.value.splice(index, 1)
}

async function submit() {
  if (!canSubmit.value || submitting.value) return

  submitting.value = true

  try {
    // 上传新添加的图片
    const photoUrls: string[] = []
    for (const localPath of previewPhotos.value) {
      try {
        const result = await reviewApi.uploadReviewPhoto(localPath)
        if (result?.url) {
          photoUrls.push(result.url)
        }
      } catch (error) {
        console.error('Upload review photo error:', error)
        uni.showToast({ title: '图片上传失败', icon: 'none' })
        submitting.value = false
        return
      }
    }

    // 提交评论
    await reviewApi.createReview(props.recipeId, {
      ratingEase: ratings.value.ease,
      ratingValue: ratings.value.value,
      ratingTaste: ratings.value.taste,
      content: content.value.trim(),
      photos: photoUrls,
    })

    uni.showToast({ title: '评价成功', icon: 'success' })
    emit('submitted')
    close()
  } catch (error: any) {
    console.error('Submit review error:', error)
    uni.showToast({ title: error.message || '评价失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.popup-content {
  width: 100%;
  max-height: 85vh;
  background-color: #fff;
  border-radius: 24rpx 24rpx 0 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.popup-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.btn-close {
  padding: 8rpx;
}

.close-icon {
  font-size: 36rpx;
  color: #999;
}

.popup-body {
  flex: 1;
  padding: 24rpx 32rpx;
  max-height: 65vh;
  box-sizing: border-box;
  width: 100%;
}

.form-section {
  margin-bottom: 32rpx;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.section-title {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
  display: block;
  margin-bottom: 16rpx;
}

.review-textarea {
  width: 100%;
  height: 200rpx;
  background-color: #f8f8f8;
  border-radius: 12rpx;
  padding: 20rpx;
  font-size: 28rpx;
  color: #333;
  box-sizing: border-box;
}

.char-count {
  font-size: 24rpx;
  color: #999;
  text-align: right;
  display: block;
  margin-top: 8rpx;
}

.image-upload {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  width: 100%;
  box-sizing: border-box;
}

.image-item {
  width: 160rpx;
  height: 160rpx;
  position: relative;
  border-radius: 12rpx;
  overflow: hidden;
}

.uploaded-image {
  width: 100%;
  height: 100%;
}

.btn-remove {
  position: absolute;
  top: 0;
  right: 0;
  width: 40rpx;
  height: 40rpx;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0 0 0 12rpx;
}

.remove-icon {
  color: #fff;
  font-size: 24rpx;
}

.btn-add {
  width: 160rpx;
  height: 160rpx;
  border: 2rpx dashed #d0d0d0;
  border-radius: 12rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.add-icon {
  font-size: 48rpx;
  color: #d0d0d0;
}

.add-text {
  font-size: 22rpx;
  color: #999;
}

.image-hint {
  font-size: 22rpx;
  color: #999;
  margin-top: 12rpx;
  display: block;
}

.popup-footer {
  padding: 20rpx 32rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f0f0f0;
  box-sizing: border-box;
  width: 100%;
}

.btn-submit {
  width: 100%;
  height: 88rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background-color: #07c160;
  color: #fff;
  font-size: 32rpx;
  font-weight: 500;
  border-radius: 44rpx;
  border: none;
  padding: 0;
  margin: 0;
}

.btn-submit::after {
  border: none;
}

.btn-submit[disabled] {
  background-color: #ccc;
  color: #fff;
}
</style>
