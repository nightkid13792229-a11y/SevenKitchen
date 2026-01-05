<template>
  <view class="order-detail-page">
    <view v-if="order" class="order-detail">
      <!-- 订单类型标签 -->
      <view class="order-type-tag">💳 鲜食制作订单</view>

      <!-- 订单进度条 -->
      <view class="progress-section">
        <OrderProgressBar :status="order.status" />
      </view>

      <!-- 订单基本信息 -->
      <view class="section info-section">
        <view class="section-title">订单信息</view>
        <view class="info-row">
          <text class="label">订单编号:</text>
          <text class="value order-id">{{ formatOrderId(order.id) }}</text>
          <button class="btn-copy" @tap="copyOrderId">复制</button>
        </view>
        <view class="info-row">
          <text class="label">订单状态:</text>
          <text class="value status" :style="{ color: getStatusColor(order.status) }">
            {{ getStatusIcon(order.status) }} {{ getStatusText(order.status) }}
          </text>
        </view>
        <view class="info-row">
          <text class="label">下单时间:</text>
          <text class="value">{{ formatTime(order.createdAt) }}</text>
        </view>
        <view class="info-row">
          <text class="label">订单金额:</text>
          <text class="value amount">¥{{ formatAmount(order.amountTotal || order.totalAmount) }}</text>
        </view>
      </view>

      <!-- 收货信息 -->
      <view class="section address-section" v-if="order.address">
        <view class="section-title">📍 收货信息</view>
        <view class="address-card">
          <view class="address-info">
            <text class="recipient">{{ order.address.recipientName }} {{ order.address.phone }}</text>
            <text class="detail">{{ order.address.regionText }} {{ order.address.detailAddress }}</text>
          </view>
        </view>
      </view>

      <!-- 商品明细 -->
      <view class="section items-section">
        <view class="section-title">📦 商品明细</view>

        <!-- 按狗狗分组 -->
        <view
          v-for="group in groupedItems"
          :key="group.dogId"
          class="dog-group"
        >
          <view class="dog-header">
            <text class="dog-icon">🐶</text>
            <text class="dog-name">{{ group.dogName }}</text>
            <text class="dog-detail">{{ group.dogBreedName }} | {{ group.dogWeightKg }}kg</text>
          </view>

          <view
            v-for="item in group.items"
            :key="item.id"
            class="order-item-card"
          >
            <view class="item-header">
              <text class="recipe-name">{{ item.recipeSnapshot?.name }}</text>
              <text class="recipe-version">v{{ item.recipeSnapshot?.version }}</text>
            </view>

            <view class="item-info">
              <text class="info-row-text">订阅周期: {{ item.cycleDays }}天</text>
              <text class="info-row-text">每日喂食: {{ item.dailyIntakeG }}g/天</text>
              <text class="info-row-text">总重量: {{ item.quantityG }}g</text>
            </view>

            <!-- 分装方案（重点展示）-->
            <view class="package-info highlight">
              <view class="package-row">
                <text class="package-label">分装方案:</text>
                <text class="package-value">{{ item.packageCount }}包 × {{ item.packageSpecG }}g</text>
              </view>
              <view class="package-row">
                <text class="package-label">单包价格:</text>
                <text class="package-price">¥{{ calculateUnitPrice(item).toFixed(2) }}/包</text>
              </view>
            </view>

            <button class="btn-view-snapshot" @tap="viewSnapshot(item.id)">
              查看配方快照 →
            </button>
          </view>
        </view>
      </view>

      <!-- 价格汇总（简化版）-->
      <view class="section price-section">
        <view class="section-title">💰 价格汇总</view>
        <view class="price-summary">
          <view class="summary-row">
            <text class="label">商品金额（{{ order.items?.length || 0 }}件）:</text>
            <text class="value">¥{{ formatAmount(order.amountProduct || 0) }}</text>
          </view>
          <view class="summary-row">
            <text class="label">运费:</text>
            <text class="value">¥{{ formatAmount(order.amountShipping || 0) }}</text>
          </view>
          <view class="summary-row total">
            <text class="label">订单金额:</text>
            <text class="value highlight">¥{{ formatAmount(order.amountTotal || order.totalAmount) }}</text>
          </view>
        </view>
      </view>

      <!-- 支付信息 -->
      <view class="section payment-section" v-if="order.paidAt">
        <view class="section-title">💳 支付信息</view>
        <view class="info-row">
          <text class="label">支付方式:</text>
          <text class="value">{{ getPaymentMethodText(order.paymentMethod) }}</text>
        </view>
        <view class="info-row" v-if="order.transactionId">
          <text class="label">交易单号:</text>
          <text class="value transaction-id">{{ order.transactionId }}</text>
          <button class="btn-copy" @tap="copyTransactionId">复制</button>
        </view>
        <view class="info-row">
          <text class="label">支付时间:</text>
          <text class="value">{{ formatTime(order.paidAt) }}</text>
        </view>
      </view>

      <!-- 物流信息（仅在SHIPPED状态显示）-->
      <view class="section shipping-section" v-if="order.status === 'SHIPPED' && order.trackingNumber">
        <view class="section-title">🚚 物流信息</view>
        <view class="info-row">
          <text class="label">快递公司:</text>
          <text class="value">{{ getCarrierName(order.carrierCode) }}</text>
        </view>
        <view class="info-row">
          <text class="label">运单号:</text>
          <text class="value tracking-number">{{ order.trackingNumber }}</text>
          <button class="btn-copy" @tap="copyTrackingNumber">复制</button>
        </view>
        <view class="info-row" v-if="order.shippedAt">
          <text class="label">发货时间:</text>
          <text class="value">{{ formatTime(order.shippedAt) }}</text>
        </view>
      </view>
    </view>

    <!-- 底部操作按钮 -->
    <view class="bottom-actions" v-if="order">
      <!-- 待付款状态 -->
      <view v-if="order.status === 'PENDING_PAYMENT'" class="action-buttons">
        <button class="btn-action btn-cancel" @tap="cancelOrder">取消订单</button>
        <button class="btn-action btn-primary" @tap="payOrder">立即付款</button>
      </view>

      <!-- 待付款之后的已付款状态 -->
      <view v-else-if="order.status === 'PAID' || order.status === 'WAITING_FOR_PRODUCTION' || order.status === 'IN_PRODUCTION'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="contactService">联系客服</button>
      </view>

      <!-- 已发货状态 -->
      <view v-else-if="order.status === 'SHIPPED'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="viewLogistics">查看物流</button>
        <button class="btn-action btn-primary" @tap="confirmReceived">确认收货</button>
      </view>

      <!-- 已完成状态 -->
      <view v-else-if="order.status === 'COMPLETED'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="buyAgain">再次购买</button>
        <button class="btn-action btn-primary" @tap="writeReview">评价</button>
      </view>

      <!-- 已取消状态 -->
      <view v-else-if="order.status === 'CANCELLED'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="buyAgain">再次购买</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request } from '../../utils/api'
