<template>
  <view class="page">
    <view class="head">
      <view>
        <text class="title">分装备料</text>
        <text class="sub">按发货日看订单 / 备料 / 包材 / 缺料</text>
      </view>
      <picker mode="date" :value="date" @change="onDateChange">
        <view class="date-btn">{{ date }}</view>
      </picker>
    </view>

    <view v-if="loading" class="state"><text>加载中…</text></view>
    <template v-else>
      <!--
        先给订单，再给汇总。
        现场是拿着单子干活：从这一屏直接进分装、打标签、发货，
        而不是看完一堆总量之后还要再绕到「订单中心」找单。
      -->
      <view class="card order-card">
        <view class="section-head">
          <text class="section-title">当天待发货订单（{{ orders.length }}）</text>
          <text class="link" @tap="goAllOrders">全部补剂订单 ›</text>
        </view>

        <view v-for="order in orders" :key="order.id" class="order-row">
          <view class="order-main" @tap="openOrder(order)">
            <text class="order-no">{{ order.orderNo }}</text>
            <text class="order-meta">{{ statusText(order.status) }} · {{ order.bagCount }} 袋</text>
          </view>
        </view>

        <view v-if="orders.length === 0" class="empty-block">
          <text class="empty">这天没有待发货的订单</text>
          <text class="empty-hint">刚下单还没看到，可能还没确认收款、还没排期，或排到了别的发货日（右上角可切换日期）。</text>
          <view class="ghost-btn" @tap="goAllOrders">去看全部补剂订单</view>
        </view>
      </view>

      <view class="hero">
        <view class="hero-item"><text class="hero-value">{{ data?.orderCount || 0 }}</text><text class="hero-label">订单</text></view>
        <view class="hero-item"><text class="hero-value">{{ data?.bagCount || 0 }}</text><text class="hero-label">总袋数</text></view>
        <view class="hero-item"><text class="hero-value">{{ data?.capacity || 0 }}</text><text class="hero-label">产能</text></view>
      </view>

      <view class="card">
        <text class="section-title">补剂总用量</text>
        <view v-for="item in data?.ingredientTotals || []" :key="`${item.ingredientId}-${item.unit}`" class="row">
          <view>
            <text class="name">{{ item.name }}</text>
            <text class="desc">{{ item.quantity }} {{ item.unit }} · {{ item.orderCount }} 单</text>
          </view>
          <text :class="item.shortage > 0 ? 'badge red' : 'badge green'">
            {{ item.shortage > 0 ? `缺 ${item.shortage} ${item.unit}` : '足' }}
          </text>
        </view>
        <text v-if="(data?.ingredientTotals || []).length === 0" class="empty">当天没有待发货订单</text>
      </view>

      <view class="card">
        <text class="section-title">包材需求</text>
        <view v-for="item in data?.packagingNeeds || []" :key="item.role + item.name" class="row">
          <view>
            <text class="name">{{ item.name }}</text>
            <text class="desc">{{ roleLabel(item.role) }} · {{ item.configured ? '已配置' : '未配置' }}</text>
          </view>
          <text class="qty">{{ item.quantity }}</text>
        </view>
      </view>

      <view v-if="(data?.missingPouchRules || []).length" class="card warning-card">
        <text class="section-title">未配置袋型（{{ data?.missingPouchRules?.length }}）</text>
        <text class="warning-text">{{ data?.missingPouchRules?.join('；') }}</text>
      </view>
      <view class="notice">缺料会按账面数量提示，但不阻断分装；请先核对库存，异常时联系管理员。</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'

interface PackingOrder {
  id: string
  orderNo: string
  status: string
  bagCount: number
}

const loading = ref(false)
const now = new Date()
const date = ref(
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
)
const data = ref<any>(null)
const orders = computed<PackingOrder[]>(() => data.value?.orders || [])

