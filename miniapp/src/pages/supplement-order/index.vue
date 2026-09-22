<template>
  <view class="page">
    <!--
      空态：2026-09-22 补上出口。
      原先只有两行文字，用户直接打开这页会卡住（比如从订单页返回、或收藏/转发进来）。
    -->
    <view v-if="!draft" class="empty-state">
      <text class="empty-title">没有待购买的补剂</text>
      <text class="empty-desc">补剂是从 DIY 制作单带过来的。先在「我的制作单」里打开一份，再点「一键购买补剂」。</text>
      <button class="empty-action" @tap="goToDiySheetList">去我的制作单</button>
    </view>

    <!-- 首次报价期间：给一个明确的加载态，避免页面看起来是"空的/坏了" -->
    <view v-else-if="initializing" class="empty-state">
      <text class="empty-title">正在核对补剂</text>
      <text class="empty-desc">正在按制作单上的用量计算价格，请稍候…</text>
    </view>

    <!--
      制作单上的补剂全都没开放购买时，原先会呈现"一片灰 + 底部 ¥0.00 + 灰按钮"，
      没有任何解释。这里给一个明确的说明与出口。
    -->
    <view v-else-if="lines.length > 0 && selectableLines.length === 0" class="empty-state">
      <text class="empty-title">这些补剂暂时无法购买</text>
      <text class="empty-desc">制作单上的补剂目前都没有开放购买，或还没有定好价格。可以稍后再试，或联系客服。</text>
      <button class="empty-action" @tap="goToDiySheetList">返回我的制作单</button>
    </view>

    <template v-else>
      <!-- 来源制作单 -->
      <view class="section source-card">
        <text class="source-title">{{ draft.recipeName || 'DIY 制作单' }}</text>
        <text class="source-sub">
          <text v-if="draft.dogName">{{ draft.dogName }} · </text>
          <text v-if="draft.cycleDays">{{ draft.cycleDays }} 天用量</text>
        </text>
      </view>

      <!-- 补剂清单 -->
      <view class="section">
        <view class="section-title">
          <text class="title-text">选择要买的补剂</text>
          <!-- 多种补剂时逐个点太累，给一个全选/全不选（不可购买的自动跳过） -->
          <text
            v-if="selectableLines.length > 1"
            class="title-action"
            @tap="toggleSelectAll"
          >
            {{ allSelectableSelected ? '全不选' : '全选' }}
          </text>
        </view>
        <text class="section-subtip">按品种单独分装，一袋一种</text>

        <view
          v-for="line in displayLines"
          :key="line.ingredientId"
          class="line-row"
          :class="{ 'line-row-disabled': !!line.unavailableReason }"
          @tap="toggleLine(line)"
        >
          <view class="line-check">
            <view
              class="checkbox"
              :class="{
                'checkbox-checked': isSelected(line.ingredientId),
                'checkbox-disabled': !!line.unavailableReason
              }"
            >
              <text v-if="isSelected(line.ingredientId)" class="checkbox-tick">✓</text>
            </view>
          </view>

          <view class="line-main">
            <text class="line-name">{{ line.name }}</text>
            <text class="line-amount">
              制作单用量 {{ formatAmount(line.requestedAmount) }}{{ line.unit }}
              <text v-if="line.packedAmount"> · 分装 {{ formatAmount(line.packedAmount) }}{{ line.unit }}</text>
            </text>
            <text v-if="line.shelfLifeMonths" class="line-extra">
              分装后保质期 {{ line.shelfLifeMonths }} 个月
            </text>
            <text v-if="line.unavailableReason" class="line-warn">
              暂不可购买：{{ line.unavailableReason }}
            </text>
          </view>

          <text class="line-price" :class="{ 'line-price-disabled': !!line.unavailableReason }">
            {{ line.unavailableReason ? '—' : `¥${line.price.toFixed(2)}` }}
          </text>
        </view>
      </view>

      <!-- 收货地址 -->
      <view class="section">
        <view class="section-title">
          <text class="title-text">收货地址</text>
        </view>
        <view v-if="selectedAddress" class="address-card" @tap="chooseAddress">
          <view class="address-main">
            <text class="address-name">{{ selectedAddress.recipientName }} {{ selectedAddress.phone }}</text>
            <text class="address-detail">{{ formatRegion(selectedAddress.region) }}{{ selectedAddress.detail }}</text>
          </view>
          <text class="address-action">更换</text>
        </view>
        <view v-else class="address-card address-empty" @tap="chooseAddress">
          <text class="address-placeholder">请选择收货地址</text>
          <text class="address-action">去选择</text>
        </view>
      </view>

      <!-- 金额明细 -->
      <!--
        费用：2026-09-22 按需求收敛为「一个最终价格」。
        原先把「补剂费 + 分装服务费 + 包材费 + 运费」四项摊开给用户看，
        小额单下费用合计（服务费 9.9 + 运费 8）甚至超过货款本身，
        等于主动把"不划算"摆到用户面前。现在只给一个总价，费用构成内部消化。
      -->
      <view class="section" v-if="summary">
        <view class="section-title">
          <text class="title-text">费用</text>
        </view>

        <view class="fee-total">
          <view class="fee-total-copy">
            <text class="fee-total-main">{{ selectedLines.length }} 种补剂 · 一价全包</text>
            <text class="fee-total-sub">已含分装与配送，结算不再额外收费</text>
          </view>
          <text class="fee-total-amount">¥{{ summary.total.toFixed(2) }}</text>
        </view>

        <view class="fee-perk">
          <text class="fee-perk-icon">🚚</text>
          <text class="fee-perk-text">
            {{ summary.freeShipping ? '全国包邮' : '补剂独立发货，随单配送' }}
          </text>
        </view>
      </view>

      <!--
        提交说明：2026-09-22 改成对「在线支付可用/不可用」两种情况都成立的说法。
        原文只说"提交订单后我们会尽快与你确认收款"，如果在线支付是通的，
        用户其实是直接付掉了，这句话就是错的；而两种情况的差别在提交前无法预知。
      -->
      <view class="notice">
        <text class="notice-text">
          补剂按品种分装成小样，独立发货。提交订单后可在线支付；若在线支付暂不可用，我们会尽快与你确认收款后发货。
        </text>
      </view>

      <view class="footer-space"></view>

      <view class="footer">
        <view class="footer-total">
          <text class="footer-label">合计</text>
          <text class="footer-amount">¥{{ summary ? summary.total.toFixed(2) : '0.00' }}</text>
        </view>
        <button
          class="footer-btn"
          :class="{ 'footer-btn-disabled': !canSubmit || submitting }"
          :disabled="!canSubmit || submitting"
          @tap="handleSubmit"
        >
          <text class="footer-btn-text">{{ submitting ? '提交中…' : '提交订单' }}</text>
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onUnload, onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import {
  clearSupplementPurchaseDraft,
  createSupplementOrder,
  quoteSupplements,
  readSupplementPurchaseDraft,
  type SupplementOrder,
  type SupplementPurchaseDraft,
  type SupplementQuote
} from '../../api/supplements'
import { runSupplementPayment } from '../../utils/supplement-payment'

