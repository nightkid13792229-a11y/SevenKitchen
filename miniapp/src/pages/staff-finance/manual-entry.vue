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
      <text class="amount-hint">点金额可以改，默认今天</text>
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
      <view class="chips">
        <view
          v-for="option in categoryOptions"
          :key="option.value"
          class="chip"
          :class="{ 'chip--on': selectedCategory === option.value }"
          @tap="selectCategory(option.value)"
        >
          {{ option.label }}
        </view>
      </view>
      <text v-if="direction === 'INCOME'" class="card-hint">
        线上/线下/补剂/定制食谱的收入由系统自动记录
      </text>
    </view>

    <view class="card">
      <text class="card-title">付款方</text>
      <view class="chips">
        <view
          v-for="option in PAYER_OPTIONS"
          :key="option.value"
          class="chip"
          :class="{ 'chip--on': payerType === option.value }"
          @tap="selectPayer(option.value)"
        >
          {{ option.label }}
        </view>
      </view>
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
import {
  staffFinanceApi,
  type CreateManualEntryPayload,
  type FinanceExpenseCategory,
} from '../../api/staff-finance'
import { getStoredUser } from '../../utils/account'
import { FINANCE_START_DATE } from '../../constants/finance'

/** 类别记住上次选择（设计文档 §5.3）：只记支出，收入永远只有一项 */
const CATEGORY_STORAGE_KEY = 'staff-finance:manual-entry-category'
const TITLE_MAX_LENGTH = 200

type Direction = 'INCOME' | 'EXPENSE'
type PayerType = 'PERSONAL' | 'COMPANY'
type CategoryOption = { value: string; label: string }

/**
 * 支出类别只给这四个中文短词：老板记账只要「能对上账」，
 * 不需要看懂会计科目（值必须与后端 FinanceExpenseCategory 枚举一致）。
 */
const EXPENSE_CATEGORIES: CategoryOption[] = [
  { value: 'EQUIPMENT', label: '设备工具' },
  { value: 'TAX', label: '税费' },
  { value: 'SOCIAL_INSURANCE', label: '社保' },
  { value: 'OTHER', label: '其他' },
]

/** 手工收入只有「其他收入」：线上/线下/补剂/定制食谱由系统按来源自动记录 */
const INCOME_CATEGORIES: CategoryOption[] = [
  { value: 'OTHER_INCOME', label: '其他收入' },
]

const PAYER_OPTIONS: Array<{ value: PayerType; label: string }> = [
  { value: 'PERSONAL', label: '我个人垫的' },
  { value: 'COMPANY', label: '公司账户' },
]

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
const payerType = ref<PayerType>('PERSONAL')
const title = ref('')
const submitting = ref(false)

const expenseCategory = ref<FinanceExpenseCategory>('EQUIPMENT')
const selectedCategory = computed(() =>
  direction.value === 'EXPENSE' ? expenseCategory.value : 'OTHER_INCOME',
)
const categoryOptions = computed(() =>
  direction.value === 'EXPENSE' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES,
)
const isToday = computed(() => occurredAt.value === todayKey.value)
const dateLabel = computed(() =>
  isToday.value ? `${occurredAt.value}（今天）` : occurredAt.value,
)

/** 上次选的支出类别：从 storage 恢复，只接受仍然存在的四个短词 */
function restoreExpenseCategory() {
  try {
    const saved = String(uni.getStorageSync(CATEGORY_STORAGE_KEY) || '')
    if (EXPENSE_CATEGORIES.some((option) => option.value === saved)) {
      expenseCategory.value = saved as FinanceExpenseCategory
    }
  } catch {
    // 读不到就按默认「设备工具」，不阻断记账
  }
}

function rememberExpenseCategory(value: string) {
  try {
    uni.setStorageSync(CATEGORY_STORAGE_KEY, value)
  } catch {
    // 存不下也不影响本次记账
  }
}

restoreExpenseCategory()

function selectDirection(next: Direction) {
  if (direction.value === next) return
  direction.value = next
}

function selectCategory(value: string) {
  // 收入只有「其他收入」一项，点它不改变任何东西
  if (direction.value !== 'EXPENSE') return
  if (!EXPENSE_CATEGORIES.some((option) => option.value === value)) return
  expenseCategory.value = value as FinanceExpenseCategory
  rememberExpenseCategory(value)
}

function selectPayer(value: PayerType) {
  payerType.value = value
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
  if (!title.value.trim()) return '请写一句说明'
  return ''
}

function buildPayload(amount: number): CreateManualEntryPayload {
  const payload: CreateManualEntryPayload = {
    direction: direction.value,
    amount,
    occurredAt: occurredAt.value,
    payerType: payerType.value,
    title: title.value.trim(),
  }
  // 支出只传 category，收入只传 incomeCategory：另一侧留空，避免双重归类
  if (direction.value === 'EXPENSE') {
    payload.category = expenseCategory.value
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

.amount-hint {
  display: block;
  margin-top: 4rpx;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
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
