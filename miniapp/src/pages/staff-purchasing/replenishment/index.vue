<template>
  <view class="replenishment-page">
    <view class="page-head">
      <text class="page-title">补货</text>
      <text class="page-subtitle">下单后传订单截图记账；货到了再点「已到货」，库存才增加。</text>
    </view>

    <view v-if="inTransitCount > 0" class="in-transit-card" @tap="selectFilter('IN_TRANSIT')">
      <view class="in-transit-copy">
        <text class="in-transit-title">待收货 {{ inTransitCount }} 笔</text>
        <text class="in-transit-hint">点这里看全部在途，超期的会标红</text>
      </view>
      <text class="in-transit-arrow">›</text>
    </view>

    <button class="record-btn" :loading="starting" :disabled="starting" @tap="startRecord">
      {{ starting ? '处理中...' : '记一笔补货' }}
    </button>

    <view class="filters">
      <view
        v-for="option in filterOptions"
        :key="option.value"
        class="filter-chip"
        :class="{ active: activeFilter === option.value }"
        @tap="selectFilter(option.value)"
      >
        <text>{{ option.label }}</text>
      </view>
    </view>

    <view v-if="loading && records.length === 0" class="state-card">
      <text>正在加载补货记录...</text>
    </view>

    <view v-else-if="records.length === 0" class="state-card">
      <text class="state-title">还没有补货记录</text>
      <text class="state-hint">下单后点「记一笔补货」，传订单截图就能记。</text>
    </view>

    <view v-else class="record-list">
      <view
        v-for="record in records"
        :key="record.id"
        class="record-card"
        :class="{ overdue: isOverdue(record) }"
        @tap="goDetail(record.id)"
      >
        <view class="record-top">
          <view class="record-top-left">
            <text class="record-channel">{{ record.channel || '渠道未确认' }}</text>
            <text class="record-date">{{ formatDate(record.orderPlacedAt || record.createdAt) }}</text>
          </view>
          <text v-if="record.orderNo" class="record-order">#{{ shortOrderNo(record.orderNo) }}</text>
        </view>

        <view class="badges">
          <text class="badge arrival" :class="arrivalTone(record)">{{ arrivalText(record) }}</text>
          <text class="badge claim" :class="claimTone(record)">{{ claimText(record) }}</text>
          <text v-if="isOverdue(record)" class="badge overdue-badge">预计 {{ formatDate(record.expectedDeliveryAt) }} 到货</text>
        </view>

        <view class="record-metrics">
          <text class="metric">{{ record.itemCount }} 种商品</text>
          <text v-if="record.reimbursementAmount !== null && record.reimbursementAmount !== undefined" class="metric amount">
            本次报销 ¥{{ formatMoney(record.reimbursementAmount) }}
          </text>
          <text v-else-if="record.paidAmount" class="metric amount">实付 ¥{{ formatMoney(record.paidAmount) }}</text>
        </view>
      </view>

      <view v-if="hasMore" class="load-more" @tap="loadMore">
        <text>{{ loading ? '加载中...' : '加载更多' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  createReplenishmentDraft,
  importOrderScreenshots,
  listReplenishmentRecords,
  uploadOrderScreenshot,
  type ReplenishmentRecordSummary,
} from '../api/purchasing';

type FilterValue = 'ALL' | 'IN_TRANSIT' | 'PENDING_CLAIM' | 'REIMBURSED';

const filterOptions: Array<{ label: string; value: FilterValue }> = [
  { label: '全部', value: 'ALL' },
  { label: '在途', value: 'IN_TRANSIT' },
  { label: '待报销', value: 'PENDING_CLAIM' },
  { label: '已报销', value: 'REIMBURSED' },
];

const records = ref<ReplenishmentRecordSummary[]>([]);
const loading = ref(false);
const starting = ref(false);
const activeFilter = ref<FilterValue>('ALL');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const inTransitCount = ref(0);

const hasMore = computed(() => records.value.length < total.value);

const filterParams = computed(() => {
  switch (activeFilter.value) {
    case 'IN_TRANSIT':
      return { arrival: 'IN_TRANSIT' as const };
    case 'PENDING_CLAIM':
      return { claim: 'UNSUBMITTED' as const };
    case 'REIMBURSED':
      return { claim: 'REIMBURSED' as const };
    default:
      return {};
  }
});

const formatMoney = (value: number) => Number(value || 0).toFixed(2);

const formatDate = (value?: string | null) => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
};

