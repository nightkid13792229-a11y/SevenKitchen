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
        <!-- 订单时间和状态 -->
        <view class="order-header">
          <text class="order-time">{{ formatShortDateTime(order.createdAt) }}</text>
          <text class="order-status" :style="{ color: getStatusColor(order.status) }">
            {{ getStatusText(order.status) }}
          </text>
        </view>

        <!-- 商品数量 -->
        <view class="order-summary">
          <text class="summary-text">{{ order.itemCount || 0 }}件商品</text>
        </view>

        <!-- 如果有详细商品信息，显示更多信息 -->
        <template v-if="order.firstItem">
          <!-- 狗狗信息 -->
          <view class="order-dogs">
            <text class="dogs-text">{{ formatDogInfo(order) }}</text>
          </view>

          <!-- 商品信息：食谱名称、总餐数、每餐重量 -->
          <view class="order-items">
            <view class="recipe-header">
              <image
                v-if="getRecipeCoverImage(order)"
                class="recipe-cover"
                :src="getRecipeCoverImage(order)"
                mode="aspectFill"
              />
              <text class="recipe-name">{{ getRecipeName(order) }}</text>
            </view>
            <view class="meal-info">
              <text class="meal-text">共{{ getTotalMeals(order) }}餐</text>
              <text class="meal-separator">·</text>
              <text class="meal-text">每餐{{ getMealWeight(order) }}g</text>
            </view>
          </view>

          <!-- 收货地址 -->
          <view class="order-address" v-if="order.address">
            <text class="address-text">{{ formatAddress(order.address) }}</text>
          </view>
        </template>

        <!-- 金额 -->
        <view class="order-amount">
          <text class="amount-label">订单金额:</text>
          <text class="amount-value">¥{{ formatAmount(order.totalAmount) }}</text>
        </view>

        <!-- 确认收款按钮（仅管理员可见且订单状态为待付款） -->
        <view
          v-if="order.status === 'PENDING_PAYMENT' && isAdminUser"
          class="order-actions"
        >
          <button
            class="confirm-payment-btn"
            @tap.stop="confirmPayment(order)"
          >
            确认收款
          </button>
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
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request, getToken } from '../../utils/api'
import { confirmOfflinePayment } from '../../api/orders'
import { formatShortDateTime } from '../../utils/date'

// DEBUG flag for development logging
const DEBUG = true

interface Order {
  id: string
  status: string
  totalAmount?: number
  itemCount?: number
  createdAt?: string
  firstItem?: {
    dog?: {
      name?: string
      breedName?: string
      weightKg?: number
      mealsPerDay?: number
    }
    recipeSnapshot?: {
      id: string
      name: string
      coverImageUrl?: string | null
    }
    packageCount: number
    packageSpecG: number
    dailyIntakeG?: number
  }
  address?: {
    recipientName: string
    regionText: string
    detailAddress: string
  }
}

// 状态筛选Tab
const selectedStatus = ref<string>('ALL')

const statusTabs = ref<Array<{label: string, value: string, count: number}>>([
  { label: '全部', value: 'ALL', count: 0 },
  { label: '待付款', value: 'PENDING_PAYMENT', count: 0 },
  { label: '已付款', value: 'PAID', count: 0 },
  { label: '等待生产', value: 'WAITING_FOR_PRODUCTION', count: 0 },
  { label: '生产中', value: 'IN_PRODUCTION', count: 0 },
  { label: '急冻中', value: 'FREEZING', count: 0 },
  { label: '已发货', value: 'SHIPPED', count: 0 },
  { label: '已完成', value: 'COMPLETED', count: 0 },
  { label: '售后中', value: 'AFTERSALE', count: 0 }
])

const allOrders = ref<Order[]>([])
const orders = ref<Order[]>([])

