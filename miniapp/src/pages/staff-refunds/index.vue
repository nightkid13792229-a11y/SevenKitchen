<template>
  <view class="refund-page">
    <view class="header">
      <text class="title">退款管理</text>
      <text class="subtitle">审核客户提交的退款申请，并保留审核人记录</text>
    </view>

    <view class="summary-card">
      <view class="summary-item">
        <text class="summary-value">{{ refundOrders.length }}</text>
        <text class="summary-label">待审核</text>
      </view>
      <view class="summary-divider"></view>
      <view class="summary-item">
        <text class="summary-value">¥{{ totalRefundAmount }}</text>
        <text class="summary-label">申请金额</text>
      </view>
    </view>

    <view v-if="loading" class="state-card">
      <text>加载中...</text>
    </view>

    <view v-else-if="refundOrders.length === 0" class="state-card">
      <text class="empty-title">暂无待审核退款</text>
      <text class="empty-copy">客户提交退款申请后会出现在这里。</text>
    </view>

    <view v-else class="refund-list">
      <view v-for="order in refundOrders" :key="order.id" class="refund-card">
        <view class="card-header">
          <view class="order-main">
            <text class="order-id">订单 #{{ shortOrderId(order.id) }}</text>
            <text class="order-time">{{ formatDateTime(order.aftersaleSince || order.createdAt) }}</text>
          </view>
          <text class="status-pill">{{ getStatusText(order.status) }}</text>
        </view>

        <view class="info-row">
          <text class="info-label">订单内容</text>
          <text class="info-value">{{ getOrderItemsText(order) }}</text>
        </view>
        <view class="amount-row">
          <text class="amount-label">订单金额</text>
          <text class="amount-value">¥{{ formatAmount(order.amountTotal || order.totalAmount) }}</text>
        </view>

        <view class="info-row">
          <text class="info-label">客户</text>
          <text class="info-value">{{ getCustomerText(order) }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">支付方式</text>
          <text class="info-value">{{ getPaymentText(order.paymentMethod) }}</text>
        </view>
        <view class="reason-box">
          <text class="reason-label">退款理由</text>
          <text class="reason-text">{{ order.aftersaleReason || '-' }}</text>
        </view>

        <view v-if="order.aftersalePhotos?.length" class="photo-row">
          <image
            v-for="(photo, index) in order.aftersalePhotos"
            :key="photo"
            :src="photo"
            class="proof-photo"
            mode="aspectFill"
            @tap="previewPhotos(order.aftersalePhotos || [], index)"
          />
        </view>

        <view class="action-row">
          <button class="action-btn secondary" @tap="rejectRefund(order)">驳回</button>
          <button class="action-btn primary" @tap="approveRefund(order)">审核通过</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import { formatDateTime } from '../../utils/date'

interface RefundOrder {
  id: string
  status: string
  createdAt?: string
  amountTotal?: number
  totalAmount?: number
  paymentMethod?: string | null
  aftersaleType?: string | null
  aftersaleReason?: string | null
  aftersaleSince?: string | null
  aftersalePhotos?: string[]
  items?: RefundOrderItem[]
  firstItem?: RefundOrderItem | null
  customer?: {
    nickname?: string | null
    phone?: string | null
  } | null
  customerName?: string | null
  customerPhone?: string | null
  address?: {
    recipientName?: string
    phone?: string
  } | null
}

interface RefundOrderItem {
  recipeSnapshot?: {
    name?: string | null
  } | null
  dog?: {
    name?: string | null
  } | null
  packageCount?: number | string | null
  packageSpecG?: number | string | null
  quantityG?: number | string | null
}

const loading = ref(false)
const refundOrders = ref<RefundOrder[]>([])

const totalRefundAmount = computed(() => {
  return refundOrders.value.reduce((sum, order) => sum + getAmount(order), 0).toFixed(2)
})

onShow(() => {
  if (!ensureAdminPermission()) return
  loadRefunds()
})

onPullDownRefresh(async () => {
  if (!ensureAdminPermission()) {
    uni.stopPullDownRefresh()
    return
  }
  await loadRefunds()
  uni.stopPullDownRefresh()
})

function ensureAdminPermission(): boolean {
  const user = getStoredUser()
  if (user?.role === 'ADMIN') {
    return true
  }

  uni.showToast({
    title: '仅管理员可审核退款',
    icon: 'none',
  })
  setTimeout(() => {
    uni.navigateBack({
      fail: () => uni.switchTab({ url: '/pages/staff-workbench/index' }),
    })
  }, 800)
  return false
}

async function loadRefunds() {
  loading.value = true
  try {
    const res = await request({
      url: '/orders/aftersale/pending',
      method: 'GET',
    })
    if (res.code !== 0) {
      throw new Error(res.message || '退款申请加载失败')
    }
    const list = Array.isArray(res.data) ? res.data : []
    refundOrders.value = list.filter((order: RefundOrder) => order.aftersaleType === 'REFUND')
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '退款申请加载失败',
      icon: 'none',
    })
  } finally {
    loading.value = false
  }
}

