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
          <view class="status-tags">
            <text class="status-tag" :class="statusClass(order.status)">
              {{ statusText(order.status) }}
            </text>
            <!-- 新售后不改订单状态：有未完结售后时单独挂「售后中/退款中」 -->
            <text v-if="openAftersaleLabel" class="status-tag status-tag--warn">
              {{ openAftersaleLabel }}
            </text>
            <text
              v-if="order.refundStatus === 'SUCCESS'"
              class="status-tag status-tag--done"
            >已退款</text>
          </view>
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

          <!-- 只有管理员能处理；员工角色看不到这一排按钮 -->
          <view v-if="canResolve(record)" class="aftersale-actions">
            <view
              v-if="record.requestType === 'REFUND'"
              class="mini-btn primary"
              @tap="openResolve(record, 'REFUND')"
            >同意退款</view>
            <view
              v-else-if="record.requestType === 'RESHIP'"
              class="mini-btn primary"
              @tap="openResolve(record, 'RESHIP')"
            >同意补发</view>
            <view
              v-else
              class="mini-btn primary"
              @tap="openResolve(record, 'REGISTER_ONLY')"
            >仅登记完成</view>
            <view class="mini-btn" @tap="openResolve(record, 'REJECT')">
              驳回
            </view>
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
        </view>
      </view>

      <!-- 预计发货日：员工只读，排期由管理员操作 -->
      <view v-if="canShip" class="card">
        <view class="section-head">
          <text class="section-title">预计发货日</text>
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
          v-if="canShip"
          class="primary-btn"
          @tap="goToLabels"
        >
          打印标签（{{ order.bagCount }} 张）
        </button>

        <button
          v-if="canShip"
          class="primary-btn"
          :disabled="submitting"
          @tap="handleShip"
        >
          发货
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

    <!-- 发货抽屉（2026-11-11）：和鲜食单、订单中心共用同一份组件，
         补剂只是接口与地址来源不同，表单和存根核对完全一致 -->
    <StaffShipDrawer
      v-if="order"
      :visible="shipVisible"
      :order-id="order.id"
      :customer-name="order.receiverName"
      :customer-phone="order.receiverPhone"
      :dog-summary="order.dogName || ''"
      :address="shipAddress"
      :initial-tracking-number="order.trackingNumber || ''"
      :initial-actual-shipping-fee="null"
      :initial-carrier-code="order.carrierCode || ''"
      kind="supplement"
      :address-revision="shipAddressRevision"
      allow-address-fix
      @close="shipVisible = false"
      @shipped="onShipped"
      @fix-address="openAddressEditor"
    />

    <!-- 代改收货地址（2026-11-10）：补剂单原先只能看不能改，硬锁下这是唯一出路 -->
    <view v-if="addressVisible" class="modal-mask" @tap="closeAddressEditor">
      <view class="modal-panel" @tap.stop>
        <view class="modal-title">改收货地址</view>

        <text class="form-label">收件人</text>
        <input v-model="addressForm.recipientName" class="form-input" :maxlength="50" />

        <text class="form-label">手机号</text>
        <input v-model="addressForm.phone" class="form-input" :maxlength="30" />

        <text class="form-label">省 / 市 / 区</text>
        <view class="region-row">
          <input v-model="addressForm.province" class="form-input region-input" placeholder="省" :maxlength="50" />
          <input v-model="addressForm.city" class="form-input region-input" placeholder="市" :maxlength="50" />
          <input v-model="addressForm.district" class="form-input region-input" placeholder="区/县" :maxlength="50" />
        </view>

        <text class="form-label">详细地址</text>
        <input v-model="addressForm.detail" class="form-input" :maxlength="120" />

        <text class="form-label">修改原因（必填）</text>
        <input
          v-model="addressForm.reason"
          class="form-input"
          placeholder="例如：顾客微信说搬家了"
          :maxlength="200"
        />

        <text class="ship-hint">
          只改未发货的单。改完地址后，之前那张存根的核对结果会作废，需要重新上传存根。
        </text>

        <button class="primary-btn" :disabled="savingAddress" @tap="saveAddressEditor">
          {{ savingAddress ? '保存中…' : '保存并重新核存根' }}
        </button>
        <button class="secondary-btn" :disabled="savingAddress" @tap="closeAddressEditor">取消</button>
      </view>
    </view>

    <!-- 售后处理弹窗（仅管理员；员工角色不显示入口） -->
    <view v-if="resolveVisible" class="modal-mask" @tap="closeResolve">
      <view class="modal-panel" @tap.stop>
        <view class="modal-title">处理售后</view>

        <view class="resolve-summary">
          <text>售后单 {{ resolveCase?.caseNo || '—' }}</text>
          <text>诉求：{{ resolveCase ? aftersaleTypeText(resolveCase.requestType) : '—' }}</text>
          <text>原因：{{ resolveCase?.requestedReason || '—' }}</text>
        </view>

        <block v-if="resolveAction === 'REFUND'">
          <text class="form-label">退款金额（元）</text>
          <input
            v-model="resolveAmount"
            class="form-input"
            type="digit"
            placeholder="不填 = 按申请金额全额退款"
            :maxlength="10"
          />
          <text class="form-hint">未发货订单只支持全额退款；发货后可部分退款。</text>
        </block>

        <text class="form-label">
          {{ resolveAction === 'REJECT' ? '驳回原因（必填）' : '处理备注（选填）' }}
        </text>
        <textarea
          v-model="resolveNote"
          class="form-textarea"
          :placeholder="resolveAction === 'REJECT' ? '请填写驳回原因' : '选填'"
          maxlength="500"
        />

        <button class="primary-btn" :disabled="resolving" @tap="submitResolve">
          {{ resolving ? '提交中…' : resolveConfirmLabel }}
        </button>
        <button class="secondary-btn" :disabled="resolving" @tap="closeResolve">取消</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import StaffShipDrawer from '../../components/shipping/StaffShipDrawer.vue'