const shortOrderNo = (orderNo: string) => {
  const text = String(orderNo || '').trim();
  return text.length > 4 ? `…${text.slice(-4)}` : text;
};

const isOverdue = (record: ReplenishmentRecordSummary) => {
  if (record.arrivedAt || record.voidedAt || !record.expectedDeliveryAt) {
    return false;
  }
  const expected = new Date(record.expectedDeliveryAt).getTime();
  return Number.isFinite(expected) && Date.now() > expected;
};

const arrivalText = (record: ReplenishmentRecordSummary) => {
  if (record.voidedAt) {
    return '已作废';
  }
  return record.arrivedAt ? '已到货' : '在途';
};

const arrivalTone = (record: ReplenishmentRecordSummary) => {
  if (record.voidedAt) {
    return 'muted';
  }
  return record.arrivedAt ? 'done' : 'in-transit';
};

const claimText = (record: ReplenishmentRecordSummary) => {
  if (record.reimbursementStatus === 'REIMBURSED') {
    return '已报销';
  }
  if (record.reimbursementId) {
    return '报销中';
  }
  return '未报销';
};

const claimTone = (record: ReplenishmentRecordSummary) => {
  if (record.reimbursementStatus === 'REIMBURSED') {
    return 'done';
  }
  if (record.reimbursementId) {
    return 'pending';
  }
  return 'muted';
};