// 权限检查：只有管理员才能确认收款
const isAdminUser = computed(() => {
  const user = uni.getStorageSync('user')
  return user && user.role === 'ADMIN'
})

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
      console.log('[OrdersList] Orders Data:', JSON.stringify(res.data, null, 2))
      if (res.data && res.data.length > 0) {
        console.log('[OrdersList] First Order:', JSON.stringify(res.data[0], null, 2))
        console.log('[OrdersList] First Order Items:', res.data[0].items)
      }
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
// Phase 9: Simplified status counts aligned with e-commerce standards
// Phase 9.1: Added FREEZING and AFTERSALE status counts
function updateStatusCounts() {
  statusTabs.value[0].count = allOrders.value.length // 全部
  statusTabs.value[1].count = allOrders.value.filter(o => o.status === 'PENDING_PAYMENT').length
  statusTabs.value[2].count = allOrders.value.filter(o => o.status === 'PAID').length
  statusTabs.value[3].count = allOrders.value.filter(o => o.status === 'WAITING_FOR_PRODUCTION').length
  statusTabs.value[4].count = allOrders.value.filter(o => o.status === 'IN_PRODUCTION').length
  statusTabs.value[5].count = allOrders.value.filter(o => o.status === 'FREEZING').length
  statusTabs.value[6].count = allOrders.value.filter(o => o.status === 'SHIPPED').length
  statusTabs.value[7].count = allOrders.value.filter(o => o.status === 'COMPLETED').length
  statusTabs.value[8].count = allOrders.value.filter(o => o.status === 'AFTERSALE').length
}

// 根据选中状态筛选订单
// Phase 9: Simplified filter logic
function filterOrders() {
  if (selectedStatus.value === 'ALL') {
    orders.value = allOrders.value
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

function formatAmount(amount?: number): string {
  if (!amount) return '0.00'
  return amount.toFixed(2)
}

function getStatusText(status: string): string {
  // Phase 9: Simplified status text aligned with e-commerce standards
  // Phase 9.1: Added FREEZING and AFTERSALE status text
  const statusMap: Record<string, string> = {
    INIT: '待确认',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    WAITING_FOR_PRODUCTION: '等待生产',
    IN_PRODUCTION: '制作中',
    FREEZING: '急冻中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    AFTERSALE: '售后中'
  }
  return statusMap[status] || status
}

function getStatusColor(status: string): string {
  // Phase 9: Simplified status colors aligned with e-commerce standards
  // Phase 9.1: Added FREEZING and AFTERSALE status colors
  const colorMap: Record<string, string> = {
    INIT: '#999',
    PENDING_PAYMENT: '#ff9800',
    PAID: '#52c41a',
    WAITING_FOR_PRODUCTION: '#1890ff',
    IN_PRODUCTION: '#1890ff',
    FREEZING: '#722ed1',
    SHIPPED: '#52c41a',
    COMPLETED: '#52c41a',
    CANCELLED: '#999',
    AFTERSALE: '#f5222d'
  }
  return colorMap[status] || '#999'
}

function formatDogInfo(order: Order): string {
  if (!order.firstItem || !order.firstItem.dog) {
    return ''
  }

  const dog = order.firstItem.dog
  const dogName = dog.name || ''
  const breedName = dog.breedName || ''
  const weightKg = dog.weightKg || 0

  const parts = [dogName]
  if (breedName) parts.push(breedName)
  if (weightKg > 0) parts.push(`${weightKg}kg`)

  return parts.join(' · ')
}

function getRecipeName(order: Order): string {
  if (!order.firstItem || !order.firstItem.recipeSnapshot) {
    return ''
  }
  return order.firstItem.recipeSnapshot.name || ''
}

function getRecipeCoverImage(order: Order): string {
  if (!order.firstItem || !order.firstItem.recipeSnapshot) {
    return ''
  }
  return order.firstItem.recipeSnapshot.coverImageUrl || ''
}

function getTotalMeals(order: Order): number {
  if (!order.firstItem) {
    return 0
  }
  return order.firstItem.packageCount || 0
}

function getMealWeight(order: Order): number {
  if (!order.firstItem) {
    return 0
  }

  const firstItem = order.firstItem

  // ✅ 修复：直接返回用户配置的包装规格（每袋重量 = 每餐饭量）
  // 这是用户下单时确认并支付的数据，而不是系统推荐值
  return firstItem.packageSpecG || 0
}

function formatAddress(address?: { regionText?: string }): string {
  if (!address || !address.regionText) {
    return ''
  }

  // 只显示第一个地区（市级）
  const regions = address.regionText.split(/\s+/)
  return regions[0] || address.regionText
}

// 确认收款函数
async function confirmPayment(order: Order) {
  // 1. 显示确认对话框
  uni.showModal({
    title: '确认收款',
    content: `订单金额：¥${formatAmount(order.totalAmount)}\n请输入实际收款金额（如与订单金额一致可直接确定）`,
    editable: true, // 启用输入框
    placeholderText: '输入实际收款金额',
    success: async (res) => {
      if (res.confirm) {
        const actualAmount = res.content ? parseFloat(res.content) : order.totalAmount

        // 2. 验证输入金额
        if (isNaN(actualAmount) || actualAmount <= 0) {
          uni.showToast({
            title: '请输入有效的金额',
            icon: 'none',
          })
          return
        }

        // 3. 金额差异警告
        if (actualAmount !== order.totalAmount) {
          const diff = actualAmount - (order.totalAmount || 0)
          const diffText = diff > 0 ? `多收¥${diff.toFixed(2)}` : `少收¥${Math.abs(diff).toFixed(2)}`

          const confirmAgain = await showWarningDialog(diffText)
          if (!confirmAgain) return
        }

        // 4. 调用API确认收款
        await submitPaymentConfirmation(order.id, actualAmount)
      }
    },
  })
}

// 金额差异警告对话框
function showWarningDialog(diffText: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '金额差异提醒',
      content: `实际收款与订单金额不一致：\n${diffText}\n\n是否继续确认收款？`,
      confirmText: '继续',
      cancelText: '取消',
      success: (res) => {
        resolve(res.confirm)
      },
    })
  })
}

