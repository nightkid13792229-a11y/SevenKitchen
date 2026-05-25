<template>
  <view class="cs-order-page">
    <view v-if="loading" class="state-card">正在加载客服处理页...</view>

    <view v-else-if="loadError" class="state-card">
      <text class="state-title">无法打开客服处理页</text>
      <text class="state-copy">{{ loadError }}</text>
      <button class="primary-btn" @tap="goStaffLogin">员工登录</button>
      <button class="ghost-btn" @tap="goHome">返回首页</button>
    </view>

    <view v-else-if="workspace" class="content">
      <view class="top-panel">
        <view>
          <text class="eyebrow">客服处理视角</text>
          <text class="title">订单 #{{ shortId(order.id) }}</text>
          <text class="subtitle">这里只给员工和管理员使用，客户操作按钮不会出现在这里。</text>
        </view>
        <text class="status-pill">{{ statusText(order.status) }}</text>
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">客户信息</text>
          <button class="mini-btn" @tap="copyCustomerPhone" :disabled="!customer.phone">复制手机号</button>
        </view>
        <view class="info-grid">
          <view class="info-item">
            <text class="label">客户</text>
            <text class="value">{{ customer.nickname || customer.phone || customer.id }}</text>
          </view>
          <view class="info-item">
            <text class="label">手机号</text>
            <text class="value">{{ customer.phone || '未绑定' }}</text>
          </view>
          <view class="info-item">
            <text class="label">用户类型</text>
            <text class="value">{{ roleText(customer.role) }}</text>
          </view>
          <view class="info-item">
            <text class="label">微信身份</text>
            <text class="value">{{ customer.wechatIdentities?.length || 0 }} 个</text>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">订单概览</text>
          <view class="section-actions">
            <button
              v-if="workspace.actionFlags.canAdjustPrice"
              class="mini-btn price-btn"
              @tap="openAmountPanel"
            >
              待支付改价
            </button>
            <button class="mini-btn" @tap="copyOrderId">复制订单号</button>
          </view>
        </view>
        <view class="info-grid">
          <view class="info-item">
            <text class="label">金额</text>
            <text class="amount">¥{{ money(order.amountTotal || order.totalAmount) }}</text>
            <text
              v-if="workspace.actionFlags.canAdjustPrice"
              class="amount-hint"
              @tap="openAmountPanel"
            >
              当前订单未支付，可由客服改价
            </text>
          </view>
          <view class="info-item">
            <text class="label">支付状态</text>
            <text class="value">{{ paymentText(order.paymentStatus, order.paidAt) }}</text>
          </view>
          <view class="info-item">
            <text class="label">支付方式</text>
            <text class="value">{{ methodText(order.paymentMethod) }}</text>
          </view>
          <view class="info-item">
            <text class="label">创建时间</text>
            <text class="value">{{ dateTime(order.createdAt) }}</text>
          </view>
          <view class="info-item wide" v-if="order.transactionId">
            <text class="label">微信交易号</text>
            <text class="value wrap">{{ order.transactionId }}</text>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="section-title">商品信息</view>
        <view v-for="item in order.items" :key="item.id" class="product-row">
          <image
            v-if="item.recipeSnapshot?.coverImageUrl"
            class="product-image"
            :src="item.recipeSnapshot.coverImageUrl"
            mode="aspectFill"
          />
          <view class="product-main">
            <text class="product-name">{{ item.recipeSnapshot?.name || '自定义食谱' }}</text>
            <text class="product-meta">
              {{ item.packageSpecG }}g/包 · {{ item.packageCount }}包 · 共{{ item.quantityG }}g
            </text>
            <text class="product-meta" v-if="item.customRequirements">
              备注：{{ item.customRequirements }}
            </text>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">收货地址</text>
          <button
            v-if="workspace.actionFlags.canEditAddress"
            class="mini-btn"
            @tap="openAddressPanel"
          >
            修改地址
          </button>
        </view>
        <view v-if="order.address" class="address-box">
          <text class="address-name">{{ order.address.recipientName }} {{ order.address.phone }}</text>
          <text class="address-detail">
            {{ order.address.regionText }} {{ order.address.detailAddress }}
          </text>
        </view>
        <view v-else class="empty-box">客户暂未填写收货地址</view>
        <text v-if="!workspace.actionFlags.canEditAddress" class="hint">已发货、已完成或已取消订单不允许修改地址。</text>
      </view>

      <view class="section" v-if="order.aftersaleType || order.aftersaleReason">
        <view class="section-title">售后信息</view>
        <view class="info-grid">
          <view class="info-item">
            <text class="label">售后类型</text>
            <text class="value">{{ aftersaleTypeText(order.aftersaleType) }}</text>
          </view>
          <view class="info-item">
            <text class="label">申请时间</text>
            <text class="value">{{ dateTime(order.aftersaleSince) }}</text>
          </view>
          <view class="info-item wide">
            <text class="label">客户原因</text>
            <text class="value wrap">{{ order.aftersaleReason || '-' }}</text>
          </view>
        </view>
        <view v-if="order.aftersalePhotos?.length" class="photo-row">
          <image
            v-for="(photo, index) in order.aftersalePhotos"
            :key="photo"
            :src="photo"
            class="proof-photo"
            mode="aspectFill"
            @tap="previewPhotos(order.aftersalePhotos, index)"
          />
        </view>
      </view>

      <view class="section">
        <view class="section-head">
          <text class="section-title">客服备注</text>
          <button class="mini-btn" @tap="openRemarkPanel">编辑备注</button>
        </view>
        <text class="remark-text">{{ order.adminRemark || '暂无内部备注' }}</text>
      </view>

      <view class="section" v-if="workspace.refundRecords.length">
        <view class="section-title">退款记录</view>
        <view v-for="record in workspace.refundRecords" :key="record.id" class="record-row">
          <view>
            <text class="record-title">{{ refundStatusText(record) }}</text>
            <text class="record-copy">退款单号：{{ record.outRefundNo }}</text>
            <text class="record-copy">处理人：{{ record.operatorName || record.operatorPhone || '-' }}</text>
          </view>
          <text class="record-amount">¥{{ money(record.amount) }}</text>
        </view>
      </view>

      <view class="section">
        <view class="section-title">客服可操作事项</view>
        <view class="action-grid">
          <button class="action-btn" @tap="openRemarkPanel">写内部备注</button>
          <button
            class="action-btn"
            :disabled="!workspace.actionFlags.canEditAddress"
            @tap="openAddressPanel"
          >
            改收货地址
          </button>
          <button
            class="action-btn"
            :disabled="!workspace.actionFlags.canAdjustPrice"
            @tap="openAmountPanel"
          >
            待支付改价
          </button>
          <button
            class="action-btn danger"
            :disabled="!workspace.actionFlags.canApproveRefund"
            @tap="approveRefund"
          >
            {{ workspace.actionFlags.hasRefundRequest ? '同意并退款' : '管理员退款' }}
          </button>
          <button
            class="action-btn"
            :disabled="!workspace.actionFlags.canRejectAftersale"
            @tap="rejectAftersale"
          >
            驳回售后
          </button>
          <button
            class="action-btn danger-outline"
            :disabled="!workspace.actionFlags.canRetryRefund"
            @tap="retryRefund"
          >
            补发退款
          </button>
        </view>
        <text class="hint">退款相关操作仅管理员可执行；确认后会直接调用微信原路退款。</text>
      </view>

      <view class="section" v-if="workspace.conversations.length">
        <view class="section-title">咨询来源</view>
        <view v-for="conversation in workspace.conversations" :key="conversation.id" class="record-row">
          <view>
            <text class="record-title">{{ sourceText(conversation.sourceType) }}</text>
            <text class="record-copy">{{ conversation.sourceTitle || '-' }}</text>
          </view>
          <text class="record-time">{{ dateTime(conversation.updatedAt) }}</text>
        </view>
      </view>
    </view>

    <view v-if="remarkVisible" class="modal-mask" @tap="closeRemarkPanel">
      <view class="modal-panel" @tap.stop>
        <text class="modal-title">编辑客服备注</text>
        <textarea class="modal-textarea" v-model="remarkDraft" placeholder="填写内部备注，客户不可见" />
        <button class="primary-btn" :disabled="saving" @tap="saveRemark">保存备注</button>
        <button class="ghost-btn" @tap="closeRemarkPanel">取消</button>
      </view>
    </view>

    <view v-if="amountVisible" class="modal-mask" @tap="closeAmountPanel">
      <view class="modal-panel" @tap.stop>
        <text class="modal-title">待支付订单改价</text>
        <input class="modal-input" v-model="amountDraft" type="digit" placeholder="新的订单金额" />
        <textarea class="modal-textarea small" v-model="amountReason" placeholder="改价原因，例如客服协商优惠" />
        <text class="hint">仅待支付订单允许改价；已支付订单请走退款或补差流程。</text>
        <button class="primary-btn" :disabled="saving" @tap="saveAmount">确认改价</button>
        <button class="ghost-btn" @tap="closeAmountPanel">取消</button>
      </view>
    </view>

    <view v-if="addressVisible" class="modal-mask" @tap="closeAddressPanel">
      <view class="modal-panel address-modal" @tap.stop>
        <text class="modal-title">修改收货地址</text>
        <view v-if="addressLoading" class="empty-box">正在加载地址...</view>
        <view v-else class="address-list">
          <view
            v-for="address in customerAddresses"
            :key="address.id"
            class="address-option"
            @tap="bindAddress(address.id)"
          >
            <text class="address-name">{{ address.recipientName }} {{ address.phone }}</text>
            <text class="address-detail">{{ formatRegion(address.region) }} {{ address.detail }}</text>
          </view>
        </view>
        <view class="form-line">
          <input class="modal-input" v-model="addressForm.recipientName" placeholder="收货人姓名" />
          <input class="modal-input" v-model="addressForm.phone" type="number" placeholder="手机号" />
          <picker mode="region" :value="addressRegionValue" @change="onAddressRegionChange">
            <view class="picker-box">{{ addressRegionText || '选择省市区' }}</view>
          </picker>
          <textarea class="modal-textarea small" v-model="addressForm.detail" placeholder="详细地址" />
        </view>
        <button class="primary-btn" :disabled="saving" @tap="createAddress">新增并绑定地址</button>
        <button class="ghost-btn" @tap="closeAddressPanel">关闭</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import {
  bindOrderCustomerAddress,
  createOrderCustomerAddress,
  getStaffCustomerServiceOrder,
  listOrderCustomerAddresses,
  resolveOrderAftersale,
  retryWechatRefund,
  updateStaffCustomerServiceAmount,
  updateStaffCustomerServiceRemark,
  type StaffOrderAddress,
} from '../../api/orders'