interface Address {
  id: string
  recipientName: string
  phone: string
  region: { province?: string; city?: string; district?: string }
  detail: string
  isDefault?: boolean
}

interface DisplayLine {
  ingredientId: string
  name: string
  unit: string
  requestedAmount: number
  packedAmount: number
  price: number
  shelfLifeMonths: number
  unavailableReason?: string
}

const draft = ref<SupplementPurchaseDraft | null>(null)
const lines = ref<DisplayLine[]>([])
const selectedIds = ref<string[]>([])
const addresses = ref<Address[]>([])
const selectedAddressId = ref('')
const summary = ref<SupplementQuote | null>(null)
const initializing = ref(true)
const quoting = ref(false)
const submitting = ref(false)

const displayLines = computed(() => lines.value)

const selectedLines = computed(() =>
  lines.value.filter(
    (line) => !line.unavailableReason && selectedIds.value.includes(line.ingredientId)
  )
)

/** 可勾选的补剂（排除不可购买的） */
const selectableLines = computed(() =>
  lines.value.filter((line) => !line.unavailableReason)
)

const allSelectableSelected = computed(
  () =>
    selectableLines.value.length > 0 &&
    selectableLines.value.every((line) => selectedIds.value.includes(line.ingredientId))
)

/** 全选 / 全不选（不可购买的自动跳过，不会污染报价） */
async function toggleSelectAll() {
  selectedIds.value = allSelectableSelected.value
    ? []
    : selectableLines.value.map((line) => line.ingredientId)

  try {
    await refreshSummaryOnly()
  } catch (error) {
    console.error('[SupplementOrder] 全选重算合计失败:', error)
  }
}