import { updateSupplementShippingAddress } from '../../api/waybillReceipt'
import { onLoad } from '@dcloudio/uni-app'
import {
  staffSupplementOrderApi,
  type StaffSupplementAftersaleCase,
  type StaffSupplementOrder,
  type SupplementOrderStatus,
} from '../../api/staff-supplement-orders'

const statusBarHeight = ref(0)
const orderId = ref('')
const order = ref<StaffSupplementOrder | null>(null)
const loading = ref(false)
const submitting = ref(false)

/** 管理员才有售后处理权；员工只能看记录 */
function getStoredUser(): { role?: string } | null {
  let stored = uni.getStorageSync('user')
  if (!stored || stored === '{}' || stored === '') {
    stored = uni.getStorageSync('userInfo')
  }
  if (typeof stored === 'string') {
    try {
      return JSON.parse(stored)
    } catch {
      return null
    }
  }
  return stored || null
}
const isAdmin = computed(() => getStoredUser()?.role === 'ADMIN')

/** 售后处理弹窗状态 */
const resolveVisible = ref(false)
const resolving = ref(false)
const resolveCase = ref<StaffSupplementAftersaleCase | null>(null)
const resolveAction = ref<'REFUND' | 'RESHIP' | 'REGISTER_ONLY' | 'REJECT'>(
  'REFUND',
)
const resolveAmount = ref('')
const resolveNote = ref('')
const resolveConfirmLabel = computed(
  () =>
    ({
      REFUND: '确认退款',
      RESHIP: '确认补发',
      REGISTER_ONLY: '确认登记',
      REJECT: '确认驳回',
    })[resolveAction.value],
)

/** 只有待受理的售后才给处理按钮；处理中/已结束的不重复操作 */
function canResolve(record: StaffSupplementAftersaleCase) {
  return isAdmin.value && record.status === 'PENDING'
}

/** 发货弹窗状态（2026-10-31） */
const shipVisible = ref(false)

/**
 * 代改收货地址（2026-11-10）。
 *
 * 硬锁上线后「存根对不上 → 先改地址 → 再传存根」是唯一出路，
 * 打包间手上只有手机，所以这里补一个只能改未发货单的小面板（必填原因）。
 * 发货表单本身已经并到共用的 StaffShipDrawer（2026-11-11）。
 */
const addressVisible = ref(false)
const savingAddress = ref(false)
const addressForm = ref({
  recipientName: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  reason: '',
})

/**
 * 地址改一次 +1：抽屉收到这个变化就把存根结论清掉 —— 改完地址，
 * 之前那张存根核对的还是旧地址，必须重新传。
 */
const shipAddressRevision = ref(0)

/** 补剂单的收货信息是平台字段，拼成抽屉要的形状 */
const shipAddress = computed(() => {
  const current = order.value
  if (!current) return null
  return {
    recipientName: current.receiverName || '',
    phone: current.receiverPhone || '',
    regionText: current.receiverRegion || '',
    detailAddress: current.receiverDetail || '',
  }
})

/** 地区串（"上海市 上海市 普陀区"）拆成三段；拆不出来就留给员工改 */
function splitRegion(region: string) {
  const parts = String(region || '')
    .split(/\s+/)
    .filter(Boolean)
  return {
    province: parts[0] || '',
    city: parts[1] || parts[0] || '',
    district: parts[2] || '',
  }
}

