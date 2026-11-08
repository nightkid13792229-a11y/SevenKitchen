<template>
  <view class="page">
    <view class="head">
      <view class="head-main">
        <text class="title">给狗狗选食谱</text>
        <text class="sub">橱窗已上架 + 全部定制食谱（含别人家狗狗的）</text>
      </view>
    </view>

    <scroll-view class="filter-row" scroll-x>
      <view
        v-for="filter in filters"
        :key="filter.value || 'ALL'"
        class="filter-chip"
        :class="{ active: activeFilter === filter.value }"
        @tap="switchFilter(filter.value)"
      >
        {{ filter.label }}{{ filterCount(filter.value) }}
      </view>
    </scroll-view>

    <view class="search-bar">
      <input
        class="search-input"
        v-model="keyword"
        placeholder="搜食谱名 / 顾客 / 狗狗"
        confirm-type="search"
        @confirm="reload"
      />
      <text class="search-btn" @tap="reload">搜索</text>
    </view>

    <view v-if="loading && items.length === 0" class="state">加载中…</view>
    <view v-else-if="visibleItems.length === 0" class="state">这个筛选下没有可下单的食谱</view>

    <view
      v-for="item in visibleItems"
      :key="`${item.id}-${item.version}`"
      class="recipe-card"
      :class="{ on: selectedKey === `${item.id}-${item.version}` }"
      @tap="select(item)"
    >
      <view class="recipe-top">
        <image
          v-if="item.coverImageUrl"
          class="recipe-cover"
          :src="item.coverImageUrl"
          mode="aspectFill"
        />
        <view v-else class="recipe-cover recipe-cover-empty">🍽</view>
        <view class="recipe-main">
          <text class="recipe-name">{{ item.name }}</text>
          <text class="recipe-meta">{{ ownershipText(item) }}</text>
          <text v-if="item.fit.level === 'WARN'" class="fit-warn">
            {{ item.fit.reasons.join('；') }}
          </text>
        </view>
        <text class="recipe-tag" :class="tagClass(item)">{{ tagText(item) }}</text>
      </view>

      <view v-if="selectedKey === `${item.id}-${item.version}` && item.ownership.kind === 'OTHER_CUSTOM'" class="other-hint">
        这条是给「{{ item.ownership.dogName || '别家狗狗' }}」定制的，用于当前狗狗下单前请确认配方仍然适用。
      </view>
    </view>

    <view v-if="hasMore" class="load-more" @tap="loadMore">
      {{ loading ? '加载中…' : '加载更多' }}
    </view>

    <view v-if="selectedKey" class="bottom-bar">
      <button class="primary-btn" @tap="goConfirm">下一步：确认订单</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  listAssistedRecipeOptions,
  type AssistedRecipeOption,
} from '../../api/staffAssistedOrder'

const filters = [
  { label: '全部', value: '' },
  { label: '橱窗已上架', value: 'WINDOW' },
  { label: '这位顾客的定制', value: 'OWN_CUSTOM' },
  { label: '其他定制', value: 'OTHER_CUSTOM' },
]

