<template>
  <view class="page">
    <view class="top">
      <text class="total">共 {{ items.length }} 次（最近 30 次）</text>
      <view class="top-actions">
        <text class="start ghost" @tap="goOpening">期初盘点</text>
        <text class="start" @tap="goStart">日常盘点</text>
      </view>
    </view>

    <view class="hint">
      只填实称，不显示账面；小差异自动入账，大差异等管理员复核。
    </view>

    <view v-if="loading && items.length === 0" class="state">加载中…</view>
    <view v-else-if="error" class="state">
      <text>{{ error }}</text>
      <text class="retry" @tap="load">重试</text>
    </view>
    <view v-else-if="items.length === 0" class="state">
      <text class="state-title">还没有盘点记录</text>
      <text class="state-hint">盘一次，看看账面和实称差多少。</text>
      <button class="start-btn" @tap="goStart">开始盘点</button>
    </view>

    <template v-else>
      <view v-for="group in groups" :key="group.key" class="group">
        <view class="group-title">
          {{ group.title }}
          <text class="count">{{ group.items.length }}</text>
        </view>

        <view
          v-for="item in group.items"
          :key="item.id"
          class="card"
          @tap="open(item)"
        >
          <view class="card-top">
            <text class="time">{{ formatTime(item.createdAt) }}</text>
            <text class="status" :class="item.status.toLowerCase()">
              {{ statusText(item.status) }}
            </text>
          </view>

          <view class="meta">
            <text>{{ item.lineCount }} 项</text>
            <text v-if="item.status !== 'DRAFT'">差异 {{ item.varianceCount }} 项</text>
            <text v-else-if="isMine(item)">盘点中</text>
            <text v-else>他人盘点中</text>
            <text v-if="item.countedCount !== undefined">
              已盘 {{ item.countedCount }} / {{ item.lineCount }}
            </text>
          </view>

          <text v-if="item.reviewNote" class="review-note">
            驳回原因：{{ item.reviewNote }}
          </text>

          <view
            v-if="item.status === 'SUBMITTED' && isAdmin"
            class="actions"
            @tap.stop
          >
            <button class="btn ok" @tap="approve(item)">通过并入账</button>
            <button class="btn warn" @tap="reject(item)">驳回</button>
          </view>

          <view
            v-if="item.status === 'REJECTED'"
            class="actions"
            @tap.stop
          >
            <button class="btn ghost" @tap="restart">重新盘点</button>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getStoredUser } from '../../utils/account';
import {
  getInventoryStocktakes,
  reviewStocktake,
  type InventoryStocktakeItem,
} from './api/inventory';

const items = ref<InventoryStocktakeItem[]>([]);
const loading = ref(true);
const error = ref('');
const currentUserId =
  uni.getStorageSync('userId') || getStoredUser()?.id;
const isAdmin = getStoredUser()?.role === 'ADMIN';
const isMine = (item: InventoryStocktakeItem) =>
  !currentUserId || !item.createdBy || item.createdBy === currentUserId;

const statusText = (status: string) =>
  ({
    DRAFT: '草稿',
    SUBMITTED: '待复核',
    APPLIED: '已入账',
    REJECTED: '已驳回',
  })[status] || status;

const groups = computed(() =>
  [
    { key: 'DRAFT', title: '进行中', items: items.value.filter((item) => item.status === 'DRAFT') },
    { key: 'SUBMITTED', title: '待复核', items: items.value.filter((item) => item.status === 'SUBMITTED') },
    { key: 'APPLIED', title: '已入账', items: items.value.filter((item) => item.status === 'APPLIED') },
    { key: 'REJECTED', title: '已驳回', items: items.value.filter((item) => item.status === 'REJECTED') },
  ].filter((group) => group.items.length > 0),
);

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
    items.value = await getInventoryStocktakes({ limit: 30 });
  } catch (err: any) {
    error.value = err?.message || '加载失败，请重试';
  } finally {
    loading.value = false;
  }
};

onShow(() => {
  load();
});

const goStart = () => {
  uni.navigateTo({ url: '/pages/staff-inventory/stocktake-create' });
};

const goOpening = () => {
  uni.navigateTo({
    url: '/pages/staff-inventory/stocktake-create?type=OPENING',
  });
};