const loadRecords = async (reset = false) => {
  if (loading.value) {
    return;
  }
  if (reset) {
    page.value = 1;
    records.value = [];
  }
  loading.value = true;
  try {
    const res: any = await listReplenishmentRecords({
      ...filterParams.value,
      page: page.value,
      pageSize,
    });
    if (res?.code === 0) {
      const list = Array.isArray(res.data?.list) ? res.data.list : [];
      records.value = reset ? list : [...records.value, ...list];
      total.value = Number(res.data?.total || 0);
    } else {
      uni.showToast({ title: res?.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const loadInTransitCount = async () => {
  try {
    const res: any = await listReplenishmentRecords({
      arrival: 'IN_TRANSIT',
      page: 1,
      pageSize: 1,
    });
    if (res?.code === 0) {
      inTransitCount.value = Number(res.data?.total || 0);
    }
  } catch {
    inTransitCount.value = 0;
  }
};

const refresh = async () => {
  await Promise.all([loadRecords(true), loadInTransitCount()]);
};

const selectFilter = (value: FilterValue) => {
  if (activeFilter.value === value) {
    return;
  }
  activeFilter.value = value;
  loadRecords(true);
};

const loadMore = () => {
  if (!loading.value && hasMore.value) {
    page.value += 1;
    loadRecords();
  }
};

const goDetail = (id: string) => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/replenishment/detail?id=${id}`,
  });
};

const startRecord = async () => {
  if (starting.value) {
    return;
  }

  const chosen: any = await new Promise((resolve) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: resolve,
      fail: () => resolve(null),
    });
  });
  const filePath = chosen?.tempFilePaths?.[0];
  if (!filePath) {
    return;
  }

  starting.value = true;
  uni.showLoading({ title: '上传中...', mask: true });
  try {
    const uploaded = await uploadOrderScreenshot(filePath);
    const draftRes: any = await createReplenishmentDraft();
    if (draftRes?.code !== 0 || !draftRes.data?.id) {
      throw new Error(draftRes?.message || '创建补货记录失败');
    }
    const draftId = draftRes.data.id;

    uni.showLoading({ title: '识别中...', mask: true });
    const importRes: any = await importOrderScreenshots(
      draftId,
      [uploaded.url],
      [uploaded.key],
    );
    if (importRes?.code !== 0) {
      throw new Error(importRes?.message || '识别失败');
    }

    uni.hideLoading();
    uni.navigateTo({
      url: `/pages/staff-purchasing/order-import/review?id=${draftId}&mode=replenishment`,
    });
  } catch (error: any) {
    uni.hideLoading();
    uni.showToast({ title: error?.message || '识别失败，请重试', icon: 'none' });
  } finally {
    starting.value = false;
  }
};

onShow(() => {
  void refresh();
});
</script>

<style scoped lang="scss">
.replenishment-page {
  min-height: 100vh;
  background: #fbfcf7;
  padding: 24rpx 28rpx 60rpx;
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-bottom: 24rpx;
}

.page-title {
  font-size: 40rpx;
  font-weight: 800;
  color: #1e3a2f;
}

.page-subtitle {
  font-size: 24rpx;
  color: #6b6653;
  line-height: 1.6;
}

.in-transit-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 28rpx;
  border-radius: 20rpx;
  background: #fff8e6;
  border: 1rpx solid #f0dca8;
  margin-bottom: 20rpx;
}

.in-transit-copy {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.in-transit-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #7a5c28;
}

.in-transit-hint {
  font-size: 22rpx;
  color: #8a6d3b;
}

.in-transit-arrow {
  font-size: 36rpx;
  color: #b08a3e;
}

.record-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 20rpx;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 30rpx;
  font-weight: 700;
  margin-bottom: 24rpx;
}

.filters {
  display: flex;
  gap: 12rpx;
  margin-bottom: 20rpx;
  flex-wrap: wrap;
}

.filter-chip {
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  background: #f1efe5;
  border: 1rpx solid transparent;
}

.filter-chip text {
  font-size: 24rpx;
  color: #5b5748;
}

.filter-chip.active {
  background: #e8f0e9;
  border-color: #1e3a2f;
}

.filter-chip.active text {
  color: #1e3a2f;
  font-weight: 700;
}

.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 80rpx 24rpx;
  background: #ffffff;
  border-radius: 20rpx;
}

.state-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #3c3a32;
}

.state-hint {
  font-size: 24rpx;
  color: #6b6653;
  text-align: center;
  line-height: 1.6;
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.record-card {
  padding: 24rpx 26rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid #e7e3d6;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.record-card.overdue {
  border-color: #d9534f;
  background: #fffafa;
}

.record-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}

.record-top-left {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  min-width: 0;
}

.record-channel {
  font-size: 30rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.record-date {
  font-size: 24rpx;
  color: #6b6653;
}

.record-order {
  font-size: 22rpx;
  color: #8a8472;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.badge {
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
}

.badge.in-transit {
  background: #fff3df;
  color: #8a5b00;
}

.badge.done {
  background: #e8f0e9;
  color: #1e3a2f;
}

.badge.pending {
  background: #e9eff9;
  color: #2a4a7a;
}

.badge.muted {
  background: #f1efe5;
  color: #5b5748;
}

.badge.overdue-badge {
  background: #fdeceb;
  color: #a12a26;
}

.record-metrics {
  display: flex;
  align-items: baseline;
  gap: 18rpx;
  flex-wrap: wrap;
}

.metric {
  font-size: 24rpx;
  color: #5b5748;
}

.metric.amount {
  margin-left: auto;
  font-weight: 700;
  color: #1e3a2f;
}

.load-more {
  padding: 24rpx;
  text-align: center;
}

.load-more text {
  font-size: 24rpx;
  color: #6b6653;
}
</style>
