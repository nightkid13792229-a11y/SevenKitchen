<template>
  <view class="page">
    <view class="head">
      <view>
        <text class="title">订单中心</text>
        <text class="sub">鲜食 / 定制食谱 / 补剂统一查看</text>
      </view>
      <text class="refresh" @tap="load()">刷新</text>
    </view>

    <!-- 三类分开看：颜色跟卡片上的色条是同一套，别各写各的 -->
    <scroll-view class="type-tabs" scroll-x>
      <view
        v-for="tab in typeTabs"
        :key="tab.value || 'ALL'"
        class="type-tab"
        :class="[{ active: type === tab.value }, typeClass(tab.value)]"
        @tap="switchType(tab.value)"
      >
        {{ tab.label }}
      </view>
    </scroll-view>

    <!-- 状态：完整一套，但只显示这个类型真实存在的状态 -->
    <scroll-view class="status-tabs" scroll-x>
      <view
        v-for="tab in visibleStatusTabs"
        :key="tab.value || 'ALL'"
        class="status-tab"
        :class="{ active: status === tab.value }"
        @tap="switchStatus(tab.value)"
      >
        {{ tab.label }}
      </view>
    </scroll-view>

    <view class="filter-row">
      <text class="aftersale-toggle" :class="{ active: onlyAftersale }" @tap="toggleAftersale">
        只看售后
      </text>
      <text class="total">共 {{ total }} 单</text>
    </view>

    <view v-if="loading" class="state">加载中…</view>
    <template v-else>
      <view
        v-for="item in items"
        :key="`${item.type}-${item.id}`"
        class="order-card"
        :class="typeClass(item.type)"
        @tap="openOrder(item)"
      >
        <view class="type-bar"></view>

        <view class="order-top">
          <view class="order-left">
            <text class="type-tag">{{ typeLabel(item.type) }}</text>
            <text class="order-no">{{ item.orderNo }}</text>
          </view>
          <text class="status">{{ item.statusLabel }}</text>
        </view>

        <!-- 主行显示食谱名，不显示顾客名/手机号（老板 2026-10-30 定的口径）：
             员工是按"要做什么菜"干活的；没有绑定食谱（多数补剂单）就整行不显示 -->
        <view v-if="item.recipeName" class="order-main">
          <text class="recipe-name">{{ item.recipeName }}</text>
        </view>

        <view class="tags-row">
          <text v-if="item.hasOpenAftersale" class="mini-tag aftersale">
            {{ item.aftersaleLabel || '售后中' }}
          </text>
          <text v-if="item.isGift" class="mini-tag gift">赠送</text>
          <text v-if="item.subtypeLabel && item.type === 'FOOD'" class="mini-tag subtype">
            {{ item.subtypeLabel }}
          </text>
          <text v-if="item.scheduledDate" class="mini-tag schedule">
            {{ item.type === 'SUPPLEMENT' ? '分装' : '生产' }} {{ item.scheduledDate }}
          </text>
        </view>

        <view class="order-bottom">
          <text class="meta">{{ formatTime(item.createdAt) }}</text>
          <text v-if="item.amountTotal !== null" class="amount">
            ¥{{ Number(item.amountTotal || 0).toFixed(2) }}
          </text>
        </view>

        <!-- 入口：没东西可看就整块不出现，不置灰 -->
        <view v-if="canOpenRecipe(item) || canOpenDog(item)" class="order-actions">
          <text v-if="canOpenRecipe(item)" class="entry" @tap.stop="openRecipe(item)">
            {{ recipeEntryLabel(item) }}
          </text>
          <text v-if="canOpenDog(item)" class="entry" @tap.stop="openDog(item)">看狗狗</text>
        </view>
      </view>

      <view v-if="items.length === 0" class="state">没有符合条件的订单</view>
      <view v-if="hasMore" class="load-more" @tap="loadMore">加载更多</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { request } from '../../utils/api'

interface OrderCenterItem {
  id: string
  orderNo: string
  type: 'FOOD' | 'CUSTOM_RECIPE' | 'SUPPLEMENT'
  statusLabel: string
  /** 卡片主行显示的食谱名；空 = 这单没绑定食谱（多数补剂单） */
  recipeName: string | null
  createdAt: string
  amountTotal: number | null
  hasOpenAftersale: boolean
  aftersaleLabel: string | null
  isGift: boolean
  subtypeLabel: string | null
  scheduledDate: string | null
  /** 鲜食：这一单的订单项（看「下单那一版」要用它） */
  itemId: string | null
  /** 可打开的食谱；空 = 这单没有可看的食谱 */
  recipeId: string | null
  /** 可打开的狗狗档案；空 = 这单没关联狗 */
  dogId: string | null
}

const TYPE_META: Record<string, { label: string; className: string }> = {
  FOOD: { label: '鲜食', className: 'is-food' },
  CUSTOM_RECIPE: { label: '定制', className: 'is-custom' },
  SUPPLEMENT: { label: '补剂', className: 'is-supp' },
}

