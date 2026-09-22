<template>
  <view class="page">
    <view v-if="loading && orders.length === 0" class="loading">
      <text class="loading-text">加载中…</text>
    </view>

    <!-- 空态：补上出口，否则用户到这一页就没有下一步可点 -->
    <view v-else-if="orders.length === 0" class="empty-state">
      <text class="empty-title">还没有补剂订单</text>
      <text class="empty-desc">补剂从 DIY 制作单购买。先在「我的制作单」里打开一份，再点「一键购买补剂」。</text>
      <button class="empty-action" @tap="goToDiySheetList">去我的制作单</button>
    </view>

    <template v-else>
      <view v-for="order in orders" :key="order.id" class="order-card">
        <view class="order-head">
          <text class="order-no">{{ order.orderNo }}</text>
          <text class="order-status" :class="statusClass(order.status)">
            {{ statusLabel(order.status) }}
          </text>
        </view>

        <view class="order-body">
          <view v-for="item in order.items" :key="item.id" class="item-row">
            <text class="item-name">{{ item.name }}</text>
            <text class="item-amount">{{ formatAmount(item.packedAmount) }}{{ item.unit }}</text>
            <text class="item-price">¥{{ item.price.toFixed(2) }}</text>
          </view>
        </view>

        <view v-if="order.trackingNumber" class="order-line">
          <text class="line-label">快递</text>
          <text class="line-value">{{ order.carrierCode || '' }} {{ order.trackingNumber }}</text>
        </view>

        <view v-if="order.aftersaleType" class="order-line">
          <text class="line-label">售后</text>
          <text class="line-value warn">
            {{ order.aftersaleType === 'REFUND' ? '退款' : '免费补发' }} · {{ order.aftersaleReason }}
          </text>
        </view>

        <view class="order-foot">
          <text class="order-time">{{ formatTime(order.createdAt) }}</text>
          <text class="order-total">
            共 {{ order.bagCount }} 袋 · 实付
            <text class="order-amount">¥{{ order.amountTotal.toFixed(2) }}</text>
          </text>
        </view>

        <view v-if="order.status === 'PENDING_PAYMENT'" class="order-actions">
          <button
            class="pay-btn"
            :disabled="payingId === order.id"
            @tap="handlePay(order)"
          >
            <text class="pay-btn-text">{{ payingId === order.id ? '支付中…' : '去支付' }}</text>
          </button>
        </view>
      </view>

      <view v-if="hasMore" class="load-more" @tap="loadMore">
        <text class="load-more-text">{{ loading ? '加载中…' : '加载更多' }}</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
import {
  fetchSupplementOrders,
  SUPPLEMENT_ORDER_STATUS_LABELS,
  type SupplementOrder
} from '../../api/supplements'
import { runSupplementPayment } from '../../utils/supplement-payment'