type Workspace = {
  staff: { userId: string; role: string }
  customer: any
  order: any
  actionFlags: Record<string, boolean>
  refundRecords: any[]
  settlementAdjustments: any[]
  statusHistory: any[]
  conversations: any[]
}

const orderId = ref('')
const scene = ref('')
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const workspace = ref<Workspace | null>(null)
const remarkVisible = ref(false)
const remarkDraft = ref('')
const amountVisible = ref(false)
const amountDraft = ref('')
const amountReason = ref('')
const addressVisible = ref(false)
const addressLoading = ref(false)
const customerAddresses = ref<StaffOrderAddress[]>([])
const addressForm = reactive({
  recipientName: '',
  phone: '',
  region: {
    province: '',
    city: '',
    district: '',
  },
  detail: '',
  isDefault: false,
})

const order = computed(() => workspace.value?.order || {})
const customer = computed(() => workspace.value?.customer || {})
const addressRegionValue = computed(() => [
  addressForm.region.province,
  addressForm.region.city,
  addressForm.region.district,
])
const addressRegionText = computed(() => formatRegion(addressForm.region))

onLoad((options: any) => {
  orderId.value = String(options?.orderId || options?.id || '')
  scene.value = String(options?.scene || options?.type || '')
  if (!orderId.value) {
    loadError.value = '缺少订单号，无法定位客户咨询的订单。'
    return
  }
  loadWorkspace()
})

