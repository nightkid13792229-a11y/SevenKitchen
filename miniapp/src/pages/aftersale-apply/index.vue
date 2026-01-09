<template>
  <view class="aftersale-apply-page">
    <view class="header">
      <text class="page-title">申请售后</text>
    </view>

    <!-- 订单信息 -->
    <view class="section order-info" v-if="orderInfo">
      <text class="section-title">订单信息</text>
      <view class="info-item">
        <text class="label">订单编号:</text>
        <text class="value">{{ formatOrderId(orderId) }}</text>
      </view>
      <view class="info-item">
        <text class="label">订单状态:</text>
        <text class="value">{{ getStatusText(orderInfo.status) }}</text>
      </view>
    </view>

    <!-- 售后类型 -->
    <view class="section">
      <text class="section-title">售后类型</text>
      <view class="type-selector">
        <view
          v-for="type in aftersaleTypes"
          :key="type.value"
          class="type-option"
          :class="{ active: selectedType === type.value }"
          @tap="selectType(type.value)"
        >
          <text class="type-icon">{{ type.icon }}</text>
          <text class="type-label">{{ type.label }}</text>
          <text v-if="selectedType === type.value" class="check-icon">✓</text>
        </view>
      </view>
    </view>

    <!-- 详细说明 -->
    <view class="section">
      <text class="section-title">详细说明</text>
      <textarea
        class="reason-input"
        v-model="reason"
        placeholder="请详细描述您遇到的问题..."
        maxlength="500"
      />
      <view class="char-count">{{ reason.length }}/500</view>
    </view>

    <!-- 上传图片 -->
    <view class="section">
      <text class="section-title">上传图片(可选)</text>
      <view class="image-upload">
        <view
          v-for="(img, idx) in photos"
          :key="idx"
          class="image-item"
        >
          <image :src="img" mode="aspectFill" class="uploaded-image" />
          <view class="btn-remove" @tap="removePhoto(idx)">×</view>
        </view>
        <view
          v-if="photos.length < 6"
          class="btn-add"
          @tap="chooseImage"
        >
          <text class="add-icon">+</text>
          <text class="add-text">添加图片</text>
        </view>
      </view>
      <text class="image-hint">最多可上传6张图片</text>
    </view>

    <!-- 提交按钮 -->
    <view class="submit-section">
      <button class="btn-submit" @tap="submitAftersale">提交申请</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '../../utils/api'
import { getBaseUrl } from '../../utils/config'

const orderId = ref('')
const selectedType = ref<'REFUND' | 'REMAKE' | 'COMPLAINT'>('COMPLAINT')
const reason = ref('')
const photos = ref<string[]>([])
const orderInfo = ref<any>(null)

const aftersaleTypes = [
  { value: 'REFUND', label: '申请退款', icon: '💰' },
  { value: 'REMAKE', label: '申请重做', icon: '🔄' },
  { value: 'COMPLAINT', label: '投诉建议', icon: '📝' },
]

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  orderId.value = currentPage.options?.orderId || ''
  const type = currentPage.options?.type || 'COMPLAINT'

  if (type) {
    selectedType.value = type as 'REFUND' | 'REMAKE' | 'COMPLAINT'
  }

  if (orderId.value) {
    loadOrderInfo()
  }
})

async function loadOrderInfo() {
  try {
    uni.showLoading({ title: '加载中...' })
    const res = await request({
      url: `/orders/${orderId.value}`,
      method: 'GET'
    })
    if (res.code === 0) {
      orderInfo.value = res.data
    }
  } catch (error) {
    console.error('Load order info error:', error)
  } finally {
    uni.hideLoading()
  }
}

function selectType(type: 'REFUND' | 'REMAKE' | 'COMPLAINT') {
  selectedType.value = type
}

function chooseImage() {
  uni.chooseImage({
    count: 6 - photos.value.length,
    success: (res) => {
      photos.value.push(...res.tempFilePaths)
    }
  })
}

function removePhoto(index: number) {
  photos.value.splice(index, 1)
}

