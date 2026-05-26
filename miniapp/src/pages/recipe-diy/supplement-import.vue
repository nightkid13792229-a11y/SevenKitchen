<template>
  <view class="supplement-import-page">
    <view class="page-header">
      <text class="page-title">拍照识别新增</text>
      <text class="page-subtitle">请拍清楚品牌、品名、规格和成分表。</text>
    </view>

    <view class="action-row">
      <button
        class="source-button source-button-primary"
        :disabled="remainingCount <= 0"
        @tap="chooseFromCamera"
      >
        拍照
      </button>
      <button
        class="source-button"
        :disabled="remainingCount <= 0"
        @tap="chooseFromAlbum"
      >
        从相册选择
      </button>
    </view>

    <view class="limit-row">
      <text class="limit-text">最多 6 张，已选择 {{ selectedImages.length }} 张</text>
    </view>

    <view v-if="selectedImages.length === 0" class="empty-panel">
      <text class="empty-title">还没有图片</text>
      <text class="empty-text">建议包含包装正面、营养/成分表和用量说明。</text>
    </view>

    <view v-else class="image-grid">
      <view
        v-for="(item, index) in selectedImages"
        :key="item.localPath"
        class="image-card"
      >
        <image
          class="preview-image"
          :src="item.localPath"
          mode="aspectFill"
        />
        <button class="remove-button" @tap="removeImage(index)">×</button>
        <view v-if="item.uploading" class="status-mask">
          <text class="status-text">上传中</text>
        </view>
        <view v-else-if="item.error" class="error-strip" @tap="retryUpload(index)">
          <text class="error-text">{{ item.error }}</text>
          <text class="retry-text">重试</text>
        </view>
        <view v-else-if="item.uploadedUrl" class="success-strip">
          <text class="success-text">已上传</text>
        </view>
      </view>
    </view>

    <view class="bottom-bar">
      <button
        class="submit-button"
        :disabled="!canCreateDraft"
        @tap="submitDraft"
      >
        {{ isSubmitting ? '创建中...' : '生成识别草稿' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  canShowSupplementImportEntry,
  supplementImportApi,
  uploadSupplementImportImage,
} from '../../utils/supplement-import'

type SelectedImage = {
  localPath: string
  uploadedUrl?: string
  uploading?: boolean
  error?: string
}

const MAX_IMAGE_COUNT = 6

const recipeId = ref('')
const selectedImages = ref<SelectedImage[]>([])
const isSubmitting = ref(false)

const remainingCount = computed(() => MAX_IMAGE_COUNT - selectedImages.value.length)
const canCreateDraft = computed(() => {
  return selectedImages.value.some(item => item.uploadedUrl) && !isSubmitting.value
})

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  recipeId.value = currentPage?.options?.recipeId || ''

  ensureAdminAccess()
})

function ensureAdminAccess(): boolean {
  if (canShowSupplementImportEntry()) {
    return true
  }

  uni.showToast({ title: '仅管理员可上传补剂图片', icon: 'none' })
  setTimeout(() => {
    if (getCurrentPages().length > 1) {
      uni.navigateBack()
      return
    }

    uni.redirectTo({ url: '/pages/recipe-list/index' })
  }, 600)
  return false
}

async function chooseFromCamera() {
  await chooseImages({
    sourceType: ['camera'],
  })
}

async function chooseFromAlbum() {
  await chooseImages({
    sourceType: ['album'],
  })
}

async function chooseImages(options: { sourceType: Array<'camera' | 'album'> }) {
  if (!ensureAdminAccess()) {
    return
  }

  if (remainingCount.value <= 0) {
    uni.showToast({ title: '最多上传 6 张图片', icon: 'none' })
    return
  }

  try {
    const res: any = await chooseImage({
      count: remainingCount.value,
      sourceType: options.sourceType,
    })
    const paths = normalizeTempFilePaths(res)
    const startIndex = selectedImages.value.length

    selectedImages.value.push(...paths.map((localPath) => ({
      localPath,
      uploading: true,
    })))

    paths.forEach((_, offset) => {
      uploadImageAt(startIndex + offset)
    })
  } catch (error: any) {
    if (!isChooseCancel(error)) {
      uni.showToast({ title: error?.message || '选择图片失败', icon: 'none' })
    }
  }
}

function chooseImage(options: {
  count: number
  sourceType: Array<'camera' | 'album'>
}) {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: options.count,
      sourceType: options.sourceType,
      success: resolve,
      fail: reject,
    })
  })
}

function normalizeTempFilePaths(res: any): string[] {
  if (Array.isArray(res?.tempFilePaths)) {
    return res.tempFilePaths.slice(0, remainingCount.value)
  }

  if (Array.isArray(res?.tempFiles)) {
    return res.tempFiles
      .map((file: any) => file?.path || file?.tempFilePath)
      .filter(Boolean)
      .slice(0, remainingCount.value)
  }

  return []
}