onPullDownRefresh(async () => {
  await loadWorkspace()
  uni.stopPullDownRefresh()
})

async function loadWorkspace() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getStaffCustomerServiceOrder(orderId.value)
    workspace.value = res.data as Workspace
  } catch (error: any) {
    loadError.value =
      error?.message === 'Authentication required'
        ? '请先使用员工或管理员账号登录，再从企业微信客服卡片进入处理。'
        : error?.message || '订单信息加载失败'
  } finally {
    loading.value = false
  }
}

function openRemarkPanel() {
  remarkDraft.value = order.value.adminRemark || ''
  remarkVisible.value = true
}

function closeRemarkPanel() {
  remarkVisible.value = false
}

async function saveRemark() {
  await runSaving(async () => {
    await updateStaffCustomerServiceRemark(orderId.value, remarkDraft.value)
    closeRemarkPanel()
    await loadWorkspace()
    toast('备注已保存')
  })
}

function openAmountPanel() {
  amountDraft.value = money(order.value.amountTotal || order.value.totalAmount)
  amountReason.value = ''
  amountVisible.value = true
}

function closeAmountPanel() {
  amountVisible.value = false
}

async function saveAmount() {
  const amount = Math.round(Number(amountDraft.value) * 100) / 100
  if (!Number.isFinite(amount) || amount < 0) {
    toast('请输入正确金额')
    return
  }
  uni.showModal({
    title: '确认改价',
    content: `订单金额将改为 ¥${money(amount)}，该操作只适用于未支付订单。`,
    success: async (res) => {
      if (!res.confirm) return
      await runSaving(async () => {
        await updateStaffCustomerServiceAmount(orderId.value, amount, amountReason.value || '客服协商改价')
        closeAmountPanel()
        await loadWorkspace()
        toast('改价已保存')
      })
    },
  })
}

