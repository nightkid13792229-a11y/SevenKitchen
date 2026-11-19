<template>
  <view class="page">
    <view class="filters">
      <view
        v-for="chip in filterChips"
        :key="chip.key"
        class="filter-chip"
        :class="{ 'filter-chip--on': activeFilter === chip.key }"
        @tap="selectFilter(chip.key)"
      >
        {{ chip.label }}
      </view>
      <text v-if="!loading && entries.length > 0" class="filters-count">
        共 {{ total }} 笔
      </text>
    </view>

    <view v-if="loading && entries.length === 0" class="skeleton">
      <view v-for="n in 5" :key="n" class="sk-row"></view>
    </view>

    <view v-else-if="error && entries.length === 0" class="state">
      <text class="state-title">收支明细加载失败</text>
      <text class="state-hint">{{ error }}</text>
      <button class="state-retry" @tap="retry">重试</button>
    </view>

    <StaffEmptyState
      v-else-if="entries.length === 0"
      card
      icon="🧾"
      title="这段时间还没有收支记录"
      hint="订单收入、采购支出、退款都会记在这里；换个筛选或回首页看看汇总"
      action-text="回财务首页"
      @action="goHome"
    />

    <view v-else class="list">
      <view
        v-for="entry in entries"
        :key="entry.id"
        class="entry"
        @tap="openSource(entry)"
      >
        <view class="entry-main">
          <view class="entry-head">
            <text class="entry-date">{{ formatDate(entry.occurredAt) }}</text>
            <text v-if="entry.label !== '退款'" class="entry-tag">{{ entry.label }}</text>
            <text v-if="entry.isRefund" class="entry-refund">退款</text>
          </view>
          <text class="entry-title">{{ entryTitle(entry) }}</text>
        </view>
        <text
          class="entry-amount"
          :class="{ 'entry-amount--negative': amountNegative(entry) }"
        >
          {{ amountSign(entry) }}¥{{ formatMoney(entry.amount) }}
        </text>
      </view>

      <view v-if="loadingMore" class="load-more">
        <text class="load-text">加载中…</text>
      </view>
      <view v-else-if="error" class="load-more" @tap="loadMore">
        <text class="load-text load-text--retry">加载失败，点这里重试</text>
      </view>
      <view v-else-if="!hasMore" class="load-more">
        <text class="load-text">没有更多了</text>
      </view>

      <text v-if="truncated" class="truncate-hint">
        明细太多，只显示最近的 5000 条，缩小日期范围能看全
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onReachBottom, onShow } from '@dcloudio/uni-app'
import StaffEmptyState from '../../components/staff/StaffEmptyState.vue'
import {
  staffFinanceApi,
  type FinanceEntry,
  type FinanceEntriesQuery,
  type FinanceEntrySourceType,
} from '../../api/staff-finance'
import { getStoredUser } from '../../utils/account'

/** 每页条数：后台上限 200，这里取 20，一屏能看到 3–4 条又不至于一次拉太多 */
const PAGE_SIZE = 20

type FilterKey = 'ALL' | 'INCOME' | 'EXPENSE' | 'PERSONAL'

const filterChips: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'INCOME', label: '收入' },
  { key: 'EXPENSE', label: '支出' },
  { key: 'PERSONAL', label: '我垫的' },
]

/**
 * 来源 → 来源页面。
 *
 * Task 12 约定的定制食谱目标 `/pages/custom-recipe/list` 在 pages.json 里
 * **没有注册**（`/pages/custom-recipe/index` 是顾客端页面），所以不进这张表：
 * 跳了必定失败，用户看到「打开失败」比看到一句说明更糊涂。
 * BILL / MANUAL / FEE 本来就没有单据页面，同样只提示。
 */
const SOURCE_ROUTES: Partial<Record<FinanceEntrySourceType, string>> = {
  ORDER: '/pages/staff-order-center/index',
  SUPPLEMENT_ORDER: '/pages/staff-supplement-orders/index',
  // 线上退款行也是指回原订单
  ORDER_REFUND: '/pages/staff-order-center/index',
  PURCHASE: '/pages/staff-purchasing/index',
}