function goToDiySheetList() {
  uni.navigateTo({ url: '/pages/diy-sheet-list/index' })
}

const selectedAddress = computed(
  () => addresses.value.find((item) => item.id === selectedAddressId.value) || null
)

const canSubmit = computed(
  () => selectedLines.value.length > 0 && !!selectedAddressId.value && !!summary.value
)

onLoad(() => {
  draft.value = readSupplementPurchaseDraft()

  // 地址列表页选择后通过全局事件回传
  uni.$on('address-selected', onAddressSelected)

  if (draft.value) {
    lines.value = draft.value.lines.map((line) => ({
      ingredientId: line.ingredientId,
      name: line.name || '补剂',
      unit: line.unit || '',
      requestedAmount: line.amount,
      packedAmount: 0,
      price: 0,
      shelfLifeMonths: 0
    }))
    selectedIds.value = draft.value.lines.map((line) => line.ingredientId)
    void initialize()
  } else {
    initializing.value = false
  }
})

onShow(() => {
  if (draft.value && addresses.value.length === 0) {
    void loadAddresses()
  }
})

onUnload(() => {
  uni.$off('address-selected', onAddressSelected)
})

async function initialize() {
  initializing.value = true
  try {
    await Promise.all([loadAddresses(), refreshQuote()])
  } finally {
    initializing.value = false
  }
}

async function loadAddresses() {
  try {
    const res: any = await request({ url: '/addresses', method: 'GET', quiet: true } as any)
    if (res.code === 0 && Array.isArray(res.data)) {
      addresses.value = res.data
      if (!selectedAddressId.value) {
        const preferred = res.data.find((item: Address) => item.isDefault) || res.data[0]
        if (preferred) selectedAddressId.value = preferred.id
      }
    }
  } catch (error) {
    console.warn('[SupplementOrder] 加载地址失败:', error)
  }
}

function onAddressSelected(payload: { addressId?: string }) {
  if (payload && payload.addressId) {
    selectedAddressId.value = payload.addressId
  }
}

function chooseAddress() {
  uni.navigateTo({ url: '/pages/address-list/index?mode=select&from=supplement-order' })
}

/** 用「全部补剂」取单价与不可购买原因，用「已勾选」算金额合计 */
async function refreshQuote() {
  if (!draft.value || quoting.value) return
  quoting.value = true
  try {
    const allRes = await quoteSupplements(
      draft.value.lines.map((line) => ({
        ingredientId: line.ingredientId,
        amount: line.amount
      }))
    )

    if (allRes.code !== 0) {
      uni.showToast({ title: allRes.message || '报价失败', icon: 'none' })
      return
    }

    const { quote, unavailable } = allRes.data
    const unavailableMap = new Map(unavailable.map((item) => [item.ingredientId, item.reason]))
    const quoteMap = new Map(quote.lines.map((item) => [item.ingredientId, item]))

    lines.value = draft.value.lines.map((line) => {
      const quoted = quoteMap.get(line.ingredientId)
      const reason = unavailableMap.get(line.ingredientId)
      return {
        ingredientId: line.ingredientId,
        name: quoted?.name || line.name || '补剂',
        unit: quoted?.unit || line.unit || '',
        requestedAmount: quoted?.requestedAmount ?? line.amount,
        packedAmount: quoted?.packedAmount ?? 0,
        price: quoted?.price ?? 0,
        shelfLifeMonths: quoted?.shelfLifeMonths ?? 0,
        unavailableReason: reason
      }
    })

    summary.value = quote
    await refreshSummaryOnly()
  } catch (error) {
    console.error('[SupplementOrder] 报价失败:', error)
    uni.showToast({ title: '报价失败，请稍后重试', icon: 'none' })
  } finally {
    quoting.value = false
  }
}

