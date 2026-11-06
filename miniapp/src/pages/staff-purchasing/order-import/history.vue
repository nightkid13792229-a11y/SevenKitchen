<template>
  <view class="history-page">
    <view v-if="loading" class="loading">加载中...</view>

    <view v-else-if="rows.length === 0" class="empty">
      <text class="empty-title">
        {{ failed ? '识别记录没加载出来' : '这个清单还没有识别记录' }}
      </text>
      <text class="empty-desc">
        {{ failed
          ? '网络或服务出了点问题，重试一下。'
          : '在采购清单详情点「AI 识别订单截图」，识别过的订单都会留在这里。' }}
      </text>
      <text v-if="failed" class="retry-link" @tap="load">重新加载</text>
    </view>

    <template v-else>
      <view class="page-tip">
        <text class="tip-main">共 {{ rows.length }} 笔 · 已生成 {{ confirmedCount }} 笔</text>
        <text class="tip-sub">只读记录：这里看得到原始截图和当时识别的内容，不会改动采购单。</text>
      </view>

      <view v-for="item in rows" :key="item.id" class="card">
        <view class="card-head">
          <view class="head-main">
            <text class="head-channel" :class="{ missing: !item.channel }">
              {{ item.channel || '渠道待确认' }}
            </text>
            <text class="head-time">{{ formatDateTime(item.orderTime || item.createdAt) }}</text>
          </view>
          <text class="status" :class="statusOf(item).tone">{{ statusOf(item).text }}</text>
        </view>

        <view class="amount-row">
          <text class="amount-label">{{ amountLabel(item) }}</text>
          <text class="amount-value">{{ amountText(item) }}</text>
        </view>

        <scroll-view
          v-if="(item.imageUrls || []).length > 0"
          scroll-x
          class="shots"
          :show-scrollbar="false"
        >
          <image
            v-for="(url, index) in item.imageUrls"
            :key="url + index"
            class="shot"
            :src="url"
            mode="aspectFill"
            @tap="previewShot(item, index)"
          />
        </scroll-view>

        <view v-if="(item.lines || []).length > 0" class="lines">
          <view v-for="line in item.lines" :key="line.id" class="line">
            <view class="line-main">
              <text class="line-name">{{ line.rawName || '未命名商品' }}</text>
              <text class="line-meta">{{ lineMeta(line) }}</text>
            </view>
            <text class="line-amount">¥{{ money(line.lineTotal) }}</text>
            <text class="line-state" :class="lineStateTone(line)">{{ lineStateText(line) }}</text>
          </view>
        </view>

        <view v-if="feeText(item)" class="fee-row">
          <text class="fee-text">{{ feeText(item) }}</text>
        </view>

        <view class="card-foot">
          <text class="foot-text">{{ footText(item) }}</text>
          <text
            v-if="item.status === 'DRAFT' && canContinueReview(listStatus)"
            class="foot-action"
            @tap="goReview"
          >去核对 ›</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { getOrderImports, getPurchaseListDetail } from '../api/purchasing';
import { formatDateTime } from '../../../utils/date';
import {
  canContinueReview,
  historyAmount,
  historyLineStats,
  historyStatus,
  sortHistoryImports,
  type ImportHistoryLine,
  type ImportHistoryRow,
} from './history';

const listId = ref('');
const listStatus = ref('');
const rows = ref<ImportHistoryRow[]>([]);
const loading = ref(true);
const failed = ref(false);
let loadedOnce = false;

const confirmedCount = computed(
  () => rows.value.filter((item) => item.status === 'CONFIRMED').length,
);

onLoad((options: Record<string, string>) => {
  listId.value = String(options?.id || '');
  void load();
});

// 从核对页回来：草稿可能刚被确认，状态要跟着变
onShow(() => {
  if (loadedOnce) void load();
});

