<template>
  <view class="container">
    <view class="order-list">
      <view 
        v-for="order in orders" 
        :key="order.id"
        class="order-item"
        @tap="viewOrder(order.id)"
      >
        <view class="order-header">
          <text class="order-id">订单ID: {{ order.id }}</text>
          <text class="order-status">{{ order.status }}</text>
        </view>
        <view class="order-info">
          <text class="order-amount">金额: ¥{{ order.totalAmount || 0 }}</text>
          <text class="order-items">商品数: {{ order.itemCount || 0 }}</text>
        </view>
      </view>
      <view v-if="orders.length === 0" class="empty-state">
        <text>暂无订单</text>
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
}

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
      orders.value = res.data
    }
  }).catch((err: any) => {
    console.error('Load orders error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}

function viewOrder(orderId: string) {
  uni.navigateTo({
    url: `/pages/order-detail/index?orderId=${orderId}`
  })
}
</script>

<style scoped>
.container {
  padding: 20rpx;
}

.order-list {
  padding: 20rpx 0;
}

.order-item {
  background-color: #fff;
  padding: 30rpx;
  margin-bottom: 20rpx;
  border-radius: 8rpx;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15rpx;
}

.order-id {
  font-size: 28rpx;
  color: #333;
}

.order-status {
  font-size: 28rpx;
  color: #1890ff;
  font-weight: bold;
}

.order-info {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: #666;
}

.empty-state {
  text-align: center;
  padding: 100rpx 0;
  color: #999;
}
</style>


