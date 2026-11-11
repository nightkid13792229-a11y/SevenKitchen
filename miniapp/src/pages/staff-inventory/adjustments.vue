<template>
  <view class="page">
    <view class="top">
      <text class="total">最近 {{ items.length }} 条</text>
      <view class="tabs">
        <text
          class="tab"
          :class="{ active: filter === 'ALL' }"
          @tap="filter = 'ALL'"
        >全部</text>
        <text
          class="tab"
          :class="{ active: filter === 'PENDING' }"
          @tap="filter = 'PENDING'"
        >待复核</text>
      </view>
    </view>

    <view class="hint">
      领用不用批；报废满 50 元要管理员确认。驳回时系统会把扣掉的加回来。
    </view>

    <view v-if="loading && items.length === 0" class="state">加载中…</view>
    <view v-else-if="error" class="state">
      <text>{{ error }}</text>
      <text class="retry" @tap="load">重试</text>
    </view>
    <view v-else-if="visibleItems.length === 0" class="state">
      <text class="state-title">
        {{ filter === 'PENDING' ? '没有待复核的单' : '还没有领用/报废记录' }}
      </text>
      <text class="state-hint">在库存卡片的「领用/报废」里记一笔就会出现在这里。</text>
    </view>

    <view v-else class="list">
      <view
        v-for="item in visibleItems"
        :key="item.id"
        class="card"
        :class="{ pending: item.reviewStatus === 'PENDING' }"
      >
        <view class="card-top">
          <text class="name">{{ item.ingredientName }}</text>
          <text class="status" :class="statusClass(item.reviewStatus)">
            {{ statusText(item.reviewStatus) }}
          </text>
        </view>

        <view class="nums">
          <text class="delta">{{ signed(item.deltaG) }}{{ item.stockUnitLabel }}</text>
          <text class="meta">{{ categoryText(item.category) }}</text>
          <text v-if="item.costAmount" class="meta">约 ¥{{ money(item.costAmount) }}</text>
        </view>

        <view class="meta-line">
          {{ formatTime(item.createdAt) }}
          <text v-if="item.note"> · {{ item.note }}</text>
        </view>

        <text v-if="item.reviewNote" class="review-note">
          驳回原因：{{ item.reviewNote }}
        </text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  getInventoryAdjustments,
  type InventoryAdjustmentItem,
} from './api/inventory';

const items = ref<InventoryAdjustmentItem[]>([]);
const loading = ref(true);
const error = ref('');
const filter = ref<'ALL' | 'PENDING'>('ALL');

const visibleItems = computed(() =>
  filter.value === 'PENDING'
    ? items.value.filter((item) => item.reviewStatus === 'PENDING')
    : items.value,
);

const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;

const money = (value: number) => Number(value).toFixed(2);

const categoryText = (category: string) =>
  ({
    INTERNAL_USE: '内部领用',
    EXPIRED: '过期报废',
    DAMAGED: '破损污染',
    OTHER: '其他',
  })[category] || category;

const statusText = (status: string) =>
  ({
    NONE: '已记上',
    PENDING: '等管理员确认',
    APPROVED: '已通过',
    REJECTED: '已驳回',
  })[status] || status;

const statusClass = (status: string) =>
  ({
    NONE: 'ok',
    PENDING: 'warn',
    APPROVED: 'ok',
    REJECTED: 'danger',
  })[status] || 'ok';

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const load = async () => {
  if (items.value.length === 0) loading.value = true;
  error.value = '';
  try {
    items.value = await getInventoryAdjustments({ limit: 50 });
  } catch (err: any) {
    error.value = err?.message || '加载失败，请重试';
  } finally {
    loading.value = false;
  }
};

onShow(() => {
  load();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 20rpx 24rpx calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: #fbfcf7;
}
.top { display: flex; align-items: center; justify-content: space-between; }
.total { font-size: 24rpx; color: #7a8a80; }
.tabs { display: flex; gap: 10rpx; }
.tab {
  height: 52rpx;
  padding: 0 22rpx;
  display: flex;
  align-items: center;
  border-radius: 26rpx;
  background: #eef2ec;
  color: #4b5b51;
  font-size: 24rpx;
}
.tab.active { background: #1e3a2f; color: #fbfcf7; }
.hint {
  margin-top: 16rpx;
  padding: 14rpx 18rpx;
  border-radius: 14rpx;
  background: #eef4ea;
  color: #4b5b51;
  font-size: 24rpx;
  line-height: 1.55;
}
.state {
  padding: 80rpx 0;
  text-align: center;
  color: #7a8a80;
  font-size: 26rpx;
}
.state-title { display: block; font-size: 30rpx; color: #1e3a2f; margin-bottom: 8rpx; }
.state-hint { display: block; line-height: 1.6; }
.retry { display: block; margin-top: 12rpx; color: #1e3a2f; font-size: 24rpx; }
.list { margin-top: 16rpx; }
.card {
  padding: 18rpx 20rpx;
  margin-bottom: 12rpx;
  border-radius: 20rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
}
.card.pending { border-color: #e8d3b3; }
.card-top { display: flex; align-items: center; justify-content: space-between; }
.name { font-size: 28rpx; font-weight: 500; color: #1e3a2f; }
.status { font-size: 24rpx; padding: 3rpx 12rpx; border-radius: 10rpx; }
.status.ok { background: #e4f0e6; color: #1f6b3a; }
.status.warn { background: #f6ead9; color: #8a5a1e; }
.status.danger { background: #f6e3df; color: #a33a2a; }
.nums { display: flex; align-items: baseline; gap: 16rpx; margin-top: 8rpx; }
.delta { font-size: 30rpx; font-weight: 600; color: #a33a2a; }
.meta { font-size: 24rpx; color: #5f6f64; }
.meta-line { margin-top: 6rpx; font-size: 24rpx; color: #7a8a80; }
.review-note { display: block; margin-top: 8rpx; font-size: 24rpx; color: #a33a2a; }
</style>