function approveRefund(order: RefundOrder) {
  uni.showModal({
    title: '审核通过',
    content: buildRefundReviewContent(order, 'approve'),
    confirmText: '通过',
    cancelText: '取消',
    success: async (res) => {
      if (!res.confirm) return
      await resolveRefund(order, 'refunded')
    },
  })
}

function rejectRefund(order: RefundOrder) {
  uni.showModal({
    title: '驳回退款',
    content: buildRefundReviewContent(order, 'reject'),
    confirmText: '驳回',
    cancelText: '取消',
    success: async (res) => {
      if (!res.confirm) return
      await resolveRefund(order, 'resolved')
    },
  })
}

async function resolveRefund(order: RefundOrder, resolutionType: 'refunded' | 'resolved') {
  try {
    uni.showLoading({ title: '处理中...' })
    const reviewer = getReviewerText()
    const actionText = resolutionType === 'refunded' ? '退款审核通过' : '退款审核驳回'
    const res = await request({
      url: `/orders/${order.id}/aftersale/resolve`,
      method: 'POST',
      data: {
        resolutionType,
        adminNote: `${actionText}；审核人：${reviewer}`,
      },
    })
    if (res.code !== 0) {
      throw new Error(res.message || '审核处理失败')
    }
    uni.showToast({
      title: resolutionType === 'refunded' ? '已通过' : '已驳回',
      icon: 'success',
    })
    await loadRefunds()
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '审核处理失败',
      icon: 'none',
    })
  } finally {
    uni.hideLoading()
  }
}

function getReviewerText(): string {
  const user = getStoredUser()
  const name = user?.nickname || user?.name || user?.phone || '当前管理员'
  const id = user?.id || user?.userId
  return id ? `${name}(${id})` : name
}

function getStoredUser() {
  const storedUser = uni.getStorageSync('user') || uni.getStorageSync('userInfo')
  return typeof storedUser === 'string' ? tryParseJson(storedUser) : storedUser
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function getAmount(order: RefundOrder): number {
  const raw = order.amountTotal ?? order.totalAmount ?? 0
  const amount = Number(raw)
  return Number.isFinite(amount) ? amount : 0
}

function formatAmount(value?: number | string | null): string {
  return Number(value || 0).toFixed(2)
}

function shortOrderId(orderId: string): string {
  return orderId ? orderId.slice(-8).toUpperCase() : '-'
}

function buildRefundReviewContent(order: RefundOrder, action: 'approve' | 'reject'): string {
  const title = action === 'approve' ? '确认通过该退款申请？' : '确认驳回该退款申请？'
  const lines = [
    title,
    `订单：#${shortOrderId(order.id)}`,
    `客户：${getCustomerText(order)}`,
    `商品：${getOrderItemsText(order)}`,
    `金额：¥${formatAmount(order.amountTotal || order.totalAmount)}`,
    `理由：${order.aftersaleReason || '未填写'}`,
  ]
  if (action === 'reject') {
    lines.push('处理后订单会回到申请售后前的状态。')
  }
  return lines.join('\n')
}

function getStatusText(status?: string): string {
  const statusMap: Record<string, string> = {
    AFTERSALE: '退款审核中',
    CANCELLED: '已退款',
    COMPLETED: '已完成',
  }
  return statusMap[status || ''] || status || '-'
}

function getPaymentText(paymentMethod?: string | null): string {
  const paymentMap: Record<string, string> = {
    WECHAT_PAY: '微信线上支付',
    OFFLINE_WECHAT: '线下微信收款',
    ADMIN: '后台确认',
  }
  return paymentMap[paymentMethod || ''] || paymentMethod || '未记录'
}

function getCustomerText(order: RefundOrder): string {
  const name = order.customer?.nickname || order.customerName || order.address?.recipientName || '未记录客户'
  const phone = order.customer?.phone || order.customerPhone || order.address?.phone || ''
  return phone ? `${name} ${phone}` : name
}

function getOrderItemsText(order: RefundOrder): string {
  const items = Array.isArray(order.items) ? order.items : []
  const item = order.firstItem || items[0]
  if (!item) return '未记录商品'

  const recipeName = item.recipeSnapshot?.name || '未命名食谱'
  const dogName = item.dog?.name ? `（${item.dog.name}）` : ''
  const packageCount = item.packageCount ? `${item.packageCount}份` : ''
  const packageSpec = item.packageSpecG ? `${item.packageSpecG}g` : ''
  const quantity = !packageCount && item.quantityG ? `${item.quantityG}g` : ''
  const spec = [packageCount, packageSpec || quantity].filter(Boolean).join('/')
  const more = items.length > 1 ? ` 等${items.length}项` : ''

  return `${recipeName}${dogName}${spec ? ` ${spec}` : ''}${more}`
}

function previewPhotos(photos: string[], current: number) {
  uni.previewImage({
    current,
    urls: photos,
  })
}
</script>

<style scoped lang="scss">
.refund-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f6f7f9;
  box-sizing: border-box;
}

