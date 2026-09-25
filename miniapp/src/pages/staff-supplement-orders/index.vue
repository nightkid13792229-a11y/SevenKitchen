<template>
  <view class="staff-supplement-orders">
    <view class="header">
      <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
      <view class="nav-bar">
        <view class="back-btn" @tap="goBack">
          <text class="back-icon">←</text>
        </view>
        <text class="header-title">补剂订单</text>
        <view class="header-actions">
          <view class="search-btn" @tap="toggleSearch">
            <text class="search-icon">🔍</text>
          </view>
        </view>
      </view>
    </view>

    <view class="header-placeholder" :style="{ height: statusBarHeight + 88 + 'px' }"></view>

    <!-- 三段最需要人动手的数量，直接可点筛选 -->
    <view class="stats-card">
      <view class="stat-item" @tap="selectStatus('PENDING_PAYMENT')">
        <text class="stat-value stat-value--warn">{{ counts.PENDING_PAYMENT || 0 }}</text>
        <text class="stat-label">待确认收款</text>
      </view>
      <view class="stat-divider"></view>
      <view class="stat-item" @tap="selectStatus('PAID')">
        <text class="stat-value">{{ counts.PAID || 0 }}</text>
        <text class="stat-label">待分装</text>
      </view>
      <view class="stat-divider"></view>
      <view class="stat-item" @tap="selectStatus('PACKED')">
        <text class="stat-value">{{ counts.PACKED || 0 }}</text>
        <text class="stat-label">待发货</text>
      </view>
    </view>

    <view v-if="searchVisible" class="search-bar">
      <input
        class="search-input"
        v-model="keyword"
        placeholder="订单号 / 收件人 / 手机号"
        confirm-type="search"
        @confirm="applySearch"
      />
      <text class="search-cancel" @tap="applySearch">搜索</text>
    </view>

    <scroll-view class="filter-scroll" scroll-x>
      <view class="filter-row">
        <view
          v-for="option in statusOptions"
          :key="option.value"
          class="filter-chip"
          :class="{ 'filter-chip--active': status === option.value }"
          @tap="selectStatus(option.value)"
        >
          <text class="filter-chip-text">{{ option.label }}</text>
        </view>
      </view>
    </scroll-view>

    <view v-if="loading && orders.length === 0" class="state-block">
      <text class="state-text">加载中…</text>
    </view>

    <view v-else-if="orders.length === 0" class="state-block">
      <text class="state-text">{{ emptyText }}</text>
    </view>

    <view v-else class="order-list">
      <view
        v-for="order in orders"
        :key="order.id"
        class="order-card"
        @tap="goToDetail(order.id)"
      >
        <view class="card-head">
          <text class="order-no">{{ order.orderNo }}</text>
          <text class="status-tag" :class="statusClass(order.status)">
            {{ statusText(order.status) }}
          </text>
        </view>

        <view class="card-row">
          <text class="row-label">顾客</text>
          <text class="row-value">{{ order.receiverName || '—' }}</text>
        </view>
        <view class="card-row">
          <text class="row-label">补剂</text>
          <text class="row-value">
            {{ (order.items || []).length }} 种 · 共 {{ order.bagCount }} 袋<text
              v-if="order.portionMultiplier > 1"
              class="portion-tag"
            > · {{ order.portionMultiplier }} 份</text>
          </text>
        </view>
        <view class="card-row">
          <text class="row-label">下单</text>
          <text class="row-value">{{ formatTime(order.createdAt) }}</text>
        </view>

        <view class="card-foot">
          <text class="amount">¥{{ order.amountTotal.toFixed(2) }}</text>
          <text class="next-action">{{ nextActionText(order.status) }}</text>
        </view>
      </view>

      <view v-if="loadingMore" class="load-more">
        <text class="state-text">加载更多…</text>
      </view>
      <view v-else-if="!hasMore && orders.length > 0" class="load-more">
        <text class="state-text">没有更多了</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