async function uploadImageAt(index: number) {
  const image = selectedImages.value[index]
  if (!image) {
    return
  }

  image.uploading = true
  image.error = ''
  image.uploadedUrl = ''

  try {
    const uploaded = await uploadSupplementImportImage(image.localPath)
    image.uploadedUrl = normalizeUploadedUrl(uploaded)
    if (!image.uploadedUrl) {
      throw new Error('上传结果缺少图片地址')
    }
  } catch (error: any) {
    image.error = error?.message || '上传失败'
  } finally {
    image.uploading = false
  }
}

function normalizeUploadedUrl(uploaded: any): string {
  if (typeof uploaded === 'string') {
    return uploaded
  }

  return uploaded?.url ||
    uploaded?.imageUrl ||
    uploaded?.uploadedUrl ||
    uploaded?.fileUrl ||
    ''
}

function retryUpload(index: number) {
  uploadImageAt(index)
}

function removeImage(index: number) {
  selectedImages.value.splice(index, 1)
}

async function submitDraft() {
  if (!ensureAdminAccess()) {
    return
  }

  const uploadedUrls = selectedImages.value
    .map((item) => item.uploadedUrl)
    .filter(Boolean) as string[]

  if (uploadedUrls.length === 0) {
    uni.showToast({ title: '请先上传至少一张图片', icon: 'none' })
    return
  }

  isSubmitting.value = true
  try {
    const response: any = await supplementImportApi.createDraft(uploadedUrls)
    const draftId = response.data.id
    uni.navigateTo({
      url: `/pages/recipe-diy/supplement-import-confirm?draftId=${encodeURIComponent(draftId)}&recipeId=${encodeURIComponent(recipeId.value)}`,
    })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '创建识别草稿失败', icon: 'none' })
  } finally {
    isSubmitting.value = false
  }
}

function isChooseCancel(error: any): boolean {
  const message = String(error?.errMsg || error?.message || '').toLowerCase()
  return message.includes('cancel')
}
</script>

<style scoped>
.supplement-import-page {
  min-height: 100vh;
  padding: 32rpx 28rpx 148rpx;
  background: #f6f7fb;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 28rpx;
}

.page-title {
  color: #20232a;
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1.25;
}

.page-subtitle {
  color: #6b7280;
  font-size: 24rpx;
  line-height: 1.4;
}

.action-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18rpx;
  margin-bottom: 16rpx;
}

.source-button {
  height: 84rpx;
  border: 2rpx solid #cfd8e7;
  border-radius: 8rpx;
  background: #fff;
  color: #1f2937;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 84rpx;
}

.source-button-primary {
  border-color: #2f6fed;
  background: #2f6fed;
  color: #fff;
}

.source-button::after {
  border: 0;
}

.source-button[disabled] {
  opacity: 0.55;
}

.limit-row {
  margin-bottom: 24rpx;
}

.limit-text {
  color: #6b7280;
  font-size: 24rpx;
}

.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 360rpx;
  padding: 44rpx;
  border: 2rpx dashed #d7deea;
  border-radius: 8rpx;
  background: #fff;
  box-sizing: border-box;
}

.empty-title {
  margin-bottom: 8rpx;
  color: #1f2937;
  font-size: 30rpx;
  font-weight: 700;
}

.empty-text {
  color: #6b7280;
  font-size: 26rpx;
  line-height: 1.5;
  text-align: center;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18rpx;
}

.image-card {
  position: relative;
  overflow: hidden;
  aspect-ratio: 1;
  border: 2rpx solid #e4eaf3;
  border-radius: 8rpx;
  background: #fff;
}

.preview-image {
  display: block;
  width: 100%;
  height: 100%;
}

.remove-button {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  width: 48rpx;
  height: 48rpx;
  padding: 0;
  border-radius: 50%;
  background: rgba(17, 24, 39, 0.72);
  color: #fff;
  font-size: 34rpx;
  line-height: 44rpx;
}

.remove-button::after {
  border: 0;
}

.status-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 24, 39, 0.5);
}

.status-text {
  color: #fff;
  font-size: 26rpx;
  font-weight: 600;
}

.error-strip,
.success-strip {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 58rpx;
  padding: 8rpx 14rpx;
  box-sizing: border-box;
}

.error-strip {
  background: rgba(185, 28, 28, 0.9);
}

.success-strip {
  background: rgba(22, 101, 52, 0.88);
}

.error-text,
.retry-text,
.success-text {
  color: #fff;
  font-size: 22rpx;
  line-height: 1.25;
}

.error-text {
  flex: 1;
  min-width: 0;
}

.retry-text {
  flex-shrink: 0;
  margin-left: 12rpx;
  font-weight: 700;
}

.bottom-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
  border-top: 2rpx solid #e5eaf2;
  background: #fff;
  box-sizing: border-box;
}

.submit-button {
  height: 88rpx;
  border-radius: 8rpx;
  background: #2f6fed;
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 88rpx;
}

.submit-button::after {
  border: 0;
}

.submit-button[disabled] {
  background: #aab7c9;
  color: #fff;
}
</style>
