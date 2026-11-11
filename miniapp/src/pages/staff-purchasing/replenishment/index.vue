<template>
  <view class="replenishment-page">
    <view v-if="needs.length > 0" class="needs-card">
      <view class="needs-head" @tap="needsExpanded = !needsExpanded">
        <view class="needs-copy">
          <text class="needs-title">还缺 {{ needs.length }} 项</text>
          <text class="needs-sub">
            {{ needsCost > 0 ? `预计 ¥${money(needsCost)} · ` : '' }}点开看清单
          </text>
        </view>
        <text class="needs-toggle">{{ needsExpanded ? '收起' : '展开' }}</text>
      </view>

      <view v-if="needsExpanded" class="needs-list">
        <view
          v-for="item in needs.slice(0, 8)"
          :key="item.id"
          class="needs-row"
        >
          <text class="needs-name">{{ item.name }}</text>
          <text class="needs-meta">
            还差 {{ fmt(shortageOf(item)) }}{{ item.stockUnitLabel }}
            <text v-if="totalInTransit(item) > 0" class="needs-transit">
              · 在途 {{ fmt(totalInTransit(item)) }}{{ item.stockUnitLabel }}
            </text>
          </text>
        </view>
        <text
          v-if="needs.length > 8"
          class="needs-more"
          @tap.stop="goInventory"
        >
          还有 {{ needs.length - 8 }} 项 · 去库存看全部 ›
        </text>
        <view class="needs-actions">
          <text class="needs-copy-btn" @tap="copyNeeds">复制清单</text>
        </view>
      </view>
    </view>

    <view v-if="inTransitCount > 0" class="in-transit-card" @tap="selectFilter('IN_TRANSIT')">
      <view class="in-transit-copy">
        <text class="in-transit-title">待收货 {{ inTransitCount }} 笔</text>
        <text class="in-transit-hint">点开看全部 · 超期标红</text>
      </view>
      <text class="in-transit-arrow">›</text>
    </view>

    <button class="record-btn" :loading="starting" :disabled="starting" @tap="startRecord">
      {{ starting ? '处理中...' : 'AI识别采购订单' }}
    </button>

    <view class="filter-row">
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
      <button class="manual-btn" @tap="startManualRecord">手动填写</button>
    </view>

    <view v-if="loading && records.length === 0" class="state-card">
      <text>加载中…</text>
    </view>

    <view v-else-if="errorText && records.length === 0" class="state-card">
      <text class="state-title">加载失败</text>
      <text class="state-hint">{{ errorText }}</text>
      <button class="retry-btn" @tap="refresh">重试</button>
    </view>

    <view v-else-if="records.length === 0" class="state-card">
      <text class="state-title">{{ emptyTitle }}</text>
      <text class="state-hint">{{ emptyHint }}</text>
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
          <text
            v-if="!record.voidedAt"
            class="badge claim"
            :class="claimTone(record)"
          >{{ claimText(record) }}</text>
          <text v-if="isOverdue(record)" class="badge overdue-badge">
            超期 {{ overdueDays(record) }} 天
          </text>
          <text v-else-if="showExpected(record)" class="badge expect">
            预计 {{ formatDate(record.expectedDeliveryAt) }} 到
          </text>
        </view>

        <view class="record-metrics">
          <text v-if="record.voidedAt" class="metric">不入库 · 不报销</text>
          <template v-else>
            <text class="metric">{{ record.itemCount }} 项</text>
            <text
              v-if="Number(record.personalAmount || 0) > 0"
              class="metric"
            >
              含个人 ¥{{ formatMoney(record.personalAmount) }}
            </text>
            <text class="metric amount">
              实付 ¥{{ formatMoney(record.paidAmount ?? record.reimbursementAmount) }}
            </text>
          </template>
        </view>
      </view>

      <view v-if="errorText" class="load-more" @tap="refresh">
        <text>加载失败，点重试</text>
      </view>
      <view v-else-if="hasMore" class="load-more" @tap="loadMore">
        <text>{{ loading ? '加载中...' : '加载更多' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import {
  createManualReplenishmentImport,
  createReplenishmentDraft,
  importOrderScreenshots,
  listReplenishmentRecords,
  listInventoryNeeds,
  uploadOrderScreenshot,
  type InventoryNeedItem,
  type ReplenishmentRecordSummary,
} from '../api/purchasing';

type FilterValue =
  | 'ALL'
  | 'IN_TRANSIT'
  | 'PENDING_CLAIM'
  | 'REIMBURSED'
  | 'VOIDED';

const filterOptions: Array<{ label: string; value: FilterValue }> = [
  { label: '全部', value: 'ALL' },
  { label: '在途', value: 'IN_TRANSIT' },
  { label: '未报销', value: 'PENDING_CLAIM' },
  { label: '已报销', value: 'REIMBURSED' },
  { label: '已作废', value: 'VOIDED' },
];

const records = ref<ReplenishmentRecordSummary[]>([]);
const loading = ref(false);
const errorText = ref('');
let loadSeq = 0;
const starting = ref(false);
const startingManual = ref(false);
const activeFilter = ref<FilterValue>('ALL');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const inTransitCount = ref(0);
const needs = ref<InventoryNeedItem[]>([]);
const needsExpanded = ref(false);

const hasMore = computed(() => records.value.length < total.value);

const emptyTitle = computed(() => {
  switch (activeFilter.value) {
    case 'IN_TRANSIT':
      return '没有在途的补货';
    case 'PENDING_CLAIM':
      return '没有未报销的补货';
    case 'REIMBURSED':
      return '没有已报销的补货';
    case 'VOIDED':
      return '没有已作废的补货';
    default:
      return '还没有补货记录';
  }
});

const emptyHint = computed(() =>
  activeFilter.value === 'ALL'
    ? '点上面的「AI识别采购订单」，传截图就能记。'
    : '换个筛选看看。',
);


const filterParams = computed(() => {
  switch (activeFilter.value) {
    case 'IN_TRANSIT':
      return { arrival: 'IN_TRANSIT' as const };
    case 'PENDING_CLAIM':
      return { claim: 'UNSUBMITTED' as const };
    case 'REIMBURSED':
      return { claim: 'REIMBURSED' as const };
    case 'VOIDED':
      return { includeVoided: true, voidedOnly: true };
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
  const expected = new Date(record.expectedDeliveryAt);
  if (Number.isNaN(expected.getTime())) return false;
  // 预计到货是“哪一天”，当天 23:59 之前都不算超期。
  const endOfDay = new Date(
    expected.getFullYear(),
    expected.getMonth(),
    expected.getDate() + 1,
    0,
    0,
    0,
    0,
  ).getTime();
  return Date.now() >= endOfDay;
};

const overdueDays = (record: ReplenishmentRecordSummary) => {
  const expected = new Date(record.expectedDeliveryAt || '');
  if (Number.isNaN(expected.getTime())) return 0;
  const endOfDay = new Date(
    expected.getFullYear(),
    expected.getMonth(),
    expected.getDate() + 1,
    0,
    0,
    0,
    0,
  ).getTime();
  return Math.max(1, Math.ceil((Date.now() - endOfDay) / 86400000));
};

const showExpected = (record: ReplenishmentRecordSummary) =>
  !record.arrivedAt && !record.voidedAt && !!record.expectedDeliveryAt;

const goInventory = () => {
  const pages = getCurrentPages();
  const previous = pages[pages.length - 2] as any;
  if (previous?.route === 'pages/staff-inventory/index') {
    uni.navigateBack();
    return;
  }
  uni.navigateTo({ url: '/pages/staff-inventory/index' });
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
  if (record.voidedAt) {
    return '不报销';
  }
  if (record.reimbursementStatus === 'REIMBURSED') {
    return '已报销';
  }
  if (record.reimbursementId) {
    return '报销中';
  }
  return '未报销';
};

const claimTone = (record: ReplenishmentRecordSummary) => {
  if (record.voidedAt) {
    return 'muted';
  }
  if (record.reimbursementStatus === 'REIMBURSED') {
    return 'done';
  }
  if (record.reimbursementId) {
    return 'pending';
  }
  return 'muted';
};

const loadRecords = async (reset = false) => {
  const seq = ++loadSeq;
  if (reset) {
    page.value = 1;
    records.value = [];
  }
  loading.value = true;
  errorText.value = '';
  try {
    const res: any = await listReplenishmentRecords({
      ...filterParams.value,
      page: page.value,
      pageSize,
    });
    if (seq !== loadSeq) return;
    if (res?.code === 0) {
      const list = Array.isArray(res.data?.list) ? res.data.list : [];
      records.value = reset ? list : [...records.value, ...list];
      total.value = Number(res.data?.total || 0);
    } else {
      errorText.value = res?.message || '请检查网络后重试';
    }
  } catch (error: any) {
    if (seq === loadSeq) {
      errorText.value = error?.message || '请检查网络后重试';
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
    }
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

const money = (value: number) => Number(value || 0).toFixed(2);

const fmt = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '0';
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
};

const shortageOf = (item: InventoryNeedItem) =>
  item.netShortageBaseQuantity ?? item.suggestedBaseQuantity ?? 0;

const totalInTransit = (item: InventoryNeedItem) =>
  (item.inTransitBaseQuantity || 0) +
  (item.replenishmentInTransitBaseQuantity || 0);

const needsCost = computed(() =>
  needs.value
    .filter((item) => !!item.procurementSkuId)
    .reduce((sum, item) => sum + Number(item.netShortageEstimatedCost || 0), 0),
);

const loadNeeds = async () => {
  try {
    needs.value = await listInventoryNeeds();
  } catch {
    needs.value = [];
  }
};

const copyNeeds = () => {
  const text = needs.value
    .map(
      (item) =>
        `${item.name} 还差 ${fmt(shortageOf(item))}${item.stockUnitLabel}`,
    )
    .join('\n');
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '清单已复制', icon: 'success' }),
  });
};

const refresh = async () => {
  await Promise.all([loadRecords(true), loadInTransitCount(), loadNeeds()]);
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
  if (starting.value || startingManual.value) {
    return;
  }

  const chosen: any = await new Promise((resolve) => {
    uni.chooseImage({
      count: 5,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: resolve,
      fail: () => resolve(null),
    });
  });
  const paths: string[] = chosen?.tempFilePaths || [];
  if (paths.length === 0) {
    return;
  }

  starting.value = true;
  uni.showLoading({ title: '上传中...', mask: true });
  const draftIds: string[] = [];
  let failedCount = 0;
  let failureMessage = '';
  try {
    for (let index = 0; index < paths.length; index += 1) {
      uni.showLoading({
        title: `上传 ${index + 1}/${paths.length}`,
        mask: true,
      });
      try {
        const uploaded = await uploadOrderScreenshot(paths[index]);
        const draftRes: any = await createReplenishmentDraft();
        if (draftRes?.code !== 0 || !draftRes.data?.id) {
          throw new Error(draftRes?.message || '创建补货记录失败');
        }
        const draftId = draftRes.data.id;

        uni.showLoading({
          title: `识别 ${index + 1}/${paths.length}`,
          mask: true,
        });
        const importRes: any = await importOrderScreenshots(
          draftId,
          [uploaded.url],
          [uploaded.key],
          { suppressErrorToast: true },
        );
        if (importRes?.code !== 0) {
          throw new Error(importRes?.message || '识别失败');
        }
        draftIds.push(draftId);
      } catch (error: any) {
        failedCount += 1;
        if (!failureMessage) {
          const reason = String(error?.message || '识别失败，请重试');
          failureMessage =
            paths.length > 1 ? `第 ${index + 1} 张：${reason}` : reason;
        }
        console.error('补货截图识别失败', error);
      }
    }
  } finally {
    // 先关 loading，再弹说明：反过来的话弹窗/提示会被 hideLoading 一起收掉，
    // 员工只看到「识别中」然后什么都没发生（2026-11-11 真机踩过）。
    uni.hideLoading();
    starting.value = false;
  }

  if (draftIds.length === 0) {
    uni.showModal({
      title: '识别失败',
      content: failureMessage || '没读到订单，请换一张订单详情截图重试。',
      showCancel: false,
      confirmText: '知道了',
    });
    return;
  }

  if (failedCount > 0) {
    await new Promise<void>((resolve) => {
      uni.showModal({
        title: `${failedCount} 张没识别成功`,
        content: `${failureMessage || '请重试'}\n其余 ${draftIds.length} 张可以继续核对。`,
        showCancel: false,
        confirmText: '继续核对',
        success: () => resolve(),
        fail: () => resolve(),
      });
    });
  }

  uni.navigateTo({
    url: `/pages/staff-purchasing/order-import/review?ids=${draftIds.join(',')}&mode=replenishment`,
  });
};

const startManualRecord = async () => {
  if (startingManual.value || starting.value) return;
  startingManual.value = true;
  uni.showLoading({ title: '准备手填...', mask: true });
  try {
    const draftRes: any = await createReplenishmentDraft();
    if (draftRes?.code !== 0 || !draftRes.data?.id) {
      throw new Error(draftRes?.message || '创建补货记录失败');
    }
    const manualRes: any = await createManualReplenishmentImport(
      draftRes.data.id,
    );
    if (manualRes?.code !== 0) {
      throw new Error(manualRes?.message || '创建手填记录失败');
    }
    uni.hideLoading();
    uni.navigateTo({
      url: `/pages/staff-purchasing/order-import/review?id=${draftRes.data.id}&mode=replenishment&manual=1`,
    });
  } catch (error: any) {
    uni.hideLoading();
    uni.showToast({ title: error?.message || '创建失败', icon: 'none' });
  } finally {
    startingManual.value = false;
  }
};

onShow(() => {
  void refresh();
});

onPullDownRefresh(async () => {
  await refresh();
  uni.stopPullDownRefresh();
});
</script>

<style scoped lang="scss">
.replenishment-page {
  min-height: 100vh;
  background: #fbfcf7;
  padding: 24rpx 28rpx 60rpx;
}

.needs-card {
  margin-bottom: 20rpx;
  padding: 20rpx 22rpx;
  border-radius: 20rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
}

.needs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.needs-copy {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.needs-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.needs-sub {
  font-size: 24rpx;
  color: #5f6f64;
}

.needs-toggle {
  font-size: 24rpx;
  color: #1e3a2f;
}

.needs-list {
  margin-top: 12rpx;
  border-top: 1rpx solid #f1f4ee;
  padding-top: 8rpx;
}

.needs-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12rpx;
  padding: 8rpx 0;
}

.needs-name {
  font-size: 26rpx;
  color: #1e3a2f;
}

.needs-meta {
  font-size: 24rpx;
  color: #5f6f64;
}

.needs-transit {
  color: #5f6f64;
}

.needs-more {
  display: block;
  padding: 8rpx 0 0;
  font-size: 24rpx;
  color: #1e3a2f;
}

.needs-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8rpx;
}

.needs-copy-btn {
  font-size: 24rpx;
  color: #1e3a2f;
  padding: 8rpx 0 8rpx 16rpx;
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

.filter-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.filters {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex: 1;
  min-width: 0;
}

.filter-chip {
  flex: none;
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: #f1efe5;
  border: 1rpx solid transparent;
}

.filter-chip text {
  font-size: 24rpx;
  color: #5b5748;
}

.manual-btn {
  flex: none;
  margin: 0;
  padding: 0 20rpx;
  height: 56rpx;
  line-height: 54rpx;
  border-radius: 999rpx;
  background: #f4d58d;
  border: 1rpx solid #e2c47c;
  color: #3d3423;
  font-size: 24rpx;
  font-weight: 700;
}

.manual-btn::after {
  border: none;
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
  font-size: 24rpx;
  color: #6b6653;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.badge {
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
}

.badge.expect {
  padding-left: 0;
  padding-right: 0;
  background: transparent;
  color: #5f6f64;
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

.retry-btn {
  margin-top: 16rpx;
  padding: 0 36rpx;
  height: 68rpx;
  line-height: 68rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 26rpx;
}
</style>