async function openAddressPanel() {
  addressVisible.value = true
  addressLoading.value = true
  try {
    const res = await listOrderCustomerAddresses(orderId.value)
    customerAddresses.value = Array.isArray(res.data) ? res.data : []
  } catch (error: any) {
    toast(error?.message || '地址加载失败')
  } finally {
    addressLoading.value = false
  }
}

function closeAddressPanel() {
  addressVisible.value = false
}

async function bindAddress(addressId: string) {
  await runSaving(async () => {
    await bindOrderCustomerAddress(orderId.value, addressId)
    closeAddressPanel()
    await loadWorkspace()
    toast('地址已更新')
  })
}

async function createAddress() {
  if (!addressForm.recipientName || !addressForm.phone || !addressForm.detail || !addressForm.region.province) {
    toast('请完整填写地址')
    return
  }
  await runSaving(async () => {
    await createOrderCustomerAddress(orderId.value, { ...addressForm })
    closeAddressPanel()
    await loadWorkspace()
    toast('地址已新增并绑定')
  })
}

function onAddressRegionChange(event: any) {
  const value = event?.detail?.value || []
  addressForm.region.province = value[0] || ''
  addressForm.region.city = value[1] || ''
  addressForm.region.district = value[2] || ''
}

function approveRefund() {
  uni.showModal({
    title: '确认退款',
    content: [
      '该操作不可撤销。',
      '同意后将直接调用微信支付原路退回钱款。',
      `订单：${shortId(orderId.value)}`,
      `金额：¥${money(order.value.amountTotal || order.value.totalAmount)}`,
    ].join('\n'),
    confirmText: '确认退款',
    confirmColor: '#d93026',
    success: async (res) => {
      if (!res.confirm) return
      await runSaving(async () => {
        const amount = Number(order.value.amountTotal || order.value.totalAmount || 0)
        if (workspace.value?.actionFlags.hasRefundRequest) {
          await resolveOrderAftersale(orderId.value, 'refunded', '客服处理页同意退款')
        } else {
          await retryWechatRefund(orderId.value, amount, '管理员客服处理页主动退款')
        }
        await loadWorkspace()
        toast('退款已发起')
      })
    },
  })
}

function rejectAftersale() {
  uni.showModal({
    title: '驳回售后',
    content: '确认驳回该售后申请？建议先在企业微信里向客户说明原因。',
    success: async (res) => {
      if (!res.confirm) return
      await runSaving(async () => {
        await resolveOrderAftersale(orderId.value, 'resolved', '客服处理页驳回售后申请')
        await loadWorkspace()
        toast('售后已处理')
      })
    },
  })
}

function retryRefund() {
  const amount = Number(order.value.amountTotal || order.value.totalAmount || 0)
  uni.showModal({
    title: '补发退款',
    content: `系统检测到退款未成功到账时才建议使用。确认补发 ¥${money(amount)}？`,
    confirmText: '补发',
    confirmColor: '#d93026',
    success: async (res) => {
      if (!res.confirm) return
      await runSaving(async () => {
        await retryWechatRefund(orderId.value, amount, '客服处理页补发退款')
        await loadWorkspace()
        toast('退款已重新发起')
      })
    },
  })
}