async function load() {
  if (!listId.value) {
    loading.value = false;
    failed.value = true;
    return;
  }
  if (!loadedOnce) loading.value = true;
  try {
    const res: any = await getOrderImports(listId.value);
    if (res.code !== 0) throw new Error(res.message || '加载失败');
    rows.value = sortHistoryImports(res.data || []);
    failed.value = false;
  } catch (error: any) {
    failed.value = true;
    uni.showToast({ title: error?.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
    loadedOnce = true;
  }

  // 清单状态只用来判断草稿还能不能回核对；拿不到就按「不能」处理，别给死入口
  try {
    const listRes: any = await getPurchaseListDetail(listId.value);
    if (listRes.code === 0) listStatus.value = listRes.data?.status || '';
  } catch {
    listStatus.value = '';
  }
}

function statusOf(item: ImportHistoryRow) {
  return historyStatus(item);
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '0.00';
  }
  return Number(value).toFixed(2);
}

function amountText(item: ImportHistoryRow) {
  const amount = historyAmount(item);
  return amount === null ? '未读到' : `¥${money(amount)}`;
}

function amountLabel(item: ImportHistoryRow) {
  if (item.paid !== null && item.paid !== undefined) return '凭证实付';
  if (item.subtotal !== null && item.subtotal !== undefined) return '商品小计';
  return '按行合计';
}

function lineMeta(line: ImportHistoryLine) {
  const qty = `${line.qty ?? '-'}${line.unit || ''}`;
  const price = Number(line.unitPrice);
  return Number.isFinite(price) && line.unitPrice !== null && line.unitPrice !== undefined
    ? `${qty} × ¥${price.toFixed(2)}`
    : qty;
}

function lineStateText(line: ImportHistoryLine) {
  if (line.isPersonal) return '个人采购';
  return line.state === 'MATCHED' ? '已匹配' : '待处理';
}

function lineStateTone(line: ImportHistoryLine) {
  if (line.isPersonal) return 'personal';
  return line.state === 'MATCHED' ? 'ok' : 'warn';
}

function feeText(item: ImportHistoryRow) {
  const parts: string[] = [];
  if (item.shippingFee !== null && item.shippingFee !== undefined) {
    parts.push(`运费 ¥${money(item.shippingFee)}`);
  }
  if (item.packagingFee !== null && item.packagingFee !== undefined) {
    parts.push(`包装 ¥${money(item.packagingFee)}`);
  }
  return parts.join(' · ');
}

function footText(item: ImportHistoryRow) {
  const stats = historyLineStats(item);
  if (item.status === 'CONFIRMED') {
    return item.confirmedAt
      ? `${formatDateTime(item.confirmedAt)} 确认生成 · 共 ${stats.total} 行`
      : `已生成采购记录 · 共 ${stats.total} 行`;
  }
  return stats.pending > 0
    ? `共 ${stats.total} 行 · 待处理 ${stats.pending} 行`
    : `共 ${stats.total} 行`;
}

function previewShot(item: ImportHistoryRow, index: number) {
  const urls = item.imageUrls || [];
  if (urls.length === 0) return;
  uni.previewImage({ urls, current: urls[index] });
}

function goReview() {
  uni.navigateTo({
    url: `/pages/staff-purchasing/order-import/review?id=${listId.value}`,
  });
}
</script>

<style scoped>
.history-page {
  min-height: 100vh;
  background: #f3eddd;
  padding: 20rpx 24rpx 80rpx;
  box-sizing: border-box;
}

.loading {
  text-align: center;
  color: #6b6653;
  padding-top: 120rpx;
}

.empty {
  text-align: center;
  color: #6b6653;
  padding-top: 120rpx;
}

.empty-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.empty-desc {
  display: block;
  margin: 12rpx 0 24rpx;
  font-size: 24rpx;
  color: #6b6653;
  line-height: 1.5;
}

.retry-link {
  display: block;
  font-size: 22rpx;
  color: #7a5c28;
  text-decoration: underline;
}

.page-tip {
  background: #fbfcf7;
  border: 1rpx solid #e7eadf;
  border-radius: 20rpx;
  padding: 18rpx 20rpx;
  margin-bottom: 16rpx;
}

.tip-main {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.tip-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 21rpx;
  color: #8a8574;
  line-height: 1.5;
}

.card {
  background: #fbfcf7;
  border: 1rpx solid #e2dcc9;
  border-radius: 22rpx;
  padding: 22rpx 22rpx 16rpx;
  margin-bottom: 18rpx;
  box-shadow: 0 2rpx 10rpx rgba(30, 58, 47, 0.04);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.head-main {
  flex: 1;
  min-width: 0;
}

.head-channel {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.head-channel.missing {
  color: #b4453a;
}

.head-time {
  display: block;
  margin-top: 4rpx;
  font-size: 21rpx;
  color: #8a8574;
}

.status {
  flex: 0 0 auto;
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: 10rpx;
  white-space: nowrap;
}

.status.done {
  background: #e8f0e6;
  color: #2f6b4f;
}

.status.pending {
  background: #f6ecd8;
  color: #7a5c28;
}

.amount-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 14rpx;
  padding: 12rpx 16rpx;
  background: #f4f0e2;
  border-radius: 14rpx;
}

.amount-label {
  font-size: 21rpx;
  color: #6b6653;
}

.amount-value {
  font-size: 30rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.shots {
  margin-top: 14rpx;
  white-space: nowrap;
}

.shot {
  display: inline-block;
  width: 132rpx;
  height: 132rpx;
  margin-right: 12rpx;
  border-radius: 12rpx;
  border: 1rpx solid #e2dcc9;
  background: #e7e1cf;
}

.lines {
  margin-top: 12rpx;
}

.line {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 0;
  border-top: 1rpx dashed #e7e2d2;
}

.line-main {
  flex: 1;
  min-width: 0;
}

.line-name {
  display: block;
  font-size: 24rpx;
  color: #26261f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-meta {
  display: block;
  margin-top: 2rpx;
  font-size: 20rpx;
  color: #8a8574;
}

.line-amount {
  flex: 0 0 auto;
  font-size: 24rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.line-state {
  flex: 0 0 auto;
  font-size: 19rpx;
  padding: 3rpx 10rpx;
  border-radius: 8rpx;
  white-space: nowrap;
}

.line-state.ok {
  background: #e8f0e6;
  color: #2f6b4f;
}

.line-state.warn {
  background: #f8e6e2;
  color: #b4453a;
}

.line-state.personal {
  background: #ece7f4;
  color: #6a4f96;
}

.fee-row {
  margin-top: 8rpx;
  padding-top: 10rpx;
  border-top: 1rpx dashed #e7e2d2;
}

.fee-text {
  font-size: 20rpx;
  color: #6b6653;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 10rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #efe9d8;
}

.foot-text {
  flex: 1;
  min-width: 0;
  font-size: 20rpx;
  color: #8a8574;
}

.foot-action {
  flex: 0 0 auto;
  font-size: 22rpx;
  font-weight: 600;
  color: #2f6b4f;
}
</style>