import OrderProgressBar from '../../components/OrderProgressBar.vue'

interface OrderItem {
  id: string
  dogId?: string
  dogName?: string
  dogBreedName?: string
  dogWeightKg?: number
  recipeSnapshot?: {
    name: string
    version: number
  }
  cycleDays?: number
  dailyIntakeG?: number
  quantityG: number
  packageCount: number
  packageSpecG: number
  totalPrice?: number
}

interface Order {
  id: string
  type: string
  status: string
  createdAt: string
  amountTotal?: number
  totalAmount?: number
  amountProduct?: number
  amountShipping?: number
  items?: OrderItem[]
  address?: {
    recipientName: string
    phone: string
    regionText: string
    detailAddress: string
  }
  trackingNumber?: string
  carrierCode?: string
  shippedAt?: string
  paymentMethod?: string
  transactionId?: string
  paidAt?: string
}

const order = ref<Order | null>(null)
const orderId = ref('')

// 按狗狗分组
const groupedItems = computed(() => {
  if (!order.value?.items) return []

  const groups = new Map()

  order.value.items.forEach((item: any) => {
    const dogId = item.dogId || 'unknown'
    if (!groups.has(dogId)) {
      groups.set(dogId, {
        dogId,
        dogName: item.dog?.name || item.dogName || '未知狗狗',
        dogBreedName: item.dog?.breedName || item.dogBreedName || '',
        dogWeightKg: item.dog?.weightKg || item.dogWeightKg || 0,
        items: []
      })
    }
    groups.get(dogId).items.push(item)
  })

  return Array.from(groups.values())
})

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  orderId.value = currentPage.options?.id || currentPage.options?.orderId || ''

  if (orderId.value) {
    loadOrderDetail()
  }
})