.header {
  padding: 32rpx 28rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #305cde 0%, #6b4edc 100%);
  color: #fff;
}

.title {
  display: block;
  font-size: 42rpx;
  font-weight: 800;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 25rpx;
  color: rgba(255, 255, 255, 0.86);
}

.summary-card {
  display: flex;
  align-items: center;
  margin: 24rpx 0;
  padding: 28rpx;
  border-radius: 16rpx;
  background: #fff;
}

.summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.summary-value {
  font-size: 38rpx;
  font-weight: 800;
  color: #1f2937;
}

.summary-label {
  font-size: 24rpx;
  color: #7b8794;
}

.summary-divider {
  width: 1rpx;
  height: 68rpx;
  background: #edf0f2;
}

.state-card {
  min-height: 260rpx;
  border-radius: 16rpx;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  color: #7b8794;
  font-size: 28rpx;
}

.empty-title {
  font-size: 32rpx;
  color: #1f2937;
  font-weight: 700;
}

.empty-copy {
  font-size: 25rpx;
  color: #7b8794;
}

.refund-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.refund-card {
  padding: 24rpx;
  border-radius: 16rpx;
  background: #fff;
}

.card-header,
.amount-row,
.info-row,
.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.order-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.order-id {
  font-size: 31rpx;
  font-weight: 800;
  color: #1f2937;
}

.order-time {
  font-size: 23rpx;
  color: #8b949e;
}

.status-pill {
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  background: #fff4e6;
  color: #ad5a00;
  font-size: 23rpx;
  font-weight: 700;
}

.amount-row {
  margin-top: 22rpx;
  padding: 18rpx;
  border-radius: 12rpx;
  background: #fff7f5;
}

.amount-label,
.info-label,
.reason-label {
  font-size: 25rpx;
  color: #7b8794;
}

.amount-value {
  font-size: 34rpx;
  font-weight: 800;
  color: #e54d42;
}

.info-row {
  margin-top: 16rpx;
}

.info-value {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 26rpx;
  color: #1f2937;
  word-break: break-all;
}

.reason-box {
  margin-top: 18rpx;
  padding: 18rpx;
  border-radius: 12rpx;
  background: #f8fafc;
}

.reason-label,
.reason-text {
  display: block;
}

.reason-text {
  margin-top: 10rpx;
  font-size: 27rpx;
  line-height: 1.55;
  color: #1f2937;
  word-break: break-word;
}

.photo-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 18rpx;
}

.proof-photo {
  width: 132rpx;
  height: 132rpx;
  border-radius: 10rpx;
  background: #edf2f7;
}

.action-row {
  margin-top: 22rpx;
}

.action-btn {
  flex: 1;
  height: 76rpx;
  line-height: 1;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 700;
  border: none;
}

.action-btn::after {
  border: none;
}

.action-btn.primary {
  background: #1890ff;
  color: #fff;
}

.action-btn.secondary {
  background: #f3f4f6;
  color: #4b5563;
}
</style>
