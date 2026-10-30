<template>
  <view class="supplement-order-detail">
    <view class="header">
      <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
      <view class="nav-bar">
        <view class="back-btn" @tap="goBack">
          <text class="back-icon">←</text>
        </view>
        <text class="header-title">补剂订单详情</text>
        <view class="header-actions"></view>
      </view>
    </view>

    <view class="header-placeholder" :style="{ height: statusBarHeight + 88 + 'px' }"></view>

    <view v-if="loading && !order" class="state-block">
      <text class="state-text">加载中…</text>
    </view>

    <view v-else-if="!order" class="state-block">
      <text class="state-text">订单不存在或已被删除</text>
    </view>

    <template v-else>
      <!-- 订单概况 -->
      <view class="card">
        <view class="card-head">
          <text class="order-no">{{ order.orderNo }}</text>
          <text class="status-tag" :class="statusClass(order.status)">
            {{ statusText(order.status) }}
          </text>
        </view>
        <view class="info-row">
          <text class="info-label">顾客</text>
          <text class="info-value">
            {{ order.receiverName || '—' }}<text v-if="order.receiverPhone"> · {{ order.receiverPhone }}</text>
          </text>
        </view>
        <view class="info-row">
          <text class="info-label">地址</text>
          <text class="info-value">{{ fullAddress }}</text>
        </view>
        <view v-if="order.remark" class="info-row">
          <text class="info-label">备注</text>
          <text class="info-value">{{ order.remark }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">下单</text>
          <text class="info-value">{{ formatTime(order.createdAt) }}</text>
        </view>
        <view v-if="order.trackingNumber" class="info-row">
          <text class="info-label">快递</text>
          <text class="info-value">{{ order.trackingNumber }}</text>
        </view>
        <!-- 旧的售后字段：新售后单已经有了独立的「售后记录」区块，
             两边都在就不再重复显示一遍 -->
        <view
          v-if="order.aftersaleReason && !(order.aftersaleCases || []).length"
          class="info-row"
        >
          <text class="info-label">售后</text>
          <text class="info-value info-value--warn">
            {{ order.aftersaleType === 'REFUND' ? '退款' : '重做' }} · {{ order.aftersaleReason }}
          </text>
        </view>
      </view>

      <!-- 售后记录（2026-10-30）：补剂售后从工作台收口到订单中心后，
           这里是员工看「这单提过几次售后、到哪一步、为什么」的地方。
           一单可能有好几条（比如先被驳回、后来又退款），按时间倒序全列出来。 -->
      <view v-if="(order.aftersaleCases || []).length" class="card">
        <view class="section-head">
          <text class="section-title">售后记录</text>
          <text class="section-sub">
            {{ (order.aftersaleCases || []).length }} 条
          </text>
        </view>

        <view
          v-for="record in order.aftersaleCases || []"
          :key="record.id"
          class="aftersale-row"
        >
          <view class="aftersale-head">
            <text class="aftersale-no">{{ record.caseNo }}</text>
            <text class="aftersale-status" :class="aftersaleTone(record.status)">
              {{ aftersaleStatusText(record.status) }}
            </text>
          </view>
          <view class="info-row">
            <text class="info-label">诉求</text>
            <text class="info-value">{{ aftersaleTypeText(record.requestType) }}</text>
          </view>
          <view class="info-row">
            <text class="info-label">原因</text>
            <text class="info-value">{{ record.requestedReason || '—' }}</text>
          </view>
          <view v-if="record.reshipOrderNo" class="info-row">
            <text class="info-label">补发单</text>
            <text class="info-value">{{ record.reshipOrderNo }}</text>
          </view>
          <view class="info-row">
            <text class="info-label">申请</text>
            <text class="info-value">{{ formatTime(record.createdAt) }}</text>
          </view>
        </view>
      </view>

      <!-- 补剂清单 -->
      <view class="card">
        <view class="section-head">
          <text class="section-title">补剂清单</text>
          <text class="section-sub">
            {{ (order.items || []).length }} 种 · 共 {{ order.bagCount }} 袋<text
              v-if="order.portionMultiplier > 1"
            >（{{ order.portionMultiplier }} 份）</text>
          </text>
        </view>

        <view v-for="item in order.items || []" :key="item.id" class="item-row">
          <view class="item-main">
            <text class="item-name">{{ item.name }}</text>
            <text class="item-spec">
              每袋 {{ formatAmount(item.packedAmount) }}{{ item.unit }} · 共 {{ item.bags }} 袋
            </text>
            <text v-if="item.brand || item.productModel" class="item-source">
              {{ [item.brand, item.productModel].filter(Boolean).join(' · ') }}
            </text>
          </view>
          <view class="item-side">
            <text v-if="item.packedAt" class="item-packed">已分装</text>
            <text v-else class="item-unpacked">待分装</text>
          </view>
        </view>
      </view>

      <!-- 分装工单：只在待分装/分装中时展开 -->
      <view v-if="canPack" class="card">
        <view class="section-head">
          <text class="section-title">分装工单</text>
          <text class="section-sub">填原瓶到期日，系统自动算标签效期</text>
        </view>

        <view v-for="(item, index) in order.items || []" :key="item.id" class="pack-row">
          <text class="pack-name">{{ item.name }}</text>
          <view class="pack-fields">
            <input
              class="pack-input"
              v-model="packForm[index].batchNo"
              placeholder="批号（可留空）"
            />
            <picker
              mode="date"
              :value="packForm[index].sourceExpiryDate"
              @change="(e: any) => onExpiryChange(index, e)"
            >
              <view class="pack-picker" :class="{ 'pack-picker--empty': !packForm[index].sourceExpiryDate }">
                <text class="pack-picker-text">
                  {{ packForm[index].sourceExpiryDate || '选择原瓶到期日' }}
                </text>
              </view>
            </picker>
          </view>
        </view>

        <button class="primary-btn" :disabled="submitting" @tap="handlePack">
          {{ submitting ? '提交中…' : '提交分装结果' }}
        </button>
      </view>

      <!-- 分装日：员工只读，排期由管理员操作 -->
      <view v-if="order.status === 'PAID'" class="card">
        <view class="section-head">
          <text class="section-title">分装日</text>
          <text class="section-sub">{{ order.packingDate || '待管理员排期' }}</text>
        </view>
      </view>

      <!-- 操作 -->
      <view class="action-bar">
        <button
          v-if="order.status === 'PENDING_PAYMENT'"
          class="primary-btn"
          :disabled="submitting"
          @tap="handleConfirmPayment"
        >
          确认收款
        </button>

        <button
          v-if="order.status === 'PACKED'"
          class="primary-btn"
          @tap="goToLabels"
        >
          打印标签（{{ order.bagCount }} 张）
        </button>

        <button
          v-if="order.status === 'PACKED'"
          class="primary-btn"
          :disabled="submitting"
          @tap="handleShip"
        >
          填单号发货
        </button>

        <button
          v-if="order.status === 'SHIPPED'"
          class="secondary-btn"
          @tap="goToLabels"
        >
          重新打印标签
        </button>

        <button
          v-if="order.status === 'PENDING_PAYMENT'"
          class="secondary-btn"
          :disabled="submitting"
          @tap="handleCancel"
        >
          取消订单
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  staffSupplementOrderApi,
  type StaffSupplementOrder,
  type SupplementOrderStatus,
} from '../../api/staff-supplement-orders'