async function runSaving(task: () => Promise<void>) {
  if (saving.value) return
  saving.value = true
  try {
    await task()
  } catch (error: any) {
    toast(error?.message || '操作失败')
  } finally {
    saving.value = false
  }
}

function previewPhotos(photos: string[], current: number) {
  uni.previewImage({ urls: photos, current: photos[current] })
}

function copyCustomerPhone() {
  if (!customer.value.phone) return
  copyText(customer.value.phone)
}

function copyOrderId() {
  copyText(orderId.value)
}

function copyText(value: string) {
  uni.setClipboardData({ data: value })
}

function goStaffLogin() {
  uni.navigateTo({ url: '/pages/login/staff' })
}

function goHome() {
  uni.switchTab({
    url: '/pages/home/index',
    fail: () => uni.reLaunch({ url: '/pages/home/index' }),
  })
}

function toast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

function shortId(value: string) {
  return value ? value.slice(-8) : '-'
}

function money(value: any) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function dateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatRegion(region?: { province?: string; city?: string; district?: string } | null) {
  if (!region) return ''
  return [region.province, region.city, region.district].filter(Boolean).join(' ')
}

function statusText(status?: string) {
  const map: Record<string, string> = {
    INIT: '待提交',
    PENDING_PAYMENT: '待支付',
    PAID: '已支付',
    PURCHASING: '采购中',
    IN_PRODUCTION: '制作中',
    FREEZING: '急冻中',
    SHIPPED: '待收货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    AFTERSALE: '售后中',
  }
  return map[status || ''] || status || '-'
}

function paymentText(status?: string | null, paidAt?: string | null) {
  if (status === 'SUCCESS' || paidAt) return '已支付'
  if (status === 'FAILED') return '支付失败'
  return '未支付'
}

function methodText(method?: string | null) {
  if (method === 'WECHAT_PAY' || method === 'WECHAT') return '微信支付'
  if (method === 'OFFLINE') return '线下收款'
  return method || '-'
}

function roleText(role?: string) {
  if (role === 'ADMIN') return '管理员'
  if (role === 'STAFF') return '员工'
  return '客户'
}

function aftersaleTypeText(type?: string | null) {
  const map: Record<string, string> = {
    REFUND: '退款',
    REMAKE: '重做',
    COMPLAINT: '投诉',
    RESOLVED: '已处理',
  }
  return map[type || ''] || type || '-'
}

function refundStatusText(record: any) {
  if (record.success) return '退款成功'
  if (record.statusText) return record.statusText
  return record.status || '退款处理中'
}

function sourceText(type?: string) {
  const map: Record<string, string> = {
    ORDER: '订单咨询',
    PRODUCT: '商品咨询',
    AFTERSALE: '售后咨询',
    REFUND: '退款咨询',
    GENERAL: '普通咨询',
  }
  return map[type || ''] || type || '咨询'
}
</script>

<style scoped>
.cs-order-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f4f6f8;
  box-sizing: border-box;
  color: #1f2933;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.top-panel,
.section,
.state-card {
  background: #ffffff;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  box-sizing: border-box;
}

.top-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
  padding: 28rpx;
}

.eyebrow {
  display: block;
  color: #1f7a5a;
  font-size: 24rpx;
  font-weight: 700;
}

.title {
  display: block;
  margin-top: 8rpx;
  color: #111827;
  font-size: 38rpx;
  font-weight: 800;
}

.subtitle,
.hint,
.state-copy {
  display: block;
  margin-top: 8rpx;
  color: #6b7280;
  font-size: 24rpx;
  line-height: 1.5;
}

.status-pill {
  flex-shrink: 0;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  background: #e8f5ef;
  color: #157347;
  font-size: 24rpx;
  font-weight: 700;
}

.section,
.state-card {
  padding: 24rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.section-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12rpx;
  flex-shrink: 0;
}

