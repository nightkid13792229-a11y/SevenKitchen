<template>
  <view class="page">
    <view v-if="loading && !order" class="state"><text>加载中…</text></view>
    <view v-else-if="!order" class="state"><text>订单不存在</text></view>
    <template v-else>
      <view class="hero">
        <view class="hero-top">
          <text class="order-no">{{ order.orderNo }}</text>
          <text class="status">{{ statusLabel(order.status) }}</text>
        </view>
        <text class="hero-date">{{ formatTime(order.createdAt) }}</text>
        <text v-if="order.status === 'PAID'" class="hero-hint">
          {{ order.packingDate ? `预计 ${order.packingDate} 分装发货` : '已付款，等待管理员排期' }}
        </text>
        <text v-else-if="order.packingDate" class="hero-hint">预计发货日 {{ order.packingDate }}</text>
      </view>

      <view class="card">
        <view class="card-title">补剂明细</view>
        <view v-for="item in order.items || []" :key="item.id" class="item">
          <view class="item-main">
            <text class="item-name">{{ item.name }}</text>
            <text class="item-sub">{{ formatAmount(item.packedAmount) }}{{ item.unit }} / 袋 · 共 {{ item.bags }} 袋</text>
          </view>
          <text class="item-price">¥{{ money(item.price) }}</text>
        </view>
        <view class="fee-line"><text>补剂商品小计</text><text>¥{{ money(order.amountSupplement) }}</text></view>
        <view class="fee-line"><text>分装服务费</text><text>¥{{ money(order.amountServiceFee) }}</text></view>
        <view v-if="order.amountPackaging > 0" class="fee-line"><text>包材费</text><text>¥{{ money(order.amountPackaging) }}</text></view>
        <view class="fee-line"><text>运费</text><text>{{ order.amountShipping > 0 ? `¥${money(order.amountShipping)}` : '包邮' }}</text></view>
        <view class="fee-line total"><text>合计</text><text>¥{{ money(order.amountTotal) }}</text></view>
      </view>

      <view class="card">
        <view class="card-title">收货信息</view>
        <view class="info"><text class="label">收件人</text><text>{{ order.receiverName }} {{ order.receiverPhone }}</text></view>
        <view class="info"><text class="label">地址</text><text class="address">{{ order.receiverRegion }} {{ order.receiverDetail }}</text></view>
        <button v-if="canChangeAddress" class="ghost-btn" @tap="changeAddress">修改收货地址</button>
        <view v-if="order.status === 'PACKED'" class="notice">已分装；改地址后需要重新打印面单。</view>
        <view v-if="order.trackingNumber" class="info">
          <text class="label">物流</text><text>{{ order.carrierCode || '' }} {{ order.trackingNumber }}</text>
        </view>
      </view>

      <view class="card" v-if="snapshot?.snapshot">
        <view class="card-title">制作单快照</view>
        <view class="info"><text class="label">食谱</text><text>{{ snapshot.snapshot.sheet?.recipeName || '—' }}</text></view>
        <view class="info"><text class="label">狗狗</text><text>{{ snapshot.snapshot.sheet?.dogName || '—' }}</text></view>
        <view class="info"><text class="label">周期</text><text>{{ snapshot.snapshot.sheet?.cycleDays || '—' }} 天</text></view>
        <view class="info"><text class="label">冻结</text><text>{{ formatTime(snapshot.snapshotAt || '') }}</text></view>
        <text class="snapshot-tip">下单时冻结，后续改食谱不影响已购补剂。</text>
      </view>

      <view class="card" v-if="aftersales.length > 0">
        <view class="card-title">售后记录</view>
        <view v-for="item in aftersales" :key="item.id" class="aftersale-row">
          <view>
            <text class="aftersale-reason">{{ item.requestedReason }}</text>
            <text class="aftersale-sub">{{ item.caseNo }} · {{ aftersaleStatus(item.status) }}</text>
          </view>
          <text v-if="item.refundAmount !== null" class="aftersale-amount">¥{{ money(item.refundAmount) }}</text>
        </view>
      </view>

      <view class="actions">
        <button v-if="order.status === 'PENDING_PAYMENT'" class="primary-btn" :disabled="paying" @tap="pay">
          {{ paying ? '支付中…' : '去支付' }}
        </button>
        <button v-if="canCancel" class="ghost-btn" @tap="cancelOrder">取消订单</button>
        <button v-if="canApplyAftersale" class="ghost-btn" @tap="goAftersale">申请售后</button>
        <button v-if="order.status !== 'CANCELLED'" class="ghost-btn" @tap="repurchase">再次购买</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import {
  cancelSupplementOrder,
  fetchSupplementAftersales,
  fetchSupplementOrderDetail,
  fetchSupplementSnapshot,
  saveSupplementPurchaseDraft,
  updateSupplementAddress,
  type SupplementAftersale,
  type SupplementOrder,
} from '../../api/supplements'
import { runSupplementPayment } from '../../utils/supplement-payment'

