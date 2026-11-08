<template>
  <view class="page">
    <view class="head">
      <view>
        <text class="title">订单中心</text>
        <text class="sub">鲜食 / 定制食谱 / 补剂统一查看</text>
      </view>
      <text class="refresh" @tap="load()">刷新</text>
    </view>

    <!-- 搜索（2026-11-02）：老「后台订单」页的关键词搜索平移过来。
         订单号 / 顾客姓名 / 手机号 / 狗狗名都能搜；状态仍用下面的状态栏 -->
    <view class="search-bar">
      <view class="search-input-wrap">
        <text class="search-icon">🔍</text>
        <input
          class="search-input"
          v-model="searchKeyword"
          placeholder="订单号 / 姓名 / 手机号 / 狗狗名"
          confirm-type="search"
          @confirm="performSearch"
        />
        <text v-if="searchKeyword" class="search-clear" @tap.stop="clearSearchKeyword">×</text>
      </view>
      <text class="search-btn" @tap="performSearch">搜索</text>
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
          <!-- 2026-11-08：显示真实阶段（已付款/采购中/生产中…），不再统一写「处理中」 -->
          <text class="status">{{ item.stageLabel || item.statusLabel }}</text>
        </view>

        <!-- 主行显示食谱名；三类卡片下面都补一行顾客/狗狗（2026-11-02 老板要求）。
             手机号仍然不显示：员工按食谱干活，电话去详情页看 -->
        <view v-if="item.recipeName" class="order-main">
          <text class="recipe-name">{{ item.recipeName }}</text>
        </view>

        <!-- 三类卡片：顾客姓名 + 狗狗名，现场认单用；缺哪项就只显示另一项 -->
        <view v-if="item.customerName || item.dogName" class="order-people">
          <text v-if="item.customerName" class="person">顾客 {{ item.customerName }}</text>
          <text v-if="item.customerName && item.dogName" class="person-sep">·</text>
          <text v-if="item.dogName" class="person">狗狗 {{ item.dogName }}</text>
        </view>

        <view class="tags-row">
          <!-- 售后标签（2026-10-30）：进行中橙色、已结束灰色。
               已结束的也要标出来——退款成功后订单会变成「已取消」，
               不标的话员工根本看不出这单退过款。 -->
          <text
            v-if="item.aftersaleLabel"
            class="mini-tag"
            :class="item.hasOpenAftersale ? 'aftersale' : 'aftersale-closed'"
          >
            {{ item.aftersaleLabel }}
          </text>
          <text v-if="item.isGift" class="mini-tag gift">赠送</text>
          <text v-if="item.subtypeLabel && item.type === 'FOOD'" class="mini-tag subtype">
            {{ item.subtypeLabel }}
          </text>
        </view>

        <!-- 只保留「下单时间」（老板 2026-10-30）：生产日/分装日不再放到卡片上，
             一个小标签说明这是下单时间，免得跟别的日期混淆 -->
        <view class="order-bottom">
          <text class="time-label">下单时间</text>
          <text class="meta">{{ formatTime(item.createdAt) }}</text>
          <text v-if="item.amountTotal !== null" class="amount">
            ¥{{ Number(item.amountTotal || 0).toFixed(2) }}
          </text>
        </view>

        <!-- 入口：没东西可看就整块不出现，不置灰 -->
        <view
          v-if="canShipItem(item) || canOpenRecipe(item) || canOpenDog(item)"
          class="order-actions"
        >
          <!-- 待发货的单直接在列表上发货（老板 2026-10-30：以前列表就有这个） -->
          <text v-if="canShipItem(item)" class="entry primary" @tap.stop="openShip(item)">发货</text>
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
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'

