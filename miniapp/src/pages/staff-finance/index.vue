<template>
  <view class="page">
    <view class="month-row">
      <text class="month-title">{{ monthTitle }}</text>
      <text class="month-mode">{{ rangeHint }}</text>
    </view>

    <view class="month-chips">
      <view
        class="chip"
        :class="{ 'chip--on': activeView === 'mtd' }"
        @tap="selectView('mtd')"
      >
        本月至今
      </view>
      <view
        v-for="chip in recentMonthChips"
        :key="chip.key"
        class="chip"
        :class="{ 'chip--on': activeView === chip.key }"
        @tap="selectView(chip.key)"
      >
        {{ chip.label }}
      </view>
      <picker
        class="month-picker"
        mode="date"
        fields="month"
        :value="pickerValue"
        :start="FINANCE_START_MONTH"
        :end="currentMonth"
        @change="onPickMonth"
      >
        <view class="chip" :class="{ 'chip--on': pickerActive }">选月份</view>
      </picker>
    </view>

    <view v-if="loading && !dashboard" class="skeleton">
      <view class="sk-hero"></view>
      <view class="sk-alert"></view>
      <view class="sk-card">
        <view class="sk-line sk-line--short"></view>
        <view v-for="n in 4" :key="n" class="sk-line"></view>
      </view>
    </view>

    <view v-else-if="error && !dashboard" class="state">
      <text class="state-title">财务数据加载失败</text>
      <text class="state-hint">{{ error }}</text>
      <button class="state-retry" @tap="retry">重试</button>
    </view>

    <template v-else-if="dashboard">
      <view class="hero">
        <text class="hero-label">{{ heroLabel }}</text>
        <view
          class="hero-amount"
          :class="{ 'hero-amount--negative': balanceNegative }"
          @tap="goEntries"
        >
          <text v-if="balanceNegative" class="hero-minus">−</text>
          <text class="hero-currency">¥</text>
          <text class="hero-number">{{ formatMoney(balanceAbs) }}</text>
          <text class="hero-chevron">›</text>
        </view>
        <text v-if="balanceNegative" class="hero-warning">这个月花得比收得多，先看房租和工资那几笔是不是漏录</text>
        <text class="hero-caption">{{ heroCaption }}</text>

        <view class="hero-split">
          <view class="hero-metric" @tap="goIncomeEntries">
            <text class="hero-metric-label">收入</text>
            <view class="hero-metric-row">
              <text class="hero-metric-value">¥{{ formatMoney(incomeTotal) }}</text>
              <text class="hero-metric-arrow">›</text>
            </view>
          </view>
          <view class="hero-metric" @tap="goExpenseEntries">
            <text class="hero-metric-label">支出</text>
            <view class="hero-metric-row">
              <text class="hero-metric-value">¥{{ formatMoney(expenseTotal) }}</text>
              <text class="hero-metric-arrow">›</text>
            </view>
          </view>
        </view>

        <text v-if="historicalRefundTotal > 0" class="hero-refund">
          其中历史订单退款 ¥{{ formatMoney(historicalRefundTotal) }}（起账日前的单）
        </text>

        <text v-if="compareText" class="hero-compare">{{ compareText }}</text>
        <text v-if="fixedFeeTotal > 0" class="hero-note">{{ fixedFeeCopy }}</text>
        <text v-else class="hero-note hero-note--link" @tap="goBills">本月固定费用还没生成 ›</text>
      </view>

      <view
        v-if="pendingOfflineCount > 0"
        class="pending-alert"
        @tap="goPendingOfflineOrders"
      >
        <view class="pending-badge">!</view>
        <text class="pending-text">有 {{ pendingOfflineCount }} 笔线下收款待确认</text>
        <text class="pending-arrow">›</text>
      </view>

      <view class="card">
        <text class="card-title">钱花在哪</text>
        <view v-if="spendBars.length === 0" class="card-empty">这段时间还没有支出</view>
        <view v-else class="bars">
          <view v-for="bar in spendBars" :key="bar.key" class="bar-row">
            <text class="bar-label">{{ bar.label }}</text>
            <view class="bar-track">
              <view class="bar-fill" :style="{ width: bar.percent + '%' }"></view>
            </view>
            <text class="bar-amount">¥{{ formatMoney(bar.amount) }}</text>
          </view>
        </view>
      </view>

      <view class="actions">
        <button class="action-btn action-btn--primary" @tap="goManualEntry">记一笔</button>
        <button class="action-btn action-btn--ghost" @tap="goBills">固定费用</button>
      </view>
      <view class="detail-link" @tap="goEntries">查看全部收支明细 ›</view>

      <text v-if="error" class="stale-hint">刷新失败，当前显示的是上次的数据</text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  staffFinanceApi,
  type FinanceDashboard,
  type FinanceExpenseCategory,
} from '../../api/staff-finance'
import { getStoredUser } from '../../utils/account'
import { FINANCE_START_MONTH } from '../../constants/finance'