const customerId = ref('')
const dogId = ref('')
const keyword = ref('')
const activeFilter = ref('')
const items = ref<AssistedRecipeOption[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const selectedKey = ref('')
const selected = ref<AssistedRecipeOption | null>(null)

type FilterCounts = {
  all: number
  window: number
  ownCustom: number
  otherCustom: number
}

/** 四档筛选各自的条数，由后端按“当前搜索词”统一算好（不是当前档的 total） */
const counts = ref<FilterCounts | null>(null)

const FILTER_COUNT_KEY: Record<string, keyof FilterCounts> = {
  '': 'all',
  WINDOW: 'window',
  OWN_CUSTOM: 'ownCustom',
  OTHER_CUSTOM: 'otherCustom',
}

const hasMore = computed(() => items.value.length < total.value)

/** 筛选在服务端做（`ownership` 参数）：只在已加载的那 20 条里筛会把
 *  「这位顾客的定制」误显示成 0 条 —— 它其实在第 5 页。 */
const visibleItems = computed(() => items.value)

onLoad((options: any) => {
  customerId.value = String(options?.customerId || '')
  dogId.value = String(options?.dogId || '')
  if (!customerId.value || !dogId.value) {
    uni.showToast({ title: '缺少顾客或狗狗信息', icon: 'none' })
    return
  }
  void reload()
})

function tagText(item: AssistedRecipeOption) {
  if (item.ownership.kind === 'WINDOW') return '橱窗'
  if (item.ownership.kind === 'OWN_CUSTOM') return '专属'
  return '别人的'
}

function tagClass(item: AssistedRecipeOption) {
  if (item.ownership.kind === 'OWN_CUSTOM') return 'is-own'
  if (item.ownership.kind === 'OTHER_CUSTOM') return 'is-other'
  return 'is-window'
}

function ownershipText(item: AssistedRecipeOption) {
  if (item.ownership.kind === 'WINDOW') {
    return `橱窗已上架 · v${item.version}`
  }
  const owner = item.ownership.customerName || '顾客'
  if (item.ownership.kind === 'OWN_CUSTOM') {
    return item.ownership.dogName
      ? `${owner}的定制 · ${item.ownership.dogName} · v${item.version}`
      : `${owner}的定制 · 通用 · v${item.version}`
  }
  return `${item.ownership.dogName || '狗狗'}的定制 · ${owner}家${
    item.ownership.breedName ? ` · ${item.ownership.breedName}` : ''
  } · v${item.version}`
}

function filterCount(kind: string) {
  if (!counts.value) return ''
  return ` ${counts.value[FILTER_COUNT_KEY[kind] || 'all']}`
}

function switchFilter(kind: string) {
  if (activeFilter.value === kind) return
  activeFilter.value = kind
  // 换筛选就把选中项清掉：否则底部按钮会带着一条已经看不见的食谱进入下一步
  selectedKey.value = ''
  selected.value = null
  void reload()
}

async function reload() {
  page.value = 1
  items.value = []
  await load(false)
}

async function loadMore() {
  if (loading.value || !hasMore.value) return
  page.value += 1
  await load(true)
}

async function load(append: boolean) {
  loading.value = true
  try {
    const response = await listAssistedRecipeOptions(dogId.value, {
      customerId: customerId.value,
      keyword: keyword.value.trim() || undefined,
      ownership: activeFilter.value || undefined,
      page: page.value,
      pageSize,
    })
    const next = (response.data as any)?.items || []
    items.value = append ? [...items.value, ...next] : next
    total.value = Number((response.data as any)?.total || 0)
    const rawCounts = (response.data as any)?.counts
    if (rawCounts) {
      counts.value = {
        all: Number(rawCounts.all || 0),
        window: Number(rawCounts.window || 0),
        ownCustom: Number(rawCounts.ownCustom || 0),
        otherCustom: Number(rawCounts.otherCustom || 0),
      }
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function select(item: AssistedRecipeOption) {
  selectedKey.value = `${item.id}-${item.version}`
  selected.value = item
}

function goConfirm() {
  if (!selected.value) {
    uni.showToast({ title: '请先选一条食谱', icon: 'none' })
    return
  }
  uni.navigateTo({
    url: `/pages/staff-assisted-order/confirm?customerId=${encodeURIComponent(
      customerId.value,
    )}&dogId=${encodeURIComponent(dogId.value)}&recipeId=${encodeURIComponent(
      selected.value.id,
    )}&recipeName=${encodeURIComponent(selected.value.name)}&ownership=${encodeURIComponent(
      selected.value.ownership.kind,
    )}`,
  })
}
</script>

<style scoped>
.page { min-height: 100vh; background: #eef2e4; padding: 24rpx 24rpx 200rpx; box-sizing: border-box; color: #26261f; }
.head { padding: 8rpx 4rpx 16rpx; }
.title { display: block; font-size: 38rpx; font-weight: 800; color: #1e3a2f; }
.sub { display: block; margin-top: 8rpx; font-size: 23rpx; color: #6b6653; }

.filter-row { white-space: nowrap; margin-bottom: 14rpx; }
.filter-chip { display: inline-block; padding: 12rpx 22rpx; margin-right: 10rpx; border-radius: 28rpx; background: #fff; border: 1rpx solid #e5e8d4; color: #606266; font-size: 24rpx; }
.filter-chip.active { background: #1e3a2f; border-color: #1e3a2f; color: #fff; font-weight: 700; }

.search-bar { display: flex; gap: 12rpx; margin-bottom: 16rpx; }
.search-input { flex: 1; height: 76rpx; padding: 0 20rpx; border: 1rpx solid #e5e8d4; border-radius: 8rpx; background: #fff; font-size: 26rpx; }
.search-btn { flex: none; padding: 0 26rpx; height: 76rpx; line-height: 76rpx; border-radius: 8rpx; background: #1e3a2f; color: #fff; font-size: 26rpx; }

.state { padding: 80rpx 24rpx; text-align: center; color: #6b6653; font-size: 26rpx; }

.recipe-card { background: #fff; border: 1rpx solid #e5e8d4; border-radius: 12rpx; padding: 20rpx; margin-bottom: 16rpx; }
.recipe-card.on { border-color: #1e3a2f; box-shadow: 0 0 0 1rpx #1e3a2f inset; }
.recipe-top { display: flex; gap: 16rpx; align-items: flex-start; }
.recipe-cover { width: 120rpx; height: 120rpx; border-radius: 10rpx; background: #dfe6dc; flex: none; }
.recipe-cover-empty { display: flex; align-items: center; justify-content: center; font-size: 40rpx; }
.recipe-main { flex: 1; min-width: 0; }
.recipe-name { display: block; font-size: 29rpx; font-weight: 800; color: #1e3a2f; }
.recipe-meta { display: block; margin-top: 6rpx; font-size: 22rpx; color: #6b6653; line-height: 1.5; }
.fit-warn { display: block; margin-top: 8rpx; font-size: 22rpx; color: #b4553f; line-height: 1.5; }
.recipe-tag { flex: none; padding: 4rpx 12rpx; border-radius: 6rpx; font-size: 20rpx; font-weight: 700; }
.recipe-tag.is-window { background: #e8f1ec; color: #1e3a2f; }
.recipe-tag.is-own { background: #eaf1fa; color: #2f5f9e; }
.recipe-tag.is-other { background: #f2f3f5; color: #8b8f86; }

.other-hint { margin-top: 14rpx; padding: 14rpx; border-radius: 8rpx; background: #fff8e8; border: 1rpx solid #f0e0bb; color: #8a6a2f; font-size: 22rpx; line-height: 1.6; }

.load-more { padding: 24rpx; text-align: center; color: #2b5040; font-size: 24rpx; }

.bottom-bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #e5e8d4; }
.primary-btn { width: 100%; height: 88rpx; line-height: 88rpx; border-radius: 10rpx; background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%); color: #f3eddd; font-size: 30rpx; font-weight: 800; }
</style>