const statusBarHeight = ref(0)
const orderId = ref('')
const order = ref<StaffSupplementOrder | null>(null)
const loading = ref(false)
const submitting = ref(false)

/** 每个补剂一条：同一补剂的多袋共用同一批号与原瓶到期日 */
const packForm = reactive<Array<{ batchNo: string; sourceExpiryDate: string }>>([])

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

/** 售后单的说法跟后台「补剂售后」页保持一致，别在这里另造一套词 */
const AFTERSALE_STATUS_TEXT: Record<string, string> = {
  PENDING: '待受理',
  PROCESSING: '处理中',
  RESOLVED: '已解决',
  REJECTED: '已驳回',
  CANCELLED: '已撤回',
}
const AFTERSALE_TYPE_TEXT: Record<string, string> = {
  REFUND: '退款',
  RESHIP: '补发',
  OTHER: '其他',
}

function aftersaleStatusText(value: string) {
  return AFTERSALE_STATUS_TEXT[value] || value
}

function aftersaleTypeText(value: string) {
  return AFTERSALE_TYPE_TEXT[value] || value
}

/** 只有「待受理 / 处理中」用橙色；已结束的一律灰色，不抢注意力 */
function aftersaleTone(value: string) {
  return value === 'PENDING' || value === 'PROCESSING' ? 'is-open' : 'is-closed'
}

const canPack = computed(() =>
  order.value ? ['PAID', 'PACKING'].includes(order.value.status) : false,
)