async function loadOrderDetail() {
  try {
    uni.showLoading({ title: '加载中...' })

    const res = await request({
      url: `/orders/${orderId.value}`,
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      order.value = res.data
    }
  } catch (error) {
    console.error('Load order detail error:', error)
  } finally {
    uni.hideLoading()
  }
}

function formatOrderId(id: string): string {
  return id.substring(0, 8) + '...'
}

function formatTime(timeStr?: string): string {
  if (!timeStr) return '-'
  const date = new Date(timeStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatAmount(amount?: number): string {
  if (!amount) return '0.00'
  return amount.toFixed(2)
}

function calculateUnitPrice(item: OrderItem): number {
  if (!item.packageCount || item.packageCount === 0) return 0
  return (item.totalPrice || 0) / item.packageCount
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

function getPaymentMethodText(method?: string): string {
  const methodMap: Record<string, string> = {
    WECHAT: '微信支付',
    ALIPAY: '支付宝'
  }
  return methodMap[method || ''] || method || '-'
}

function getCarrierName(code?: string): string {
  const carrierMap: Record<string, string> = {
    SF: '顺丰速运',
    STO: '申通快递',
    YTO: '圆通速递',
    ZTO: '中通快递',
    EMS: 'EMS'
  }
  return carrierMap[code || ''] || code || '-'
}

function copyOrderId() {
  uni.setClipboardData({
    data: order.value?.id || '',
    success: () => {
      uni.showToast({ title: '订单号已复制', icon: 'success' })
    }
  })
}

function copyTransactionId() {
  uni.setClipboardData({
    data: order.value?.transactionId || '',
    success: () => {
      uni.showToast({ title: '交易单号已复制', icon: 'success' })
    }
  })
}

function copyTrackingNumber() {
  uni.setClipboardData({
    data: order.value?.trackingNumber || '',
    success: () => {
      uni.showToast({ title: '运单号已复制', icon: 'success' })
    }
  })
}

function viewSnapshot(itemId: string) {
  uni.navigateTo({
    url: `/pages/snapshot/index?itemId=${itemId}`
  })
}

// 取消订单
async function cancelOrder() {
  uni.showModal({
    title: '确认取消',
    content: '确定要取消这个订单吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          uni.showLoading({ title: '取消中...' })
          const result = await request({
            url: `/orders/${orderId.value}/cancel`,
            method: 'POST'
          })
          if (result.code === 0) {
            uni.showToast({
              title: '订单已取消',
              icon: 'success'
            })
            // 重新加载订单详情
            loadOrderDetail()
          }
        } catch (error) {
          uni.showToast({
            title: '取消失败',
            icon: 'none'
          })
        } finally {
          uni.hideLoading()
        }
      }
    }
  })
}

// 立即付款
function payOrder() {
  uni.showToast({
    title: '跳转支付...',
    icon: 'none'
  })
  // TODO: 调用支付API
}

// 联系客服
function contactService() {
  uni.showModal({
    title: '联系客服',
    content: '客服电话：400-123-4567\n工作时间：9:00-18:00',
    showCancel: false
  })
}

// 查看物流
function viewLogistics() {
  uni.showToast({
    title: '查看物流...',
    icon: 'none'
  })
  // TODO: 跳转到物流详情页
}

// 确认收货
async function confirmReceived() {
  uni.showModal({
    title: '确认收货',
    content: '确认已收到商品吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          uni.showLoading({ title: '确认中...' })
          const result = await request({
            url: `/orders/${orderId.value}/confirm`,
            method: 'POST'
          })
          if (result.code === 0) {
            uni.showToast({
              title: '已确认收货',
              icon: 'success'
            })
            loadOrderDetail()
          }
        } catch (error) {
          uni.showToast({
            title: '确认失败',
            icon: 'none'
          })
        } finally {
          uni.hideLoading()
        }
      }
    }
  })
}

