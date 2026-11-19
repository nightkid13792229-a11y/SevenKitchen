<template>
  <view class="page">
    <text class="range-hint">{{ periodLabel }}</text>

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
      <view
        class="filter-chip"
        :class="{ 'filter-chip--on': !!monthParam }"
        @tap="toggleMonthPanel"
      >
        月份 · {{ monthChipLabel }}
      </view>
      <view
        class="filter-chip"
        :class="{ 'filter-chip--on': !!selectedCategory }"
        @tap="toggleCategoryPanel"
      >
        {{ categoryChipLabel }}
      </view>
      <text v-if="!loading && entries.length > 0" class="filters-count">
        共 {{ total }} 笔
      </text>
    </view>

    <!-- 账户筛选（2026-11-19）：取代个人/公司垫付，钱从哪个账户进出一眼可查 -->
    <view class="account-filter">
      <text class="account-filter-label">账户</text>
      <AccountPicker
        :model-value="selectedAccount"
        allow-all
        :remember="false"
        @update:model-value="selectAccount"
      />
    </view>

    <view v-if="monthPanelOpen" class="month-panel">
      <view
        class="month-chip"
        :class="{ 'month-chip--on': !monthParam }"
        @tap="selectMonth('')"
      >
        本月
      </view>
      <view
        v-for="chip in recentMonthChips"
        :key="chip.key"
        class="month-chip"
        :class="{ 'month-chip--on': monthParam === chip.key }"
        @tap="selectMonth(chip.key)"
      >
        {{ chip.label }}
      </view>
    </view>

    <view v-if="categoryPanelOpen" class="category-panel">
      <view
        class="category-chip"
        :class="{ 'category-chip--on': !selectedCategory }"
        @tap="selectCategory('')"
      >
        全部类别
      </view>
      <view
        v-for="option in categoryOptions"
        :key="option.value"
        class="category-chip"
        :class="{ 'category-chip--on': selectedCategory === option.value }"
        @tap="selectCategory(option.value)"
      >
        {{ option.label }}
      </view>
      <text v-if="categoryOptions.length === 0" class="category-empty">
        这段时间还没有可选的类别
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
            <text
              v-if="entry.categoryLabel && entry.categoryLabel !== '退款'"
              class="entry-tag"
            >
              {{ entry.categoryLabel }}
            </text>
            <text v-if="entry.isRefund" class="entry-refund">退款</text>
            <!-- 每行写明钱从哪个账户进/出：五个账户的显示名由后端给 -->
            <text v-if="entry.payerAccountLabel" class="entry-account">
              {{ entry.payerAccountLabel }}
            </text>
          </view>
          <view class="entry-title-row">
            <!-- 报销杂费单独标出来：和订单收入/退款一眼区分 -->
            <text
              v-if="entry.sourceType === 'REIMBURSEMENT'"
              class="entry-reimbursement"
            >
              报销杂费
            </text>
            <text class="entry-title">{{ entryTitle(entry) }}</text>
            <!-- 退款对应的订单付款早于起账日：标题后单独标「历史单」，别和当月退款混在一起 -->
            <text
              v-if="entry.isRefund && entry.isHistorical"
              class="entry-historical"
            >
              历史单
            </text>
          </view>
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
import AccountPicker from '../../components/finance/AccountPicker.vue'
import {
  staffFinanceApi,
  type FinanceEntry,
  type FinanceEntriesQuery,
  type FinanceEntrySourceType,
} from '../../api/staff-finance'
import {
  isFinanceAccountCode,
  type FinanceAccountCode,
} from '../../utils/finance-account'
import { getStoredUser } from '../../utils/account'
import { FINANCE_START_MONTH } from '../../constants/finance'

/** 每页条数：后台上限 200，这里取 20，一屏能看到 3–4 条又不至于一次拉太多 */
const PAGE_SIZE = 20

type FilterKey = 'ALL' | 'INCOME' | 'EXPENSE'

const filterChips: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'INCOME', label: '收入' },
  { key: 'EXPENSE', label: '支出' },
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
  // 报销杂费：详情页参数是 id（报销单 id），不是 claimNumber（只用于展示）
  REIMBURSEMENT: '/pages/staff-purchasing/reimbursement/detail',
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

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 按上海时区取今天，避免设备时区不是 +08:00 时月初串月 */
function shanghaiToday() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

const activeFilter = ref<FilterKey>('ALL')
/**
 * 区间：首页完整月份点进来会带 `?month=YYYY-MM`，这里就按整月取数；
 * 不带月份 = 本月至今，与首页默认口径一致。
 */