/** 起账日：早于起账月的月份后端不统计，月份快照也只在起账月之后给 */
const FINANCE_START_MONTH_NUMBER = Number(FINANCE_START_MONTH.slice(5, 7))

/**
 * 固定费用分类：月初查「本月至今」时收入只算几天、支出却已含整月固定费用，
 * 主卡必须单独把这一笔写出来，老板才不会把月初的亏损当成真亏。
 */
const FIXED_FEE_CATEGORIES: readonly FinanceExpenseCategory[] = [
  'RENT',
  'UTILITIES',
  'NETWORK_COMMUNICATION',
  'TECHNICAL_SERVICES',
  'PAYROLL',
  'SOCIAL_INSURANCE',
  'TAX',
]
const FIXED_FEE_CATEGORY_SET = new Set<string>(FIXED_FEE_CATEGORIES)

type MonthChip = { key: string; label: string }
type SpendBar = { key: string; label: string; amount: number; percent: number }

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 按上海时区取今天的年月日，避免设备时区不是 +08:00 时月初串月 */
function shanghaiNowParts() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

function previousMonthKey(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 2, 1))
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** 统一金额格式：千分位，整数不带 .00，有分则保留两位 */
function formatMoney(value: number | null | undefined): string {
  const amount = Math.abs(Number(value) || 0)
  const [integer, decimal] = amount.toFixed(2).split('.')
  const grouped = integer.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
  return decimal === '00' ? grouped : `${grouped}.${decimal}`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: string } | null)?.errMsg
  return typeof errMsg === 'string' && errMsg ? errMsg : '请稍后重试'
}

const nowParts = ref(shanghaiNowParts())
/** 'mtd' = 本月至今；'YYYY-MM' = 完整月份 */
const activeView = ref('mtd')

const dashboard = ref<FinanceDashboard | null>(null)
const previousDashboard = ref<FinanceDashboard | null>(null)
const loading = ref(true)
const error = ref('')

let requestSeq = 0

const currentMonth = computed(
  () => `${nowParts.value.year}-${pad2(nowParts.value.month)}`,
)
const isFullMonth = computed(() => activeView.value !== 'mtd')
const selectedMonth = computed(() =>
  isFullMonth.value ? activeView.value : currentMonth.value,
)
const pickerValue = computed(() => selectedMonth.value)

/**
 * 最近三个月的整月快照。
 * 起账日之前的月份没有数据（后端会直接报错），所以按起账月裁剪；
 * 2026-11 打开时只剩「11 月」这一个整月入口，正好用来验证月报。
 */