// 再次购买
function buyAgain() {
  uni.showToast({
    title: '跳转到订购页...',
    icon: 'none'
  })
  // TODO: 将订单商品加入购物车，跳转到订购页
}

// 评价
function writeReview() {
  uni.showToast({
    title: '评价功能开发中...',
    icon: 'none'
  })
  // TODO: 跳转到评价页
}
</script>

<style scoped>
.order-detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
}

.order-detail {
  padding: 20rpx;
}

/* 底部操作按钮 */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 16rpx 20rpx;
  border-top: 1rpx solid #e5e5e5;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.06);
  z-index: 100;
}

.action-buttons {
  display: flex;
  gap: 16rpx;
}

.btn-action {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
  text-align: center;
}

.btn-cancel {
  background-color: #fff;
  color: #999;
  border: 1rpx solid #ddd;
}

.btn-primary {
  background-color: #1890ff;
  color: #fff;
}

.btn-secondary {
  background-color: #fff;
  color: #1890ff;
  border: 1rpx solid #1890ff;
}

.order-type-tag {
  font-size: 26rpx;
  color: #1890ff;
  margin-bottom: 20rpx;
  padding: 10rpx 20rpx;
  background-color: #fff;
  border-radius: 8rpx;
  display: inline-block;
  text-align: center;
}

.progress-section {
  background-color: #fff;
  border-radius: 16rpx;
  margin-bottom: 20rpx;
  overflow: hidden;
}

.section {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.info-section {
  margin-bottom: 20rpx;
}

.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
  font-size: 28rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  color: #666;
  margin-right: 20rpx;
  min-width: 150rpx;
}

.value {
  color: #333;
  flex: 1;
}

.order-id {
  font-family: monospace;
  font-size: 26rpx;
}

.status {
  font-weight: 500;
}

.amount {
  font-size: 32rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.btn-copy {
  padding: 8rpx 20rpx;
  background-color: #f0f0f0;
  color: #333;
  border-radius: 6rpx;
  font-size: 24rpx;
  border: none;
}

/* 收货信息 */
.address-card {
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.address-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.recipient {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.detail {
  font-size: 26rpx;
  color: #666;
}

/* 商品明细 */
.dog-group {
  margin-bottom: 24rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.dog-group:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.dog-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.dog-icon {
  font-size: 28rpx;
}

.dog-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.dog-detail {
  font-size: 24rpx;
  color: #999;
}

.order-item-card {
  background-color: #f9f9f9;
  border-radius: 12rpx;
  padding: 20rpx;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid #e8e8e8;
}

.recipe-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
}

.recipe-version {
  font-size: 22rpx;
  color: #999;
  padding: 4rpx 10rpx;
  background-color: #fff;
  border-radius: 4rpx;
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 16rpx;
}

.info-row-text {
  font-size: 26rpx;
  color: #666;
}

.package-info {
  padding: 16rpx;
  background-color: #fff7e6;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
  border-left: 3rpx solid #ff9800;
}

.package-info.highlight {
  border-left-color: #ff9800;
}

.package-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.package-row:last-child {
  margin-bottom: 0;
}

.package-label {
  font-size: 26rpx;
  color: #666;
}

.package-value {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
}

.package-price {
  font-size: 30rpx;
  color: #ff9800;
  font-weight: bold;
}

.btn-view-snapshot {
  width: 100%;
  padding: 16rpx;
  background-color: #fff;
  border: 1rpx solid #1890ff;
  color: #1890ff;
  border-radius: 8rpx;
  font-size: 26rpx;
}

/* 价格汇总 */
.price-summary {
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16rpx;
  font-size: 28rpx;
}

.summary-row:last-child {
  margin-bottom: 0;
}

.summary-row.total {
  padding-top: 16rpx;
  font-size: 32rpx;
  font-weight: bold;
  border-top: 1rpx solid #e8e8e8;
}

.value.highlight {
  color: #ff4d4f;
  font-size: 36rpx;
}

/* 物流信息 */
.transaction-id,
.tracking-number {
  font-family: monospace;
  font-size: 24rpx;
  word-break: break-all;
}
</style>