async function submitAftersale() {
  if (!reason.value.trim()) {
    uni.showToast({ title: '请填写售后原因', icon: 'none' })
    return
  }

  try {
    uni.showLoading({ title: '提交中...' })

    // 上传图片到服务器
    const uploadedPhotos: string[] = []
    for (const photo of photos.value) {
      try {
        // 使用后端API上传图片
        const uploadRes = await uploadImage(photo, orderId.value, 'aftersale-photos')
        if (uploadRes && uploadRes.url) {
          uploadedPhotos.push(uploadRes.url)
        }
      } catch (error) {
        console.error('Upload photo error:', error)
        uni.showToast({
          title: '图片上传失败',
          icon: 'none'
        })
        return // 如果图片上传失败，停止提交
      }
    }

    const res = await request({
      url: `/orders/${orderId.value}/aftersale`,
      method: 'POST',
      data: {
        type: selectedType.value,
        reason: reason.value,
        photos: uploadedPhotos
      }
    })

    if (res.code === 0) {
      uni.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    } else {
      throw new Error(res.message || '提交失败')
    }
  } catch (error: any) {
    console.error('Submit aftersale error:', error)
    uni.showToast({
      title: error.message || '提交失败',
      icon: 'none'
    })
  } finally {
    uni.hideLoading()
  }
}

/**
 * 上传图片到后端API
 * @param filePath 本地文件路径
 * @param orderId 订单ID
 * @param category 图片分类
 */
async function uploadImage(filePath: string, orderId: string, category: string) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token') || ''

    uni.uploadFile({
      url: `${getBaseUrl()}/orders/${orderId}/aftersale-photos`,
      filePath: filePath,
      name: 'files',
      header: {
        'X-Customer-Id': uni.getStorageSync('customerId') || '',
      },
      success: (res) => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(res.data)
            if (data.code === 0 && data.data && data.data.photos && data.data.photos.length > 0) {
              resolve(data.data.photos[0])
            } else {
              reject(new Error(data.message || '上传失败'))
            }
          } catch (e) {
            reject(new Error('解析响应失败'))
          }
        } else {
          reject(new Error(`上传失败: ${res.statusCode}`))
        }
      },
      fail: (err) => {
        reject(err)
      }
    })
  })
}

function formatOrderId(id: string): string {
  if (!id) return ''
  return id.substring(0, 8) + '...'
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'FREEZING': '急冻中',
    'SHIPPED': '已发货',
    'COMPLETED': '已完成',
  }
  return statusMap[status] || status
}
</script>

<style scoped lang="scss">
.aftersale-apply-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx;
}

.header {
  background-color: #fff;
  padding: 30rpx;
  text-align: center;
  border-bottom: 1rpx solid #eee;
}

.page-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}

.section {
  background-color: #fff;
  margin: 20rpx;
  padding: 30rpx;
  border-radius: 16rpx;
}

.section-title {
  display: block;
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.order-info {
  .info-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 20rpx;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .label {
    font-size: 28rpx;
    color: #666;
  }

  .value {
    font-size: 28rpx;
    color: #333;
    font-weight: 500;
  }
}

.type-selector {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.type-option {
  display: flex;
  align-items: center;
  padding: 30rpx;
  border: 2rpx solid #eee;
  border-radius: 12rpx;
  position: relative;

  &.active {
    border-color: #1890ff;
    background-color: #f0f8ff;
  }
}

.type-icon {
  font-size: 48rpx;
  margin-right: 20rpx;
}

.type-label {
  flex: 1;
  font-size: 30rpx;
  color: #333;
}

.check-icon {
  font-size: 40rpx;
  color: #1890ff;
  font-weight: bold;
}

.reason-input {
  width: 100%;
  min-height: 300rpx;
  padding: 20rpx;
  border: 1rpx solid #eee;
  border-radius: 8rpx;
  font-size: 28rpx;
  background-color: #f9f9f9;
}

.char-count {
  text-align: right;
  font-size: 24rpx;
  color: #999;
  margin-top: 10rpx;
}

.image-upload {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.image-item {
  position: relative;
  width: 160rpx;
  height: 160rpx;
}

.uploaded-image {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}

.btn-remove {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 40rpx;
  height: 40rpx;
  background-color: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 32rpx;
  line-height: 1;
}

.btn-add {
  width: 160rpx;
  height: 160rpx;
  background-color: #f9f9f9;
  border: 2rpx dashed #ddd;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.add-icon {
  font-size: 60rpx;
  color: #999;
  line-height: 1;
}

.add-text {
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
}

.image-hint {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-top: 10rpx;
}

.submit-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 20rpx 30rpx;
  box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.1);
}

.btn-submit {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  border: none;
  font-weight: bold;
}
</style>