const STATUS_TEXT: Record<string, string> = {
  PENDING_PAYMENT: '待确认收款',
  PAID: '待发货',
  PACKING: '待发货',
  PACKED: '待发货',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

function statusText(value: string) {
  return STATUS_TEXT[value] || value
}

function roleLabel(role: string) {
  return ({ POUCH: '分装袋', DESICCANT: '干燥剂', LABEL: '标签' } as Record<string, string>)[role] || role
}

function onDateChange(event: any) {
  date.value = event.detail.value
  load()
}

function openOrder(order: PackingOrder) {
  uni.navigateTo({
    url: `/pages/staff-supplement-orders/detail?id=${encodeURIComponent(order.id)}`,
  })
}

function goAllOrders() {
  uni.navigateTo({ url: '/pages/staff-supplement-orders/index' })
}

async function load() {
  loading.value = true
  try {
    const res = await request({
      url: '/admin/supplement-shop/packing-summary',
      method: 'GET',
      data: { date: date.value },
    })
    if (res.code === 0) data.value = res.data
    else uni.showToast({ title: res.message || '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

// 从分装/发货详情返回时，状态和汇总都要重算；onMounted 只会在第一次进来时跑。
onShow(load)
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f6f8; padding: 24rpx; box-sizing: border-box; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.title { display: block; font-size: 38rpx; font-weight: 700; color: #1e3a2f; }
.sub { display: block; margin-top: 6rpx; color: #909399; font-size: 23rpx; }
.date-btn { background: #fff; padding: 12rpx 20rpx; border-radius: 30rpx; font-size: 26rpx; color: #1e3a2f; }
.state { padding-top: 200rpx; text-align: center; color: #909399; }
.hero { display: flex; background: linear-gradient(140deg, #1e3a2f, #2b5040); border-radius: 18rpx; padding: 28rpx; color: #f7f3e8; margin-bottom: 20rpx; }
.hero-item { flex: 1; text-align: center; }
.hero-value { display: block; font-size: 40rpx; font-weight: 700; }
.hero-label { display: block; margin-top: 4rpx; font-size: 22rpx; color: #cad6c9; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx; }
.section-title { display: block; font-size: 28rpx; font-weight: 600; margin-bottom: 12rpx; }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12rpx; }
.section-head .section-title { margin-bottom: 0; }
.link { color: #2b5040; font-size: 23rpx; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 14rpx 0; border-bottom: 1rpx solid #f2f2f2; }
.name { display: block; font-size: 27rpx; color: #303133; }
.desc { display: block; margin-top: 4rpx; font-size: 22rpx; color: #909399; }
.badge { font-size: 22rpx; padding: 4rpx 12rpx; border-radius: 20rpx; }
.badge.green { color: #2e7d32; background: #edf7ed; }
.badge.red { color: #c62828; background: #fdecea; }
.qty { font-size: 30rpx; font-weight: 600; }
.empty { color: #909399; font-size: 24rpx; }
.order-row { display: flex; align-items: center; justify-content: space-between; padding: 18rpx 0; border-bottom: 1rpx solid #f2f2f2; }
.order-row:last-child { border-bottom: none; }
.order-main { flex: 1; min-width: 0; }
.order-no { display: block; font-size: 27rpx; font-weight: 600; color: #303133; }
.order-meta { display: block; margin-top: 4rpx; font-size: 22rpx; color: #909399; }
.empty-block { padding: 26rpx 0 8rpx; text-align: center; }
.empty-hint { display: block; margin-top: 8rpx; font-size: 22rpx; color: #b0b3b8; }
.ghost-btn { display: inline-block; margin-top: 18rpx; padding: 12rpx 24rpx; border: 1rpx solid #2b5040; border-radius: 999rpx; font-size: 23rpx; color: #2b5040; }
.warning-card { border-left: 6rpx solid #e6a23c; }
.warning-text { color: #8a5a00; font-size: 23rpx; line-height: 1.6; }
.notice { padding: 18rpx; background: #fdf6ec; color: #b88230; border-radius: 10rpx; font-size: 23rpx; line-height: 1.6; }
</style>
