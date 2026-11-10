<template>
  <view class="replenishment-detail-page">
    <view v-if="loading" class="state-card">
      <text>正在加载补货记录...</text>
    </view>

    <view v-else-if="errorText" class="state-card">
      <text class="state-title">{{ errorText }}</text>
      <button class="retry-btn" @tap="load">重试</button>
    </view>

    <template v-else-if="record">
      <view class="head-card">
        <view class="head-top">
          <text class="head-channel">{{ record.channel || '渠道未确认' }}</text>
          <text v-if="record.orderNo" class="head-order">#{{ record.orderNo }}</text>
        </view>
        <view class="badges">
          <text class="badge" :class="arrivalTone">{{ arrivalText }}</text>
          <text class="badge" :class="claimTone">{{ claimText }}</text>
          <text v-if="isOverdue" class="badge overdue">超期未到货</text>
        </view>
        <text class="head-date">下单 {{ formatDateTime(record.orderPlacedAt || record.createdAt) }}</text>
      </view>

      <view class="amount-card">
        <view class="amount-main">
          <text class="amount-label">本次报销</text>
          <text class="amount-value">¥{{ money(record.reimbursementAmount ?? 0) }}</text>
        </view>
        <view class="amount-rows">
          <view class="amount-row">
            <text>订单实付</text>
            <text>¥{{ money(record.paidAmount ?? 0) }}</text>
          </view>
          <view v-if="Number(record.personalAmount || 0) > 0" class="amount-row muted">
            <text>含个人商品</text>
            <text>¥{{ money(record.personalAmount) }}</text>
          </view>
          <view v-if="Number(record.shippingFee || 0) > 0" class="amount-row muted">
            <text>运费</text>
            <text>¥{{ money(record.shippingFee) }}</text>
          </view>
          <view v-if="Number(record.packagingFee || 0) > 0" class="amount-row muted">
            <text>包装费</text>
            <text>¥{{ money(record.packagingFee) }}</text>
          </view>
          <view v-if="Number(record.discountAmount || 0) !== 0" class="amount-row muted">
            <text>优惠/调整</text>
            <text>-¥{{ money(Math.abs(Number(record.discountAmount))) }}</text>
          </view>
        </view>
        <view v-if="record.reimbursement" class="claim-line" @tap="viewClaim">
          <text>报销单 {{ record.reimbursement.claimNumber }} · {{ claimStatusText(record.reimbursement.status) }}</text>
          <text>›</text>
        </view>
      </view>

      <view class="info-card">
        <view class="info-row">
          <text class="info-label">预计到货</text>
          <text class="info-value">{{ formatDate(record.expectedDeliveryAt) }}</text>
        </view>
        <view v-if="record.arrivedAt" class="info-row">
          <text class="info-label">到货时间</text>
          <text class="info-value">{{ formatDateTime(record.arrivedAt) }}</text>
        </view>
        <view v-if="record.voidedAt" class="info-row">
          <text class="info-label">作废时间</text>
          <text class="info-value">{{ formatDateTime(record.voidedAt) }}</text>
        </view>
      </view>

      <view class="section-card">
        <view class="section-head">
          <text class="section-title">商品明细</text>
          <text class="section-count">{{ (record.items || []).length }} 项</text>
        </view>

        <view v-if="(record.items || []).length === 0" class="empty-line">
          <text>没有商品明细</text>
        </view>

        <view v-else class="item-list">
          <view v-for="item in record.items" :key="item.id" class="item-row">
            <view class="item-main">
              <text class="item-name">{{ item.ingredientName || item.ingredient?.name || '原料' }}</text>
              <text class="item-meta">
                {{ item.procurementSkuName || item.quantityUnit }}
                <text v-if="item.productModel"> · {{ item.productModel }}</text>
              </text>
            </view>
            <view class="item-right">
              <text class="item-qty">{{ formatQuantity(item.quantityNeeded) }}{{ item.quantityUnit }}</text>
              <text class="item-cost">¥{{ money(item.estimatedCost) }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="(record.records || []).length > 0" class="section-card">
        <view class="section-head">
          <text class="section-title">采购记录</text>
          <text class="section-count">{{ record.records.length }} 条</text>
        </view>
        <view class="record-list">
          <view v-for="item in record.records" :key="item.id" class="record-row">
            <view class="record-main">
              <text class="record-name">{{ item.procurementSkuName || item.ingredientName }}</text>
              <text class="record-meta">{{ item.purchaseChannelName || item.purchaseChannel || '未填渠道' }}</text>
            </view>
            <view class="record-right">
              <text class="record-qty">{{ formatQuantity(item.actualBaseQuantity) }}{{ item.actualBaseUnit || '' }}</text>
              <text class="record-cost">¥{{ money(item.actualCost) }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="imports.length > 0" class="section-card">
        <view class="section-head">
          <text class="section-title">订单截图</text>
          <text class="section-count">{{ imports.length }} 张</text>
        </view>
        <view class="shots">
          <image
            v-for="(shot, index) in importShots"
            :key="index"
            :src="shot"
            class="shot"
            mode="aspectFill"
            @tap="previewShot(shot)"
          />
        </view>
      </view>

      <view class="actions">
        <button v-if="canArrive" class="action-btn primary" :loading="acting" @tap="confirmArrival">
          已到货
        </button>
        <button v-if="canEdit" class="action-btn" @tap="goEdit">
          修改
        </button>
        <button v-if="canRevokeArrival" class="action-btn" :loading="acting" @tap="revokeArrival">
          撤销到货
        </button>
        <button v-if="canReimburse" class="action-btn" @tap="goReimburse">
          去报销
        </button>
        <button v-if="canVoid" class="action-btn danger" :loading="acting" @tap="voidRecord">
          作废
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  confirmReplenishmentArrival,
  getReplenishmentRecord,
  revokeReplenishmentArrival,
  voidReplenishmentRecord,
} from '../api/purchasing';

const recordId = ref('');
const record = ref<any>(null);
const loading = ref(true);
const acting = ref(false);
const errorText = ref('');

const money = (value: unknown) => Number(value || 0).toFixed(2);
const formatQuantity = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '0';
  }
  return String(Number(number.toFixed(3)));
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return '未填';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未填';
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '未填';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未填';
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hours}:${minutes}`;
};

const isOverdue = computed(() => {
  if (!record.value || record.value.arrivedAt || record.value.voidedAt) {
    return false;
  }
  const expected = record.value.expectedDeliveryAt
    ? new Date(record.value.expectedDeliveryAt).getTime()
    : NaN;
  return Number.isFinite(expected) && Date.now() > expected;
});

const arrivalText = computed(() => {
  if (!record.value) return '';
  if (record.value.voidedAt) return '已作废';
  return record.value.arrivedAt ? '已到货' : '在途';
});

const arrivalTone = computed(() => {
  if (!record.value) return 'muted';
  if (record.value.voidedAt) return 'muted';
  return record.value.arrivedAt ? 'done' : 'in-transit';
});

const claimText = computed(() => {
  if (!record.value) return '';
  if (record.value.reimbursement?.status === 'REIMBURSED') return '已报销';
  if (record.value.reimbursementId) return '报销中';
  return '未报销';
});

const claimTone = computed(() => {
  if (!record.value) return 'muted';
  if (record.value.reimbursement?.status === 'REIMBURSED') return 'done';
  if (record.value.reimbursementId) return 'pending';
  return 'muted';
});

const claimStatusText = (status?: string | null) => {
  const map: Record<string, string> = {
    PENDING_REVIEW: '待审核',
    REIMBURSED: '已报销',
    REJECTED: '已驳回',
    REQUIRES_RESUBMIT: '需重新提交',
  };
  return map[status || ''] || status || '';
};

const imports = computed(() => (Array.isArray(record.value?.imports) ? record.value.imports : []));
const importShots = computed(() =>
  imports.value.flatMap((item: any) => (Array.isArray(item.imageUrls) ? item.imageUrls : [])),
);

const canArrive = computed(
  () => !!record.value && !record.value.arrivedAt && !record.value.voidedAt,
);
const canVoid = computed(
  () =>
    !!record.value &&
    !record.value.arrivedAt &&
    !record.value.voidedAt &&
    !record.value.reimbursementId,
);
const canEdit = computed(
  () =>
    !!record.value &&
    !record.value.arrivedAt &&
    !record.value.voidedAt &&
    !record.value.reimbursementId,
);
const canRevokeArrival = computed(
  () =>
    !!record.value &&
    !!record.value.arrivedAt &&
    !record.value.voidedAt &&
    !record.value.reimbursementId,
);
const canReimburse = computed(
  () => !!record.value && !record.value.voidedAt && !record.value.reimbursementId,
);

const load = async () => {
  if (!recordId.value) {
    loading.value = false;
    errorText.value = '缺少补货记录 id';
    return;
  }
  loading.value = true;
  errorText.value = '';
  try {
    const res: any = await getReplenishmentRecord(recordId.value);
    if (res?.code === 0 && res.data) {
      record.value = res.data;
    } else {
      errorText.value = res?.message || '加载失败';
    }
  } catch (error: any) {
    errorText.value = error?.message || '加载失败';
  } finally {
    loading.value = false;
  }
};

const withActing = async (task: () => Promise<void>) => {
  if (acting.value) return;
  acting.value = true;
  try {
    await task();
  } finally {
    acting.value = false;
  }
};

const confirmArrival = () => {
  uni.showModal({
    title: '确认到货',
    content: '确认这批货已经收到？确认后整单进入库存。',
    success: async (res) => {
      if (!res.confirm) return;
      await withActing(async () => {
        try {
          const response: any = await confirmReplenishmentArrival(recordId.value);
          if (response?.code !== 0) {
            throw new Error(response?.message || '确认失败');
          }
          uni.showToast({ title: '已确认到货', icon: 'success' });
          await load();
        } catch (error: any) {
          uni.showToast({ title: error?.message || '确认失败', icon: 'none' });
        }
      });
    },
  });
};

const revokeArrival = () => {
  uni.showModal({
    title: '撤销到货',
    content: '撤销后这批货退回在途，库存会扣回；已经被用掉的货不能撤销。',
    success: async (res) => {
      if (!res.confirm) return;
      await withActing(async () => {
        try {
          const response: any = await revokeReplenishmentArrival(recordId.value);
          if (response?.code !== 0) {
            throw new Error(response?.message || '撤销失败');
          }
          uni.showToast({ title: '已撤销到货', icon: 'success' });
          await load();
        } catch (error: any) {
          uni.showToast({ title: error?.message || '撤销失败', icon: 'none' });
        }
      });
    },
  });
};

const voidRecord = () => {
  uni.showModal({
    title: '作废补货记录',
    content: '确认取消这笔补货？作废后不再计入在途，也不能报销。',
    confirmColor: '#b4453a',
    success: async (res) => {
      if (!res.confirm) return;
      await withActing(async () => {
        try {
          const response: any = await voidReplenishmentRecord(recordId.value);
          if (response?.code !== 0) {
            throw new Error(response?.message || '作废失败');
          }
          uni.showToast({ title: '已作废', icon: 'success' });
          await load();
        } catch (error: any) {
          uni.showToast({ title: error?.message || '作废失败', icon: 'none' });
        }
      });
    },
  });
};

const goEdit = () => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/replenishment/edit?id=${recordId.value}`,
  });
};