/** 勾选变化时只重算合计（单价与单项无关，无需重算明细） */
async function refreshSummaryOnly() {
  const ids = selectedLines.value.map((line) => line.ingredientId)
  if (ids.length === 0) {
    summary.value = null
    return
  }

  const payload = ids.map((id) => {
    const line = lines.value.find((item) => item.ingredientId === id)!
    return { ingredientId: id, amount: line.requestedAmount }
  })

  const res = await quoteSupplements(payload)
  if (res.code === 0) {
    summary.value = res.data.quote
  }
}

function isSelected(ingredientId: string): boolean {
  return selectedIds.value.includes(ingredientId)
}

async function toggleLine(line: DisplayLine) {
  if (line.unavailableReason) return

  if (isSelected(line.ingredientId)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== line.ingredientId)
  } else {
    selectedIds.value = [...selectedIds.value, line.ingredientId]
  }

  try {
    await refreshSummaryOnly()
  } catch (error) {
    console.error('[SupplementOrder] 重算合计失败:', error)
  }
}

/** 提交后的支付处理：能支付就支付，不能支付就降级为待人工确认收款 */
async function settlePayment(order: SupplementOrder) {
  const outcome = await runSupplementPayment(order.id)

  if (outcome === 'PAID') {
    showPaidModal(order)
    return
  }

  const prefix = outcome === 'CANCELLED' ? '支付未完成，订单已为你保留。' : ''
  showManualConfirmModal(order, prefix)
}

function showPaidModal(order: SupplementOrder) {
  uni.showModal({
    title: '支付成功',
    content: `订单号 ${order.orderNo}\n合计 ¥${order.amountTotal.toFixed(2)}\n\n我们会尽快分装发货。`,
    showCancel: false,
    confirmText: '查看订单',
    success: () => {
      uni.redirectTo({ url: '/pages/supplement-orders/index' })
    }
  })
}

