<template>
  <view class="container">
    <!-- 状态筛选Tab -->
    <view class="status-tabs">
      <view
        v-for="tab in statusTabs"
        :key="tab.value"
        class="tab-item"
        :class="{ active: selectedStatus === tab.value }"
        @tap="selectStatus(tab.value)"
      >
        <text class="tab-text">{{ tab.label }}</text>
        <text v-if="tab.count > 0" class="tab-count">({{ tab.count }})</text>
      </view>
    </view>

    <view class="order-list">
      <view
        v-for="order in orders"
        :key="order.id"
        class="order-item"
        @tap="viewOrder(order.id)"
      >
        <!-- 订单类型标签 -->
        <view class="order-type-tag">💳 鲜食制作订单</view>

        <view class="order-header">
          <text class="order-time">{{ formatTime(order.createdAt) }}</text>
          <text class="order-status" :style="{ color: getStatusColor(order.status) }">
            {{ getStatusIcon(order.status) }} {{ getStatusText(order.status) }}
          </text>
        </view>

        <!-- 狗狗信息 -->
        <view class="order-dogs">
          <text class="dogs-icon">🐶</text>
          <text class="dogs-text">{{ formatDogsText(order) }}</text>
        </view>

        <!-- 金额（只显示总价）-->
        <view class="order-amount">
          <text class="amount-label">订单金额:</text>
          <text class="amount-value">¥{{ formatAmount(order.totalAmount) }}</text>
        </view>
      </view>

      <view v-if="orders.length === 0" class="empty-state">
        <text class="empty-icon">📦</text>
        <text class="empty-text">暂无订单</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request, getToken } from '../../utils/api'

// DEBUG flag for development logging
const DEBUG = false

interface Order {
  id: string
  status: string
  totalAmount?: number
  itemCount?: number
  createdAt?: string
  items?: any[]
}

// 状态筛选Tab
const selectedStatus = ref<string>('ALL')

const statusTabs = ref<Array<{label: string, value: string, count: number}>>([
  { label: '全部', value: 'ALL', count: 0 },
  { label: '待付款', value: 'PENDING_PAYMENT', count: 0 },
  { label: '生产中', value: 'IN_PRODUCTION', count: 0 },
  { label: '已发货', value: 'SHIPPED', count: 0 },
  { label: '已完成', value: 'COMPLETED', count: 0 }
])

const allOrders = ref<Order[]>([])
const orders = ref<Order[]>([])

onMounted(() => {
  loadOrders()
})

onShow(() => {
  // Refresh orders when page becomes visible (e.g., after creating new order)
  loadOrders()
})