const typeTabs = [
  { label: '全部', value: '' },
  { label: '鲜食', value: 'FOOD' },
  { label: '定制', value: 'CUSTOM_RECIPE' },
  { label: '补剂', value: 'SUPPLEMENT' },
]

const ALL_STATUS_TABS = [
  { label: '全部', value: '' },
  { label: '待处理', value: 'PENDING' },
  { label: '待付款', value: 'PENDING_PAYMENT' },
  { label: '处理中', value: 'IN_PROGRESS' },
  { label: '待发货', value: 'TO_SHIP' },
  { label: '已发货', value: 'SHIPPED' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '已取消', value: 'CANCELLED' },
]

/**
 * 每个类型**真实存在**的状态。
 *
 * 定制是食谱交付，没有「待发货 / 已发货」这一段流程；
 * 鲜食没有「待付款」以外的定制式状态差异（保留全套）。
 * 以前这三类共用一套 tab，点「已发货」时定制单会整片消失，
 * 看起来像丢数据 —— 实际是它压根没有这个状态。
 */
const TYPE_STATUS_VALUES: Record<string, string[]> = {
  '': ALL_STATUS_TABS.map((tab) => tab.value),
  FOOD: ['', 'PENDING', 'PENDING_PAYMENT', 'IN_PROGRESS', 'TO_SHIP', 'SHIPPED', 'COMPLETED', 'CANCELLED'],
  CUSTOM_RECIPE: ['', 'PENDING_PAYMENT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  SUPPLEMENT: ['', 'PENDING_PAYMENT', 'IN_PROGRESS', 'TO_SHIP', 'SHIPPED', 'COMPLETED', 'CANCELLED'],
}

const type = ref('')
const status = ref('')
const onlyAftersale = ref(false)
const items = ref<OrderCenterItem[]>([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)
const pageSize = 20
const hasMore = ref(false)

const visibleStatusTabs = computed(() => {
  const allowed = TYPE_STATUS_VALUES[type.value] || TYPE_STATUS_VALUES['']
  return ALL_STATUS_TABS.filter((tab) => allowed.includes(tab.value))
})

function typeLabel(value: string) {
  return TYPE_META[value]?.label || value
}

/** 颜色类名：后端若冒出没见过的类型，这里回落成空串，不要整页崩掉 */
function typeClass(value: string) {
  return TYPE_META[value]?.className || ''
}

function formatTime(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

async function load(reset = true) {
  if (reset) {
    page.value = 1
    items.value = []
  }
  loading.value = true
  try {
    const res = await request({
      url: '/admin/order-center',
      method: 'GET',
      data: {
        type: type.value || undefined,
        status: status.value || undefined,
        aftersale: onlyAftersale.value ? true : undefined,
        page: page.value,
        pageSize,
      },
    })
    if (res.code === 0) {
      const next = res.data?.items || []
      items.value = reset ? next : [...items.value, ...next]
      total.value = Number(res.data?.total || 0)
      hasMore.value = items.value.length < total.value
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' })
    }
  } finally {
    loading.value = false
  }
}

function switchType(next: string) {
  type.value = next
  // 换类型后当前状态可能不存在了（比如「已发货」在定制里没有）
  const allowed = TYPE_STATUS_VALUES[next] || TYPE_STATUS_VALUES['']
  if (!allowed.includes(status.value)) status.value = ''
  load()
}

function switchStatus(next: string) {
  status.value = next
  load()
}

function toggleAftersale() {
  onlyAftersale.value = !onlyAftersale.value
  load()
}

function loadMore() {
  if (loading.value || !hasMore.value) return
  page.value += 1
  load(false)
}

function canOpenRecipe(item: OrderCenterItem) {
  return Boolean(item.itemId || item.recipeId)
}

function canOpenDog(item: OrderCenterItem) {
  return Boolean(item.dogId)
}

function recipeEntryLabel(item: OrderCenterItem) {
  return item.itemId ? '看下单食谱' : '看食谱'
}

/**
 * 三类订单的食谱入口不是同一个页面，别图省事共用一个：
 *   · 鲜食：`itemId` → 下单快照页（那一版配方只存在订单项里）
 *   · 定制：`recipeId + orderNo` → 食谱详情，按交付冻结的版本打开
 *   · 补剂：`recipeId` → 食谱详情当前版（补剂没有"交付版本"这回事）
 */
function openRecipe(item: OrderCenterItem) {
  if (item.itemId) {
    uni.navigateTo({
      url: `/pages/staff-recipe-snapshot/index?itemId=${encodeURIComponent(item.itemId)}`,
    })
    return
  }
  if (!item.recipeId) return
  const base = `/pages/recipe-detail/index?id=${encodeURIComponent(item.recipeId)}`
  if (item.type === 'CUSTOM_RECIPE') {
    uni.navigateTo({ url: `${base}&orderId=${encodeURIComponent(item.orderNo)}` })
    return
  }
  uni.navigateTo({ url: base })
}

function openDog(item: OrderCenterItem) {
  if (!item.dogId) return
  uni.navigateTo({
    url: `/pages/staff-dog-profile/index?dogId=${encodeURIComponent(item.dogId)}`,
  })
}

function openOrder(item: OrderCenterItem) {
  if (item.type === 'SUPPLEMENT') {
    uni.navigateTo({ url: `/pages/staff-supplement-orders/detail?id=${encodeURIComponent(item.id)}` })
    return
  }
  if (item.type === 'CUSTOM_RECIPE') {
    uni.navigateTo({ url: `/pages/custom-recipe/order-detail?id=${encodeURIComponent(item.id)}` })
    return
  }
  uni.navigateTo({ url: `/pages/staff-orders/detail?id=${encodeURIComponent(item.id)}` })
}

onMounted(() => load())
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f6f8; padding: 24rpx; box-sizing: border-box; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18rpx; }
.title { display: block; font-size: 38rpx; font-weight: 700; color: #1e3a2f; }
.sub { display: block; margin-top: 6rpx; color: #909399; font-size: 23rpx; }
.refresh { color: #1e3a2f; font-size: 25rpx; padding: 10rpx 4rpx; }

.type-tabs { white-space: nowrap; margin-bottom: 12rpx; }
.type-tab { display: inline-block; padding: 12rpx 26rpx; margin-right: 12rpx; border-radius: 30rpx; background: #fff; color: #606266; font-size: 26rpx; }
.type-tab.is-food { border: 1rpx solid #c9dccf; }
.type-tab.is-custom { border: 1rpx solid #c6d6ea; }
.type-tab.is-supp { border: 1rpx solid #e6d2b8; }
.type-tab.active { background: #1e3a2f; color: #fff; border-color: #1e3a2f; }
.type-tab.is-custom.active { background: #2f5f9e; border-color: #2f5f9e; }
.type-tab.is-supp.active { background: #b1722c; border-color: #b1722c; }

.status-tabs { white-space: nowrap; margin-bottom: 12rpx; }
.status-tab { display: inline-block; padding: 10rpx 18rpx; margin-right: 8rpx; border-radius: 8rpx; color: #909399; font-size: 23rpx; }
.status-tab.active { background: #e8f1ec; color: #1e3a2f; font-weight: 600; }

.filter-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.aftersale-toggle { padding: 8rpx 22rpx; border-radius: 24rpx; background: #fff; color: #909399; font-size: 23rpx; border: 1rpx solid #e4e7ed; }
.aftersale-toggle.active { background: #fdf6ec; color: #b88230; border-color: #f0d9b5; font-weight: 600; }
.total { color: #909399; font-size: 22rpx; }

.order-card { position: relative; background: #fff; border-radius: 16rpx; padding: 22rpx 22rpx 18rpx 30rpx; margin-bottom: 16rpx; overflow: hidden; }
/* 左侧色条：三类各一个颜色，扫列表时靠它分辨 */
.type-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 8rpx; background: #1e3a2f; }
.order-card.is-custom .type-bar { background: #2f5f9e; }
.order-card.is-supp .type-bar { background: #b1722c; }

.order-top { display: flex; justify-content: space-between; align-items: center; }
.order-left { display: flex; align-items: center; min-width: 0; }
.type-tag { flex: none; padding: 4rpx 12rpx; margin-right: 12rpx; border-radius: 6rpx; background: #e8f1ec; color: #1e3a2f; font-size: 21rpx; }
.order-card.is-custom .type-tag { background: #eaf1fa; color: #2f5f9e; }
.order-card.is-supp .type-tag { background: #fbf1e6; color: #b1722c; }
.order-no { font-size: 25rpx; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { flex: none; margin-left: 14rpx; color: #b88230; font-size: 23rpx; }

.order-main { display: flex; align-items: baseline; margin-top: 16rpx; }
.recipe-name { font-size: 29rpx; font-weight: 600; color: #1e3a2f; }

.tags-row { display: flex; flex-wrap: wrap; margin-top: 10rpx; }
.mini-tag { margin: 0 10rpx 6rpx 0; padding: 3rpx 10rpx; border-radius: 6rpx; font-size: 20rpx; }
.mini-tag.aftersale { background: #fdf6ec; color: #b88230; }
.mini-tag.gift { background: #eaf5ec; color: #2e7d4f; }
.mini-tag.subtype { background: #f2f3f5; color: #606266; }
.mini-tag.schedule { background: #f2f3f5; color: #606266; }

.order-bottom { display: flex; align-items: center; margin-top: 10rpx; }
.meta { color: #909399; font-size: 22rpx; }
.amount { margin-left: auto; color: #1e3a2f; font-size: 28rpx; font-weight: 600; }

.order-actions { display: flex; justify-content: flex-end; margin-top: 16rpx; padding-top: 14rpx; border-top: 1rpx solid #f2f3f5; }
.entry { margin-left: 14rpx; padding: 8rpx 20rpx; border-radius: 24rpx; background: #f5f6f8; color: #2b5040; font-size: 22rpx; }

.state { padding: 120rpx 0; text-align: center; color: #909399; font-size: 24rpx; }
.load-more { padding: 20rpx; text-align: center; color: #2b5040; font-size: 24rpx; }
</style>