import {
  staffSupplementOrderApi,
  type StaffSupplementOrder,
  type SupplementOrderStatus,
} from '../../api/staff-supplement-orders'

const statusBarHeight = ref(0)
const orders = ref<StaffSupplementOrder[]>([])
const counts = ref<Record<string, number>>({})
const loading = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const hasMore = computed(() => orders.value.length < total.value)

const status = ref('')
const keyword = ref('')
const searchVisible = ref(false)

/**
 * 工作台看的是**全部 8 个状态**，与顾客侧那 5 个不一样 ——
 * 分装中/已分装是生产环节，顾客不需要知道，但这里正需要。
 */
const statusOptions: Array<{ label: string; value: string }> = [
  { label: '全部', value: '' },
  { label: '待确认收款', value: 'PENDING_PAYMENT' },
  { label: '待分装', value: 'PAID' },
  { label: '分装中', value: 'PACKING' },
  { label: '待发货', value: 'PACKED' },
  { label: '已发货', value: 'SHIPPED' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '售后中', value: 'AFTERSALE' },
  { label: '已取消', value: 'CANCELLED' },
]

const STATUS_TEXT: Record<SupplementOrderStatus, string> = {
  PENDING_PAYMENT: '待确认收款',
  PAID: '待分装',
  PACKING: '分装中',
  PACKED: '待发货',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  AFTERSALE: '售后中',
}

function statusText(value: string) {
  return STATUS_TEXT[value as SupplementOrderStatus] || value
}

function statusClass(value: string) {
  if (value === 'PENDING_PAYMENT') return 'status-tag--warn'
  if (value === 'AFTERSALE' || value === 'CANCELLED') return 'status-tag--muted'
  if (value === 'SHIPPED' || value === 'COMPLETED') return 'status-tag--done'
  return 'status-tag--doing'
}

/** 每个状态下，下一步该做什么 —— 让人一眼知道点进去干什么 */
function nextActionText(value: string) {
  switch (value) {
    case 'PENDING_PAYMENT':
      return '下一步：确认收款'
    case 'PAID':
    case 'PACKING':
      return '下一步：分装并打标签'
    case 'PACKED':
      return '下一步：填单号发货'
    case 'SHIPPED':
      return '已发出，等待签收'
    case 'AFTERSALE':
      return '有售后待处理'
    default:
      return ''
  }
}

const emptyText = computed(() => {
  if (keyword.value) return `没有匹配「${keyword.value}」的补剂订单`
  if (status.value) return `没有${statusText(status.value)}的补剂订单`
  return '还没有补剂订单'
})