/** 不跳的来源都给一句人话，别让用户点了没反应 */
const SOURCE_HINTS: Partial<Record<FinanceEntrySourceType, string>> = {
  CUSTOM_RECIPE_ORDER: '定制食谱订单暂时不能在员工端打开',
  BILL: '固定费用在「固定费用」页按账单管理',
  MANUAL: '这笔是手工记的，没有来源单据',
  FEE: '支付手续费由系统按订单汇总，没有单独单据',
  SHIPPING: '快递费记在对应的订单里，明细这里只做汇总',
}

/** 统一金额格式：千分位，整数不带 .00，有分则保留两位 */
function formatMoney(value: number | null | undefined): string {
  const amount = Math.abs(Number(value) || 0)
  const [integer, decimal] = amount.toFixed(2).split('.')
  const grouped = integer.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
  return decimal === '00' ? grouped : `${grouped}.${decimal}`
}

/**
 * 后端给的 `occurredAt` 已经是上海时区的 ISO 字符串（带 +08:00），
 * 直接截日期，不 new Date 再换算，免得设备时区不是 +08:00 时跨天。
 */
function formatDate(occurredAt: string): string {
  const iso = String(occurredAt || '')
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return ''
  const date = iso.slice(0, 10)
  return date.slice(0, 4) === String(new Date().getFullYear())
    ? date.slice(5)
    : date
}

/** 标题已经带来源单号；没带的补上，别让两笔同名收入分不清 */
function entryTitle(entry: FinanceEntry): string {
  const title = String(entry.title || '').trim() || '收支'
  const sourceNo = String(entry.sourceNo || '').trim()
  if (!sourceNo || title.includes(sourceNo)) return title
  return `${title} · ${sourceNo}`
}

/** 带符号显示：支出是减项；金额为负（退款 / 手续费冲回）时按符号还原 */
function amountSign(entry: FinanceEntry): string {
  const negative = entry.direction === 'EXPENSE' ? entry.amount >= 0 : entry.amount < 0
  return negative ? '−' : '+'
}

function amountNegative(entry: FinanceEntry): boolean {
  return entry.isRefund || Number(entry.amount) < 0
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: string } | null)?.errMsg
  return typeof errMsg === 'string' && errMsg ? errMsg : '请稍后重试'
}

const activeFilter = ref<FilterKey>('ALL')
/** 从首页月报点进来时带上月份；缺省 = 本月至今（与首页默认口径一致） */
const monthParam = ref('')

const entries = ref<FinanceEntry[]>([])
const total = ref(0)
const truncated = ref(false)
const page = ref(1)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')

let requestSeq = 0

const hasMore = computed(() => entries.value.length < total.value)

const periodQuery = computed<FinanceEntriesQuery>(() =>
  monthParam.value ? { month: monthParam.value } : {},
)

function filterQuery(filter: FilterKey): FinanceEntriesQuery {
  if (filter === 'INCOME') return { direction: 'INCOME' }
  if (filter === 'EXPENSE') return { direction: 'EXPENSE' }
  // 「我垫的」= 付款方是个人的明细行，不改后端任何口径
  if (filter === 'PERSONAL') return { payerType: 'PERSONAL' }
  return {}
}

