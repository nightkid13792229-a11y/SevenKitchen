<template>
  <view class="container">
    <view v-if="order" class="order-detail">
      <view class="order-header">
        <text class="order-id">订单ID: {{ order.id }}</text>
        <text class="order-status">{{ order.status }}</text>
      </view>

      <view class="order-info">
        <view class="info-item">
          <text class="label">订单类型:</text>
          <text class="value">{{ order.type }}</text>
        </view>
        <view class="info-item">
          <text class="label">总金额:</text>
          <text class="value">¥{{ order.amountTotal || order.totalAmount || 0 }}</text>
        </view>
        <view v-if="order.amountProduct !== undefined" class="info-item">
          <text class="label">商品金额:</text>
          <text class="value">¥{{ order.amountProduct }}</text>
        </view>
        <view v-if="order.amountShipping !== undefined" class="info-item">
          <text class="label">运费:</text>
          <text class="value">¥{{ order.amountShipping }}</text>
        </view>
      </view>

      <!-- Price Explanation Section (Phase 7.2) -->
      <view v-if="priceExplanation" class="price-explanation-section">
        <view class="section-header" @tap="togglePriceExplanation">
          <text class="section-title">价格说明</text>
          <text class="toggle-icon">{{ showPriceExplanation ? '▼' : '▶' }}</text>
        </view>
        <view v-if="showPriceExplanation" class="price-explanation-content">
          <view class="explanation-item">
            <text class="explanation-label">商品金额：</text>
            <text class="explanation-value">¥{{ formatPrice(priceExplanation.productPrice) }}</text>
          </view>
          <view class="explanation-detail">
            <text class="detail-line">· 食材成本：¥{{ formatPrice(priceExplanation.costIngredients) }}</text>
          </view>
          <view class="explanation-detail">
            <text class="detail-line">· 包装成本：¥{{ formatPrice(priceExplanation.costPackaging) }}</text>
          </view>
          <view class="explanation-detail">
            <text class="detail-line">· 人工成本：¥{{ formatPrice(priceExplanation.costLabor) }}</text>
          </view>
          <view class="explanation-detail">
            <text class="detail-line">· 运营成本：¥{{ formatPrice(priceExplanation.costOverhead) }}</text>
          </view>
          <view class="explanation-detail">
            <text class="detail-line">· 平台服务与保障：¥{{ formatPrice(priceExplanation.marginAmount) }}</text>
          </view>
          <view class="explanation-item">
            <text class="explanation-label">运费：</text>
            <text class="explanation-value">¥{{ formatPrice(priceExplanation.shippingFee) }}</text>
          </view>
        </view>
      </view>

      <view class="items-section">
        <view class="section-title">订单项</view>
        <view 
          v-for="item in items" 
          :key="item.id"
          class="item-card"
        >
          <view class="item-header">
            <text class="item-id">项ID: {{ item.id }}</text>
          </view>
          <view class="item-info">
            <text>数量: {{ item.quantityG }}g</text>
            <text>包装: {{ item.packageCount }}包 × {{ item.packageSpecG }}g</text>
          </view>
          <button 
            class="btn-view-snapshot"
            @tap="viewSnapshot(item.id)"
          >
            查看快照
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '../../utils/api'

interface OrderItem {
  id: string
  quantityG: number
  packageCount: number
  packageSpecG: number
}

interface Order {
  id: string
  status: string
  type: string
  totalAmount?: number
  amountTotal?: number
  amountProduct?: number
  amountShipping?: number
  items?: OrderItem[]
}

interface PriceExplanation {
  productPrice: number
  shippingFee: number
  totalPrice: number
  costIngredients: number
  costPackaging: number
  costLabor: number
  costOverhead: number
  marginAmount: number
  explanationLines: string[]
}

const order = ref<Order | null>(null)
const items = ref<OrderItem[]>([])
const orderId = ref('')
const priceExplanation = ref<PriceExplanation | null>(null)
const showPriceExplanation = ref(false)

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  orderId.value = currentPage.options?.orderId || ''
  
  if (orderId.value) {
    loadOrderDetail()
  }
})

function loadOrderDetail() {
  uni.showLoading({ title: '加载中...' })
  
  Promise.all([
    request({
      url: `/orders/${orderId.value}`,
      method: 'GET'
    }),
    request({
      url: `/orders/${orderId.value}/pricing-breakdown`,
      method: 'GET'
    }).catch(() => null) // Gracefully handle if pricing breakdown is not available
  ]).then(([orderRes, pricingRes]: any[]) => {
    if (orderRes.code === 0 && orderRes.data) {
      order.value = orderRes.data
      items.value = orderRes.data.items || []
    }
    
    // Load price explanation if available (Phase 7.2)
    if (pricingRes && pricingRes.code === 0 && pricingRes.data && pricingRes.data.priceExplanation) {
      priceExplanation.value = pricingRes.data.priceExplanation
    }
  }).catch((err: any) => {
    console.error('Load order detail error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}

function togglePriceExplanation() {
  showPriceExplanation.value = !showPriceExplanation.value
}

function formatPrice(price: number): string {
  return price.toFixed(2)
}

function viewSnapshot(itemId: string) {
  uni.navigateTo({
    url: `/pages/snapshot/index?itemId=${itemId}`
  })
}
</script>

<style scoped>
.container {
  padding: 20rpx;
}

.order-detail {
  background-color: #fff;
  padding: 30rpx;
  border-radius: 8rpx;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
  padding-bottom: 20rpx;
  border-bottom: 1px solid #eee;
}

.order-id {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.order-status {
  font-size: 28rpx;
  color: #1890ff;
  font-weight: bold;
}

.order-info {
  margin-bottom: 30rpx;
}

.info-item {
  display: flex;
  margin-bottom: 15rpx;
  font-size: 28rpx;
}

.label {
  color: #666;
  margin-right: 20rpx;
  width: 150rpx;
}

.value {
  color: #333;
  flex: 1;
}

.items-section {
  margin-top: 30rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  margin-bottom: 20rpx;
  color: #333;
}

.item-card {
  background-color: #f9f9f9;
  padding: 20rpx;
  margin-bottom: 20rpx;
  border-radius: 8rpx;
}

.item-header {
  margin-bottom: 10rpx;
}

.item-id {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.item-info {
  display: flex;
  flex-direction: column;
  font-size: 24rpx;
  color: #666;
  margin-bottom: 15rpx;
}

.btn-view-snapshot {
  font-size: 24rpx;
  padding: 10rpx 20rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 4rpx;
}

.price-explanation-section {
  margin-top: 30rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
  padding: 20rpx;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10rpx 0;
  cursor: pointer;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.toggle-icon {
  font-size: 24rpx;
  color: #666;
}

.price-explanation-content {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1px solid #eee;
}

.explanation-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15rpx;
  font-size: 28rpx;
}

.explanation-label {
  color: #666;
  font-weight: 500;
}

.explanation-value {
  color: #333;
  font-weight: bold;
}

.explanation-detail {
  margin-left: 30rpx;
  margin-bottom: 10rpx;
  font-size: 24rpx;
}

.detail-line {
  color: #666;
}
</style>


