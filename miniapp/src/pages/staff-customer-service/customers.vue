<template>
  <view class="staff-customer-page">
    <view class="search-panel">
      <text class="page-title">客户与狗狗</text>
      <view class="search-row">
        <input
          class="search-input"
          v-model="keyword"
          placeholder="手机号、昵称、狗狗名或订单号"
          confirm-type="search"
          @confirm="searchCustomers"
        />
        <button class="search-btn" :disabled="loading" @tap="searchCustomers">搜索</button>
      </view>
    </view>

    <view v-if="loading" class="state-card">正在搜索...</view>
    <view v-else-if="searched && customers.length === 0" class="state-card">
      <text class="state-title">没有找到匹配客户</text>
      <text class="state-copy">可以换手机号后四位、狗狗名字或订单号再试。</text>
    </view>

    <view v-for="customer in customers" :key="customer.id" class="customer-card">
      <view class="customer-head">
        <view>
          <text class="customer-name">{{ customer.nickname || customer.phone || customer.id }}</text>
          <text class="customer-meta">{{ customer.phone || '未绑定手机号' }}</text>
        </view>
        <text class="dog-count">{{ customer.dogs.length }} 只狗狗</text>
      </view>

      <view v-for="dog in customer.dogs" :key="dog.id" class="dog-row">
        <view class="dog-main">
          <text class="dog-name">{{ dog.name }}</text>
          <text class="dog-meta">
            {{ dog.breedName || '未填写品种' }} · {{ formatWeight(dog.currentWeightKg) }}
          </text>
        </view>
        <view class="dog-actions">
          <button class="mini-btn primary" @tap="openAssistedOrder(customer, dog)">代客下单</button>
          <button class="mini-btn" @tap="openDogHistory(dog)">成品食谱历史</button>
        </view>
      </view>
    </view>

    <view v-if="historyVisible" class="modal-mask" @tap="closeDogHistory">
      <view class="modal-panel" @tap.stop>
        <view class="modal-head">
          <text class="modal-title">{{ historyDogName }} 的成品食谱历史</text>
          <text class="modal-close" @tap="closeDogHistory">关闭</text>
        </view>
        <view v-if="historyLoading" class="state-card inline">正在加载...</view>
        <view v-else-if="historyItems.length === 0" class="state-card inline">
          <text class="state-copy">这只狗狗还没有成品订购记录。</text>
        </view>
        <view
          v-for="item in historyItems"
          :key="item.orderItemId"
          class="history-row"
          @tap="openStaffOrderDetail(item.orderId)"
        >
          <view>
            <text class="history-title">{{ item.recipeName }}</text>
            <text class="history-meta">{{ formatDate(item.orderedAt) }} · {{ statusText(item.orderStatus) }}</text>
            <text class="history-meta">{{ item.packageSummary || formatPackage(item) }}</text>
          </view>
          <text class="history-amount">¥{{ money(item.amountTotal) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onPullDownRefresh } from '@dcloudio/uni-app'
import {
  getStaffDogFinishedFoodHistory,
  searchStaffCustomers,
  type DogFinishedFoodHistoryItem,
  type StaffCustomerDogSummary,
  type StaffCustomerSearchResult,
} from '../../api/orders'

const keyword = ref('')
const loading = ref(false)
const searched = ref(false)
const customers = ref<StaffCustomerSearchResult[]>([])
const historyVisible = ref(false)
const historyLoading = ref(false)
const historyDogName = ref('')
const historyItems = ref<DogFinishedFoodHistoryItem[]>([])

onPullDownRefresh(async () => {
  if (keyword.value.trim()) {
    await searchCustomers()
  }
  uni.stopPullDownRefresh()
})

async function searchCustomers() {
  const value = keyword.value.trim()
  if (!value) {
    uni.showToast({ title: '请输入搜索内容', icon: 'none' })
    return
  }
  loading.value = true
  searched.value = true
  try {
    const response = await searchStaffCustomers(value)
    customers.value = Array.isArray(response.data) ? response.data : []
  } catch (error: any) {
    uni.showToast({ title: error?.message || '搜索失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function openAssistedOrder(customer: StaffCustomerSearchResult, dog: StaffCustomerDogSummary) {
  const query = [
    `customerId=${encodeURIComponent(customer.id)}`,
    `dogId=${encodeURIComponent(dog.id)}`,
    `dogName=${encodeURIComponent(dog.name)}`,
    `customerName=${encodeURIComponent(customer.nickname || customer.phone || customer.id)}`,
  ].join('&')
  uni.navigateTo({ url: `/pages/staff-customer-service/assisted-order?${query}` })
}

async function openDogHistory(dog: StaffCustomerDogSummary) {
  historyVisible.value = true
  historyLoading.value = true
  historyDogName.value = dog.name
  historyItems.value = []
  try {
    const response = await getStaffDogFinishedFoodHistory(dog.id)
    historyItems.value = Array.isArray(response.data) ? response.data : []
  } catch (error: any) {
    uni.showToast({ title: error?.message || '历史加载失败', icon: 'none' })
  } finally {
    historyLoading.value = false
  }
}

function closeDogHistory() {
  historyVisible.value = false
}

function openStaffOrderDetail(orderId: string) {
  uni.navigateTo({ url: `/pages/staff-orders/detail?id=${orderId}` })
}

function formatWeight(value?: number | null) {
  const num = Number(value || 0)
  return num > 0 ? `${num.toFixed(1)}kg` : '未填写体重'
}

function formatPackage(item: DogFinishedFoodHistoryItem) {
  return `${item.packageSpecG}g x ${item.packageCount}包`
}

function money(value: unknown) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function statusText(status?: string) {
  const map: Record<string, string> = {
    INIT: '待提交',
    PENDING_PAYMENT: '待收款',
    PAID: '已收款',
    PURCHASING: '采购中',
    IN_PRODUCTION: '制作中',
    FREEZING: '急冻中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    AFTERSALE: '售后中',
  }
  return map[status || ''] || status || '-'
}
</script>

<style scoped>
.staff-customer-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f4f6f8;
  box-sizing: border-box;
  color: #1f2933;
}

.search-panel,
.customer-card,
.state-card,
.modal-panel {
  background: #ffffff;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  box-sizing: border-box;
}

.search-panel {
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.page-title,
.customer-name,
.modal-title,
.state-title {
  display: block;
  color: #111827;
  font-size: 32rpx;
  font-weight: 800;
}

.search-row {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
}

.search-input {
  flex: 1;
  height: 76rpx;
  padding: 0 20rpx;
  border: 1rpx solid #d1d5db;
  border-radius: 8rpx;
  font-size: 28rpx;
  background: #fff;
}

.search-btn,
.mini-btn {
  border-radius: 8rpx;
  background: #1677ff;
  color: #fff;
  font-size: 26rpx;
}

.search-btn {
  width: 140rpx;
  height: 76rpx;
  line-height: 76rpx;
}

.state-card {
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.state-card.inline {
  margin: 16rpx 0;
  background: #f9fafb;
}

.state-copy,
.customer-meta,
.dog-meta,
.history-meta {
  display: block;
  margin-top: 6rpx;
  color: #6b7280;
  font-size: 24rpx;
  line-height: 1.5;
}

.customer-card {
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.customer-head,
.dog-row,
.history-row,
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.dog-count {
  color: #157347;
  font-size: 24rpx;
  font-weight: 700;
}

.dog-row {
  padding: 20rpx 0;
  border-top: 1rpx solid #edf0f3;
}

.dog-main {
  flex: 1;
  min-width: 0;
}

.dog-name,
.history-title {
  display: block;
  color: #111827;
  font-size: 28rpx;
  font-weight: 700;
}

.dog-actions {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.mini-btn {
  width: 170rpx;
  height: 58rpx;
  line-height: 58rpx;
}

.mini-btn:not(.primary) {
  background: #f3f4f6;
  color: #374151;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 99;
  display: flex;
  align-items: flex-end;
  background: rgba(17, 24, 39, 0.45);
}

.modal-panel {
  width: 100%;
  max-height: 78vh;
  padding: 28rpx;
  overflow: auto;
  border-radius: 20rpx 20rpx 0 0;
}

.modal-close {
  color: #1677ff;
  font-size: 26rpx;
}

.history-row {
  padding: 20rpx 0;
  border-top: 1rpx solid #edf0f3;
}

.history-amount {
  flex-shrink: 0;
  color: #d4380d;
  font-size: 28rpx;
  font-weight: 800;
}
</style>