function loadOrders() {
  if (DEBUG) {
    const token = getToken()
    console.log('[OrdersList] Loading orders', {
      token: token ? token.substring(0, 20) + '...' : 'none',
    })
  }

  uni.showLoading({ title: '加载中...' })

  request({
    url: '/orders',
    method: 'GET'
  }).then((res: any) => {
    if (DEBUG) {
      console.log('[OrdersList] Response:', {
        code: res.code,
        orderCount: res.data?.length || 0,
      })
    }
    if (res.code === 0 && res.data) {
      allOrders.value = res.data
      updateStatusCounts()
      filterOrders()
    }
  }).catch((err: any) => {
    console.error('Load orders error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}

// 更新各状态订单数量
function updateStatusCounts() {
  statusTabs.value[0].count = allOrders.value.length // 全部
  statusTabs.value[1].count = allOrders.value.filter(o => o.status === 'PENDING_PAYMENT').length
  statusTabs.value[2].count = allOrders.value.filter(o =>
    o.status === 'IN_PRODUCTION' ||
    o.status === 'READY_FOR_PACKAGING' ||
    o.status === 'READY_FOR_SHIPMENT'
  ).length
  statusTabs.value[3].count = allOrders.value.filter(o => o.status === 'SHIPPED').length
  statusTabs.value[4].count = allOrders.value.filter(o => o.status === 'COMPLETED').length
}

// 根据选中状态筛选订单
function filterOrders() {
  if (selectedStatus.value === 'ALL') {
    orders.value = allOrders.value
  } else if (selectedStatus.value === 'IN_PRODUCTION') {
    // 生产中包含多个状态
    orders.value = allOrders.value.filter(o =>
      o.status === 'IN_PRODUCTION' ||
      o.status === 'READY_FOR_PACKAGING' ||
      o.status === 'READY_FOR_SHIPMENT'
    )
  } else {
    orders.value = allOrders.value.filter(o => o.status === selectedStatus.value)
  }
}

// 选择状态
function selectStatus(status: string) {
  selectedStatus.value = status
  filterOrders()
}

function viewOrder(orderId: string) {
  uni.navigateTo({
    url: `/pages/order-detail/index?id=${orderId}`
  })
}

function formatTime(timeStr?: string): string {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function formatAmount(amount?: number): string {
  if (!amount) return '0.00'
  return amount.toFixed(2)
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    INIT: '待确认',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    WAITING_FOR_PRODUCTION: '待生产',
    IN_PRODUCTION: '生产中',
    READY_FOR_PACKAGING: '生产中',
    READY_FOR_SHIPMENT: '急冻中，待发货',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消'
  }
  return statusMap[status] || status
}

function getStatusIcon(status: string): string {
  const iconMap: Record<string, string> = {
    INIT: '📝',
    PENDING_PAYMENT: '💳',
    PAID: '✓',
    WAITING_FOR_PRODUCTION: '⏳',
    IN_PRODUCTION: '👨‍🍳',
    READY_FOR_PACKAGING: '👨‍🍳',
    READY_FOR_SHIPMENT: '❄️',
    SHIPPED: '🚚',
    COMPLETED: '✅',
    CANCELLED: '✕'
  }
  return iconMap[status] || ''
}

function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    INIT: '#999',
    PENDING_PAYMENT: '#ff9800',
    PAID: '#1890ff',
    WAITING_FOR_PRODUCTION: '#1890ff',
    IN_PRODUCTION: '#1890ff',
    READY_FOR_PACKAGING: '#1890ff',
    READY_FOR_SHIPMENT: '#722ed1',
    SHIPPED: '#52c41a',
    COMPLETED: '#52c41a',
    CANCELLED: '#999'
  }
  return colorMap[status] || '#999'
}

function formatDogsText(order: Order): string {
  if (!order.items || order.items.length === 0) {
    return order.itemCount ? `${order.itemCount}件商品` : ''
  }

  // 简化显示：只显示狗狗数量和商品数量
  const uniqueDogs = new Set(order.items.map(item => item.dogId))
  const dogCount = uniqueDogs.size
  const itemCount = order.items.length

  if (dogCount === 1) {
    const firstDog = order.items[0]
    return `${firstDog.dogName || ''} (${itemCount}件商品)`
  } else {
    return `${dogCount}只狗狗 (${itemCount}件商品)`
  }
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-top: 0;
}

/* 状态筛选Tab */
.status-tabs {
  display: flex;
  background-color: #fff;
  padding: 20rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  overflow-x: auto;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-item {
  flex-shrink: 0;
  padding: 12rpx 24rpx;
  margin-right: 16rpx;
  border-radius: 20rpx;
  background-color: #f5f5f5;
  display: flex;
  align-items: center;
  gap: 4rpx;
  transition: all 0.3s;
}

.tab-item.active {
  background-color: #1890ff;
}

.tab-text {
  font-size: 26rpx;
  color: #666;
}

.tab-item.active .tab-text {
  color: #fff;
  font-weight: bold;
}

.tab-count {
  font-size: 22rpx;
  color: #999;
}

.tab-item.active .tab-count {
  color: rgba(255, 255, 255, 0.9);
}

.order-list {
  padding: 20rpx 0;
}

.order-item {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.order-type-tag {
  font-size: 24rpx;
  color: #1890ff;
  margin-bottom: 16rpx;
  padding: 8rpx 16rpx;
  background-color: #f0f9ff;
  border-radius: 6rpx;
  display: inline-block;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.order-time {
  font-size: 26rpx;
  color: #999;
}

.order-status {
  font-size: 28rpx;
  font-weight: bold;
}

.order-dogs {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 16rpx;
  padding: 12rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
}

.dogs-icon {
  font-size: 28rpx;
}

.dogs-text {
  font-size: 26rpx;
  color: #333;
  flex: 1;
}

.order-amount {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8rpx;
}

.amount-label {
  font-size: 26rpx;
  color: #666;
}

.amount-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}

.empty-icon {
  font-size: 120rpx;
  margin-bottom: 24rpx;
}

.empty-text {
  font-size: 28rpx;
  color: #999;
}
</style>