const orderId = ref('')
const order = ref<SupplementOrder | null>(null)
const aftersales = ref<SupplementAftersale[]>([])
const snapshot = ref<any>(null)
const loading = ref(false)
const paying = ref(false)
const pendingAddress = ref(false)

const canChangeAddress = computed(() =>
  order.value ? ['PENDING_PAYMENT', 'PAID', 'PACKED'].includes(order.value.status) : false,
)
const canCancel = computed(() =>
  order.value ? ['PENDING_PAYMENT', 'PAID'].includes(order.value.status) : false,
)
const canApplyAftersale = computed(() =>
  order.value ? ['PACKED', 'SHIPPED', 'COMPLETED'].includes(order.value.status) : false,
)

function money(value: number | null | undefined) {
  return Number(value || 0).toFixed(2)
}
function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}
function formatTime(value: string) {
  return value ? value.replace('T', ' ').slice(0, 16) : '—'
}
function statusLabel(value: string) {
  return (
    {
      PENDING_PAYMENT: '待付款',
      PAID: '已付款 · 待分装',
      PACKING: '分装中',
      PACKED: '已分装 · 待发货',
      SHIPPED: '已发货',
      COMPLETED: '已完成',
      CANCELLED: '已取消',
      AFTERSALE: '售后中',
    } as Record<string, string>
  )[value] || value
}
function aftersaleStatus(value: string) {
  return (
    {
      PENDING: '待受理',
      PROCESSING: '处理中',
      RESOLVED: '已解决',
      REJECTED: '已驳回',
      CANCELLED: '已撤回',
    } as Record<string, string>
  )[value] || value
}

async function load() {
  loading.value = true
  try {
    const [detail, cases, snapshotRes] = await Promise.all([
      fetchSupplementOrderDetail(orderId.value),
      fetchSupplementAftersales(orderId.value).catch(() => ({ code: 0, data: [] } as any)),
    ])
    if (detail.code === 0) order.value = detail.data
    else uni.showToast({ title: detail.message || '加载失败', icon: 'none' })
    if (cases.code === 0) aftersales.value = cases.data || []
  } finally {
    loading.value = false
  }
}

async function pay() {
  if (!order.value || paying.value) return
  paying.value = true
  try {
    const outcome = await runSupplementPayment(order.value.id)
    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' })
      await load()
    } else if (outcome === 'CANCELLED') {
      uni.showToast({ title: '已取消支付', icon: 'none' })
    } else if (outcome === 'MANUAL') {
      uni.showModal({ title: '暂不能在线支付', content: '我们会尽快联系你确认收款。', showCancel: false })
    } else {
      uni.showToast({ title: '支付失败，请重试', icon: 'none' })
    }
  } finally {
    paying.value = false
  }
}

function changeAddress() {
  pendingAddress.value = true
  uni.navigateTo({ url: '/pages/address-list/index?mode=select' })
}

async function onAddressSelected(payload: { addressId?: string }) {
  if (!pendingAddress.value || !payload?.addressId || !order.value) return
  pendingAddress.value = false
  const res = await updateSupplementAddress(order.value.id, { addressId: payload.addressId })
  if (res.code !== 0) {
    uni.showToast({ title: res.message || '改地址失败', icon: 'none' })
    return
  }
  uni.showModal({
    title: '地址已更新',
    content: res.data?.needsReprint ? '请重新打印面单，避免发错。' : '下次发货会使用新地址。',
    showCancel: false,
  })
  await load()
}

