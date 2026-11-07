<template>
  <view class="packing-panel">
    <view v-if="loading && !data" class="state"><text>加载中…</text></view>
    <view v-else-if="loadError && !data" class="state error-state">
      <text class="state-title">没取到当天的分装备料</text>
      <text class="state-error">{{ loadError }}</text>
      <view class="ghost-btn" @tap="load">重试</view>
    </view>
    <template v-else>
      <view v-if="loadError" class="inline-error">
        <text>数据没更新</text>
        <text class="retry-link" @tap="load">重试</text>
      </view>
      <!--
        先给订单，再给汇总。
        现场是拿着单子干活：从这一屏直接打标签或进订单详情，
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
            <text class="order-meta">
              {{ order.receiverName ? order.receiverName + ' · ' : '' }}{{ statusText(order.status) }} · {{ order.bagCount }} 袋
            </text>
            <text class="order-hint">查看详情 ›</text>
          </view>
          <view class="order-print" @tap.stop="openLabels(order)">
            <text>打印标签</text>
          </view>
        </view>

        <view v-if="orders.length === 0 && !loadError" class="empty-block">
          <text class="empty">这天没有待发货的订单</text>
          <text class="empty-hint">刚下单还没看到，可能还没确认收款、还没排期，或排到了别的发货日（上方可切换日期）。</text>
          <view class="ghost-btn" @tap="goAllOrders">去看全部补剂订单</view>
        </view>
      </view>

      <template v-if="orders.length > 0">
        <view class="hero">
          <view class="hero-item"><text class="hero-value">{{ data?.orderCount || 0 }}</text><text class="hero-label">订单</text></view>
          <view class="hero-item"><text class="hero-value">{{ data?.bagCount || 0 }}</text><text class="hero-label">总袋数</text></view>
          <view class="hero-item"><text class="hero-value">{{ data?.capacity || 0 }}</text><text class="hero-label">产能（袋/天）</text></view>
        </view>
        <view v-if="capacityOver > 0" class="capacity-warning">
          当天 {{ data?.bagCount || 0 }} 袋，超出日产能 {{ capacityOver }} 袋
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
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { request } from '../../../utils/api'

interface PackingOrder {
  id: string
  orderNo: string
  status: string
  bagCount: number
  receiverName?: string
}

const props = defineProps<{ date: string }>()
const emit = defineEmits<{ (event: 'count', value: number): void }>()

const loading = ref(true)
const data = ref<any>(null)
const loadError = ref('')
const orders = computed<PackingOrder[]>(() => data.value?.orders || [])
const capacityOver = computed(() =>
  Math.max(
    Number(data.value?.bagCount || 0) - Number(data.value?.capacity || 0),
    0,
  ),
)

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

function openOrder(order: PackingOrder) {
  uni.navigateTo({
    url: `/pages/staff-supplement-orders/detail?id=${encodeURIComponent(order.id)}`,
  })
}

// 看板上直接打标签：不用先进详情再找「打印标签」。
function openLabels(order: PackingOrder) {
  uni.navigateTo({
    url: `/pages/staff-supplement-orders/labels?id=${encodeURIComponent(order.id)}`,
  })
}

function goAllOrders() {
  uni.navigateTo({ url: '/pages/staff-supplement-orders/index' })
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await request({
      url: '/admin/supplement-shop/packing-summary',
      method: 'GET',
      data: { date: props.date },
    })
    if (res.code === 0) {
      data.value = res.data
      emit('count', Number(res.data?.orderCount || 0))
    } else {
      loadError.value = res.message || '加载失败，请重试'
    }
  } catch (error: any) {
    loadError.value = error?.message || '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

// 这一块现在是生产管理页里的一个面板，页面的 onShow 不会再自动跑到这里，
// 所以由父页面在「回到本页」或「切到补剂」时手动调 refresh()。
// 日期由父页面统一控制，换日期时清掉旧数据再拉。
watch(
  () => props.date,
  () => {
    data.value = null
    load()
  },
)
defineExpose({ refresh: load })

onMounted(load)
</script>

<style scoped>
.packing-panel { padding: 0 32rpx 24rpx; box-sizing: border-box; }
.panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.panel-sub { color: #6b6653; font-size: 23rpx; }
.date-btn { background: #fff; padding: 12rpx 20rpx; border-radius: 30rpx; font-size: 26rpx; color: #1e3a2f; border: 1rpx solid #e3e6d5; }
.state { padding-top: 120rpx; text-align: center; color: #909399; }
.error-state { padding: 80rpx 32rpx; text-align: center; }
.state-title { display: block; font-size: 30rpx; font-weight: 600; color: #26261f; }
.state-error { display: block; margin-top: 10rpx; font-size: 24rpx; color: #b4453a; }
.error-state .ghost-btn { margin-top: 24rpx; }
.inline-error { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; padding: 14rpx 20rpx; background: #fdf6ec; border-radius: 10rpx; font-size: 24rpx; color: #8a5a00; }
.inline-error .retry-link { color: #7a5c28; font-weight: 600; padding: 8rpx 12rpx; }
.capacity-warning { margin-bottom: 20rpx; padding: 12rpx 18rpx; background: #fdecea; color: #b4453a; border-radius: 10rpx; font-size: 24rpx; }
.hero { display: flex; background: linear-gradient(140deg, #1e3a2f, #2b5040); border-radius: 18rpx; padding: 28rpx; color: #f7f3e8; margin-bottom: 20rpx; }
.hero-item { flex: 1; text-align: center; }
.hero-value { display: block; font-size: 40rpx; font-weight: 700; }
.hero-label { display: block; margin-top: 4rpx; font-size: 22rpx; color: #cad6c9; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx; box-shadow: 0 2rpx 8rpx rgba(30, 46, 36, 0.04); }
.section-title { display: block; font-size: 28rpx; font-weight: 600; margin-bottom: 12rpx; color: #26261f; }
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
.order-hint { display: block; margin-top: 4rpx; font-size: 24rpx; color: #2b5040; }
.order-print { flex-shrink: 0; margin-left: 16rpx; padding: 12rpx 20rpx; border: 1rpx solid #2b5040; border-radius: 999rpx; font-size: 24rpx; line-height: 1.4; color: #2b5040; background: #fff; }
.order-print:active { background: #eef2e4; }
.empty-block { padding: 26rpx 0 8rpx; text-align: center; }
.empty-hint { display: block; margin-top: 8rpx; font-size: 22rpx; color: #b0b3b8; }
.ghost-btn { display: inline-block; margin-top: 18rpx; padding: 12rpx 24rpx; border: 1rpx solid #2b5040; border-radius: 999rpx; font-size: 23rpx; color: #2b5040; }
.warning-card { border-left: 6rpx solid #e6a23c; }
.warning-text { color: #8a5a00; font-size: 23rpx; line-height: 1.6; }
.notice { padding: 18rpx; background: #fdf6ec; color: #b88230; border-radius: 10rpx; font-size: 23rpx; line-height: 1.6; }
</style>
