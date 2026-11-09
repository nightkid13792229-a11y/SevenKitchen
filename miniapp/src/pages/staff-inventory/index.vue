<template>
  <view class="page">
    <view class="date-row">
      <text class="date">{{ dateText }} · 数据截至 {{ asOf }}</text>
      <text class="last" @tap="goRecords">上次盘库 {{ lastStocktakeText }}</text>
    </view>

    <view class="warning" @tap="openDrawer('needs')">
      <text class="warning-text">
        {{ summary.needsReplenishment }} 项需要补货 · {{ summary.lowStock }} 项低于安全库存
      </text>
      <text class="arrow">›</text>
    </view>

    <view class="search">
      <input
        v-model="keyword"
        class="search-input"
        placeholder="搜原料、渠道、规格"
        confirm-type="search"
      />
    </view>

    <view class="filters">
      <view
        v-for="item in filters"
        :key="item.value"
        class="chip"
        :class="{ active: filter === item.value }"
        @tap="filter = item.value"
      >
        {{ item.label }}
        <text v-if="item.count > 0" class="chip-count">{{ item.count }}</text>
      </view>
    </view>

    <view v-if="loading" class="state">正在加载库存…</view>
    <view v-else-if="error" class="state">
      <text class="state-title">加载失败</text>
      <text class="state-hint">{{ error }}</text>
      <button class="retry" @tap="load">重试</button>
    </view>
    <view v-else-if="filteredItems.length === 0" class="state">
      <text class="state-title">{{ keyword ? '没搜到' : '这个分组是空的' }}</text>
      <text class="state-hint">换个关键词或筛选看看。</text>
    </view>

    <view v-else class="list">
      <view
        v-for="item in filteredItems"
        :key="item.id"
        class="card"
        :class="{ negative: item.currentStock < 0 }"
      >
        <view class="card-head">
          <text class="name">{{ item.name }}</text>
          <text class="badge" :class="badgeClass(item)">{{ badgeText(item) }}</text>
        </view>

        <view class="card-main">
          <text class="big">{{ fmt(item.currentStock) }}</text>
          <text class="unit">{{ item.stockUnitLabel }}</text>
          <view v-if="item.suggestedPurchaseQuantity > 0" class="suggest">
            <text>建议补 {{ fmt(item.suggestedPurchaseQuantity) }}{{ item.purchaseUnit }}</text>
            <text class="suggest-cost">约 ¥{{ fmt(item.suggestedEstimatedCost) }}</text>
          </view>
        </view>

        <view v-if="item.lastMovement" class="last">
          <text class="last-text">
            {{ formatTime(item.lastMovement.at) }} {{ item.lastMovement.sourceLabel }}
          </text>
          <text
            class="last-delta"
            :class="item.lastMovement.deltaBaseQuantity >= 0 ? 'up' : 'down'"
          >
            {{ signed(item.lastMovement.deltaBaseQuantity) }}{{ item.stockUnitLabel }}
          </text>
        </view>

        <view class="actions">
          <button class="btn ghost" @tap="openDrawer('ledger', item)">看流水</button>
          <button class="btn primary" @tap="goReplenish(item)">去补货</button>
        </view>
      </view>
    </view>

    <view class="bottom">
      <button class="btn ghost" @tap="goAdjust">记一笔</button>
      <button class="btn primary" @tap="openDrawer('needs')">
        补货清单 {{ summary.needsReplenishment }}
      </button>
    </view>

    <InventoryDrawer
      :visible="drawerVisible"
      :tab="drawerTab"
      :ingredient-id="drawerIngredientId"
      @close="drawerVisible = false"
      @update:tab="drawerTab = $event"
      @go-replenish="goReplenish"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import InventoryDrawer from './components/InventoryDrawer.vue';
import {
  getInventoryHome,
  type InventoryHome,
  type InventoryHomeItem,
} from './api/inventory';

const home = ref<InventoryHome | null>(null);
const loading = ref(true);
const error = ref('');
const keyword = ref('');
const filter = ref<'ALL' | 'NEEDS' | 'LOW' | 'NO_POLICY'>('ALL');
const asOf = ref('');
const drawerVisible = ref(false);
const drawerTab = ref<'needs' | 'ledger'>('needs');
const drawerIngredientId = ref<string | undefined>(undefined);

const summary = computed(
  () =>
    home.value?.summary ?? {
      needsReplenishment: 0,
      lowStock: 0,
      noPolicy: 0,
      lastStocktakeAt: null,
    },
);

const items = computed(() => home.value?.items ?? []);

const filters = computed(() => [
  { value: 'ALL' as const, label: '全部', count: items.value.length },
  {
    value: 'NEEDS' as const,
    label: '需补货',
    count: summary.value.needsReplenishment,
  },
  { value: 'LOW' as const, label: '低库存', count: summary.value.lowStock },
  {
    value: 'NO_POLICY' as const,
    label: '未设阈值',
    count: summary.value.noPolicy,
  },
]);

const filteredItems = computed(() => {
  const term = keyword.value.trim().toLowerCase();
  return items.value.filter((item) => {
    if (filter.value === 'NEEDS' && item.stockStatus !== 'NEEDS_REPLENISHMENT') {
      return false;
    }
    if (filter.value === 'LOW' && item.stockStatus !== 'LOW_STOCK') {
      return false;
    }
    if (filter.value === 'NO_POLICY' && item.stockStatus !== 'NO_POLICY') {
      return false;
    }
    if (!term) return true;
    return [item.name, item.purchaseChannel, item.productModel]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });
});