function openAddressEditor() {
  const current = order.value
  if (!current) return
  const region = splitRegion(current.receiverRegion)
  addressForm.value = {
    recipientName: current.receiverName || '',
    phone: current.receiverPhone || '',
    province: region.province,
    city: region.city,
    district: region.district,
    detail: current.receiverDetail || '',
    reason: '',
  }
  addressVisible.value = true
}

function closeAddressEditor() {
  if (savingAddress.value) return
  addressVisible.value = false
}

async function saveAddressEditor() {
  if (savingAddress.value || !orderId.value) return
  const form = addressForm.value
  if (
    !form.recipientName.trim() ||
    !form.phone.trim() ||
    !form.province.trim() ||
    !form.city.trim() ||
    !form.detail.trim()
  ) {
    uni.showToast({ title: '请填完整收货地址', icon: 'none' })
    return
  }
  if (!form.reason.trim()) {
    uni.showToast({ title: '请写修改原因', icon: 'none' })
    return
  }

  savingAddress.value = true
  try {
    await updateSupplementShippingAddress(orderId.value, {
      recipientName: form.recipientName.trim(),
      phone: form.phone.trim(),
      province: form.province.trim(),
      city: form.city.trim(),
      district: form.district.trim(),
      detail: form.detail.trim(),
      reason: form.reason.trim(),
    })
    // 地址变了，之前那张存根的核对结果已经作废 —— 抽屉收到这个变化会清空重来
    shipAddressRevision.value += 1
    addressVisible.value = false
    uni.showToast({ title: '地址已改，请重新上传存根', icon: 'none' })
    await fetchOrder()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    savingAddress.value = false
  }
}
const STATUS_TEXT: Record<SupplementOrderStatus, string> = {
  PENDING_PAYMENT: '待确认收款',
  // 补剂没有生产环节：付了钱就能打标签发货（2026-11-02 起也不再录分装）
  PAID: '待发货',
  // 只留给历史遗留的分装单，和订单中心筛选同口径（2026-11-08）
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

/**
 * 2026-11-02：员工端不再录入分装信息。
 * 已付款（PAID）就可以直接打标签、发货；PACKING/PACKED 是旧单兼容。
 */
const canShip = computed(() =>
  order.value
    ? ['PAID', 'PACKING', 'PACKED'].includes(order.value.status)
    : false,
)

/** 有未完结售后时，在订单状态旁边挂「售后中/退款中」 */
const openAftersaleLabel = computed(() => {
  const current = (order.value?.aftersaleCases || []).find((item) =>
    ['PENDING', 'PROCESSING'].includes(item.status),
  )
  if (!current) return ''
  return current.requestType === 'REFUND' ? '退款中' : '售后中'
})

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

async function fetchOrder() {
  loading.value = true
  try {
    const res = await staffSupplementOrderApi.detail(orderId.value)
    if (res.code === 0 && res.data) {
      order.value = res.data
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
    content: '确认已收到这笔款项？确认后订单进入待发货。',
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

function openResolve(
  record: StaffSupplementAftersaleCase,
  action: 'REFUND' | 'RESHIP' | 'REGISTER_ONLY' | 'REJECT',
) {
  resolveCase.value = record
  resolveAction.value = action
  // 退款默认带出申请金额；管理员能看到的订单实付作为兜底
  resolveAmount.value =
    action === 'REFUND'
      ? String(record.refundAmount ?? order.value?.amountTotal ?? '')
      : ''
  resolveNote.value = ''
  resolveVisible.value = true
}

function closeResolve() {
  if (resolving.value) return
  resolveVisible.value = false
}

async function submitResolve() {
  if (!resolveCase.value || resolving.value) return
  const action = resolveAction.value
  const note = resolveNote.value.trim()

  if (action === 'REJECT' && !note) {
    uni.showToast({ title: '请填写驳回原因', icon: 'none' })
    return
  }

  let refundAmount: number | undefined
  if (action === 'REFUND' && resolveAmount.value.trim()) {
    const value = Number(resolveAmount.value)
    if (!Number.isFinite(value) || value <= 0) {
      uni.showToast({ title: '退款金额不正确', icon: 'none' })
      return
    }
    refundAmount = value
  }

  resolving.value = true
  try {
    const res = await staffSupplementOrderApi.resolveAftersale(
      resolveCase.value.id,
      {
        resolutionType: action,
        ...(refundAmount !== undefined ? { refundAmount } : {}),
        ...(note ? { note } : {}),
        ...(action === 'REJECT' ? { rejectReason: note } : {}),
      },
    )
    if (res.code === 0) {
      const successText: Record<typeof action, string> = {
        REFUND: '退款已发起',
        RESHIP: '补发单已生成',
        REGISTER_ONLY: '已登记完成',
        REJECT: '已驳回',
      }
      uni.showToast({ title: successText[action], icon: 'success' })
      resolveVisible.value = false
      await fetchOrder()
    } else {
      uni.showToast({ title: res.message || '处理失败', icon: 'none' })
    }
  } catch (error) {
    console.error('[SupplementOrderDetail] 处理售后失败:', error)
    uni.showToast({ title: '处理失败', icon: 'none' })
  } finally {
    resolving.value = false
  }
}

function handleShip() {
  // 表单、存根核对、提交、微信同步都在共用抽屉里；这里只负责打开它
  shipVisible.value = true
}

/** 抽屉里发完货：关门 + 刷新这单（状态会变成已发货） */
async function onShipped() {
  shipVisible.value = false
  await fetchOrder()
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

  // 订单中心卡片上点了「发货」→ 加载完直接弹填单号。
  // 2026-11-08：补剂的 PAID 也算「待发货」（付了钱就能发），不能再只认 PACKED，
  // 否则列表点「发货」进来不会弹窗，员工以为按钮没反应。
  // 后端发货校验只接受 PAID / PACKED；历史 PACKING 单要先标分装完成，不在此列。
  const autoShip = options?.action === 'ship'
  void fetchOrder().then(() => {
    if (autoShip && ['PAID', 'PACKED'].includes(order.value?.status || '')) {
      handleShip()
    }
  })
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

.status-tags {
  display: flex;
  align-items: center;
  gap: 8rpx;
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
.aftersale-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 16rpx;
}
.mini-btn {
  margin: 0;
  padding: 10rpx 22rpx;
  border: 1rpx solid #d9dfcf;
  border-radius: 10rpx;
  background: #fbfcf7;
  color: #2b5040;
  font-size: 24rpx;
  line-height: 1.4;
}
.mini-btn.primary {
  background: #1e3a2f;
  border-color: #1e3a2f;
  color: #f7f3e8;
}
.resolve-summary {
  padding: 16rpx 20rpx;
  margin-bottom: 12rpx;
  background: #f7f8f2;
  border-radius: 12rpx;
}
.resolve-summary text {
  display: block;
  margin: 4rpx 0;
  color: #606266;
  font-size: 24rpx;
}
.form-textarea {
  width: 100%;
  min-height: 140rpx;
  padding: 16rpx 20rpx;
  background: #f6f7f6;
  border-radius: 10rpx;
  font-size: 26rpx;
  color: #303133;
  box-sizing: border-box;
}
.form-hint {
  display: block;
  margin-top: 8rpx;
  color: #909399;
  font-size: 22rpx;
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

/* ===== 发货弹窗（2026-10-31，与鲜食单同一套字段） ===== */
.modal-mask {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: flex-end;
}
.modal-panel {
  width: 100%; background: #fff;
  border-radius: 28rpx 28rpx 0 0;
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
}
.modal-title { font-size: 32rpx; font-weight: 700; color: #1e3a2f; margin-bottom: 24rpx; }
.form-label { display: block; margin: 20rpx 0 10rpx; font-size: 24rpx; color: #606266; }
.form-input, .form-picker {
  height: 80rpx; line-height: 80rpx; padding: 0 20rpx;
  background: #f6f7f6; border-radius: 10rpx; font-size: 28rpx; color: #303133;
}
.ship-type-row { display: flex; gap: 16rpx; }
.ship-type-option {
  flex: 1; height: 72rpx; line-height: 72rpx; text-align: center;
  background: #f5f6f8; color: #606266; font-size: 26rpx;
  border-radius: 12rpx; border: 2rpx solid transparent;
}
.ship-type-option.active { background: #e8f1ec; color: #1e3a2f; border-color: #1e3a2f; font-weight: 600; }
.ship-hint { display: block; margin: 20rpx 0; font-size: 24rpx; color: #909399; line-height: 1.6; }

/* 存根块下面的改地址入口（2026-11-10）：小字靠右，不抢主流程 */
.addr-link-row { display: flex; justify-content: flex-end; margin: 4rpx 0 16rpx; }
.addr-link { font-size: 23rpx; color: #2b5040; }
/* 省 / 市 / 区 三个短输入并排 */
.region-row { display: flex; gap: 10rpx; }
.region-input { flex: 1; min-width: 0; }
</style>