const fullAddress = computed(() => {
  if (!order.value) return '—'
  return [order.value.receiverRegion, order.value.receiverDetail].filter(Boolean).join(' ') || '—'
})

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatTime(value: string) {
  if (!value) return '—'
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function syncPackForm() {
  packForm.length = 0
  for (const item of order.value?.items || []) {
    packForm.push({
      batchNo: item.batchNo || '',
      // 已分装过的（比如补打）带出原值，避免重填
      sourceExpiryDate: item.sourceExpiryDate ? item.sourceExpiryDate.slice(0, 10) : '',
    })
  }
}

function onExpiryChange(index: number, event: { detail: { value: string } }) {
  packForm[index].sourceExpiryDate = event.detail.value
}

async function fetchOrder() {
  loading.value = true
  try {
    const res = await staffSupplementOrderApi.detail(orderId.value)
    if (res.code === 0 && res.data) {
      order.value = res.data
      syncPackForm()
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' })
    }
  } catch (error) {
    console.error('[SupplementOrderDetail] 加载失败:', error)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function handleConfirmPayment() {
  uni.showModal({
    title: '确认收款',
    content: '确认已收到这笔款项？确认后订单进入待分装。',
    success: async (res) => {
      if (!res.confirm) return
      submitting.value = true
      try {
        const response = await staffSupplementOrderApi.confirmPayment(orderId.value)
        if (response.code === 0) {
          uni.showToast({ title: '已确认收款', icon: 'success' })
          await fetchOrder()
        } else {
          uni.showToast({ title: response.message || '操作失败', icon: 'none' })
        }
      } catch (error) {
        console.error('[SupplementOrderDetail] 确认收款失败:', error)
        uni.showToast({ title: '操作失败', icon: 'none' })
      } finally {
        submitting.value = false
      }
    },
  })
}

function handlePack() {
  const items = (order.value?.items || []).map((item, index) => ({
    itemId: item.id,
    batchNo: packForm[index]?.batchNo || undefined,
    sourceExpiryDate: packForm[index]?.sourceExpiryDate || '',
  }))

  const missing = (order.value?.items || []).filter((_, index) => !packForm[index]?.sourceExpiryDate)
  if (missing.length > 0) {
    uni.showToast({
      title: `还有 ${missing.length} 个补剂没填原瓶到期日`,
      icon: 'none',
    })
    return
  }

  uni.showModal({
    title: '提交分装结果',
    content: '提交后即可打印标签。标签效期 = min(原瓶到期日, 分装日 + 效期系数)。',
    success: async (res) => {
      if (!res.confirm) return
      submitting.value = true
      try {
        const response = await staffSupplementOrderApi.pack(orderId.value, items)
        if (response.code === 0) {
          if (response.data?.inventoryWarnings?.length) {
            uni.showModal({
              title: '库存提示',
              content: `分装已完成，但库存不足（不阻断）：\n${response.data.inventoryWarnings.join('\n')}`,
              showCancel: false,
            })
          } else {
            uni.showToast({ title: '分装完成', icon: 'success' })
          }
          await fetchOrder()
        } else {
          uni.showToast({ title: response.message || '提交失败', icon: 'none' })
        }
      } catch (error) {
        console.error('[SupplementOrderDetail] 提交分装失败:', error)
        uni.showToast({ title: '提交失败', icon: 'none' })
      } finally {
        submitting.value = false
      }
    },
  })
}

function handleShip() {
  uni.showModal({
    title: '填快递单号',
    editable: true,
    placeholderText: '请输入快递单号',
    success: async (res) => {
      if (!res.confirm) return
      const trackingNumber = (res.content || '').trim()
      if (!trackingNumber) {
        uni.showToast({ title: '单号不能为空', icon: 'none' })
        return
      }
      submitting.value = true
      try {
        const response = await staffSupplementOrderApi.ship(orderId.value, trackingNumber)
        if (response.code === 0) {
          uni.showToast({ title: '已发货', icon: 'success' })
          await fetchOrder()
        } else {
          uni.showToast({ title: response.message || '发货失败', icon: 'none' })
        }
      } catch (error) {
        console.error('[SupplementOrderDetail] 发货失败:', error)
        uni.showToast({ title: '发货失败', icon: 'none' })
      } finally {
        submitting.value = false
      }
    },
  })
}

function handleCancel() {
  uni.showModal({
    title: '取消订单',
    content: '确认取消这张补剂订单？',
    success: async (res) => {
      if (!res.confirm) return
      submitting.value = true
      try {
        const response = await staffSupplementOrderApi.cancel(orderId.value)
        if (response.code === 0) {
          uni.showToast({ title: '已取消', icon: 'success' })
          await fetchOrder()
        } else {
          uni.showToast({ title: response.message || '取消失败', icon: 'none' })
        }
      } catch (error) {
        console.error('[SupplementOrderDetail] 取消失败:', error)
        uni.showToast({ title: '取消失败', icon: 'none' })
      } finally {
        submitting.value = false
      }
    },
  })
}

function goToLabels() {
  uni.navigateTo({ url: `/pages/staff-supplement-orders/labels?id=${orderId.value}` })
}

function goBack() {
  uni.navigateBack()
}

onLoad((options) => {
  const info = uni.getSystemInfoSync()
  statusBarHeight.value = info.statusBarHeight || 0
  orderId.value = (options?.id as string) || ''
  if (!orderId.value) {
    uni.showToast({ title: '缺少订单参数', icon: 'none' })
    return
  }
  void fetchOrder()
})
</script>

<style lang="scss" scoped>
.supplement-order-detail {
  min-height: 100vh;
  background-color: #f7f8f2;
  padding-bottom: 60rpx;
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
}

.header-placeholder {
  width: 100%;
}

.state-block {
  padding: 160rpx 40rpx;
  text-align: center;
}

.state-text {
  font-size: 26rpx;
  color: #968f6d;
}

.card {
  margin: 24rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background-color: #ffffff;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.order-no {
  font-size: 30rpx;
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

.info-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 12rpx;
}

.info-row--total {
  margin-top: 4rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid #f2f4ea;
}

.info-label {
  width: 150rpx;
  font-size: 26rpx;
  color: #968f6d;
}

.info-value {
  flex: 1;
  font-size: 26rpx;
  color: #26261f;
}

.info-value--warn {
  color: #a97c33;
}

/* 售后记录（2026-10-30）：一条一条分开，多条时能看出是两次不同的申请 */
.aftersale-row {
  margin-top: 16rpx;
}
.aftersale-row + .aftersale-row {
  padding-top: 18rpx;
  border-top: 1rpx solid #f2f4ea;
}
.aftersale-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10rpx;
}
.aftersale-no {
  font-size: 26rpx;
  color: #26261f;
  font-family: monospace;
}
.aftersale-status {
  flex: none;
  padding: 4rpx 14rpx;
  border-radius: 16rpx;
  font-size: 22rpx;
}
.aftersale-status.is-open {
  background: #fdf6ec;
  color: #b88230;
}
.aftersale-status.is-closed {
  background: #f0f2f5;
  color: #8a8f99;
}

.total-value {
  flex: 1;
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.section-head {
  margin-bottom: 18rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #26261f;
}

.section-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #968f6d;
}

.item-row {
  display: flex;
  align-items: flex-start;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f7f8f2;
}

.item-row:last-child {
  border-bottom: none;
}

.item-main {
  flex: 1;
}

.item-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

.item-spec {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #6b6653;
}

.item-source {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #968f6d;
}

.item-side {
  margin-left: 16rpx;
}

.item-packed {
  font-size: 22rpx;
  color: #2b5040;
}

.item-unpacked {
  font-size: 22rpx;
  color: #a97c33;
}

.pack-row {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f7f8f2;
}

.pack-name {
  font-size: 27rpx;
  font-weight: 600;
  color: #26261f;
}

.pack-fields {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
}

.pack-input {
  flex: 1;
  height: 68rpx;
  padding: 0 18rpx;
  margin-right: 16rpx;
  border-radius: 10rpx;
  background-color: #f7f8f2;
  font-size: 26rpx;
  color: #26261f;
}

.pack-picker {
  flex: 1;
  height: 68rpx;
  display: flex;
  align-items: center;
  padding: 0 18rpx;
  border-radius: 10rpx;
  background-color: #f7f8f2;
}

.pack-picker--empty {
  border: 1rpx dashed #d8bc85;
}

.pack-picker-text {
  font-size: 26rpx;
  color: #26261f;
}

.schedule-picker {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22rpx 24rpx;
  background: #f5f7fa;
  border-radius: 10rpx;
  color: #303133;
  font-size: 28rpx;
  margin-bottom: 16rpx;
}
.schedule-arrow { color: #c0c4cc; font-size: 34rpx; }
.secondary-btn {
  margin-top: 12rpx;
  background: #ecf5ff;
  color: #409eff;
  border-radius: 40rpx;
  font-size: 28rpx;
}
.primary-btn {
  margin-top: 24rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 12rpx;
  background-color: #1e3a2f;
  color: #fbfcf7;
  font-size: 30rpx;
}

.primary-btn[disabled] {
  opacity: 0.6;
}

.secondary-btn {
  margin-top: 20rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 12rpx;
  background-color: #f2f4ea;
  color: #2b5040;
  font-size: 30rpx;
}

.action-bar {
  padding: 0 24rpx;
}
</style>