.section-title,
.modal-title,
.state-title {
  display: block;
  color: #111827;
  font-size: 30rpx;
  font-weight: 800;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.info-item {
  min-width: 0;
  padding: 16rpx;
  border-radius: 10rpx;
  background: #f8fafc;
}

.wide {
  grid-column: 1 / -1;
}

.label,
.record-copy,
.product-meta {
  display: block;
  color: #667085;
  font-size: 23rpx;
  line-height: 1.45;
}

.value,
.amount {
  display: block;
  margin-top: 6rpx;
  color: #1f2933;
  font-size: 27rpx;
  font-weight: 700;
}

.amount,
.record-amount {
  color: #b42318;
}

.wrap {
  word-break: break-all;
}

.mini-btn,
.primary-btn,
.ghost-btn,
.action-btn {
  min-height: 64rpx;
  margin: 0;
  padding: 0 20rpx;
  border-radius: 8rpx;
  font-size: 25rpx;
  line-height: 64rpx;
}

.mini-btn {
  background: #eef4ff;
  color: #1d4ed8;
}

.price-btn {
  background: #fff4e5;
  color: #b54708;
}

.amount-hint {
  display: block;
  margin-top: 6rpx;
  color: #b54708;
  font-size: 22rpx;
  line-height: 1.4;
}

.primary-btn {
  width: 100%;
  margin-top: 22rpx;
  background: #1677ff;
  color: #ffffff;
}

.ghost-btn {
  width: 100%;
  margin-top: 14rpx;
  background: #ffffff;
  color: #475467;
  border: 1rpx solid #d0d5dd;
}

button::after {
  border: none;
}

button[disabled] {
  opacity: 0.45;
}

.product-row,
.record-row,
.address-option {
  display: flex;
  gap: 16rpx;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #edf0f2;
}

.product-row:last-child,
.record-row:last-child,
.address-option:last-child {
  border-bottom: none;
}

.product-image {
  width: 118rpx;
  height: 118rpx;
  border-radius: 10rpx;
  background: #f1f5f9;
  flex-shrink: 0;
}

.product-main {
  min-width: 0;
  flex: 1;
}

.product-name,
.address-name,
.record-title {
  display: block;
  color: #111827;
  font-size: 27rpx;
  font-weight: 700;
  line-height: 1.45;
}

.address-box,
.empty-box,
.remark-text {
  display: block;
  padding: 18rpx;
  border-radius: 10rpx;
  background: #f8fafc;
  color: #344054;
  font-size: 26rpx;
  line-height: 1.55;
}

.address-detail {
  display: block;
  margin-top: 6rpx;
  color: #667085;
  font-size: 24rpx;
  line-height: 1.45;
}

.photo-row {
  display: flex;
  gap: 12rpx;
  margin-top: 16rpx;
  flex-wrap: wrap;
}

.proof-photo {
  width: 132rpx;
  height: 132rpx;
  border-radius: 10rpx;
  background: #f1f5f9;
}

.record-row {
  align-items: center;
  justify-content: space-between;
}

.record-amount,
.record-time {
  flex-shrink: 0;
  color: #475467;
  font-size: 24rpx;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
}

.action-btn {
  width: 100%;
  background: #f2f4f7;
  color: #1f2933;
  font-weight: 700;
}

.danger {
  background: #d93026;
  color: #ffffff;
}

.danger-outline {
  background: #fff5f4;
  color: #b42318;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 24rpx;
  background: rgba(15, 23, 42, 0.45);
  box-sizing: border-box;
}

.modal-panel {
  width: 100%;
  max-height: 86vh;
  padding: 28rpx;
  border-radius: 18rpx;
  background: #ffffff;
  box-sizing: border-box;
  overflow-y: auto;
}

.modal-input,
.modal-textarea,
.picker-box {
  width: 100%;
  margin-top: 18rpx;
  padding: 0 18rpx;
  border: 1rpx solid #d0d5dd;
  border-radius: 10rpx;
  background: #ffffff;
  box-sizing: border-box;
  color: #111827;
  font-size: 27rpx;
}

.modal-input,
.picker-box {
  height: 72rpx;
  min-height: 72rpx;
  line-height: 72rpx;
}

.modal-textarea {
  min-height: 210rpx;
  padding: 18rpx;
  line-height: 1.5;
}

.modal-textarea.small {
  min-height: 128rpx;
}

.form-line {
  margin-top: 16rpx;
}
</style>
