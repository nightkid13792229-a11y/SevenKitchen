<template>
  <view class="order-detail">
    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 订单详情内容 -->
    <view v-else-if="order" class="detail-content">
      <!-- 顶部状态栏 -->
      <view class="status-header" :style="{ background: statusGradient }">
        <view class="status-info">
          <text class="status-text">{{ getStatusText(order.status) }}</text>
          <text class="order-id-text">订单 #{{ orderId.slice(-8) }}</text>
        </view>
      </view>

      <!-- 订单信息 -->
      <view class="section">
        <view class="section-title">📦 订单信息</view>
        <view class="info-list">
          <view class="info-item">
            <text class="info-label">订单号</text>
            <text class="info-value">{{ order.id }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">订单状态</text>
            <text class="info-value" :style="{ color: getStatusColor(order.status) }">
              {{ getStatusText(order.status) }}
            </text>
          </view>
          <view class="info-item">
            <text class="info-label">创建时间</text>
            <text class="info-value">{{ formatDateTime(order.createdAt) }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">支付方式</text>
            <text class="info-value">{{ getPaymentMethod(order.paymentMethod) }}</text>
          </view>
        </view>
      </view>

      <!-- 客户信息 -->
      <view class="section" v-if="order.customerName">
        <view class="section-title">👤 客户信息</view>
        <view class="info-list">
          <view class="info-item">
            <text class="info-label">姓名</text>
            <text class="info-value">{{ order.customerName }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">手机</text>
            <text class="info-value">{{ order.customerPhone }}</text>
            <text class="action-link" @tap="copyPhone">复制</text>
          </view>
        </view>
      </view>

      <!-- 狗狗信息 -->
      <view class="section" v-if="order.firstItem && order.firstItem.dog">
        <view class="section-title">🐕 狗狗信息</view>
        <view class="info-list">
          <view class="info-item">
            <text class="info-label">名称</text>
            <text class="info-value">{{ order.firstItem.dog.name }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">品种</text>
            <text class="info-value">{{ order.firstItem.dog.breedName || '未知' }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">体重</text>
            <text class="info-value">{{ order.firstItem.dog.weightKg }}kg</text>
          </view>
          <view class="info-item">
            <text class="info-label">每日餐数</text>
            <text class="info-value">{{ order.firstItem.dog.mealsPerDay }}餐</text>
          </view>
        </view>
      </view>

      <!-- 商品详情 -->
      <view class="section" v-if="order.firstItem">
        <view class="section-title">🍽️ 商品详情</view>
        <view class="product-card">
          <image
            v-if="order.firstItem.recipeSnapshot && order.firstItem.recipeSnapshot.coverImageUrl"
            class="product-cover"
            :src="order.firstItem.recipeSnapshot.coverImageUrl"
            mode="aspectFill"
          />
          <view class="product-info">
            <text class="product-name">{{ order.firstItem.recipeSnapshot?.name || '自定义食谱' }}</text>
            <view class="product-specs">
              <text class="spec-item">包装规格: {{ order.firstItem.packageSpecG }}g/餐</text>
              <text class="spec-item">数量: {{ order.firstItem.packageCount }}餐</text>
              <text class="spec-item" v-if="order.firstItem.dailyIntakeG">
                每日摄入: {{ order.firstItem.dailyIntakeG }}g
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- 收货地址 -->
      <view class="section" v-if="order.address">
        <view class="section-title">📍 收货地址</view>
        <view class="address-card">
          <view class="address-header">
            <text class="recipient-name">{{ order.address.recipientName }}</text>
            <text class="recipient-phone">{{ formatPhone(order.address.recipientPhone || '') }}</text>
          </view>
          <text class="address-text">{{ order.address.regionText }} {{ order.address.detailAddress }}</text>
        </view>
      </view>

      <!-- 费用明细 -->
      <view class="section">
        <view class="section-title">💰 费用明细</view>
        <view class="fee-list">
          <view class="fee-item">
            <text class="fee-label">商品费用</text>
            <text class="fee-value">¥{{ formatAmount(order.totalAmount || order.amountTotal) }}</text>
          </view>
          <view class="fee-item">
            <text class="fee-label">运费</text>
            <text class="fee-value">¥0</text>
          </view>
          <view class="fee-item total">
            <text class="fee-label">总计</text>
            <text class="fee-value">¥{{ formatAmount(order.totalAmount || order.amountTotal) }}</text>
          </view>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="action-section">
        <button
          v-if="canConfirmPayment"
          class="action-btn primary"
          @tap="confirmPayment"
        >
          确认收款
        </button>
        <button
          v-if="canStartProduction"
          class="action-btn orange"
          @tap="startProduction"
        >
          开始制作
        </button>
        <button
          v-if="canShip"
          class="action-btn cyan"
          @tap="shipOrder"
        >
          发货
        </button>
        <button
          v-if="canComplete"
          class="action-btn green"
          @tap="completeOrder"
        >
          完成订单
        </button>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-state">
      <text class="error-icon">❌</text>
      <text class="error-text">订单加载失败</text>
      <button class="retry-btn" @tap="loadOrderDetail">重试</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request } from '../../utils/api'
import { confirmOfflinePayment } from '../../api/orders'
import { formatShortDateTime } from '../../utils/date'

// 获取页面参数
const orderId = ref('')

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  orderId.value = options.id || ''
  if (orderId.value) {
    loadOrderDetail()
  }
})

interface OrderDetail {
  id: string
  status: string
  totalAmount?: number
  amountTotal?: number
  createdAt?: string
  paymentMethod?: string
  customerName?: string
  customerPhone?: string
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
    recipientPhone?: string
    regionText: string
    detailAddress: string
  }
}

const order = ref<OrderDetail | null>(null)
const loading = ref(false)

// 计算状态渐变色
const statusGradient = computed(() => {
  if (!order.value) return '#999'
  const colorMap: Record<string, string> = {
    PENDING_PAYMENT: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
    PAID: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
    PURCHASING: 'linear-gradient(135deg, #faad14 0%, #d48806 100%)',
    IN_PRODUCTION: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
    FREEZING: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
    SHIPPED: 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)',
    COMPLETED: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
    CANCELLED: 'linear-gradient(135deg, #999 0%, #666 100%)',
    AFTERSALE: 'linear-gradient(135deg, #f5222d 0%, #cf1322 100%)'
  }
  return colorMap[order.value.status] || '#999'
})