const recentMonthChips = computed<MonthChip[]>(() => {
  const chips: MonthChip[] = []
  const [year, month] = currentMonth.value.split('-').map(Number)
  for (let offset = 0; offset < 3; offset += 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1))
    const key = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`
    if (key < FINANCE_START_MONTH) continue
    chips.push({ key, label: `${Number(key.slice(5, 7))} 月` })
  }
  return chips
})
const recentMonthKeys = computed(() => recentMonthChips.value.map((chip) => chip.key))
const pickerActive = computed(
  () => isFullMonth.value && !recentMonthKeys.value.includes(activeView.value),
)

const monthTitle = computed(() => {
  const [year, month] = selectedMonth.value.split('-')
  return `${year} 年 ${Number(month)} 月`
})

const rangeHint = computed(() => {
  if (isFullMonth.value) return '完整月份'
  const range = dashboard.value?.range
  const fromDay = range ? Number(range.from.slice(8, 10)) : 1
  const toDay = range ? Number(range.to.slice(8, 10)) : nowParts.value.day
  return `本月至今 · ${fromDay}–${toDay} 日`
})

const heroLabel = computed(() =>
  isFullMonth.value
    ? `${Number(selectedMonth.value.slice(5, 7))} 月结余`
    : '这个月到现在，你赚了',
)

const incomeTotal = computed(() => Number(dashboard.value?.income.netTotal) || 0)
/** 起账日前的订单退款：已经含在收入净额里，单独列出来，免得以为当月白干 */
const historicalRefundTotal = computed(
  () => Number(dashboard.value?.income.historicalRefundTotal) || 0,
)
const expenseTotal = computed(() => Number(dashboard.value?.expense.total) || 0)
const balance = computed(() => Number(dashboard.value?.balance) || 0)
const balanceAbs = computed(() => Math.abs(balance.value))
const balanceNegative = computed(() => balance.value < 0)

const fixedFeeTotal = computed(() => {
  const rows = dashboard.value?.expense.byCategory || []
  const total = rows.reduce(
    (sum, row) =>
      FIXED_FEE_CATEGORY_SET.has(row.category) ? sum + (Number(row.amount) || 0) : sum,
    0,
  )
  return roundMoney(total)
})

/** 固定费用为 0 时，连「已经扣掉房租、工资、社保」也不能说 */
const heroCaption = computed(() =>
  fixedFeeTotal.value > 0
    ? '= 收入 − 支出，已经扣掉房租、工资、社保'
    : '= 收入 − 支出，固定费用还没生成',
)

/**
 * 固定费用的说明必须跟「已经扣掉房租、工资、社保」对得上：
 * 完整月份写「该月」，本月至今写「本月」；为 0 时不再说「已含 ¥0」，
 * 改成引导去「固定费用」页生成（Task 14 的页面）。
 */
const fixedFeeCopy = computed(() => {
  const amount = formatMoney(fixedFeeTotal.value)
  return isFullMonth.value
    ? `该月已含固定费用 ¥${amount}`
    : `本月已含固定费用 ¥${amount}`
})

const pendingOfflineCount = computed(
  () => Number(dashboard.value?.pendingOfflineConfirmCount) || 0,
)

/**
 * 完整月份才和上月比：11 月是起账月，直接写「从 11 月起账」。
 * 上月请求失败不阻断本月月报，只把对比行写成「暂时取不到」。
 */
const compareText = computed(() => {
  if (!isFullMonth.value || !dashboard.value) return ''
  if (selectedMonth.value === FINANCE_START_MONTH) {
    return `从 ${FINANCE_START_MONTH_NUMBER} 月起账`
  }
  if (!previousDashboard.value) return '上月数据暂时取不到'
  const diff = roundMoney(dashboard.value.balance - previousDashboard.value.balance)
  const sign = diff >= 0 ? '+' : '−'
  return `比上月 ${sign}¥${formatMoney(Math.abs(diff))}`
})

/** 最多 7 行：前 6 类按金额降序，其余合并成「其他」 */
const spendBars = computed<SpendBar[]>(() => {
  const expense = dashboard.value?.expense
  if (!expense) return []
  const total = Number(expense.total) || 0
  const categories = (expense.byCategory || [])
    .filter((row) => Number(row.amount) > 0)
    .map((row) => ({
      key: row.category,
      label: row.label || row.category,
      amount: Number(row.amount) || 0,
    }))
    .sort((left, right) => right.amount - left.amount)

  if (categories.length === 0) return []

  let rows = categories
  if (categories.length > 7) {
    rows = categories.slice(0, 6)
    const restAmount = roundMoney(
      categories.slice(6).reduce((sum, row) => sum + row.amount, 0),
    )
    const existingOther = rows.find((row) => row.label === '其他')
    if (existingOther) {
      existingOther.amount = roundMoney(existingOther.amount + restAmount)
    } else {
      rows = [...rows, { key: 'OTHER_MERGED', label: '其他', amount: restAmount }]
    }
  }

  return rows.map((row) => ({
    ...row,
    percent:
      total > 0
        ? Math.min(100, Math.round((row.amount / total) * 1000) / 10)
        : 0,
  }))
})

async function load(options: { reset?: boolean } = {}) {
  if (options.reset) {
    dashboard.value = null
    previousDashboard.value = null
  }
  loading.value = true
  error.value = ''
  nowParts.value = shanghaiNowParts()

  const seq = ++requestSeq
  const view = activeView.value
  const fullMonth = view !== 'mtd'
  const previousMonth =
    fullMonth && view > FINANCE_START_MONTH ? previousMonthKey(view) : ''

  try {
    const [current, previous] = await Promise.all([
      staffFinanceApi.getDashboard(fullMonth ? { month: view } : {}),
      previousMonth
        ? staffFinanceApi.getDashboard({ month: previousMonth }).catch(() => null)
        : Promise.resolve(null),
    ])
    if (seq !== requestSeq) return
    dashboard.value = current
    previousDashboard.value = previous
  } catch (err) {
    if (seq !== requestSeq) return
    error.value = errorMessage(err)
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function selectView(view: string) {
  if (activeView.value === view) return
  activeView.value = view
  load({ reset: true })
}

function onPickMonth(event: any) {
  const value = String(event?.detail?.value || '')
  if (!/^\d{4}-\d{2}$/.test(value)) return
  selectView(value)
}

function retry() {
  load({ reset: true })
}

function goPendingOfflineOrders() {
  // 旧的 /pages/staff-orders/index 已下线，订单列表现在在「订单中心」
  uni.navigateTo({ url: '/pages/staff-order-center/index' })
}

function goManualEntry() {
  uni.navigateTo({ url: '/pages/staff-finance/manual-entry' })
}

function goBills() {
  uni.navigateTo({ url: '/pages/staff-finance/bills' })
}

/**
 * 明细页跳转。跳不过去必须有提示，不能让老板点了没反应。
 *
 * 完整月份时把 `month` 一起带上：否则从月报点进明细会按「本月至今」重新取数，
 * 跟首页上的数字对不上。本月至今不带月份，明细页也按本月至今取，口径一致。
 */
function openEntries(direction?: 'INCOME' | 'EXPENSE') {
  const params: string[] = []
  if (direction) params.push(`direction=${direction}`)
  if (isFullMonth.value) params.push(`month=${activeView.value}`)
  const query = params.length > 0 ? `?${params.join('&')}` : ''
  uni.navigateTo({
    url: `/pages/staff-finance/entries${query}`,
    fail: () => {
      uni.showToast({ title: '打开失败，请稍后重试', icon: 'none' })
    },
  })
}

function goIncomeEntries() {
  openEntries('INCOME')
}

function goExpenseEntries() {
  openEntries('EXPENSE')
}

function goEntries() {
  openEntries()
}

onShow(() => {
  // 员工直接输地址进来时先拦下，连请求都不发（后端也会 403，但不要停在错误页）
  if (getStoredUser()?.role !== 'ADMIN') {
    uni.showToast({ title: '权限不足', icon: 'none' })
    setTimeout(() => {
      uni.navigateBack({
        fail: () => {
          uni.reLaunch({ url: '/pages/staff-workbench/index' })
        },
      })
    }, 600)
    return
  }
  load()
})
</script>

<style scoped lang="scss">
@import '../../styles/staff-tokens.scss';

/* 深绿底上的警示红：$staff-danger (#B4453A) 在深底上读不清，
   这里取浅红，对 #1E3A2F 的对比度 6.3:1（正文级别）。 */
$staff-danger-on-brand: #f2a79a;

/* 深绿底上的金色：$staff-gold-ink (#7A5C28) 对 #1E3A2F 只有 2:1，
   同样另取浅金，对 #1E3A2F 的对比度 7.2:1（正文级别）。 */
$staff-gold-on-brand: #e3c27e;

.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24rpx $staff-gutter calc(48rpx + env(safe-area-inset-bottom));
  background: $staff-bg;
}

.month-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 4rpx 4rpx 0;
}

.month-title {
  font-size: $staff-font-h1;
  font-weight: 700;
  color: $staff-ink;
}

.month-mode {
  font-size: $staff-font-caption;
  color: $staff-ink-2;
}

.month-chips {
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
  background: $staff-surface;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-pill;
}

.chip--on {
  font-weight: 600;
  color: $staff-cream;
  background: $staff-brand;
  border-color: $staff-brand;
}

.month-picker {
  display: inline-flex;
}

.hero {
  margin-top: 24rpx;
  padding: $staff-card-padding;
  color: $staff-cream;
  background: $staff-brand;
  border-radius: $staff-radius-card;
  box-shadow: $staff-shadow-card;
}

.hero-label {
  display: block;
  font-size: $staff-font-caption;
  color: rgba(243, 237, 221, 0.72);
}

.hero-amount {
  display: flex;
  align-items: baseline;
  min-height: 88rpx;
  margin-top: 6rpx;
}

.hero-minus {
  font-size: $staff-font-metric;
  font-weight: 700;
}

.hero-currency {
  margin-right: 6rpx;
  font-size: $staff-font-body;
  font-weight: 600;
}

.hero-number {
  font-size: $staff-font-metric;
  font-weight: 700;
  letter-spacing: -1rpx;
  font-variant-numeric: tabular-nums;
}

/* 结余可点：`›` 用深底上的半透明米白，不抢数字 */
.hero-chevron {
  margin-left: 10rpx;
  font-size: $staff-font-body;
  color: rgba(243, 237, 221, 0.72);
}

.hero-amount--negative .hero-minus,
.hero-amount--negative .hero-currency,
.hero-amount--negative .hero-number {
  color: $staff-danger-on-brand;
}

.hero-warning {
  display: block;
  margin-top: 8rpx;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: $staff-danger-on-brand;
}

.hero-caption {
  display: block;
  margin-top: 4rpx;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: rgba(243, 237, 221, 0.72);
}

.hero-split {
  display: flex;
  gap: 64rpx;
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid rgba(243, 237, 221, 0.18);
}

.hero-metric {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 88rpx;
}

.hero-metric-row {
  display: flex;
  align-items: baseline;
  margin-top: 4rpx;
}

.hero-metric-arrow {
  margin-left: 8rpx;
  font-size: $staff-font-body;
  color: rgba(243, 237, 221, 0.72);
}

.hero-metric-label {
  font-size: $staff-font-caption;
  color: rgba(243, 237, 221, 0.72);
}

.hero-metric-value {
  font-size: $staff-font-h2;
  font-weight: 600;
  color: $staff-cream;
  font-variant-numeric: tabular-nums;
}

.hero-compare {
  display: block;
  margin-top: 20rpx;
  font-size: $staff-font-caption;
  font-weight: 600;
  color: $staff-cream;
}

/* 历史订单退款：小号金色，金额也在这里，不抢主数字 */
.hero-refund {
  display: block;
  margin-top: 12rpx;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: $staff-gold-on-brand;
  font-variant-numeric: tabular-nums;
}

.hero-note {
  display: block;
  margin-top: 12rpx;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: rgba(243, 237, 221, 0.72);
}

.hero-note--link {
  color: $staff-cream;
  text-decoration: underline;
}

.pending-alert {
  display: flex;
  align-items: center;
  min-height: 88rpx;
  margin-top: 16rpx;
  padding: 16rpx 20rpx;
  color: $staff-gold-ink;
  background: $staff-gold-soft;
  border: 1rpx solid #e6d8b8;
  border-radius: $staff-radius-control;
}

.pending-badge {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36rpx;
  height: 36rpx;
  font-size: $staff-font-caption;
  font-weight: 700;
  color: $staff-gold-soft;
  background: $staff-gold-ink;
  border-radius: $staff-radius-pill;
}

.pending-text {
  flex: 1;
  margin-left: 12rpx;
  font-size: $staff-font-sub;
  font-weight: 600;
}

.pending-arrow {
  flex: none;
  margin-left: 8rpx;
  font-size: $staff-font-body;
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
  font-size: $staff-font-sub;
  font-weight: 600;
  color: $staff-ink-2;
}

.card-empty {
  padding: 24rpx 0 8rpx;
  font-size: $staff-font-sub;
  text-align: center;
  color: $staff-ink-2;
}

.bars {
  margin-top: 12rpx;
}

.bar-row {
  display: flex;
  align-items: center;
  padding: 10rpx 0;
}

.bar-label {
  flex: none;
  width: 168rpx;
  overflow: hidden;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bar-track {
  flex: 1;
  height: 14rpx;
  margin: 0 16rpx;
  overflow: hidden;
  background: $staff-line;
  border-radius: $staff-radius-pill;
}

.bar-fill {
  min-width: 4rpx;
  height: 100%;
  background: $staff-brand;
  border-radius: $staff-radius-pill;
}

.bar-amount {
  flex: none;
  width: 136rpx;
  font-size: $staff-font-sub;
  text-align: right;
  color: $staff-ink;
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}

.action-btn {
  flex: 1;
  min-height: 88rpx;
  margin: 0;
  padding: 0 24rpx;
  font-size: $staff-font-body;
  font-weight: 600;
  line-height: 88rpx;
  border-radius: $staff-radius-control;
}

.action-btn::after {
  border: none;
}

.action-btn--primary {
  color: $staff-cream;
  background: $staff-brand;
}

.action-btn--ghost {
  color: $staff-brand;
  background: $staff-surface;
  border: 1rpx solid $staff-line-strong;
}

.detail-link {
  padding: 24rpx 0 8rpx;
  font-size: $staff-font-sub;
  text-align: center;
  color: $staff-ink-2;
}

.stale-hint {
  display: block;
  padding-top: 8rpx;
  font-size: $staff-font-caption;
  text-align: center;
  color: $staff-gold-ink;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 32rpx;
}

.state-title {
  font-size: $staff-font-h2;
  font-weight: 700;
  color: $staff-ink;
}

.state-hint {
  margin-top: 12rpx;
  font-size: $staff-font-sub;
  line-height: 1.5;
  text-align: center;
  color: $staff-ink-2;
}

.state-retry {
  min-width: 200rpx;
  min-height: 88rpx;
  margin-top: 32rpx;
  padding: 0 48rpx;
  font-size: $staff-font-body;
  line-height: 88rpx;
  color: $staff-cream;
  background: $staff-brand;
  border-radius: $staff-radius-control;
}

.state-retry::after {
  border: none;
}

.skeleton {
  margin-top: 24rpx;
}

.sk-hero {
  height: 320rpx;
  background: $staff-line;
  border-radius: $staff-radius-card;
}

.sk-alert {
  height: 88rpx;
  margin-top: 16rpx;
  background: $staff-gold-soft;
  border-radius: $staff-radius-control;
}

.sk-card {
  margin-top: 16rpx;
  padding: $staff-card-padding;
  background: $staff-surface;
  border: 1rpx solid $staff-line;
  border-radius: $staff-radius-card;
}

.sk-line {
  height: 28rpx;
  margin: 22rpx 0;
  background: $staff-line;
  border-radius: $staff-radius-pill;
}

.sk-line--short {
  width: 40%;
  margin-top: 0;
}
</style>