const dateText = computed(() => {
  const now = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  return `${now.getMonth() + 1}月${now.getDate()}日 周${week}`;
});

const lastStocktakeText = computed(() => {
  const value = summary.value.lastStocktakeAt;
  if (!value) return '还没盘过';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '还没盘过';
  return `${date.getMonth() + 1}/${date.getDate()}`;
});

const fmt = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '0';
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${fmt(value)}`;

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const badgeText = (item: InventoryHomeItem) => {
  if (item.currentStock < 0) return '待核实';
  if (item.stockStatus === 'NEEDS_REPLENISHMENT') return '需要补货';
  if (item.stockStatus === 'LOW_STOCK') return '低于安全';
  if (item.stockStatus === 'NO_POLICY') return '未设阈值';
  return '库存充足';
};

const badgeClass = (item: InventoryHomeItem) => {
  if (item.currentStock < 0) return 'danger';
  if (item.stockStatus === 'NEEDS_REPLENISHMENT') return 'danger';
  if (item.stockStatus === 'LOW_STOCK') return 'warn';
  if (item.stockStatus === 'NO_POLICY') return 'muted';
  return 'ok';
};

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    home.value = await getInventoryHome();
    const now = new Date();
    asOf.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  } catch (err: any) {
    error.value = err?.message || '请稍后重试';
  } finally {
    loading.value = false;
  }
};

onShow(() => {
  load();
});

const openDrawer = (tab: 'needs' | 'ledger', item?: InventoryHomeItem) => {
  drawerTab.value = tab;
  drawerIngredientId.value = item?.id;
  drawerVisible.value = true;
};

const goReplenish = (item: InventoryHomeItem) => {
  drawerVisible.value = false;
  uni.navigateTo({
    url: `/pages/staff-purchasing/stock-create?ingredientId=${item.id}`,
  });
};

const goAdjust = () => {
  uni.navigateTo({ url: '/pages/staff-inventory/adjustment-create' });
};

const goRecords = () => {
  uni.navigateTo({ url: '/pages/staff-inventory/stocktake-records' });
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 20rpx 24rpx calc(150rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: #fbfcf7;
}
.date-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12rpx;
}
.date {
  font-size: 24rpx;
  color: #7a8a80;
}
.last {
  font-size: 24rpx;
  color: #4b5b51;
}
.warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: 16rpx;
  background: #f8e9e4;
  color: #8a3a28;
}
.warning-text {
  font-size: 26rpx;
}
.arrow {
  font-size: 30rpx;
}
.search {
  margin-top: 16rpx;
}
.search-input {
  height: 72rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
  font-size: 26rpx;
}
.filters {
  display: flex;
  gap: 12rpx;
  margin-top: 16rpx;
  overflow-x: auto;
}
.chip {
  flex-shrink: 0;
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  background: #f1f4ee;
  color: #4b5b51;
  font-size: 24rpx;
}
.chip.active {
  background: #1e3a2f;
  color: #fbfcf7;
}
.chip-count {
  margin-left: 6rpx;
  opacity: 0.8;
}
.state {
  padding: 80rpx 24rpx;
  text-align: center;
  color: #7a8a80;
  font-size: 26rpx;
}
.state-title {
  display: block;
  font-size: 30rpx;
  color: #1e3a2f;
  margin-bottom: 8rpx;
}
.state-hint {
  display: block;
  line-height: 1.6;
}
.retry {
  margin-top: 20rpx;
  padding: 0 40rpx;
  height: 68rpx;
  line-height: 68rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #fbfcf7;
  font-size: 26rpx;
}
.list {
  margin-top: 16rpx;
}
.card {
  padding: 22rpx;
  margin-bottom: 14rpx;
  border-radius: 22rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
}
.card.negative {
  border-color: #e6b8ae;
  background: #fffaf8;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.name {
  font-size: 30rpx;
  font-weight: 600;
  color: #1e3a2f;
}
.badge {
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
}
.badge.ok {
  background: #e4f0e6;
  color: #1f6b3a;
}
.badge.warn {
  background: #f6ead9;
  color: #8a5a1e;
}
.badge.danger {
  background: #f6e3df;
  color: #a33a2a;
}
.badge.muted {
  background: #eef1ec;
  color: #5b6b60;
}
.card-main {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  margin-top: 12rpx;
}
.big {
  font-size: 48rpx;
  font-weight: 600;
  color: #1e3a2f;
}
.unit {
  font-size: 24rpx;
  color: #7a8a80;
}
.suggest {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
  font-size: 24rpx;
  color: #4b5b51;
}
.suggest-cost {
  color: #7a8a80;
}
.last {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #7a8a80;
}
.up {
  color: #1f6b3a;
}
.down {
  color: #a33a2a;
}
.actions {
  display: flex;
  gap: 14rpx;
  margin-top: 18rpx;
}
.btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
}
.btn.ghost {
  background: #f1f4ee;
  color: #1e3a2f;
}
.btn.primary {
  background: #1e3a2f;
  color: #fbfcf7;
}
.bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 14rpx;
  padding: 14rpx 24rpx calc(14rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #e8ede7;
}
.bottom .btn {
  height: 84rpx;
  line-height: 84rpx;
}
</style>