// 操作权限判断
const canConfirmPayment = computed(() => {
  return order.value && order.value.status === 'PENDING_PAYMENT'
})

const canStartProduction = computed(() => {
  return order.value && (order.value.status === 'PAID' || order.value.status === 'PURCHASING')
})

const canShip = computed(() => {
  return order.value && order.value.status === 'FREEZING'
})

const canComplete = computed(() => {
  return order.value && order.value.status === 'SHIPPED'
})

// 加载订单详情
async function loadOrderDetail() {
  if (!orderId.value) return

  loading.value = true
  uni.showLoading({ title: '加载中...' })

  try {
    const response = await request({
      url: `/admin/orders/${orderId.value}`,
      method: 'GET'
    })

    if (response.code === 0 && response.data) {
      order.value = response.data
    }
  } catch (error: any) {
    console.error('[OrderDetail] Load error:', error)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  } finally {
    loading.value = false
    uni.hideLoading()
  }
}

// 格式化函数
function formatAmount(amount?: number): string {
  if (!amount) return '0.00'
  return amount.toFixed(2)
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '--'
  return formatShortDateTime(dateStr)
}

function formatPhone(phone: string): string {
  if (phone.length !== 11) return phone
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    INIT: '待确认',
    PENDING_PAYMENT: '待付款',
    PAID: '已支付',
    PURCHASING: '采购中',
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
  const colorMap: Record<string, string> = {
    INIT: '#999',
    PENDING_PAYMENT: '#ff9800',
    PAID: '#52c41a',
    PURCHASING: '#faad14',
    IN_PRODUCTION: '#1890ff',
    FREEZING: '#722ed1',
    SHIPPED: '#13c2c2',
    COMPLETED: '#52c41a',
    CANCELLED: '#999',
    AFTERSALE: '#f5222d'
  }
  return colorMap[status] || '#999'
}

function getPaymentMethod(method?: string): string {
  const methodMap: Record<string, string> = {
    WECHAT: '微信支付',
    ALIPAY: '支付宝',
    OFFLINE: '线下支付'
  }
  return method ? (methodMap[method] || method) : '未支付'
}