const open = (item: InventoryStocktakeItem) => {
  if (item.status === 'DRAFT') {
    if (!isMine(item)) {
      uni.showToast({
        title: '这单由其他人盘点中，等对方完成或取消',
        icon: 'none',
      });
      return;
    }
    uni.navigateTo({ url: '/pages/staff-inventory/stocktake-create' });
    return;
  }
  uni.navigateTo({
    url: `/pages/staff-inventory/stocktake-result?id=${item.id}&mode=result`,
  });
};

const approve = async (item: InventoryStocktakeItem) => {
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '通过并入账',
      content: '确认通过并补入超容差的差异吗？',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  try {
    await reviewStocktake(item.id, { approve: true });
    uni.showToast({ title: '已通过并入账', icon: 'success' });
    await load();
  } catch (error: any) {
    uni.showToast({ title: error?.message || '复核失败', icon: 'none' });
  }
};

const reject = async (item: InventoryStocktakeItem) => {
  const result = await new Promise<any>((resolve) => {
    uni.showModal({
      title: '驳回盘点',
      editable: true,
      placeholderText: '填写驳回原因（至少 4 个字）',
      success: (res) => resolve(res),
      fail: () => resolve({}),
    });
  });
  if (!result?.confirm) return;

  const note = String(result.content || '').trim();
  if (note.length < 4) {
    uni.showToast({ title: '请填写至少 4 个字的原因', icon: 'none' });
    return;
  }

  try {
    await reviewStocktake(item.id, { approve: false, note });
    uni.showToast({ title: '已驳回，需重新盘点', icon: 'success' });
    await load();
  } catch (error: any) {
    uni.showToast({ title: error?.message || '驳回失败', icon: 'none' });
  }
};

const restart = () => {
  uni.navigateTo({ url: '/pages/staff-inventory/stocktake-create' });
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  box-sizing: border-box;
  background: #fbfcf7;
}
.top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.title {
  font-size: 34rpx;
  font-weight: 600;
  color: #1e3a2f;
}
.total {
  font-size: 24rpx;
  color: #7a8a80;
}
.top-actions { display: flex; gap: 12rpx; }
.start.ghost {
  background: #eef2ec;
  color: #1e3a2f;
}
.start {
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #fbfcf7;
  font-size: 24rpx;
}
.hint {
  margin-top: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  background: #eef4ea;
  color: #4b5b51;
  font-size: 24rpx;
  line-height: 1.6;
}
.retry {
  display: block;
  margin-top: 12rpx;
  color: #1e3a2f;
  font-size: 24rpx;
}
.state {
  padding: 80rpx 0;
  text-align: center;
  color: #7a8a80;
  font-size: 26rpx;
}
.state-title {
  display: block;
  margin-bottom: 8rpx;
  font-size: 30rpx;
  color: #1e3a2f;
}
.state-hint {
  display: block;
  line-height: 1.6;
}
.start-btn {
  margin-top: 24rpx;
  padding: 0 48rpx;
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #fbfcf7;
  font-size: 28rpx;
}
.group {
  margin-top: 24rpx;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 0 8rpx 12rpx;
  font-size: 26rpx;
  color: #4b5b51;
}
.count {
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  background: #e8ede7;
  font-size: 24rpx;
}
.card {
  padding: 20rpx;
  margin-bottom: 12rpx;
  border-radius: 20rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.time {
  font-size: 28rpx;
  color: #1e3a2f;
  font-weight: 500;
}
.status {
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  background: #eef1ec;
  color: #4b5b51;
}
.status.submitted {
  background: #f6ead9;
  color: #8a5a1e;
}
.status.applied {
  background: #e4f0e6;
  color: #1e3a2f;
}
.status.rejected {
  background: #f6e3df;
  color: #a33a2a;
}
.meta {
  display: flex;
  gap: 20rpx;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #7a8a80;
}
.review-note {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #a33a2a;
}
.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
}
.btn {
  flex: 1;
  height: 68rpx;
  line-height: 68rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
}
.btn.ok {
  background: #1e3a2f;
  color: #fbfcf7;
}
.btn.warn {
  background: #f6e3df;
  color: #a33a2a;
}
.btn.ghost {
  background: #f1f4ee;
  color: #1e3a2f;
}
</style>