function showManualConfirmModal(order: SupplementOrder, prefix = '') {
  uni.showModal({
    title: '订单已提交',
    content: `${prefix}订单号 ${order.orderNo}\n合计 ¥${order.amountTotal.toFixed(2)}\n\n我们会尽快与你确认收款，随后分装发货。`,
    showCancel: false,
    confirmText: '查看订单',
    success: () => {
      uni.redirectTo({ url: '/pages/supplement-orders/index' })
    }
  })
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function formatRegion(region?: { province?: string; city?: string; district?: string }): string {
  if (!region) return ''
  return [region.province, region.city, region.district].filter(Boolean).join(' ')
}

async function handleSubmit() {
  if (!canSubmit.value || !draft.value) return

  submitting.value = true
  try {
    const res = await createSupplementOrder({
      addressId: selectedAddressId.value,
      lines: selectedLines.value.map((line) => ({
        ingredientId: line.ingredientId,
        amount: line.requestedAmount
      })),
      recipeId: draft.value.recipeId,
      recipeName: draft.value.recipeName,
      dogId: draft.value.dogId,
      dogName: draft.value.dogName,
      cycleDays: draft.value.cycleDays
    })

    if (res.code !== 0) {
      uni.showToast({ title: res.message || '提交失败', icon: 'none' })
      return
    }

    const order = res.data as SupplementOrder
    clearSupplementPurchaseDraft()
    await settlePayment(order)
  } catch (error) {
    console.error('[SupplementOrder] 提交失败:', error)
    uni.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: #f5f6f8;
  padding: 24rpx 24rpx 0;
  box-sizing: border-box;
}

.empty-state {
  padding: 200rpx 60rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-title {
  font-size: 32rpx;
  color: #303133;
  font-weight: 600;
}

.empty-desc {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #909399;
  text-align: center;
  line-height: 1.6;
}

/* 空态出口：给用户一条明确的下一步 */
.empty-action {
  margin-top: 40rpx;
  padding: 0 56rpx;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #ffffff;
  background-color: #1e3a2f;
  border-radius: 12rpx;
}

.empty-action::after {
  border: none;
}

.section {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.source-card {
  display: flex;
  flex-direction: column;
}

.source-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #303133;
}

.source-sub {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #909399;
}

.section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.title-text {
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
}

/* 全选 / 全不选 */
.title-action {
  font-size: 24rpx;
  font-weight: 600;
  color: #0f6b43;
}

.section-subtip {
  display: block;
  margin-bottom: 14rpx;
  font-size: 22rpx;
  color: #c0c4cc;
  line-height: 1.4;
}

.line-row {
  display: flex;
  align-items: flex-start;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f2f3f5;
}

.line-row:last-child {
  border-bottom: none;
}

.line-row-disabled {
  opacity: 0.5;
}

.line-check {
  width: 56rpx;
  padding-top: 4rpx;
}

.checkbox {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 2rpx solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox-checked {
  background-color: #4a90d9;
  border-color: #4a90d9;
}

.checkbox-disabled {
  background-color: #f2f3f5;
  border-color: #e4e7ed;
}

.checkbox-tick {
  color: #ffffff;
  font-size: 24rpx;
  line-height: 1;
}

.line-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.line-name {
  font-size: 28rpx;
  color: #303133;
  font-weight: 500;
}

.line-amount {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #606266;
}

.line-extra {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #909399;
}

.line-warn {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #e6a23c;
}

.line-price {
  font-size: 28rpx;
  color: #e6641e;
  font-weight: 600;
  padding-top: 4rpx;
}

.line-price-disabled {
  color: #c0c4cc;
}

.address-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 0;
}

.address-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.address-name {
  font-size: 28rpx;
  color: #303133;
}

.address-detail {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #909399;
}

.address-placeholder {
  font-size: 28rpx;
  color: #909399;
}

.address-action {
  font-size: 26rpx;
  color: #4a90d9;
  padding-left: 20rpx;
}

/* 费用：只给一个最终价格（费用构成内部消化，不再逐项摊开） */
.fee-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 26rpx 24rpx;
  border-radius: 16rpx;
  background-color: #f6efe0;
  border: 1rpx solid rgba(176, 141, 79, 0.35);
}

.fee-total-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.fee-total-main {
  font-size: 28rpx;
  font-weight: 800;
  color: #26261f;
  line-height: 1.3;
}

.fee-total-sub {
  font-size: 22rpx;
  color: #8a6b33;
  line-height: 1.4;
}

.fee-total-amount {
  flex: none;
  font-size: 40rpx;
  font-weight: 800;
  color: #b4553f;
  line-height: 1.1;
}

.fee-perk {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 16rpx;
}

.fee-perk-icon {
  font-size: 24rpx;
  line-height: 1;
}

.fee-perk-text {
  font-size: 23rpx;
  color: #6b6653;
  line-height: 1.4;
}

.notice {
  padding: 0 8rpx 20rpx;
}

.notice-text {
  font-size: 22rpx;
  color: #909399;
  line-height: 1.6;
}

.footer-space {
  height: 140rpx;
}

.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120rpx;
  background-color: #ffffff;
  border-top: 1rpx solid #f2f3f5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24rpx;
  box-sizing: border-box;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

.footer-total {
  display: flex;
  align-items: baseline;
}

.footer-label {
  font-size: 26rpx;
  color: #606266;
  margin-right: 8rpx;
}

.footer-amount {
  font-size: 38rpx;
  color: #e6641e;
  font-weight: 700;
}

.footer-btn {
  width: 280rpx;
  height: 80rpx;
  border-radius: 40rpx;
  background-color: #4a90d9;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}

.footer-btn::after {
  border: none;
}

.footer-btn-disabled {
  background-color: #c0c4cc;
}

.footer-btn-text {
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 500;
}
</style>