interface OrderCenterItem {
  id: string
  orderNo: string
  type: 'FOOD' | 'CUSTOM_RECIPE' | 'SUPPLEMENT'
  /** 统一状态组的中文名（兼容旧接口；卡片优先用 stageLabel） */
  statusLabel: string
  /** 真实阶段：已付款 / 采购中 / 生产中 / 分装中 / 制作中 / 已交付（2026-11-08） */
  stageLabel?: string
  /** 统一状态组（TO_SHIP = 待发货）；列表上据此决定要不要给「发货」 */
  statusGroup: string
  /** 卡片主行显示的食谱名；空 = 这单没绑定食谱（多数补剂单） */
  recipeName: string | null
  /** 顾客昵称；三类卡片上都显示（2026-11-02） */
  customerName: string | null
  /** 狗狗名；三类卡片上都显示（2026-11-02） */
  dogName: string | null
  createdAt: string
  amountTotal: number | null
  /** 是否有未完结的售后（待受理/处理中）：决定标签是橙色还是灰色 */
  hasOpenAftersale: boolean
  /** 售后标签文案；空 = 这单从来没提过售后。已结束的也会出现（2026-10-30） */
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

/**
 * 状态筛选（2026-11-08）：按**真实阶段**筛，卡片写什么就筛什么。
 *
 * 「处理中」把已付款 / 采购中 / 生产中压成一句话，员工看不出单子停在哪一步；
 * 草稿单（原来的「待处理」）顾客还没提交支付、员工做不了任何事，入口去掉，
 * 后端也不再把它放进列表。
 */
const ALL_STATUS_TABS = [
  { label: '全部', value: '' },
  { label: '待付款', value: 'PENDING_PAYMENT' },
  { label: '已付款', value: 'PAID' },
  { label: '采购中', value: 'PURCHASING' },
  { label: '生产中', value: 'IN_PRODUCTION' },
  { label: '分装中', value: 'PACKING' },
  { label: '制作中', value: 'MAKING' },
  { label: '待发货', value: 'TO_SHIP' },
  { label: '已发货', value: 'SHIPPED' },
  { label: '已交付', value: 'DELIVERED' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '已取消', value: 'CANCELLED' },
]

/**
 * 每个类型**真实存在**的阶段。
 *
 * 定制是食谱交付，没有采购 / 发货这一段流程；
 * 补剂没有采购 / 生产：付了钱就能打标签发货，所以没有「已付款」这一档，
 * PAID 直接算「待发货」（和补剂详情页一致）。
 * 以前这三类共用一套 tab，点「已发货」时定制单会整片消失，
 * 看起来像丢数据 —— 实际是它压根没有这个状态。
 */
const TYPE_STATUS_VALUES: Record<string, string[]> = {
  '': ALL_STATUS_TABS.map((tab) => tab.value),
  FOOD: [
    '',
    'PENDING_PAYMENT',
    'PAID',
    'PURCHASING',
    'IN_PRODUCTION',
    'TO_SHIP',
    'SHIPPED',
    'COMPLETED',
    'CANCELLED',
  ],
  CUSTOM_RECIPE: [
    '',
    'PENDING_PAYMENT',
    'PAID',
    'MAKING',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
  ],
  SUPPLEMENT: [
    '',
    'PENDING_PAYMENT',
    'PACKING',
    'TO_SHIP',
    'SHIPPED',
    'COMPLETED',
    'CANCELLED',
  ],
}

const type = ref('')
const status = ref('')
const onlyAftersale = ref(false)
/** 关键词：订单号 / 顾客姓名 / 手机号 / 狗狗名（后端统一处理三类订单） */
const searchKeyword = ref('')
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

/** 点搜索 / 键盘回车都走这里：从第 1 页重新查，别把上一次的结果留在后面 */
function performSearch() {
  searchKeyword.value = searchKeyword.value.trim()
  load()
}

function clearSearchKeyword() {
  if (!searchKeyword.value) return
  searchKeyword.value = ''
  load()
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
        keyword: searchKeyword.value.trim() || undefined,
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

/**
 * 只有「待发货」才给发货按钮：鲜食是急冻完成，补剂是分装完成。
 * 定制单没有发货环节（食谱是线上交付）。
 */
function canShipItem(item: OrderCenterItem) {
  return item.statusGroup === 'TO_SHIP' && item.type !== 'CUSTOM_RECIPE'
}

/**
 * 发货不在列表里直接弹窗：餐饮类的发货要选快递公司、要走地址校验，
 * 复制一套必然和详情页对不上。这里直接跳到详情并**自动打开**发货弹窗。
 */
function openShip(item: OrderCenterItem) {
  if (item.type === 'SUPPLEMENT') {
    uni.navigateTo({
      url: `/pages/staff-supplement-orders/detail?id=${encodeURIComponent(item.id)}&action=ship`,
    })
    return
  }
  uni.navigateTo({
    url: `/pages/staff-orders/detail?id=${encodeURIComponent(item.id)}&action=ship`,
  })
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

/**
 * 卡片点开到哪里（2026-11-08 修）。
 *
 * 定制单一度指到**顾客侧**的订单详情页，那一页只认 `orderId=<订单号>`
 * （这里传的却是主键），而且只允许下单顾客本人访问 ——
 * 员工点进去永远停在「订单加载失败」。
 *
 * 员工端能看的就是「这单交付的食谱」（食谱详情页对 STAFF/ADMIN 有放行），
 * 所以定制单的卡片和「看食谱」走同一个入口；还没交付就明说，不跳空页。
 */
function openOrder(item: OrderCenterItem) {
  if (item.type === 'SUPPLEMENT') {
    uni.navigateTo({ url: `/pages/staff-supplement-orders/detail?id=${encodeURIComponent(item.id)}` })
    return
  }
  if (item.type === 'CUSTOM_RECIPE') {
    if (!canOpenRecipe(item)) {
      uni.showToast({ title: '这单还没交付食谱', icon: 'none' })
      return
    }
    openRecipe(item)
    return
  }
  uni.navigateTo({ url: `/pages/staff-orders/detail?id=${encodeURIComponent(item.id)}` })
}

/**
 * 每次页面显示都重新拉一次（2026-11-08 修）。
 *
 * 以前只在 onMounted 加载：从详情页返回时页面不会重建，卡片永远停在
 * 「进去之前」那一份。员工在详情页点了「无需发货」，回到订单中心
 * 仍然写着「待发货」、还挂着「发货」按钮（数据库里其实已经结案），
 * 看起来就像点了没生效。现在改成页面一显示就刷新，状态和按钮都跟着变。
 */
onShow(() => load())
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f6f8; padding: 24rpx; box-sizing: border-box; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18rpx; }
.title { display: block; font-size: 38rpx; font-weight: 700; color: #1e3a2f; }
.sub { display: block; margin-top: 6rpx; color: #909399; font-size: 23rpx; }
.refresh { color: #1e3a2f; font-size: 25rpx; padding: 10rpx 4rpx; }

/* 搜索：跟卡片同一套白底圆角，按钮用主色，别做成另一套视觉 */
.search-bar { display: flex; align-items: center; gap: 14rpx; margin-bottom: 16rpx; }
.search-input-wrap { flex: 1; display: flex; align-items: center; min-height: 76rpx; padding: 0 22rpx; background: #fff; border-radius: 38rpx; border: 1rpx solid #e4e7ed; box-sizing: border-box; }
.search-icon { margin-right: 10rpx; color: #909399; font-size: 24rpx; }
.search-input { flex: 1; min-width: 0; height: 76rpx; font-size: 24rpx; color: #303133; }
.search-clear { padding: 0 6rpx 0 12rpx; color: #b0b4bb; font-size: 30rpx; line-height: 1; }
.search-btn { flex: none; padding: 0 28rpx; height: 76rpx; line-height: 76rpx; border-radius: 38rpx; background: #1e3a2f; color: #fff; font-size: 24rpx; font-weight: 600; }

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
/* 鲜食卡片上的顾客/狗狗：小字一行，别抢食谱名的注意力 */
.order-people { display: flex; align-items: center; flex-wrap: wrap; margin-top: 8rpx; }
.person { font-size: 22rpx; color: #606266; }
.person-sep { margin: 0 10rpx; color: #c0c4cc; font-size: 22rpx; }

.tags-row { display: flex; flex-wrap: wrap; margin-top: 10rpx; }
.mini-tag { margin: 0 10rpx 6rpx 0; padding: 3rpx 10rpx; border-radius: 6rpx; font-size: 20rpx; }
.mini-tag.aftersale { background: #fdf6ec; color: #b88230; }
/* 已结束的售后：灰底，跟"还在处理"一眼分开，别抢注意力 */
.mini-tag.aftersale-closed { background: #f2f3f5; color: #909399; }
.mini-tag.gift { background: #eaf5ec; color: #2e7d4f; }
.mini-tag.subtype { background: #f2f3f5; color: #606266; }

.order-bottom { display: flex; align-items: center; margin-top: 10rpx; }
/* 小字说明：这是「下单时间」，不是生产日 */
.time-label { margin-right: 8rpx; padding: 2rpx 10rpx; border-radius: 6rpx; background: #f2f3f5; color: #909399; font-size: 20rpx; }
.meta { color: #909399; font-size: 22rpx; }
.amount { margin-left: auto; color: #1e3a2f; font-size: 28rpx; font-weight: 600; }

.order-actions { display: flex; justify-content: flex-end; margin-top: 16rpx; padding-top: 14rpx; border-top: 1rpx solid #f2f3f5; }
.entry { margin-left: 14rpx; padding: 8rpx 20rpx; border-radius: 24rpx; background: #f5f6f8; color: #2b5040; font-size: 22rpx; }
.entry.primary { background: #1e3a2f; color: #fff; font-weight: 600; }

.state { padding: 120rpx 0; text-align: center; color: #909399; font-size: 24rpx; }
.load-more { padding: 20rpx; text-align: center; color: #2b5040; font-size: 24rpx; }
</style>