const monthParam = ref('')

/** 月份面板是否展开；和类别面板互斥，避免两个面板叠在一起 */
const monthPanelOpen = ref(false)

/**
 * 可选整月：最近三个月，往后裁到起账月（2026-11）。
 * 与财务首页的月份 chip 同一口径；2026-11 打开时只有「11 月」一个整月。
 */
const recentMonthChips = computed<Array<{ key: string; label: string }>>(() => {
  const today = shanghaiToday()
  const chips: Array<{ key: string; label: string }> = []
  for (let offset = 0; offset < 3; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1 - offset, 1))
    const key = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`
    if (key < FINANCE_START_MONTH) continue
    chips.push({ key, label: `${Number(key.slice(5, 7))} 月` })
  }
  return chips
})

/** 默认「本月」= 本月至今；选了整月就显示那个月 */
const monthChipLabel = computed(() =>
  monthParam.value
    ? `${Number(monthParam.value.slice(5, 7))} 月`
    : '本月',
)

const entries = ref<FinanceEntry[]>([])
const total = ref(0)
const truncated = ref(false)
const page = ref(1)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')
/** 最近一次成功返回的原始条数：少于 PAGE_SIZE 说明后端已经没有下一页 */
const lastBatchSize = ref(0)

let requestSeq = 0

const hasMore = computed(
  () =>
    entries.value.length < total.value && lastBatchSize.value === PAGE_SIZE,
)

const periodQuery = computed<FinanceEntriesQuery>(() =>
  monthParam.value ? { month: monthParam.value } : {},
)

/**
 * 顶部区间文案：从月报点进来必须能看到「这是哪一段」，
 * 否则数字和首页对不上时，用户根本不知道自己看的是哪个月。
 */
const periodLabel = computed(() => {
  if (monthParam.value) {
    const [year, month] = monthParam.value.split('-').map(Number)
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return `${monthParam.value}-01 ~ ${monthParam.value}-${pad2(lastDay)}`
  }
  const today = shanghaiToday()
  const prefix = `${today.year}-${pad2(today.month)}`
  return `本月至今 · ${prefix}-01 ~ ${prefix}-${pad2(today.day)}`
})

/** 类别筛选：从已加载的明细里聚合（按类别字典 id），选中的类别翻页后消失也保留 */
const categoryOptions = ref<Array<{ value: string; label: string }>>([])
const selectedCategory = ref('')
const categoryPanelOpen = ref(false)

/** 账户筛选：'' = 全部账户；其余走后端 `account` 参数（只做行级过滤） */
const selectedAccount = ref<'' | FinanceAccountCode>('')

const categoryChipLabel = computed(() => {
  if (!selectedCategory.value) return '类别'
  const match = categoryOptions.value.find(
    (option) => option.value === selectedCategory.value,
  )
  return `类别 · ${match ? match.label : selectedCategory.value}`
})

function collectCategories(items: FinanceEntry[]) {
  if (items.length === 0) return
  const known = new Map(
    categoryOptions.value.map((option) => [option.value, option.label]),
  )
  for (const item of items) {
    // 收入类别没有字典 id，不进支出类别筛选（否则会把收入类别也列出来）
    const value = String(item.categoryId || '').trim()
    if (!value || known.has(value)) continue
    known.set(value, String(item.categoryLabel || '').trim() || value)
  }
  categoryOptions.value = Array.from(known.entries()).map(([value, label]) => ({
    value,
    label,
  }))
}

function toggleMonthPanel() {
  monthPanelOpen.value = !monthPanelOpen.value
  if (monthPanelOpen.value) categoryPanelOpen.value = false
}

/** 切月份必须重置分页：不清空的话第 2 页会拼到新月份的列表后面 */
function selectMonth(value: string) {
  monthPanelOpen.value = false
  if (monthParam.value === value) return
  monthParam.value = value
  load({ reset: true })
}

function toggleCategoryPanel() {
  categoryPanelOpen.value = !categoryPanelOpen.value
  if (categoryPanelOpen.value) monthPanelOpen.value = false
}

function selectCategory(value: string) {
  categoryPanelOpen.value = false
  if (selectedCategory.value === value) return
  selectedCategory.value = value
  load({ reset: true })
}

/** 切账户：'' = 全部账户；不清空列表就翻页会拼到新筛选后面 */
function selectAccount(value: string) {
  const next = isFinanceAccountCode(value) ? value : ''
  if (selectedAccount.value === next) return
  selectedAccount.value = next
  load({ reset: true })
}

function filterQuery(filter: FilterKey): FinanceEntriesQuery {
  if (filter === 'INCOME') return { direction: 'INCOME' }
  if (filter === 'EXPENSE') return { direction: 'EXPENSE' }
  return {}
}

async function load(options: { reset?: boolean } = {}) {
  if (options.reset) {
    page.value = 1
    entries.value = []
    total.value = 0
    truncated.value = false
    lastBatchSize.value = 0
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
      ...(selectedCategory.value ? { category: selectedCategory.value } : {}),
      ...(selectedAccount.value ? { account: selectedAccount.value } : {}),
      page: requestPage,
      pageSize: PAGE_SIZE,
    })
    if (seq !== requestSeq) return
    const items = Array.isArray(result?.items) ? result.items : []
    lastBatchSize.value = items.length
    collectCategories(items)
    // 按 id 去重再拼接：翻页期间数据有变动时，宁可少一条也不要重复行 / 错乱的分页
    const merged = requestPage === 1 ? [] : entries.value.slice()
    const seen = new Set(merged.map((item) => item.id))
    for (const item of items) {
      if (!item?.id || seen.has(item.id)) continue
      seen.add(item.id)
      merged.push(item)
    }
    entries.value = merged
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

/**
 * 拼来源页地址。
 *
 * 报销杂费要带报销单 id 才能打开详情；后端明细里 `sourceId` 就是报销单 id，
 * `sourceNo` 是给人看的单号。缺 id 时返回空串，交给通用 toast 兜底。
 */
function sourceUrl(entry: FinanceEntry): string {
  const base = SOURCE_ROUTES[entry.sourceType]
  if (!base) return ''
  if (entry.sourceType !== 'REIMBURSEMENT') return base
  const sourceId = String(entry.sourceId || '').trim()
  return sourceId ? `${base}?id=${encodeURIComponent(sourceId)}` : ''
}

function openSource(entry: FinanceEntry) {
  const url = sourceUrl(entry)
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
  if (direction === 'INCOME') activeFilter.value = 'INCOME'
  else if (direction === 'EXPENSE') activeFilter.value = 'EXPENSE'

  // 从别处带账户进来（例如以后按账户看某类支出）
  const account = String(options?.account || '').toUpperCase()
  if (isFinanceAccountCode(account)) selectedAccount.value = account

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

/* 当前区间：从月报点进来要一眼看出看的是哪一段 */
.range-hint {
  display: block;
  margin: 0 4rpx 12rpx;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
  font-variant-numeric: tabular-nums;
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

.category-panel,
.month-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
  margin-top: 12rpx;
  padding: 16rpx 20rpx;
  background: $staff-surface;
  border: 1rpx solid $staff-line;
  border-radius: $staff-radius-card;
}

.category-chip,
.month-chip {
  display: inline-flex;
  align-items: center;
  min-height: 88rpx;
  padding: 0 24rpx;
  font-size: $staff-font-caption;
  color: $staff-ink;
  background: $staff-bg;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-pill;
}

.category-chip--on,
.month-chip--on {
  font-weight: 600;
  color: $staff-cream;
  background: $staff-brand;
  border-color: $staff-brand;
}

.category-empty {
  padding: 8rpx 4rpx;
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

/* 账户筛选：标签 + 五账户 chips，换行不横向滚动 */
.account-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
  margin-top: 12rpx;
}

.account-filter-label {
  flex: none;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
}

/* 账户徽标：中性灰底深字，金额才是主角 */
.entry-account {
  padding: 2rpx 12rpx;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
  background: $staff-line;
  border-radius: $staff-radius-pill;
}

.entry-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
  margin-top: 8rpx;
}

.entry-title {
  font-size: $staff-font-h2;
  font-weight: 600;
  line-height: 1.4;
  color: $staff-ink;
}

/* 历史单：金色小标签，和红色的「退款」区分开，别误以为当月退款 */
.entry-historical {
  flex: none;
  padding: 2rpx 12rpx;
  font-size: $staff-font-caption;
  color: $staff-gold-ink;
  background: $staff-gold-soft;
  border-radius: $staff-radius-pill;
}

/* 报销杂费：标题前的绿色来源标签 */
.entry-reimbursement {
  flex: none;
  padding: 2rpx 12rpx;
  font-size: $staff-font-caption;
  color: $staff-brand;
  background: $staff-brand-soft;
  border-radius: $staff-radius-pill;
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