const orders = ref<SupplementOrder[]>([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)
const pageSize = 10

const hasMore = ref(false)
const payingId = ref('')

function statusLabel(status: string): string {
  return SUPPLEMENT_ORDER_STATUS_LABELS[status] || status
}

function statusClass(status: string): string {
  if (status === 'SHIPPED' || status === 'COMPLETED') return 'status-done'
  if (status === 'CANCELLED' || status === 'AFTERSALE') return 'status-muted'
  if (status === 'PENDING_PAYMENT') return 'status-pending'
  return 'status-progress'
}

/** 空态出口：去「我的制作单」挑一份制作单再买补剂 */
function goToDiySheetList() {
  uni.navigateTo({ url: '/pages/diy-sheet-list/index' })
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function formatTime(value: string): string {
  return value ? value.replace('T', ' ').slice(0, 16) : ''
}

async function loadOrders(reset = false) {
  if (loading.value) return
  loading.value = true

  try {
    const targetPage = reset ? 1 : page.value
    const res = await fetchSupplementOrders({ page: targetPage, pageSize })

    if (res.code !== 0) {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' })
      return
    }

    orders.value = reset ? res.data.items : [...orders.value, ...res.data.items]
    total.value = res.data.total
    page.value = targetPage
    hasMore.value = orders.value.length < total.value
  } catch (error) {
    console.error('[SupplementOrders] 加载失败:', error)
    uni.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function handlePay(order: SupplementOrder) {
  payingId.value = order.id
  try {
    const outcome = await runSupplementPayment(order.id)

    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' })
      await loadOrders(true)
      return
    }

    if (outcome === 'CANCELLED') {
      uni.showToast({ title: '已取消支付', icon: 'none' })
      return
    }

    if (outcome === 'MANUAL') {
      uni.showModal({
        title: '暂不能在线支付',
        content: '我们会尽快与你联系确认收款，订单已为你保留。',
        showCancel: false
      })
      return
    }

    uni.showToast({ title: '支付失败，请重试', icon: 'none' })
  } finally {
    payingId.value = ''
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return
  page.value += 1
  void loadOrders(false)
}

onShow(() => {
  void loadOrders(true)
})

onPullDownRefresh(() => {
  page.value = 1
  void loadOrders(true).finally(() => uni.stopPullDownRefresh())
})

onReachBottom(() => {
  loadMore()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding: 24rpx;
  box-sizing: border-box;
}

.loading {
  padding: 160rpx 0;
  display: flex;
  justify-content: center;
}

.loading-text {
  font-size: 26rpx;
  color: #909399;
}

.empty-state {
  padding: 200rpx 60rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-title {
  font-size: 32rpx;
  color: #303133;
  font-weight: 600;
}

.empty-desc {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #909399;
  text-align: center;
  line-height: 1.6;
}

/* 空态出口 */
.empty-action {
  margin-top: 40rpx;
  padding: 0 56rpx;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #ffffff;
  background-color: #1e3a2f;
  border-radius: 12rpx;
}

.empty-action::after {
  border: none;
}

.order-card {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.order-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #f2f3f5;
}

.order-no {
  font-size: 26rpx;
  color: #303133;
  font-weight: 600;
}

.order-status {
  font-size: 24rpx;
}

.status-pending {
  color: #e6a23c;
}

.status-progress {
  color: #4a90d9;
}

.status-done {
  color: #67c23a;
}

.status-muted {
  color: #909399;
}

.order-body {
  padding: 16rpx 0;
}

.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 0;
}

.item-name {
  flex: 1;
  font-size: 26rpx;
  color: #303133;
}

.item-amount {
  width: 180rpx;
  font-size: 24rpx;
  color: #606266;
  text-align: right;
}

.item-price {
  width: 140rpx;
  font-size: 24rpx;
  color: #e6641e;
  text-align: right;
}

.order-line {
  display: flex;
  padding: 8rpx 0;
}

.line-label {
  width: 80rpx;
  font-size: 24rpx;
  color: #909399;
}

.line-value {
  flex: 1;
  font-size: 24rpx;
  color: #303133;
}

.line-value.warn {
  color: #e6a23c;
}

.order-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16rpx;
  border-top: 1rpx solid #f2f3f5;
}

.order-time {
  font-size: 22rpx;
  color: #c0c4cc;
}

.order-total {
  font-size: 24rpx;
  color: #606266;
}

.order-amount {
  font-size: 30rpx;
  color: #e6641e;
  font-weight: 700;
}

.order-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 16rpx;
}

.pay-btn {
  min-width: 180rpx;
  height: 64rpx;
  line-height: 64rpx;
  border-radius: 32rpx;
  background-color: #4a90d9;
  padding: 0 32rpx;
  margin: 0;
}

.pay-btn::after {
  border: none;
}

.pay-btn-text {
  color: #ffffff;
  font-size: 26rpx;
}

.load-more {
  padding: 24rpx 0 60rpx;
  display: flex;
  justify-content: center;
}

.load-more-text {
  font-size: 26rpx;
  color: #4a90d9;
}
</style>
