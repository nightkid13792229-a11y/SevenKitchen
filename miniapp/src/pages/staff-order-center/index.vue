<template>
  <view class="page">
    <view class="head">
      <view>
        <text class="title">订单中心</text>
        <text class="sub">鲜食 / 定制食谱 / 补剂统一查看</text>
      </view>
      <text class="refresh" @tap="load">刷新</text>
    </view>

    <scroll-view class="type-tabs" scroll-x>
      <view
        v-for="tab in typeTabs"
        :key="tab.value || 'ALL'"
        class="type-tab"
        :class="{ active: type === tab.value }"
        @tap="switchType(tab.value)"
      >
        {{ tab.label }}
      </view>
    </scroll-view>

    <view class="status-tabs">
      <text
        v-for="tab in statusTabs"
        :key="tab.value || 'ALL'"
        class="status-tab"
        :class="{ active: status === tab.value }"
        @tap="switchStatus(tab.value)"
      >
        {{ tab.label }}
      </text>
    </view>

    <view v-if="loading" class="state">加载中…</view>
    <template v-else>
      <view v-for="item in items" :key="`${item.type}-${item.id}`" class="order-card" @tap="openOrder(item)">
        <view class="order-top">
          <view class="order-left">
            <text class="type-tag">{{ typeLabel(item.type) }}</text>
            <text class="order-no">{{ item.orderNo }}</text>
          </view>
          <text class="status">{{ item.statusLabel }}</text>
        </view>
        <view class="order-main">
          <text class="customer">{{ item.customerName || '顾客' }}</text>
          <text v-if="item.customerPhone" class="phone">{{ item.customerPhone }}</text>
        </view>
        <view class="order-bottom">
          <text class="meta">{{ formatTime(item.createdAt) }}</text>
          <text v-if="item.hasOpenAftersale" class="aftersale">{{ item.aftersaleLabel || '售后中' }}</text>
          <text v-if="item.amountTotal !== null" class="amount">¥{{ Number(item.amountTotal || 0).toFixed(2) }}</text>
        </view>
      </view>
      <view v-if="items.length === 0" class="state">没有符合条件的订单</view>
      <view v-if="hasMore" class="load-more" @tap="loadMore">加载更多</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { request } from '../../utils/api'

interface OrderCenterItem {
  id: string
  orderNo: string
  type: 'FOOD' | 'CUSTOM_RECIPE' | 'SUPPLEMENT'
  statusLabel: string
  customerName: string | null
  customerPhone: string | null
  createdAt: string
  amountTotal: number | null
  hasOpenAftersale: boolean
  aftersaleLabel: string | null
}

const typeTabs = [
  { label: '全部', value: '' },
  { label: '鲜食', value: 'FOOD' },
  { label: '定制', value: 'CUSTOM_RECIPE' },
  { label: '补剂', value: 'SUPPLEMENT' },
]
const statusTabs = [
  { label: '全部', value: '' },
  { label: '待发货', value: 'TO_SHIP' },
  { label: '处理中', value: 'IN_PROGRESS' },
  { label: '已发货', value: 'SHIPPED' },
  { label: '已完成', value: 'COMPLETED' },
]

const type = ref('')
const status = ref('')
const items = ref<OrderCenterItem[]>([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)
const pageSize = 20
const hasMore = ref(false)

function typeLabel(value: string) {
  return ({ FOOD: '鲜食', CUSTOM_RECIPE: '定制', SUPPLEMENT: '补剂' } as Record<string, string>)[value] || value
}

function formatTime(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

async function load(reset = true) {
  if (reset) {
    page.value = 1
    items.value = []
  }
  loading.value = true
  try {
    const res = await request({
      url: '/admin/order-center',
      method: 'GET',
      data: {
        type: type.value || undefined,
        status: status.value || undefined,
        page: page.value,
        pageSize,
      },
    })
    if (res.code === 0) {
      const next = res.data?.items || []
      items.value = reset ? next : [...items.value, ...next]
      total.value = Number(res.data?.total || 0)
      hasMore.value = items.value.length < total.value
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' })
    }
  } finally {
    loading.value = false
  }
}

function switchType(next: string) {
  type.value = next
  load()
}

function switchStatus(next: string) {
  status.value = next
  load()
}

function loadMore() {
  if (loading.value || !hasMore.value) return
  page.value += 1
  load(false)
}

function openOrder(item: OrderCenterItem) {
  if (item.type === 'SUPPLEMENT') {
    uni.navigateTo({ url: `/pages/staff-supplement-orders/detail?id=${encodeURIComponent(item.id)}` })
    return
  }
  if (item.type === 'CUSTOM_RECIPE') {
    uni.navigateTo({ url: `/pages/custom-recipe/order-detail?id=${encodeURIComponent(item.id)}` })
    return
  }
  uni.navigateTo({ url: `/pages/staff-orders/detail?id=${encodeURIComponent(item.id)}` })
}

onMounted(() => load())
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f6f8; padding: 24rpx; box-sizing: border-box; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18rpx; }
.title { display: block; font-size: 38rpx; font-weight: 700; color: #1e3a2f; }
.sub { display: block; margin-top: 6rpx; color: #909399; font-size: 23rpx; }
.refresh { color: #1e3a2f; font-size: 25rpx; padding: 10rpx 4rpx; }
.type-tabs { white-space: nowrap; margin-bottom: 14rpx; }
.type-tab { display: inline-block; padding: 12rpx 26rpx; margin-right: 12rpx; border-radius: 30rpx; background: #fff; color: #606266; font-size: 26rpx; }
.type-tab.active { background: #1e3a2f; color: #fff; }
.status-tabs { display: flex; gap: 8rpx; overflow-x: auto; margin-bottom: 16rpx; }
.status-tab { flex: none; padding: 10rpx 18rpx; border-radius: 8rpx; color: #909399; font-size: 23rpx; }
.status-tab.active { background: #e8f1ec; color: #1e3a2f; font-weight: 600; }
.order-card { background: #fff; border-radius: 16rpx; padding: 22rpx; margin-bottom: 16rpx; }
.order-top { display: flex; justify-content: space-between; align-items: center; }
.order-left { display: flex; align-items: center; min-width: 0; }
.type-tag { flex: none; padding: 4rpx 10rpx; margin-right: 12rpx; border-radius: 6rpx; background: #f0f6f2; color: #2b5040; font-size: 21rpx; }
.order-no { font-size: 25rpx; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { flex: none; margin-left: 14rpx; color: #b88230; font-size: 23rpx; }
.order-main { display: flex; align-items: baseline; margin-top: 16rpx; }
.customer { font-size: 29rpx; font-weight: 600; color: #1e3a2f; }
.phone { margin-left: 14rpx; color: #909399; font-size: 23rpx; }
.order-bottom { display: flex; align-items: center; margin-top: 14rpx; }
.meta { color: #909399; font-size: 22rpx; }
.aftersale { margin-left: 14rpx; padding: 3rpx 10rpx; border-radius: 6rpx; background: #fdf6ec; color: #b88230; font-size: 21rpx; }
.amount { margin-left: auto; color: #1e3a2f; font-size: 28rpx; font-weight: 600; }
.state { padding: 120rpx 0; text-align: center; color: #909399; font-size: 24rpx; }
.load-more { padding: 20rpx; text-align: center; color: #2b5040; font-size: 24rpx; }
</style>