// 操作
function copyPhone() {
  if (!order.value || !order.value.customerPhone) return
  uni.setClipboardData({
    data: order.value.customerPhone,
    success: () => {
      uni.showToast({
        title: '已复制',
        icon: 'success'
      })
    }
  })
}

async function confirmPayment() {
  if (!order.value) return

  uni.showModal({
    title: '确认收款',
    content: `确认收到订单 #${order.value.id.slice(-8)} 的款项？`,
    success: async (res) => {
      if (res.confirm) {
        try {
          await confirmOfflinePayment(order.value.id, order.value.totalAmount || order.value.amountTotal || 0)
          uni.showToast({
            title: '收款成功',
            icon: 'success'
          })
          loadOrderDetail()
        } catch (error) {
          console.error('[OrderDetail] Confirm payment error:', error)
        }
      }
    }
  })
}

async function startProduction() {
  if (!order.value) return

  uni.showModal({
    title: '开始制作',
    content: '确认开始制作此订单？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await request({
            url: `/admin/orders/${order.value.id}/start-production`,
            method: 'POST'
          })
          uni.showToast({
            title: '已开始制作',
            icon: 'success'
          })
          loadOrderDetail()
        } catch (error) {
          console.error('[OrderDetail] Start production error:', error)
        }
      }
    }
  })
}

async function shipOrder() {
  uni.showToast({
    title: '请在电脑端操作发货',
    icon: 'none'
  })
}

async function completeOrder() {
  if (!order.value) return

  uni.showModal({
    title: '完成订单',
    content: '确认完成此订单？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await request({
            url: `/admin/orders/${order.value.id}/complete`,
            method: 'POST'
          })
          uni.showToast({
            title: '订单已完成',
            icon: 'success'
          })
          loadOrderDetail()
        } catch (error) {
          console.error('[OrderDetail] Complete order error:', error)
        }
      }
    }
  })
}
</script>

<style scoped lang="scss">
.order-detail {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 40rpx;
}

// 加载和错误状态
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}

.loading-text,
.error-text {
  font-size: 28rpx;
  color: #999;
  margin-top: 24rpx;
}

.error-icon {
  font-size: 120rpx;
}

.retry-btn {
  margin-top: 32rpx;
  padding: 16rpx 48rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 8rpx;
  font-size: 28rpx;
}

// 详情内容
.detail-content {
  padding-bottom: 40rpx;
}

// 状态头部
.status-header {
  padding: 48rpx 32rpx;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.status-text {
  font-size: 48rpx;
  font-weight: bold;
  color: #fff;
}

.order-id-text {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.9);
}

// 通用区块
.section {
  background-color: #fff;
  margin: 24rpx 32rpx;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 24rpx;
}

// 信息列表
.info-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: 28rpx;
  color: #666;
}

.info-value {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.action-link {
  margin-left: 16rpx;
  font-size: 24rpx;
  color: #1890ff;
}

// 商品卡片
.product-card {
  display: flex;
  gap: 24rpx;
}

.product-cover {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
}

.product-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.product-name {
  font-size: 30rpx;
  font-weight: 500;
  color: #333;
}

.product-specs {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.spec-item {
  font-size: 26rpx;
  color: #666;
}

// 地址卡片
.address-card {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.address-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.recipient-name {
  font-size: 30rpx;
  font-weight: 500;
  color: #333;
}

.recipient-phone {
  font-size: 26rpx;
  color: #666;
}

.address-text {
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
}

// 费用列表
.fee-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.fee-item {
  display: flex;
  justify-content: space-between;
  align-items: center;

  &.total {
    padding-top: 16rpx;
    border-top: 2rpx solid #f0f0f0;
  }
}

.fee-label {
  font-size: 28rpx;
  color: #666;
}

.fee-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;

  .fee-item.total & {
    font-size: 36rpx;
    color: #ff4d4f;
  }
}

// 操作区块
.action-section {
  background-color: #fff;
  margin: 24rpx 32rpx;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.action-btn {
  width: 100%;
  height: 80rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;

  &.primary {
    background-color: #1890ff;
    color: #fff;
  }

  &.orange {
    background-color: #faad14;
    color: #fff;
  }

  &.cyan {
    background-color: #13c2c2;
    color: #fff;
  }

  &.green {
    background-color: #52c41a;
    color: #fff;
  }

  &::after {
    border: none;
  }
}
</style>