async function load(options: { reset?: boolean } = {}) {
  if (options.reset) {
    page.value = 1
    entries.value = []
    total.value = 0
    truncated.value = false
  }
  error.value = ''
  loading.value = page.value === 1 && entries.value.length === 0
  loadingMore.value = page.value > 1

  const seq = ++requestSeq
  const requestPage = page.value

  try {
    const result = await staffFinanceApi.listEntries({
      ...periodQuery.value,
      ...filterQuery(activeFilter.value),
      page: requestPage,
      pageSize: PAGE_SIZE,
    })
    if (seq !== requestSeq) return
    const items = Array.isArray(result?.items) ? result.items : []
    entries.value = requestPage === 1 ? items : [...entries.value, ...items]
    total.value = Number(result?.total) || 0
    truncated.value = Boolean(result?.truncated)
  } catch (err) {
    if (seq !== requestSeq) return
    error.value = errorMessage(err)
    // 翻页失败退回上一页，重试时不会跳页
    if (requestPage > 1) page.value = requestPage - 1
  } finally {
    if (seq === requestSeq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function selectFilter(filter: FilterKey) {
  if (activeFilter.value === filter) return
  activeFilter.value = filter
  load({ reset: true })
}

function retry() {
  load({ reset: true })
}

function loadMore() {
  if (loading.value || loadingMore.value || !hasMore.value) return
  page.value += 1
  load()
}

function openSource(entry: FinanceEntry) {
  const url = SOURCE_ROUTES[entry.sourceType]
  if (!url) {
    uni.showToast({
      title: SOURCE_HINTS[entry.sourceType] || '这类账目暂时没有对应的单据页面',
      icon: 'none',
    })
    return
  }
  uni.navigateTo({
    url,
    fail: () => {
      uni.showToast({ title: '打开失败，请稍后重试', icon: 'none' })
    },
  })
}

function goHome() {
  uni.navigateBack({
    fail: () => {
      uni.reLaunch({ url: '/pages/staff-finance/index' })
    },
  })
}

onLoad((options: any) => {
  const direction = String(options?.direction || '').toUpperCase()
  const payerType = String(options?.payerType || '').toUpperCase()
  if (direction === 'INCOME') activeFilter.value = 'INCOME'
  else if (direction === 'EXPENSE') activeFilter.value = 'EXPENSE'
  else if (payerType === 'PERSONAL') activeFilter.value = 'PERSONAL'

  const month = String(options?.month || '')
  monthParam.value = /^\d{4}-\d{2}$/.test(month) ? month : ''
})

onShow(() => {
  // 与财务首页一致：非 ADMIN 直接输地址先拦下，连请求都不发
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
  load({ reset: true })
})

onReachBottom(() => {
  loadMore()
})
</script>

<style scoped lang="scss">
@import '../../styles/staff-tokens.scss';

.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24rpx $staff-gutter calc(48rpx + env(safe-area-inset-bottom));
  background: $staff-bg;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
}

.filter-chip {
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

.filter-chip--on {
  font-weight: 600;
  color: $staff-cream;
  background: $staff-brand;
  border-color: $staff-brand;
}

.filters-count {
  margin-left: 4rpx;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
}

.list {
  margin-top: 8rpx;
}

.entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  min-height: 112rpx;
  margin-top: 16rpx;
  padding: 20rpx $staff-card-padding;
  background: $staff-surface;
  border: 1rpx solid $staff-line;
  border-radius: $staff-radius-card;
  box-shadow: $staff-shadow-card;
}

.entry-main {
  flex: 1;
  min-width: 0;
}

.entry-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
}

.entry-date {
  font-size: $staff-font-caption;
  color: $staff-ink-2;
  font-variant-numeric: tabular-nums;
}

.entry-tag {
  padding: 2rpx 12rpx;
  font-size: $staff-font-caption;
  color: $staff-brand;
  background: $staff-brand-soft;
  border-radius: $staff-radius-pill;
}

.entry-refund {
  padding: 2rpx 12rpx;
  font-size: $staff-font-caption;
  font-weight: 600;
  color: $staff-danger;
  background: $staff-danger-soft;
  border-radius: $staff-radius-pill;
}

.entry-title {
  display: block;
  margin-top: 8rpx;
  font-size: $staff-font-h2;
  font-weight: 600;
  line-height: 1.4;
  color: $staff-ink;
}

.entry-amount {
  flex: none;
  font-size: $staff-font-h2;
  font-weight: 700;
  text-align: right;
  color: $staff-ink;
  font-variant-numeric: tabular-nums;
}

.entry-amount--negative {
  color: $staff-danger;
}

.load-more {
  padding: 28rpx 0;
  text-align: center;
}

.load-text {
  font-size: $staff-font-caption;
  color: $staff-ink-2;
}

.load-text--retry {
  color: $staff-brand;
  text-decoration: underline;
}

.truncate-hint {
  display: block;
  padding: 8rpx 0 16rpx;
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
  margin-top: 16rpx;
}

.sk-row {
  height: 112rpx;
  margin-bottom: 16rpx;
  background: $staff-line;
  border-radius: $staff-radius-card;
}
</style>