function formatTime(value: string) {
  if (!value) return '—'
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function fetchOrders(reset = false) {
  if (reset) {
    page.value = 1
    orders.value = []
  }
  if (loading.value || loadingMore.value) return

  if (page.value === 1) loading.value = true
  else loadingMore.value = true

  try {
    const res = await staffSupplementOrderApi.list({
      status: status.value || undefined,
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize,
    })
    if (res.code === 0 && res.data) {
      const items = res.data.items || []
      orders.value = page.value === 1 ? items : [...orders.value, ...items]
      total.value = res.data.total || 0
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' })
    }
  } catch (error) {
    console.error('[StaffSupplementOrders] 加载失败:', error)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function fetchCounts() {
  try {
    const res = await staffSupplementOrderApi.summary()
    if (res.code === 0 && res.data) counts.value = res.data
  } catch (error) {
    console.error('[StaffSupplementOrders] 汇总失败:', error)
  }
}

function selectStatus(value: string) {
  status.value = value
  void fetchOrders(true)
}

function toggleSearch() {
  searchVisible.value = !searchVisible.value
  if (!searchVisible.value && keyword.value) {
    keyword.value = ''
    void fetchOrders(true)
  }
}

function applySearch() {
  void fetchOrders(true)
}

function goToDetail(orderId: string) {
  uni.navigateTo({ url: `/pages/staff-supplement-orders/detail?id=${orderId}` })
}

function goBack() {
  uni.navigateBack()
}

onLoad(() => {
  const info = uni.getSystemInfoSync()
  statusBarHeight.value = info.statusBarHeight || 0
})

onShow(() => {
  void fetchOrders(true)
  void fetchCounts()
})

onPullDownRefresh(async () => {
  await Promise.all([fetchOrders(true), fetchCounts()])
  uni.stopPullDownRefresh()
})

onReachBottom(() => {
  if (!hasMore.value || loading.value || loadingMore.value) return
  page.value += 1
  void fetchOrders()
})
</script>

<style lang="scss" scoped>
.staff-supplement-orders {
  min-height: 100vh;
  background-color: #f7f8f2;
  padding-bottom: 40rpx;
}

.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background-color: #1e3a2f;
}

.nav-bar {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 24rpx;
}

.back-btn {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-icon {
  font-size: 40rpx;
  color: #fbfcf7;
}

.header-title {
  flex: 1;
  text-align: center;
  font-size: 34rpx;
  font-weight: 600;
  color: #fbfcf7;
}

.header-actions {
  width: 60rpx;
  display: flex;
  justify-content: flex-end;
}

.search-icon {
  font-size: 34rpx;
}

.header-placeholder {
  width: 100%;
}

.stats-card {
  display: flex;
  align-items: center;
  margin: 24rpx;
  padding: 28rpx 0;
  border-radius: 16rpx;
  background-color: #ffffff;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 40rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.stat-value--warn {
  color: #a97c33;
}

.stat-label {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #968f6d;
}

.stat-divider {
  width: 1rpx;
  height: 56rpx;
  background-color: #e5e8d4;
}

.search-bar {
  display: flex;
  align-items: center;
  margin: 0 24rpx 16rpx;
  padding: 0 20rpx;
  height: 76rpx;
  border-radius: 12rpx;
  background-color: #ffffff;
}

.search-input {
  flex: 1;
  font-size: 28rpx;
  color: #26261f;
}

.search-cancel {
  font-size: 28rpx;
  color: #2b5040;
}

.filter-scroll {
  white-space: nowrap;
  padding: 0 24rpx 8rpx;
}

.filter-row {
  display: inline-flex;
  align-items: center;
}

.filter-chip {
  padding: 10rpx 24rpx;
  margin-right: 16rpx;
  border-radius: 999rpx;
  background-color: #ffffff;
  border: 1rpx solid #e5e8d4;
}

.filter-chip--active {
  background-color: #1e3a2f;
  border-color: #1e3a2f;
}

.filter-chip-text {
  font-size: 26rpx;
  color: #6b6653;
}

.filter-chip--active .filter-chip-text {
  color: #fbfcf7;
}

.state-block {
  padding: 120rpx 40rpx;
  text-align: center;
}

.state-text {
  font-size: 26rpx;
  color: #968f6d;
}

.order-list {
  padding: 8rpx 24rpx 0;
}

.order-card {
  margin-bottom: 20rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background-color: #ffffff;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.order-no {
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

.status-tag {
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
}

.status-tag--warn {
  background-color: #fdf4e3;
  color: #a97c33;
}

.status-tag--doing {
  background-color: #eef3ea;
  color: #2b5040;
}

.status-tag--done {
  background-color: #f2f4ea;
  color: #6b6653;
}

.status-tag--muted {
  background-color: #f2f4ea;
  color: #968f6d;
}

.card-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 10rpx;
}

.row-label {
  width: 90rpx;
  font-size: 26rpx;
  color: #968f6d;
}

.row-value {
  flex: 1;
  font-size: 26rpx;
  color: #26261f;
}

.portion-tag {
  color: #a97c33;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #f2f4ea;
}

.amount {
  font-size: 32rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.next-action {
  font-size: 24rpx;
  color: #a97c33;
}

.load-more {
  padding: 24rpx 0 40rpx;
  text-align: center;
}
</style>