function cancelOrder() {
  if (!order.value) return
  const isPaid = order.value.status === 'PAID'
  uni.showModal({
    title: isPaid ? '申请全额退款' : '取消订单',
    content: isPaid ? '已付款未分装，确认后发起全额退款；退款成功才取消订单。' : '确认取消这笔未付款订单？',
    success: async (res) => {
      if (!res.confirm || !order.value) return
      const response = await cancelSupplementOrder(order.value.id, '顾客取消')
      if (response.code === 0) {
        uni.showToast({ title: isPaid ? '退款已提交' : '已取消', icon: 'success' })
        await load()
      } else {
        uni.showToast({ title: response.message || '取消失败', icon: 'none' })
      }
    },
  })
}

function goAftersale() {
  if (!order.value) return
  uni.navigateTo({ url: `/pages/supplement-aftersale/index?orderId=${encodeURIComponent(order.value.id)}` })
}

function repurchase() {
  if (!order.value) return
  const lines = (order.value.items || [])
    .filter((item) => item.ingredientId && Number(item.requestedAmount) > 0)
    .map((item) => ({
      ingredientId: item.ingredientId,
      amount: Number(item.requestedAmount),
      name: item.name,
      unit: item.unit,
      specText: [item.brand, item.productModel].filter(Boolean).join(' / '),
    }))
  if (lines.length === 0) return uni.showToast({ title: '没有可复购的补剂', icon: 'none' })
  saveSupplementPurchaseDraft({
    lines,
    recipeId: order.value.recipeId || undefined,
    recipeName: order.value.recipeName || undefined,
    dogId: order.value.dogId || undefined,
    dogName: order.value.dogName || undefined,
    cycleDays: order.value.cycleDays || undefined,
  })
  uni.navigateTo({ url: '/pages/supplement-order/index' })
}

onLoad((options: any) => {
  orderId.value = options?.orderId || ''
  uni.$on('address-selected', onAddressSelected)
  if (orderId.value) load()
})
onUnload(() => uni.$off('address-selected', onAddressSelected))
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f6f8; padding: 16rpx 24rpx 80rpx; box-sizing: border-box; }
.state { padding-top: 200rpx; text-align: center; color: #909399; }
.hero { background: linear-gradient(140deg, #1e3a2f, #2b5040); color: #f7f3e8; border-radius: 20rpx; padding: 28rpx; margin-bottom: 20rpx; }
.hero-top { display: flex; justify-content: space-between; align-items: center; }
.order-no { font-size: 28rpx; font-weight: 600; }
.status { font-size: 24rpx; background: rgba(255,255,255,.16); padding: 6rpx 14rpx; border-radius: 20rpx; }
.hero-date, .hero-hint { display: block; margin-top: 12rpx; color: #cad6c9; font-size: 23rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx; }
.card-title { font-size: 28rpx; font-weight: 600; margin-bottom: 16rpx; }
.item { display: flex; justify-content: space-between; padding: 12rpx 0; border-bottom: 1rpx solid #f0f2f5; }
.item-name { display: block; font-size: 27rpx; }
.item-sub { display: block; color: #909399; font-size: 23rpx; margin-top: 4rpx; }
.item-price { font-size: 27rpx; }
.fee-line { display: flex; justify-content: space-between; padding: 10rpx 0; font-size: 25rpx; color: #606266; }
.fee-line.total { border-top: 1rpx solid #eee; margin-top: 8rpx; padding-top: 16rpx; font-size: 30rpx; font-weight: 600; color: #303133; }
.info { display: flex; gap: 16rpx; padding: 8rpx 0; font-size: 26rpx; }
.label { color: #909399; flex: 0 0 100rpx; }
.address { flex: 1; line-height: 1.5; }
.snapshot-tip { display: block; margin-top: 10rpx; color: #909399; font-size: 22rpx; line-height: 1.5; }
.notice { margin-top: 12rpx; padding: 12rpx; background: #fdf6ec; color: #b88230; font-size: 23rpx; border-radius: 8rpx; }
.aftersale-row { display: flex; justify-content: space-between; padding: 12rpx 0; border-bottom: 1rpx solid #f2f2f2; }
.aftersale-reason { display: block; font-size: 26rpx; }
.aftersale-sub { display: block; color: #909399; font-size: 22rpx; margin-top: 4rpx; }
.aftersale-amount { font-size: 26rpx; color: #b88230; }
.actions { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 10rpx; }
.primary-btn, .ghost-btn { flex: 1; min-width: 220rpx; border-radius: 44rpx; font-size: 28rpx; }
.primary-btn { background: #409eff; color: #fff; }
.ghost-btn { background: #ecf5ff; color: #409eff; }
</style>
