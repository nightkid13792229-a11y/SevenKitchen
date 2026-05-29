<template>
  <view class="customer-service-entry-page">
    <view class="entry-card">
      <text class="entry-title">正在打开咨询内容</text>
      <text class="entry-subtitle">{{ entryDescription }}</text>
      <button class="entry-button" @tap="openTarget">立即查看</button>
      <button class="entry-secondary" @tap="goHome">返回首页</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type EntryType = 'ORDER' | 'PRODUCT' | 'AFTERSALE' | 'REFUND' | 'GENERAL'

const entryType = ref<EntryType>('GENERAL')
const orderId = ref('')
const productId = ref('')
const targetPath = ref('')

const entryDescription = computed(() => {
  if (entryType.value === 'PRODUCT') return '即将进入商品详情'
  if (entryType.value === 'ORDER' || entryType.value === 'AFTERSALE' || entryType.value === 'REFUND') {
    return '即将进入订单详情'
  }
  return '即将进入相关页面'
})

function normalizePath(path?: string) {
  const raw = String(path || '').trim()
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).replace(/^\/+/, '')
  } catch (error) {
    return raw.replace(/^\/+/, '')
  }
}

function resolveTargetPath() {
  const explicitTarget = normalizePath(targetPath.value)
  if (explicitTarget) return `/${explicitTarget}`

  if (entryType.value === 'PRODUCT' && productId.value) {
    return `/pages/recipe-detail/index?recipeId=${encodeURIComponent(productId.value)}`
  }

  if (
    (entryType.value === 'ORDER' || entryType.value === 'AFTERSALE' || entryType.value === 'REFUND') &&
    orderId.value
  ) {
    return `/pages/order-detail/index?id=${encodeURIComponent(orderId.value)}`
  }

  return '/pages/home/index'
}

function openTarget() {
  const url = resolveTargetPath()
  uni.redirectTo({
    url,
    fail: () => {
      uni.navigateTo({
        url,
        fail: goHome,
      })
    },
  })
}

function goHome() {
  uni.switchTab({
    url: '/pages/home/index',
    fail: () => {
      uni.reLaunch({ url: '/pages/home/index' })
    },
  })
}

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage?.options || {}

  entryType.value = (options.type || 'GENERAL') as EntryType
  orderId.value = options.orderId || ''
  productId.value = options.productId || ''
  targetPath.value = options.target || ''

  setTimeout(openTarget, 100)
})
</script>

<style scoped>
.customer-service-entry-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx;
  background: #f5f5f5;
  box-sizing: border-box;
}

.entry-card {
  width: 100%;
  max-width: 620rpx;
  padding: 44rpx 36rpx;
  border-radius: 16rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 28rpx rgba(15, 23, 42, 0.08);
  box-sizing: border-box;
}

.entry-title {
  display: block;
  color: #1f2933;
  font-size: 34rpx;
  font-weight: 700;
  text-align: center;
}

.entry-subtitle {
  display: block;
  margin-top: 14rpx;
  color: #6b7280;
  font-size: 26rpx;
  line-height: 1.5;
  text-align: center;
}

.entry-button,
.entry-secondary {
  width: 100%;
  height: 82rpx;
  margin-top: 34rpx;
  border-radius: 41rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.entry-button {
  background: #1890ff;
  color: #ffffff;
}

.entry-secondary {
  margin-top: 18rpx;
  background: #ffffff;
  color: #6b7280;
  border: 1rpx solid #e5e7eb;
}

.entry-button::after,
.entry-secondary::after {
  border: none;
}
</style>