// 提交确认收款
async function submitPaymentConfirmation(orderId: string, actualAmount: number) {
  uni.showLoading({ title: '确认中...' })

  try {
    await confirmOfflinePayment(orderId, actualAmount)

    uni.hideLoading()

    uni.showToast({
      title: '收款确认成功',
      icon: 'success',
      duration: 2000,
    })

    // 刷新订单列表
    setTimeout(() => {
      loadOrders()
    }, 500)

  } catch (error: any) {
    uni.hideLoading()
    console.error('Confirm payment failed:', error)
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
  margin-bottom: 16rpx;
}

.dogs-text {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.order-summary {
  margin-bottom: 16rpx;
  padding: 12rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
}

.summary-text {
  font-size: 26rpx;
  color: #666;
}

.order-items {
  margin-bottom: 16rpx;
  padding-left: 12rpx;
}

.recipe-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 8rpx;
}

.recipe-cover {
  width: 80rpx;
  height: 80rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}

.recipe-name {
  flex: 1;
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.meal-info {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.meal-text {
  font-size: 26rpx;
  color: #666;
}

.meal-separator {
  font-size: 26rpx;
  color: #ccc;
}

.order-address {
  margin-bottom: 16rpx;
  padding-left: 12rpx;
}

.address-text {
  font-size: 26rpx;
  color: #666;
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

/* 确认收款按钮 */
.order-actions {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
}

.confirm-payment-btn {
  background-color: #1890ff;
  color: #fff;
  border-radius: 8rpx;
  padding: 16rpx 32rpx;
  font-size: 28rpx;
  border: none;
}

.confirm-payment-btn::after {
  border: none;
}
</style>


