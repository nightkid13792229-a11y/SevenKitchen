<template>
  <view class="page">
    <view class="segment">
      <view
        class="segment-item"
        :class="{ 'segment-item--on': direction === 'EXPENSE' }"
        @tap="selectDirection('EXPENSE')"
      >
        支出
      </view>
      <view
        class="segment-item"
        :class="{ 'segment-item--on': direction === 'INCOME' }"
        @tap="selectDirection('INCOME')"
      >
        收入
      </view>
    </view>

    <view class="amount-card" @tap="focusAmount">
      <text class="amount-label">金额</text>
      <view class="amount-row">
        <text class="amount-currency">¥</text>
        <input
          class="amount-input"
          type="digit"
          :value="amountText"
          :focus="amountFocus"
          placeholder="0.00"
          placeholder-class="amount-placeholder"
          @input="onAmountInput"
          @blur="onAmountBlur"
        />
      </view>
    </view>

    <view class="card">
      <view class="row">
        <text class="row-label">日期</text>
        <picker
          class="row-picker"
          mode="date"
          :value="occurredAt"
          :start="minDate"
          :end="maxDate"
          @change="onPickDate"
        >
          <view class="row-value">
            <text class="row-value-text">{{ dateLabel }}</text>
            <text class="row-chevron">›</text>
          </view>
        </picker>
      </view>
    </view>

    <view class="card">
      <text class="card-title">类别</text>
      <!-- 支出走类别字典：输入即建，下次自己就在候选里 -->
      <CategoryPicker
        v-if="direction === 'EXPENSE'"
        v-model="expenseCategoryId"
        placeholder="选一个类别，或输入新名字"
      />
      <view v-else class="chips">
        <view class="chip chip--on">其他收入</view>
      </view>
      <text v-if="direction === 'INCOME'" class="card-hint">
        线上/线下/补剂/定制食谱的收入由系统自动记录
      </text>
    </view>

    <view class="card">
      <!-- 支出口径是「钱从哪个账户出」，收入是「钱进哪个账户」 -->
      <text class="card-title">{{ direction === 'EXPENSE' ? '从哪个账户出' : '钱进哪个账户' }}</text>
      <AccountPicker v-model="payerAccount" />
    </view>

    <view class="card">
      <text class="card-title">说明</text>
      <input
        class="text-input"
        :value="title"
        maxlength="200"
        placeholder="写一句，例：封口机"
        placeholder-class="text-placeholder"
        @input="onTitleInput"
      />
      <text class="counter">{{ title.length }}/{{ TITLE_MAX_LENGTH }}</text>
    </view>

    <view class="bottom-bar">
      <button class="save-btn" :disabled="submitting" @tap="submit">
        {{ submitting ? '保存中…' : '保存' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import CategoryPicker from '../../components/finance/CategoryPicker.vue'
import AccountPicker from '../../components/finance/AccountPicker.vue'
import {
  staffFinanceApi,
  type CreateManualEntryPayload,
} from '../../api/staff-finance'
import { getStoredUser } from '../../utils/account'
import {
  getLastAccount,
  type FinanceAccountCode,
} from '../../utils/finance-account'
import { FINANCE_START_DATE } from '../../constants/finance'

const TITLE_MAX_LENGTH = 200

type Direction = 'INCOME' | 'EXPENSE'

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 按上海时区取「今天」，设备时区不是 +08:00 时也不会串天 */
function shanghaiTodayKey(): string {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(
    shifted.getUTCDate(),
  )}`
}

/** 默认日期夹在 [起账日, 今天] 之间 */
function defaultDateKey(): string {
  const today = shanghaiTodayKey()
  return today < FINANCE_START_DATE ? FINANCE_START_DATE : today
}

const todayKey = ref(shanghaiTodayKey())
const maxDate = computed(() =>
  todayKey.value < FINANCE_START_DATE ? FINANCE_START_DATE : todayKey.value,
)
const minDate = FINANCE_START_DATE

const direction = ref<Direction>('EXPENSE')
const amountText = ref('')
/** 打开页面直接弹金额键盘：15 秒内记完 */
const amountFocus = ref(true)
const occurredAt = ref(defaultDateKey())
/** 账户记住上次用的（五处共用 `finance:lastAccount`） */
const payerAccount = ref<FinanceAccountCode>(getLastAccount())
const title = ref('')
const submitting = ref(false)

/** 支出类别 id（类别字典）；收入不选类别，固定「其他收入」 */
const expenseCategoryId = ref('')

const isToday = computed(() => occurredAt.value === todayKey.value)
const dateLabel = computed(() =>
  isToday.value ? `${occurredAt.value}（今天）` : occurredAt.value,
)

function selectDirection(next: Direction) {
  if (direction.value === next) return
  direction.value = next
}

function focusAmount() {
  amountFocus.value = true
}

function onAmountInput(event: any) {
  amountText.value = String(event?.detail?.value ?? '')
}

function onAmountBlur() {
  amountFocus.value = false
}

function onPickDate(event: any) {
  const value = String(event?.detail?.value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
  if (value < FINANCE_START_DATE || value > maxDate.value) return
  occurredAt.value = value
}

function onTitleInput(event: any) {
  const value = String(event?.detail?.value ?? '')
  title.value = value.slice(0, TITLE_MAX_LENGTH)
}

/** 金额：空、非数字、非正数、超过两位小数都拦下；返回按分取整后的元 */
function parseAmount(): { value: number } | { error: string } {
  const raw = amountText.value.trim()
  if (!raw) return { error: '请输入金额' }
  if (!/^\d*\.?\d*$/.test(raw)) return { error: '请输入正确的金额' }
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return { error: '金额必须大于 0' }
  const cents = Math.round(value * 100)
  if (Math.abs(cents - value * 100) > 1e-6) {
    return { error: '金额最多两位小数' }
  }
  return { value: cents / 100 }
}

/** 保存前校验：返回第一条错误，空字符串表示通过 */
function validationMessage(): string {
  const amount = parseAmount()
  if ('error' in amount) return amount.error
  // 类别必须显式选：默认不替老板猜，猜错类别报表就得重记
  if (direction.value === 'EXPENSE' && !expenseCategoryId.value) {
    return '请选择类别'
  }
  if (!title.value.trim()) return '请写一句说明'
  return ''
}

function buildPayload(amount: number): CreateManualEntryPayload {
  const payload: CreateManualEntryPayload = {
    direction: direction.value,
    amount,
    occurredAt: occurredAt.value,
    payerAccount: payerAccount.value,
    title: title.value.trim(),
  }
  // 支出只传 categoryId，收入只传 incomeCategory：另一侧留空，避免双重归类
  if (direction.value === 'EXPENSE') {
    payload.categoryId = expenseCategoryId.value
  } else {
    payload.incomeCategory = 'OTHER_INCOME'
  }
  return payload
}

/** 后端 message 原样拿出来显示，不能吞（用户要知道是金额还是日期不对） */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: string } | null)?.errMsg
  return typeof errMsg === 'string' && errMsg ? errMsg : '保存失败，请稍后重试'
}

async function submit() {
  if (submitting.value) return
  amountFocus.value = false

  const message = validationMessage()
  if (message) {
    uni.showToast({ title: message, icon: 'none' })
    return
  }
  const amount = parseAmount()
  if ('error' in amount) return

  submitting.value = true
  try {
    await staffFinanceApi.createManualEntry(buildPayload(amount.value))
    uni.showToast({ title: '已记入', icon: 'success', duration: 1200 })
    // 等 toast 露个面再回首页；首页 onShow 会重新取数，数字立即更新
    setTimeout(() => {
      uni.navigateBack({
        fail: () => {
          uni.reLaunch({ url: '/pages/staff-finance/index' })
        },
      })
    }, 700)
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none', duration: 2500 })
    // 失败停在页面，按钮恢复可点，已填内容不丢
    submitting.value = false
  }
}

onShow(() => {
  // 与财务首页一致：非 ADMIN 直接输地址先进来，连请求都不发
  if (getStoredUser()?.role !== 'ADMIN') {
    uni.showToast({ title: '权限不足', icon: 'none' })
    setTimeout(() => {
      uni.navigateBack({
        fail: () => {
          uni.reLaunch({ url: '/pages/staff-workbench/index' })
        },
      })
    }, 600)
  }
})
</script>

<style scoped lang="scss">
@import '../../styles/staff-tokens.scss';

.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24rpx $staff-gutter calc(200rpx + env(safe-area-inset-bottom));
  background: $staff-bg;
}

/* 支出 / 收入：选中 = 深绿底米白字 */
.segment {
  display: flex;
  gap: 6rpx;
  padding: 6rpx;
  background: $staff-line;
  border-radius: $staff-radius-pill;
}

.segment-item {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  font-size: $staff-font-body;
  font-weight: 600;
  color: $staff-ink-2;
  border-radius: $staff-radius-pill;
}

.segment-item--on {
  color: $staff-cream;
  background: $staff-brand;
  box-shadow: $staff-shadow-card;
}

.amount-card {
  margin-top: 16rpx;
  padding: $staff-card-padding;
  background: $staff-surface;
  border: 1rpx solid $staff-line;
  border-radius: $staff-radius-card;
  box-shadow: $staff-shadow-card;
}

.amount-label {
  display: block;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
}

.amount-row {
  display: flex;
  align-items: baseline;
  margin-top: 4rpx;
}

.amount-currency {
  margin-right: 8rpx;
  font-size: $staff-font-h1;
  font-weight: 600;
  color: $staff-ink-2;
}

.amount-input {
  flex: 1;
  height: 96rpx;
  font-size: $staff-font-metric;
  font-weight: 700;
  line-height: 96rpx;
  color: $staff-ink;
  font-variant-numeric: tabular-nums;
}

.amount-placeholder {
  font-size: $staff-font-metric;
  font-weight: 700;
  color: $staff-ink-3;
}

.card {
  margin-top: 16rpx;
  padding: $staff-card-padding;
  background: $staff-surface;
  border: 1rpx solid $staff-line;
  border-radius: $staff-radius-card;
  box-shadow: $staff-shadow-card;
}

.card-title {
  display: block;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
}

.card-hint {
  display: block;
  margin-top: 12rpx;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: $staff-ink-2;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 88rpx;
}

.row-label {
  flex: none;
  font-size: $staff-font-sub;
  color: $staff-ink;
}

.row-picker {
  display: flex;
  flex: 1;
  justify-content: flex-end;
}

.row-value {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 88rpx;
  padding-left: 24rpx;
}

.row-value-text {
  font-size: $staff-font-body;
  font-weight: 600;
  color: $staff-ink;
  font-variant-numeric: tabular-nums;
}

.row-chevron {
  margin-left: 10rpx;
  font-size: $staff-font-body;
  color: $staff-ink-3;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.chip {
  display: inline-flex;
  align-items: center;
  min-height: 88rpx;
  padding: 0 28rpx;
  font-size: $staff-font-sub;
  color: $staff-ink;
  background: $staff-bg;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-pill;
}

.chip--on {
  font-weight: 600;
  color: $staff-cream;
  background: $staff-brand;
  border-color: $staff-brand;
}

.text-input {
  box-sizing: border-box;
  height: 88rpx;
  margin-top: 16rpx;
  padding: 0 20rpx;
  font-size: $staff-font-body;
  color: $staff-ink;
  background: $staff-bg;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-control;
}

.text-placeholder {
  color: $staff-ink-3;
}

.counter {
  display: block;
  margin-top: 8rpx;
  font-size: $staff-font-caption;
  text-align: right;
  color: $staff-ink-2;
  font-variant-numeric: tabular-nums;
}

.bottom-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 24rpx $staff-gutter calc(24rpx + env(safe-area-inset-bottom));
  background: $staff-bg;
  box-shadow: $staff-shadow-bar;
}

.save-btn {
  min-height: 88rpx;
  margin: 0;
  font-size: $staff-font-body;
  font-weight: 600;
  line-height: 88rpx;
  color: $staff-cream;
  background: $staff-brand;
  border-radius: $staff-radius-control;
}

.save-btn::after {
  border: none;
}

.save-btn[disabled] {
  color: $staff-cream;
  background: $staff-ink-3;
}
</style>