const goReimburse = () => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/reimbursement/submit?purchaseListId=${recordId.value}`,
  });
};

const viewClaim = () => {
  if (!record.value?.reimbursement?.id) return;
  uni.navigateTo({
    url: `/pages/staff-purchasing/reimbursement/detail?id=${record.value.reimbursement.id}`,
  });
};

const previewShot = (url: string) => {
  if (!url) return;
  uni.previewImage({ urls: importShots.value, current: url });
};

onLoad((options: Record<string, string>) => {
  recordId.value = String(options?.id || '');
  void load();
});

onShow(() => {
  if (recordId.value && record.value) {
    void load();
  }
});
</script>

<style scoped lang="scss">
.replenishment-detail-page {
  min-height: 100vh;
  background: #fbfcf7;
  padding: 24rpx 28rpx 180rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.state-card {
  margin-top: 120rpx;
  padding: 60rpx 24rpx;
  background: #ffffff;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
}

.state-title {
  font-size: 28rpx;
  color: #3c3a32;
  font-weight: 700;
}

.retry-btn {
  padding: 0 36rpx;
  height: 68rpx;
  line-height: 68rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 26rpx;
}

.head-card {
  padding: 26rpx;
  border-radius: 20rpx;
  background: #1e3a2f;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.head-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18rpx;
}

.head-channel {
  font-size: 34rpx;
  font-weight: 800;
  color: #f3eddd;
}

.head-order {
  font-size: 22rpx;
  color: rgba(243, 237, 221, 0.7);
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
}

.badge.in-transit {
  background: rgba(255, 196, 92, 0.2);
  color: #ffd89a;
}

.badge.done {
  background: rgba(151, 209, 168, 0.2);
  color: #bfe6c9;
}

.badge.pending {
  background: rgba(151, 184, 255, 0.2);
  color: #c6d8ff;
}

.badge.muted {
  background: rgba(243, 237, 221, 0.14);
  color: rgba(243, 237, 221, 0.75);
}

.badge.overdue {
  background: rgba(255, 128, 120, 0.2);
  color: #ffb3ad;
}

.head-date {
  font-size: 22rpx;
  color: rgba(243, 237, 221, 0.68);
}

.amount-card,
.info-card,
.section-card {
  padding: 24rpx 26rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid #e7e3d6;
}

.amount-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #f0eee5;
}

.amount-label {
  font-size: 26rpx;
  color: #5b5748;
}

.amount-value {
  font-size: 44rpx;
  font-weight: 800;
  color: #1e3a2f;
}

.amount-rows {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding-top: 16rpx;
}

.amount-row {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: #3c3a32;
}

.amount-row.muted {
  color: #6b6653;
}

.claim-line {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #f0eee5;
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: #2a4a7a;
}

.info-card {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
}

.info-label {
  color: #6b6653;
}

.info-value {
  color: #3c3a32;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.section-count {
  font-size: 22rpx;
  color: #6b6653;
}

.item-list,
.record-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.item-row,
.record-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #f5f3ea;
}

.item-row:last-child,
.record-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.item-main,
.record-main {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}

.item-name,
.record-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #3c3a32;
}

.item-meta,
.record-meta {
  font-size: 22rpx;
  color: #6b6653;
}

.item-right,
.record-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  flex-shrink: 0;
}

.item-qty,
.record-qty {
  font-size: 24rpx;
  color: #3c3a32;
}

.item-cost,
.record-cost {
  font-size: 24rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.empty-line {
  padding: 20rpx 0;
  font-size: 24rpx;
  color: #6b6653;
}

.shots {
  display: flex;
  gap: 14rpx;
  flex-wrap: wrap;
}

.shot {
  width: 160rpx;
  height: 220rpx;
  border-radius: 12rpx;
  background: #f1efe5;
}

.actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
  background: #fbfcf7;
  border-top: 1rpx solid #e7e3d6;
  display: flex;
  gap: 14rpx;
}

.action-btn {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 16rpx;
  font-size: 28rpx;
  background: #f1efe5;
  color: #1e3a2f;
}

.action-btn.primary {
  background: #1e3a2f;
  color: #f3eddd;
}

.action-btn.danger {
  background: #fdecea;
  color: #a12a26;
}
</style>
