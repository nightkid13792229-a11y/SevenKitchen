<template>
  <view v-if="visible" class="mask" @tap="onClose">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <text class="sheet-title">
          {{ tab === 'ledger' ? ingredientName || '最近流水' : '缺什么' }}
        </text>
        <text class="close" @tap="onClose">关闭</text>
      </view>

      <view class="tabs">
        <view
          class="tab"
          :class="{ active: tab === 'needs' }"
          @tap="switchTab('needs')"
        >
          缺什么
        </view>
        <view
          class="tab"
          :class="{ active: tab === 'ledger' }"
          @tap="switchTab('ledger')"
        >
          最近流水
        </view>
      </view>

      <view v-if="loading" class="state">加载中…</view>
      <view v-else-if="error" class="state">
        <text>{{ error }}</text>
        <text class="retry" @tap="load">重试</text>
      </view>

      <scroll-view v-else scroll-y class="body">
        <template v-if="tab === 'needs'">
          <view
            v-for="item in needs"
            :key="item.id"
            class="needs-row"
          >
            <view class="needs-copy">
              <text class="name">{{ item.name }}</text>
              <text class="meta">
                现存 {{ fmt(item.currentStock) }}{{ item.stockUnitLabel }}
                <text v-if="totalInTransit(item) > 0">
                  · 在途 {{ fmt(totalInTransit(item)) }}{{ item.stockUnitLabel }}
                </text>
                <text v-if="netBase(item) > 0">
                  · 还差 {{ fmt(netBase(item)) }}{{ item.stockUnitLabel }}
                  <text v-if="(item.netShortageEstimatedCost || 0) > 0">
                    · 约 ¥{{ fmt(item.netShortageEstimatedCost) }}
                  </text>
                </text>
                <text v-else-if="totalInTransit(item) <= 0"> · 库存够</text>
              </text>
            </view>
            <button class="mini" @tap="onGoReplenish(item)">去补货</button>
          </view>
          <view v-if="needs.length === 0" class="state">暂时没有需要补的</view>
        </template>

        <template v-else>
          <view
            v-for="item in ledger"
            :key="item.id"
            class="ledger-row"
          >
            <view class="ledger-copy">
              <text class="name">{{ item.ingredientName }}</text>
              <text class="meta">
                {{ formatTime(item.createdAt) }} · {{ item.sourceLabel }}
              </text>
            </view>
            <text
              class="delta"
              :class="item.deltaG >= 0 ? 'up' : 'down'"
            >
              {{ signed(item.deltaG) }}{{ item.stockUnitLabel }}
            </text>
          </view>
          <view v-if="ledger.length === 0" class="state">还没有流水</view>
        </template>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  getInventoryLedger,
  getInventoryOverview,
  type InventoryLedgerItem,
  type InventoryOverviewItem,
} from '../api/inventory';

const props = defineProps<{
  visible: boolean;
  tab: 'needs' | 'ledger';
  ingredientId?: string;
  ingredientName?: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'update:tab', value: 'needs' | 'ledger'): void;
  (event: 'go-replenish', item: InventoryOverviewItem): void;
}>();

const tab = ref<'needs' | 'ledger'>(props.tab);
const loading = ref(false);
const error = ref('');
const needs = ref<InventoryOverviewItem[]>([]);
const ledger = ref<InventoryLedgerItem[]>([]);

const fmt = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '0';
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${fmt(value)}`;

const totalInTransit = (item: InventoryOverviewItem) =>
  (item.inTransitBaseQuantity || 0) +
  (item.replenishmentInTransitBaseQuantity || 0);

const netBase = (item: InventoryOverviewItem) =>
  item.netShortageBaseQuantity ?? item.suggestedBaseQuantity ?? 0;

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const load = async () => {
  if (!props.visible) return;
  loading.value = true;
  error.value = '';
  try {
    if (tab.value === 'needs') {
      needs.value = await getInventoryOverview({
        onlyNeedsReplenishment: true,
      });
    } else {
      ledger.value = await getInventoryLedger({
        ingredientId: props.ingredientId,
        limit: 50,
      });
    }
  } catch (err: any) {
    error.value = err?.message || '加载失败，请重试';
  } finally {
    loading.value = false;
  }
};

watch(
  () => [props.visible, props.tab, props.ingredientId],
  () => {
    tab.value = props.tab;
    load();
  },
  { immediate: true },
);

const switchTab = (value: 'needs' | 'ledger') => {
  tab.value = value;
  emit('update:tab', value);
};

const onClose = () => emit('close');
const onGoReplenish = (item: InventoryOverviewItem) =>
  emit('go-replenish', item);
</script>

<style scoped>
.mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  background: rgba(20, 30, 24, 0.45);
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  max-height: 74vh;
  padding: 20rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  border-radius: 28rpx 28rpx 0 0;
  background: #fbfcf7;
  display: flex;
  flex-direction: column;
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12rpx;
}
.sheet-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1e3a2f;
}
.close {
  font-size: 24rpx;
  color: #7a8a80;
}
.tabs {
  display: flex;
  gap: 16rpx;
  padding-bottom: 16rpx;
}
.tab {
  padding: 10rpx 26rpx;
  border-radius: 999rpx;
  background: #eef2ec;
  color: #4b5b51;
  font-size: 24rpx;
}
.tab.active {
  background: #1e3a2f;
  color: #fbfcf7;
}
.body {
  flex: 1;
  height: 58vh;
}
.state {
  padding: 40rpx 0;
  text-align: center;
  color: #7a8a80;
  font-size: 24rpx;
}
.retry {
  display: block;
  margin-top: 12rpx;
  color: #1e3a2f;
  font-size: 24rpx;
}
.needs-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #e8ede7;
}
.needs-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.name {
  font-size: 28rpx;
  color: #1e3a2f;
}
.meta {
  font-size: 24rpx;
  color: #7a8a80;
}
.mini {
  padding: 0 24rpx;
  height: 60rpx;
  line-height: 60rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #fbfcf7;
  font-size: 24rpx;
}
.ledger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #e8ede7;
}
.ledger-copy {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.delta {
  font-size: 26rpx;
}
.up {
  color: #1f6b3a;
}
.down {
  color: #a33a2a;
}
</style>
