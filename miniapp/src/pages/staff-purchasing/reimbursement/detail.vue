<template>
  <view class="reimbursement-detail-page">
    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <view v-else-if="reimbursement" class="detail-content">
      <!-- ① 单据头：谁、什么时候、什么状态 -->
      <view class="section header-card">
        <view class="card-header">
          <text class="claim-number">{{ reimbursement.claimNumber }}</text>
          <StaffStatusBadge
            :label="statusText"
            :tone="statusTone"
            size="lg"
          />
        </view>
        <view class="submit-line">
          <text class="submitter">{{ submitterName }}</text>
          <text class="dot">·</text>
          <text class="submit-time">{{ formatFullDateTime(reimbursement.submittedAt) }}</text>
          <text v-if="waitingText" class="waiting">{{ waitingText }}</text>
        </view>
        <view v-if="revertedNotice" class="revert-notice">
          <text>{{ revertedNotice }}</text>
        </view>
        <view v-if="rejectNotice" class="reject-notice">
          <text>{{ rejectNotice }}</text>
        </view>
      </view>

      <!-- ② 审核摘要：审核员最先要看的三个数 + 风险 -->
      <view class="section summary-card">
        <view class="summary-main">
          <text class="summary-label">报销金额</text>
          <text class="summary-amount">¥{{ money(reimbursement.totalActualCost) }}</text>
        </view>

        <view class="summary-grid">
          <view class="summary-cell">
            <text class="cell-label">凭证金额</text>
            <text class="cell-value">{{ voucherAmountText }}</text>
          </view>
          <view class="summary-cell">
            <text class="cell-label">差额</text>
            <text class="cell-value" :class="differenceClass">{{ differenceText }}</text>
          </view>
          <view class="summary-cell">
            <text class="cell-label">转账凭证</text>
            <text class="cell-value">{{ proofCountText }}</text>
          </view>
        </view>

        <view v-if="summaryAlerts.length > 0" class="summary-alerts">
          <view
            v-for="(alert, index) in summaryAlerts"
            :key="index"
            class="alert-line"
            :class="alert.tone"
          >
            <text class="alert-dot">●</text>
            <text class="alert-text">{{ alert.text }}</text>
          </view>
        </view>

        <text v-if="differenceNote" class="difference-note">差额说明：{{ differenceNote }}</text>
      </view>

      <!-- ③ 金额构成：一个数怎么来的 -->
      <view class="section">
        <view class="section-header">
          <text class="section-title">金额构成</text>
        </view>
        <view class="breakdown">
          <view class="breakdown-row">
            <text class="breakdown-label">采购 {{ auditPurchaseRecords.length }} 条</text>
            <text class="breakdown-value">¥{{ purchaseRecordsTotal }}</text>
          </view>
          <view v-if="shippingFee > 0" class="breakdown-row">
            <text class="breakdown-label">平台运费</text>
            <text class="breakdown-value">¥{{ money(shippingFee) }}</text>
          </view>
          <view v-if="packagingFee > 0" class="breakdown-row">
            <text class="breakdown-label">平台打包费</text>
            <text class="breakdown-value">¥{{ money(packagingFee) }}</text>
          </view>
          <view
            v-for="(fee, index) in customFees"
            :key="`fee-${index}`"
            class="breakdown-row"
          >
            <text class="breakdown-label">{{ customFeeLabel(fee) }}</text>
            <text class="breakdown-value">¥{{ money(fee.amount) }}</text>
          </view>
          <view class="breakdown-row total">
            <text class="breakdown-label">报销总额</text>
            <text class="breakdown-value">¥{{ money(reimbursement.totalActualCost) }}</text>
          </view>
        </view>
        <text v-if="breakdownMismatchText" class="breakdown-hint">{{ breakdownMismatchText }}</text>
      </view>

      <!-- ④ 付款凭证（审核员自己的证据，前置） -->
      <view class="section">
        <view class="section-header">
          <text class="section-title">报销转账凭证</text>
          <text class="section-hint">{{ proofPhotos.length }} 张</text>
        </view>

        <view v-if="proofPhotos.length > 0" class="photos-grid">
          <view
            v-for="(url, index) in proofPhotos"
            :key="`proof-${index}`"
            class="photo-item"
            @tap="previewPaymentProof(url)"
          >
            <image :src="url" mode="aspectFill" />
          </view>
        </view>

        <view v-else class="empty-block">
          <text class="empty-text">还没有上传报销转账凭证</text>
          <text v-if="canReview" class="empty-sub">付款后把转账截图传上来，再点「审核通过」才算完成</text>
        </view>

        <view v-if="canManageProof" class="inline-actions">
          <button
            class="ghost-btn"
            :loading="uploading"
            :disabled="uploading"
            @tap="uploadProof"
          >
            {{ proofPhotos.length > 0 ? '继续添加' : '上传报销转账凭证' }}
          </button>
          <button
            v-if="proofPhotos.length > 0"
            class="ghost-btn danger"
            :disabled="uploading"
            @tap="clearProof"
          >
            清空
          </button>
        </view>
      </view>

      <!-- ⑤ 采购付款凭证（员工付给商家的发票 / 订单截图） -->
      <view v-if="receiptPhotos.length > 0" class="section">
        <view class="section-header">
          <text class="section-title">采购付款凭证</text>
          <text class="section-hint">{{ receiptPhotos.length }} 张</text>
        </view>
        <view class="photos-grid">
          <view
            v-for="(photo, index) in receiptPhotos"
            :key="`receipt-${index}`"
            class="photo-item-wrapper"
          >
            <view class="photo-item" @tap="previewReceipt(photo)">
              <image :src="photo.url" mode="aspectFill" />
            </view>
            <view
              v-if="canEditReceipts && photo.removableIndex >= 0"
              class="delete-btn"
              @tap.stop="removeReceiptPhoto(photo.removableIndex)"
            >
              <text>×</text>
            </view>
          </view>
        </view>
        <view v-if="canEditReceipts" class="inline-actions">
          <button class="ghost-btn" :disabled="uploadingReceipts" @tap="appendReceiptPhotos">
            补充发票 / 截图
          </button>
        </view>
      </view>

      <!-- ⑥ 采购明细 -->
      <view class="section">
        <view class="section-header">
          <text class="section-title">采购明细</text>
          <text class="section-hint">{{ auditPurchaseRecords.length }} 条 · ¥{{ purchaseRecordsTotal }}</text>
        </view>

        <text v-if="pendingPriceChangeCount > 0" class="pending-price-hint">
          {{ pendingPriceChangeCount }} 项调价没能自动生效，标「需放行」；点一下「放行」价格才会更新。
        </text>

        <view v-if="auditPurchaseRecords.length === 0" class="empty-block">
          <text class="empty-text">没有关联采购记录</text>
        </view>

        <view v-else class="record-list">
          <view
            v-for="record in auditPurchaseRecords"
            :key="record.id"
            class="record-card"
          >
            <view class="record-head">
              <view class="record-title-wrap">
                <text class="record-name">{{ recordTitle(record) }}</text>
                <text v-if="recordSubtitle(record)" class="record-sub">{{ recordSubtitle(record) }}</text>
              </view>
              <text class="record-cost">¥{{ money(record.actualCost) }}</text>
            </view>

            <view class="record-meta">
              <text class="meta-chip">{{ record.purchaseChannelName || record.purchaseChannel || '未填渠道' }}</text>
              <text class="meta-chip">{{ formatShortDate(record.purchasedAt) }}</text>
              <text v-if="record.productModel" class="meta-chip">{{ record.productModel }}</text>
              <text v-if="isManualRecord(record)" class="meta-chip warn">无订单截图</text>
              <text
                v-if="recordPriceTag(record)"
                class="meta-chip"
                :class="recordPriceTagTone(record)"
              >{{ recordPriceTag(record) }}</text>
              <text
                v-if="canRelease(record)"
                class="meta-chip release"
                @tap.stop="releaseHeldChange(record)"
              >放行</text>
            </view>

            <view class="record-metrics">
              <view class="metric">
                <text class="metric-label">实际采购</text>
                <text class="metric-value">{{ record.purchasedQuantityText }}</text>
              </view>
              <view class="metric">
                <text class="metric-label">折算单价</text>
                <text class="metric-value">{{ record.unitPriceText }}</text>
              </view>
              <view class="metric">
                <text class="metric-label">上次单价</text>
                <text class="metric-value muted">{{ record.previousUnitPriceText }}</text>
              </view>
              <view class="metric metric-delta" @tap.stop="openPriceCompare(record)">
                <text class="metric-label">涨跌</text>
                <view class="metric-delta-line">
                  <text class="metric-value" :class="recordDeltaTone(record)">
                    {{ recordDeltaText(record) }}
                  </text>
                  <text class="metric-help">?</text>
                </view>
              </view>
            </view>

            <text v-if="record.notes" class="record-note">备注：{{ record.notes }}</text>
          </view>
        </view>
      </view>

      <!-- ⑧ 审核记录 -->
      <view class="section">
        <view class="section-header">
          <text class="section-title">处理进度</text>
        </view>
        <view class="timeline">
          <view
            v-for="(item, index) in timeline"
            :key="index"
            class="timeline-item"
            :class="item.tone"
          >
            <view class="timeline-dot" />
            <view class="timeline-body">
              <text class="timeline-title">{{ item.title }}</text>
              <text class="timeline-desc">{{ item.desc }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view v-else class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败</text>
    </view>

    <!-- 底部操作栏 -->
    <view v-if="reimbursement && hasBottomActions" class="bottom-actions">
      <text v-if="canReview && !canApprove" class="bottom-hint">
        先上传报销转账凭证，才能点「审核通过」
      </text>
      <text v-else-if="canReview && isSelfReview && !hasPaymentProof" class="bottom-hint">
        这是你自己的单：不需要转账凭证，直接通过即可（会记「本人审核」）
      </text>

      <view class="action-row">
        <template v-if="canReview">
          <button class="action-btn reject" :disabled="submitting" @tap="openSheet('reject')">
            驳回
          </button>
          <button
            class="action-btn approve"
            :class="{ disabled: !canApprove }"
            :disabled="submitting || !canApprove"
            @tap="openSheet('approve')"
          >
            审核通过
          </button>
        </template>

        <template v-else-if="canRevert">
          <button class="action-btn revert" :disabled="submitting" @tap="openSheet('revert')">
            撤销审核
          </button>
        </template>

        <template v-else-if="canWithdraw || canResubmit">
          <button
            v-if="canWithdraw"
            class="action-btn withdraw"
            :loading="withdrawing"
            :disabled="withdrawing"
            @tap="withdrawReimbursement"
          >
            撤回报销
          </button>
          <button
            v-if="canResubmit"
            class="action-btn resubmit"
            :loading="resubmitting"
            :disabled="resubmitting"
            @tap="resubmit"
          >
            重新提交
          </button>
        </template>
      </view>
    </view>

    <!-- 驳回弹层 -->
    <view v-if="activeSheet === 'reject'" class="sheet-mask" @tap="closeSheet">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">驳回报销单</text>
        <text class="sheet-sub">员工会看到这段说明，改完可以重新提交</text>

        <view class="reason-chips">
          <view
            v-for="reason in rejectReasons"
            :key="reason"
            class="chip"
            :class="{ active: rejectReason === reason }"
            @tap="rejectReason = reason"
          >
            {{ reason }}
          </view>
        </view>

        <textarea
          v-model="rejectComment"
          class="sheet-textarea"
          placeholder="补充说明（可选，会一起发给员工）"
          maxlength="200"
        />

        <view class="sheet-actions">
          <button class="sheet-btn" @tap="closeSheet">取消</button>
          <button
            class="sheet-btn primary danger"
            :loading="submitting"
            :disabled="submitting"
            @tap="submitReject"
          >
            确认驳回
          </button>
        </view>
      </view>
    </view>

    <!-- 通过确认弹层 -->
    <view v-if="activeSheet === 'approve'" class="sheet-mask" @tap="closeSheet">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">确认审核通过？</text>
        <text class="sheet-sub">通过后可在 24 小时内撤销</text>

        <view class="confirm-rows">
          <view class="confirm-row">
            <text class="confirm-label">报销金额</text>
            <text class="confirm-value">¥{{ money(reimbursement.totalActualCost) }}</text>
          </view>
          <view class="confirm-row">
            <text class="confirm-label">报销转账凭证</text>
            <text class="confirm-value">{{ proofPhotos.length }} 张</text>
          </view>
          <view v-if="isSelfReview && !hasPaymentProof" class="confirm-row">
            <text class="confirm-label">转账凭证</text>
            <text class="confirm-value">本人单，无需凭证</text>
          </view>
          <view v-if="pendingPriceChangeCount > 0" class="confirm-row">
            <text class="confirm-label">价格变更</text>
            <text class="confirm-value">{{ pendingPriceChangeCount }} 项待确认</text>
          </view>
          <view v-if="heldPriceChangeCount > 0" class="confirm-row">
            <text class="confirm-label">已被挂起</text>
            <text class="confirm-value warn">{{ heldPriceChangeCount }} 项通过后不会生效</text>
          </view>
        </view>

        <view class="sheet-actions">
          <button class="sheet-btn" @tap="closeSheet">再看看</button>
          <button
            class="sheet-btn primary"
            :loading="submitting"
            :disabled="submitting"
            @tap="submitApprove"
          >
            确认通过
          </button>
        </view>
      </view>
    </view>

    <!-- 撤销确认弹层 -->
    <view v-if="activeSheet === 'revert'" class="sheet-mask" @tap="closeSheet">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">撤销审核？</text>
        <text class="sheet-sub">
          单据会回到待审核；{{ revertedPriceChangeCount }} 项已生效的价格会回退成变更前，
          员工也能看到这次撤销。
        </text>

        <textarea
          v-model="revertComment"
          class="sheet-textarea"
          placeholder="撤销说明（可选）"
          maxlength="200"
        />

        <view class="sheet-actions">
          <button class="sheet-btn" @tap="closeSheet">取消</button>
          <button
            class="sheet-btn primary warning"
            :loading="submitting"
            :disabled="submitting"
            @tap="submitRevert"
          >
            确认撤销
          </button>
        </view>
      </view>
    </view>

    <!-- 价格对比弹层（2026-11-10） -->
    <view v-if="priceCompareVisible" class="sheet-mask" @tap="closePriceCompare">
      <view class="sheet price-compare-sheet" @tap.stop>
        <view class="pc-head">
          <view class="pc-head-text">
            <text class="sheet-title">价格对比</text>
            <text class="sheet-sub">{{ priceCompareSubtitle }}</text>
          </view>
          <text class="pc-close" @tap="closePriceCompare">×</text>
        </view>

        <view v-if="priceCompareLoading" class="pc-state">加载中...</view>
        <view v-else-if="priceCompareError" class="pc-state">{{ priceCompareError }}</view>
        <template v-else-if="priceCompareData">
          <view class="pc-summary">
            <view class="pc-sum-cell">
              <text class="pc-sum-label">本次</text>
              <text class="pc-sum-value">{{ priceCompareData.current.priceText }}</text>
            </view>
            <view class="pc-sum-cell">
              <text class="pc-sum-label">上次单价</text>
              <text class="pc-sum-value">{{ priceCompareData.current.previousPriceText || '暂无' }}</text>
            </view>
            <view class="pc-sum-cell">
              <text class="pc-sum-label">涨跌</text>
              <text
                class="pc-sum-value"
                :class="getDeltaTone(priceCompareData.current.deltaRate)"
              >
                {{ formatDeltaPercent(priceCompareData.current.deltaRate) }}
              </text>
            </view>
          </view>

          <text v-if="priceCompareNote" class="pc-note">{{ priceCompareNote }}</text>

          <view
            v-for="section in priceCompareSections"
            :key="section.key"
            class="pc-section"
          >
            <view class="pc-list-head">
              <text class="pc-list-title">{{ section.title }}</text>
              <text class="pc-list-hint">最近 5 条</text>
            </view>
            <text v-if="section.caption" class="pc-list-cap">{{ section.caption }}</text>

            <view v-if="section.rows.length === 0" class="pc-empty">
              {{ section.empty }}
            </view>
            <view v-else class="pc-rows">
              <view
                v-for="row in section.rows"
                :key="row.recordId"
                class="pc-row"
              >
                <view class="pc-row-left">
                  <text class="pc-row-date">{{ formatShortDate(row.purchasedAt) }}</text>
                  <text class="pc-row-name">{{ formatHistoryRowName(row) }}</text>
                  <text class="pc-row-meta">{{ row.purchaseChannelName || '未填渠道' }}</text>
                </view>
                <view class="pc-row-right">
                  <view class="pc-row-price-line">
                    <text class="pc-row-price">{{ row.priceText }}</text>
                    <text v-if="row.isBaseline" class="pc-base-tag">≈ 基准价</text>
                  </view>
                  <text class="pc-row-delta" :class="getDeltaTone(row.deltaRate)">{{ formatComparisonDelta(row.deltaRate) }}</text>
                </view>
              </view>
            </view>
          </view>

          <text class="pc-foot">
            右边 = 现在这条采购的折算价，比这一行历史价的折算价；和卡片上的涨跌同一个算法、同一个方向。驳回的单据不计入。
          </text>
        </template>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import StaffStatusBadge from '../../../components/staff/StaffStatusBadge.vue';
import {
  getReimbursementDetail,
  getPurchaseRecords,
  uploadPaymentProofFiles,
  clearPaymentProof as clearPaymentProofApi,
  appendReceiptUrls,
  removeReceiptUrl,
  deleteReimbursement as deleteReimbursementApi,
  reviewReimbursement,
  revertReimbursementReview,
  applyHeldPriceChange,
  getPurchaseRecordPriceComparison,
} from '../api/purchasing';
import { formatStaffQuantity } from '../../../utils/staff-quantity';
import { formatReimbursementCustomFeeTitle } from '../constants/reimbursement';

const REVERT_WINDOW_MS = 24 * 60 * 60 * 1000;

const activeSheet = ref<'' | 'reject' | 'approve' | 'revert'>('');
const priceCompareVisible = ref(false);
const priceCompareLoading = ref(false);
const priceCompareError = ref('');
const priceCompareData = ref<any>(null);
const reimbursementId = ref('');
const reimbursement = ref<any>(null);
const loading = ref(true);
const submitting = ref(false);
const uploading = ref(false);
const uploadingReceipts = ref(false);
const withdrawing = ref(false);
const resubmitting = ref(false);
const purchaseRecordsByListId = ref<Record<string, any[]>>({});
const recordsLoadFailed = ref(false);

const rejectReasons = [
  '金额对不上',
  '凭证看不清',
  '重复报销',
  '没按采购流程',
  '其它',
];
const rejectReason = ref(rejectReasons[0]);
const rejectComment = ref('');
const revertComment = ref('');

const currentUserId = computed(() => {
  const user = uni.getStorageSync('user');
  return user?.id || '';
});

const isAdmin = computed(() => {
  const user = uni.getStorageSync('user');
  return user?.role === 'ADMIN';
});

const isOwner = computed(
  () => !!currentUserId.value && reimbursement.value?.submittedById === currentUserId.value,
);

const status = computed(() => reimbursement.value?.status || '');
const isPending = computed(() => status.value === 'PENDING_REVIEW');
const hasPaymentProof = computed(
  () => (reimbursement.value?.paymentProofUrls?.length || 0) > 0,
);
const proofPhotos = computed<string[]>(() => reimbursement.value?.paymentProofUrls || []);

const canManageProof = computed(() => isAdmin.value && isPending.value);
// 2026-11-07 复审：不再挡「自己审自己」——老板很可能既是提交人又是唯一管理员，
// 挡了会导致自己的单在手机上永远过不了。要严格隔离的话应在服务端统一做。
const canReview = computed(() => isAdmin.value && isPending.value);

/** 当前用户就是提交人：自己的单不存在「给自己转账」，不该被凭证卡住 */
const isSelfReview = computed(() => isAdmin.value && isOwner.value);

/** 能点「审核通过」：已有转账凭证，或者是自己的单 */
const canApprove = computed(() => hasPaymentProof.value || isSelfReview.value);

const canRevert = computed(() => {
  if (!isAdmin.value || status.value !== 'REIMBURSED') {
    return false;
  }
  const reviewedAt = reimbursement.value?.reviewedAt;
  if (!reviewedAt) {
    return false;
  }
  const elapsed = Date.now() - new Date(reviewedAt).getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= REVERT_WINDOW_MS;
});

const canResubmit = computed(() =>
  ['REJECTED', 'REQUIRES_RESUBMIT'].includes(status.value),
);

const canWithdraw = computed(() => {
  if (!isPending.value && !canResubmit.value) {
    return false;
  }
  if (!isOwner.value) {
    return false;
  }
  return !hasPaymentProof.value;
});

const hasBottomActions = computed(
  () => canReview.value || canRevert.value || canWithdraw.value || canResubmit.value,
);

const canEditReceipts = computed(() => {
  const editableStatuses = ['PENDING_REVIEW', 'REJECTED', 'REQUIRES_RESUBMIT'];
  return (isAdmin.value || isOwner.value) && editableStatuses.includes(status.value);
});

/* ---------------- 格式化 ---------------- */

const money = (value?: number | null) => Number(value || 0).toFixed(2);

const formatMeasurementUnit = (unit?: string | null) => {
  if (!unit) return '';

  const normalized = `${unit}`.trim().toUpperCase();
  const labelMap: Record<string, string> = {
    G: 'g',
    KG: 'kg',
    JIN: '斤',
    ML: 'ml',
    L: 'L',
    PCS: '个',
  };

  return labelMap[normalized] || `${unit}`.trim();
};

const normalizeUnitForMath = (unit?: string | null) => {
  const raw = `${unit || ''}`.trim();
  const upper = raw.toUpperCase();

  if (['G', 'GRAM', 'GRAMS'].includes(upper) || raw === '克') {
    return 'G';
  }

  if (['KG', 'KILOGRAM', 'KILOGRAMS'].includes(upper) || raw === '公斤') {
    return 'KG';
  }

  if (upper === 'JIN' || raw === '斤') {
    return 'JIN';
  }

  if (['ML', 'MILLILITER', 'MILLILITERS'].includes(upper) || raw === '毫升') {
    return 'ML';
  }

  if (upper === 'L' || raw === '升') {
    return 'L';
  }

  return upper || raw;
};

const getRecordBaseUnit = (record: any, item?: any) => {
  return normalizeUnitForMath(
    record?.actualBaseUnit ||
      record?.procurementSkuStockBaseUnit ||
      item?.ingredientBaseUnit ||
      item?.ingredient?.baseUnit ||
      item?.quantityUnit,
  );
};

const getPcsDisplayUnit = (item?: any) => {
  const candidates = [
    item?.displayUnit,
    item?.quantityUnit,
    item?.ingredient?.unitDisplayLabel,
    item?.ingredient?.purchaseUnit,
  ];
  const unit = candidates.find((candidate) => {
    const normalized = normalizeUnitForMath(candidate);
    return candidate && !['G', 'KG', 'JIN', 'ML', 'L'].includes(normalized);
  });

  return unit ? `${unit}`.trim() : '个';
};

const getComparablePriceUnitLabel = (record: any, item?: any) => {
  const baseUnit = getRecordBaseUnit(record, item);

  if (baseUnit === 'G') {
    return '500g';
  }

  if (baseUnit === 'ML') {
    return '500ml';
  }

  return getPcsDisplayUnit(item);
};

const getComparablePriceScale = (record: any, item?: any) => {
  const baseUnit = getRecordBaseUnit(record, item);
  return baseUnit === 'G' || baseUnit === 'ML' ? 500 : 1;
};

const getPurchaseUnitToBaseRatio = (unit: string | undefined, baseUnit: string, item?: any) => {
  const normalized = normalizeUnitForMath(unit);
  const purchaseToBaseRatio = Number(
    item?.ingredient?.purchaseToBaseRatio ||
      item?.purchaseToBaseRatio ||
      item?.resolvedPurchaseToBaseRatio ||
      0,
  );

  if (baseUnit === 'G') {
    if (normalized === 'G') return 1;
    if (normalized === 'KG') return 1000;
    if (normalized === 'JIN') return 500;
    return purchaseToBaseRatio > 0 ? purchaseToBaseRatio : 0;
  }

  if (baseUnit === 'ML') {
    if (normalized === 'ML') return 1;
    if (normalized === 'L') return 1000;
    return purchaseToBaseRatio > 0 ? purchaseToBaseRatio : 0;
  }

  return purchaseToBaseRatio > 0 && unit === item?.ingredient?.purchaseUnit
    ? purchaseToBaseRatio
    : 1;
};

const getPurchaseRecordUnit = (item?: any, priceChange?: any) => {
  const unit =
    priceChange?.purchaseUnit ||
    item?.ingredient?.purchaseUnit ||
    item?.quantityUnit ||
    item?.ingredient?.baseUnit;

  return formatMeasurementUnit(unit) || '个';
};

const parsePurchaseUnitFromProductModel = (productModel?: string | null) => {
  const normalized = `${productModel || ''}`.trim();
  const match = normalized.match(/[\/／]\s*([^\/／\s]+)\s*$/);
  return match?.[1]?.trim() || '';
};

const getRecordPurchaseUnit = (record: any, item?: any, priceChange?: any) => {
  return (
    record?.procurementSkuPurchaseUnit ||
    parsePurchaseUnitFromProductModel(record?.productModel) ||
    getPurchaseRecordUnit(item, priceChange)
  );
};

/**
 * 实际采购数量。
 * 2026-11-07 修：原来是「2 g x 1000 G」——包数被套上了采购单位，
 * 而且单位大小写混着。这里改成「2 × 1000 g（共 2 kg）」，不再编造「袋/包」。
 */
const formatRecordQuantity = (record: any, item?: any, priceChange?: any) => {
  const packageCount = Number(record?.actualPackageCount || 0);
  const packageSize = Number(record?.actualPackageSize || 0);
  const packageUnitRaw = record?.actualPackageUnit;
  const baseQuantity = Number(record?.actualBaseQuantity || 0);
  const baseUnitRaw = record?.actualBaseUnit || record?.procurementSkuStockBaseUnit;
  const baseUnit = formatMeasurementUnit(baseUnitRaw);

  // 只有「包装单位 ≠ 基础单位」（真的换算过）才补一句总计，避免「2 × 1 个（共 2 个）」
  const hasUnitConversion =
    normalizeUnitForMath(packageUnitRaw) !== normalizeUnitForMath(baseUnitRaw);
  const baseSummary =
    hasUnitConversion && Number.isFinite(baseQuantity) && baseQuantity > 0 && baseUnit
      ? `（共 ${formatStaffQuantity(baseQuantity, baseUnit, { maxDecimals: 3 })}）`
      : '';

  if (
    Number.isFinite(packageCount) &&
    packageCount > 0 &&
    Number.isFinite(packageSize) &&
    packageSize > 0
  ) {
    const size = formatStaffQuantity(packageSize, formatMeasurementUnit(packageUnitRaw), {
      maxDecimals: 3,
    });
    return `${formatStaffQuantity(packageCount, '', { maxDecimals: 3 })} × ${size}${baseSummary}`;
  }

  const quantity = Number(record?.actualQuantity || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return '-';
  }

  return formatStaffQuantity(
    quantity,
    getRecordPurchaseUnit(record, item, priceChange),
    { maxDecimals: 3 },
  );
};

const formatComparableUnitPrice = (record: any, item?: any) => {
  const cost = Number(record?.actualCost || 0);
  const baseQuantity = Number(record?.actualBaseQuantity || 0);

  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(baseQuantity) || baseQuantity <= 0) {
    return '-';
  }

  const unitLabel = getComparablePriceUnitLabel(record, item);
  const scaledPrice = (cost / baseQuantity) * getComparablePriceScale(record, item);

  return `¥${scaledPrice.toFixed(2)}/${unitLabel}`;
};

const formatComparablePreviousUnitPrice = (item: any, priceChange: any, record: any) => {
  const previousPrice = Number(priceChange?.previousEffectivePrice);

  if (!Number.isFinite(previousPrice) || previousPrice <= 0) {
    return '暂无';
  }

  const baseUnit = getRecordBaseUnit(record, item);
  const sourceUnit =
    priceChange?.purchaseUnit ||
    item?.ingredient?.purchaseUnit ||
    item?.quantityUnit ||
    item?.ingredient?.baseUnit;
  const sourceBaseQuantity = getPurchaseUnitToBaseRatio(sourceUnit, baseUnit, item);

  if (!Number.isFinite(sourceBaseQuantity) || sourceBaseQuantity <= 0) {
    return '暂无';
  }

  const scaledPrice =
    (previousPrice / sourceBaseQuantity) * getComparablePriceScale(record, item);

  return `¥${scaledPrice.toFixed(2)}/${getComparablePriceUnitLabel(record, item)}`;
};

const formatDeltaPercent = (deltaRate?: number | null) => {
  if (deltaRate === undefined || deltaRate === null || !Number.isFinite(Number(deltaRate))) {
    return '—';
  }

  const percentage = Number(deltaRate) * 100;
  if (Math.abs(percentage) < 0.05) {
    return '—';
  }

  const prefix = percentage > 0 ? '+' : '';
  return `${prefix}${percentage.toFixed(1)}%`;
};

const getDeltaTone = (deltaRate?: number | null) => {
  if (deltaRate === undefined || deltaRate === null || !Number.isFinite(Number(deltaRate))) {
    return 'flat';
  }

  if (Number(deltaRate) > 0.0005) {
    return 'up';
  }

  if (Number(deltaRate) < -0.0005) {
    return 'down';
  }

  return 'flat';
};

const formatFullDateTime = (dateStr?: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '-';
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
};

const formatShortDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

/* ---------------- 状态与文案 ---------------- */

const statusText = computed(() => {
  const map: Record<string, string> = {
    PENDING_REVIEW: '待审核',
    REIMBURSED: '已报销',
    REJECTED: '已驳回',
    REQUIRES_RESUBMIT: '需重新提交',
  };
  return map[status.value] || status.value;
});

const statusTone = computed<'pending' | 'done' | 'danger' | 'neutral'>(() => {
  if (status.value === 'REIMBURSED') return 'done';
  if (status.value === 'REJECTED') return 'danger';
  if (status.value === 'PENDING_REVIEW' || status.value === 'REQUIRES_RESUBMIT') return 'pending';
  return 'neutral';
});

const submitterName = computed(() => reimbursement.value?.submittedBy?.nickname || '-');
const reviewerName = computed(() => reimbursement.value?.reviewedBy?.nickname || '-');
const differenceNote = computed(() => reimbursement.value?.differenceNote || '');

const waitingText = computed(() => {
  if (!isPending.value || !reimbursement.value?.submittedAt) {
    return '';
  }
  const elapsed = Date.now() - new Date(reimbursement.value.submittedAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return '';
  }
  const hours = Math.floor(elapsed / 3600000);
  if (hours >= 24) {
    return `已等 ${Math.floor(hours / 24)} 天`;
  }
  if (hours >= 1) {
    return `已等 ${hours} 小时`;
  }
  return `已等 ${Math.max(1, Math.floor(elapsed / 60000))} 分钟`;
});

const revertedNotice = computed(() => {
  if (!isPending.value) {
    return '';
  }

  // 优先读事件表里最后一条撤销记录（老单据没有事件时退回 reviewComment）
  const lastRevert = [...reviewEvents.value]
    .reverse()
    .find((event: any) => event.action === 'REVERT');

  if (lastRevert) {
    return lastRevert.comment
      ? `上次审核已撤销：${lastRevert.comment}`
      : '上次审核已撤销';
  }

  if (!reimbursement.value?.reviewedAt) {
    return '';
  }

  // 后端存的是「审核已撤销：原因」，展示时去掉前缀，避免出现两个「已撤销」
  const comment = String(reimbursement.value?.reviewComment || '').replace(
    /^审核已撤销[:：]\s*/,
    '',
  );

  return comment && comment !== '审核已撤销'
    ? `上次审核已撤销：${comment}`
    : '上次审核已撤销';
});

const rejectNotice = computed(() => {
  if (!['REJECTED', 'REQUIRES_RESUBMIT'].includes(status.value)) {
    return '';
  }

  const comment = reimbursement.value?.reviewComment;
  const who = reviewerName.value !== '-' ? `${reviewerName.value} · ` : '';
  const when = reimbursement.value?.reviewedAt
    ? formatFullDateTime(reimbursement.value.reviewedAt)
    : '';
  const label = status.value === 'REJECTED' ? '已驳回' : '需要补充后重新提交';

  return `${label}｜${who}${when}${comment ? `：${comment}` : ''}`;
});

/* ---------------- 金额 ---------------- */

const shippingFee = computed(() => Number(reimbursement.value?.platformShippingFee || 0));
const packagingFee = computed(() => Number(reimbursement.value?.platformPackagingFee || 0));
const customFees = computed<any[]>(() => {
  const fees = reimbursement.value?.customFees;
  return Array.isArray(fees) ? fees : [];
});

// 分类 + 说明（「其它 · 燃气费」），不能只显示分类，否则两条「其它」长得一样
const customFeeLabel = (fee: any) => formatReimbursementCustomFeeTitle(fee);

const voucherAmountText = computed(() => {
  const amount = reimbursement.value?.voucherAmount;
  return amount === null || amount === undefined ? '未核对' : `¥${money(amount)}`;
});

const differenceText = computed(() => {
  const amount = reimbursement.value?.differenceAmount;
  if (amount === null || amount === undefined) {
    return '—';
  }
  return `¥${money(amount)}`;
});

const differenceClass = computed(() => {
  const amount = reimbursement.value?.differenceAmount;
  if (amount === null || amount === undefined || Number(amount) <= 0.01) {
    return '';
  }
  return 'warn';
});

const proofCountText = computed(() => `${proofPhotos.value.length} 张`);

/* ---------------- 采购记录 ---------------- */

const purchaseItemMap = computed(() => {
  const map = new Map<string, any>();
  const lists = reimbursement.value?.purchaseLists || [];

  lists.forEach((list: any) => {
    (list.items || []).forEach((item: any) => {
      map.set(item.id, item);
    });
  });

  return map;
});

const priceChangeMap = computed(() => {
  const changes = reimbursement.value?.priceChanges || [];
  return new Map(
    changes
      .filter((change: any) => change?.purchaseRecordId)
      .map((change: any) => [change.purchaseRecordId, change]),
  );
});

const auditPurchaseRecords = computed(() => {
  const lists = reimbursement.value?.purchaseLists || [];

  return lists
    .flatMap((list: any) => {
      const listRecords = purchaseRecordsByListId.value[list.id] || [];

      return listRecords.map((record: any) => {
        const purchaseItem =
          purchaseItemMap.value.get(record.purchaseItemId) ||
          (list.items || []).find((item: any) => item.ingredientId === record.ingredientId);
        const priceChange = priceChangeMap.value.get(record.id);

        return {
          ...record,
          purchasedQuantityText: formatRecordQuantity(record, purchaseItem, priceChange),
          unitPriceText: formatComparableUnitPrice(record, purchaseItem),
          previousUnitPriceText: formatComparablePreviousUnitPrice(purchaseItem, priceChange, record),
        };
      });
    })
    .sort((left: any, right: any) => {
      const rightTime = new Date(right.purchasedAt || right.createdAt || 0).getTime();
      const leftTime = new Date(left.purchasedAt || left.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
});

const purchaseRecordsTotal = computed(() => {
  const total = auditPurchaseRecords.value.reduce((sum: number, record: any) => {
    return sum + Number(record.actualCost || 0);
  }, 0);

  return total.toFixed(2);
});

const recordTitle = (record: any) => record.procurementSkuName || record.ingredientName || '-';

const recordSubtitle = (record: any) => {
  if (!record?.procurementSkuName || record.procurementSkuName === record.ingredientName) {
    return '';
  }
  return `标准原料：${record.ingredientName}`;
};

const isManualRecord = (record: any) => !record?.sourceImportId;

const priceChangeOf = (record: any) => priceChangeMap.value.get(record.id);

/** 行内「涨跌」：后端算好的比率，不拿两个四舍五入后的显示值相除 */
const recordDeltaText = (record: any) => {
  const change = priceChangeOf(record);
  return change ? formatDeltaPercent(change.deltaRate) : '—';
};

const recordDeltaTone = (record: any) => {
  const change = priceChangeOf(record);
  return change ? getDeltaTone(change.deltaRate) : 'flat';
};

/* ---------------- 价格对比（2026-11-10） ---------------- */

const priceCompareSubtitle = computed(() => {
  const current = priceCompareData.value?.current;
  if (!current) return '';
  const sku =
    current.procurementSkuName || current.productModel || current.ingredientName;
  return `${current.ingredientName} · ${sku} · ${formatShortDate(current.purchasedAt)}`;
});

const priceCompareSections = computed(() => {
  const data = priceCompareData.value;
  if (!data) return [];

  return [
    {
      key: 'others',
      title: '① 同原料 · 其他商品',
      caption: '右边是现在这条比它贵多少',
      rows: data.sameIngredientOthers || [],
      empty: '这个原料下还没有其他商品的采购记录',
    },
    {
      key: 'same',
      title: '② 同商品 · 历史采购',
      caption: '',
      rows: data.sameSkuHistory || [],
      empty: '这个商品还没有历史采购',
    },
  ];
});

const priceCompareNote = computed(() => {
  const current = priceCompareData.value?.current;
  if (!current?.previousPriceText) return '';
  const sku = current.procurementSkuName || current.ingredientName;
  return `这次是拿「${sku} ${current.priceText}」跟「原料基准价 ${current.previousPriceText}」在比，不是同一个商品。`;
});

const formatHistoryRowName = (row: any) => {
  const name = row.procurementSkuName || '未关联商品';
  return row.productModel ? `${name} · ${row.productModel}` : name;
};

/**
 * 历史行右侧的对比：当前这条采购的折算价 vs 这一行历史价。
 * 和卡片上的「涨跌」同一个算法、同一个方向，所以基准价那一行会算出
 * 和卡片一模一样的百分比。
 */
const formatComparisonDelta = (deltaRate?: number | null) => {
  if (
    deltaRate === undefined ||
    deltaRate === null ||
    !Number.isFinite(Number(deltaRate))
  ) {
    return '暂无可比价';
  }

  if (Math.abs(Number(deltaRate)) < 0.0005) {
    return '现在跟它持平';
  }

  return `现在比它 ${formatDeltaPercent(deltaRate)}`;
};

const openPriceCompare = async (record: any) => {
  priceCompareVisible.value = true;
  priceCompareLoading.value = true;
  priceCompareError.value = '';
  priceCompareData.value = null;

  try {
    const res: any = await getPurchaseRecordPriceComparison(record.id);
    if (res.code !== 0) {
      throw new Error(res.message || '加载失败');
    }
    priceCompareData.value = res.data;
  } catch (error: any) {
    priceCompareError.value = error?.message || '加载失败，请稍后再试';
  } finally {
    priceCompareLoading.value = false;
  }
};

const closePriceCompare = () => {
  priceCompareVisible.value = false;
};

/** 被价格闸挂起的调价，管理员可以在手机上直接放行 */
const canRelease = (record: any) => {
  if (!isAdmin.value) {
    return false;
  }
  const change = priceChangeOf(record);
  return (
    !!change &&
    change.status === 'PENDING' &&
    (change.gateAction === 'HOLD' || change.gatePreviewAction === 'HOLD')
  );
};

const releaseHeldChange = (record: any) => {
  const change = priceChangeOf(record);
  if (!change) {
    return;
  }

  // 弹窗里必须用「当前口径」说话：
  // gateReason 是判定当时存下来的文字，规则改过之后会过时（比如还写着 8%），
  // 直接展示会让人以为今天算出来是 89.9%。
  const percent = formatDeltaPercent(change.deltaRate);
  const changeText =
    percent === '—' ? '与上次档案价一致（0%）' : `比上次档案价 ${percent}`;
  const staleVerdict =
    change.gateAction === 'HOLD' && change.gatePreviewAction === 'APPLY';
  const currentVerdict = staleVerdict
    ? '按现在的规则（基准＝上次档案价），这一项本可以直接生效；它是在旧规则下被拦的。'
    : '按现在的规则，这一项仍需人工确认才能生效。';
  const oldVerdict = change.gateReason
    ? `当时判定：${change.gateReason}`
    : '';

  uni.showModal({
    title: '放行这次调价？',
    content: [
      change.ingredientName || '该原料',
      `本次${changeText}`,
      currentVerdict,
      oldVerdict,
      '放行后会立刻按本次采购价更新原料价。',
    ]
      .filter(Boolean)
      .join('\n\n'),
    confirmText: '放行',
    success: async (res) => {
      if (!res.confirm) {
        return;
      }

      try {
        const result: any = await applyHeldPriceChange(change.id, '手机端放行');
        if (result.code !== 0) {
          throw new Error(result.message || '放行失败');
        }
        uni.showToast({ title: '已放行', icon: 'success' });
        await loadDetail();
      } catch (error: any) {
        uni.showToast({ title: error?.message || '放行失败', icon: 'none' });
      }
    },
  });
};

/** 行内标签：把「调价 / 需放行 / 已生效 / 已作废」挂在记录上 */
const recordPriceTag = (record: any) => {
  const change = priceChangeOf(record);
  if (!change) {
    return '';
  }
  if (change.status === 'APPROVED') {
    return '已生效';
  }
  if (change.status === 'REJECTED') {
    return '已作废';
  }
  // 2026-11-08：提交时就全量判定，所以待确认项要么已被挂起、要么是没判定过的老数据。
  // 两种都按「需放行」处理：不放行就不会生效。
  if (change.gateAction === 'HOLD' || change.gatePreviewAction === 'HOLD') {
    return '需放行';
  }
  if (change.gatePreviewAction === 'REJECT') {
    return '无法放行';
  }

  return '';
};

const recordPriceTagTone = (record: any) => {
  const change = priceChangeOf(record);
  if (!change) {
    return '';
  }
  if (change.status === 'APPROVED') {
    return 'done';
  }
  if (change.status === 'REJECTED') {
    return 'muted';
  }
  if (change.gateAction === 'HOLD' || change.gatePreviewAction === 'HOLD') {
    return 'danger';
  }
  if (change.gatePreviewAction === 'REJECT') {
    return 'muted';
  }
  return '';
};

const breakdownMismatchText = computed(() => {
  // 采购记录没加载全时，明细合计必然是 0 或不全，这时候报「相差多少」是误报
  if (recordsLoadFailed.value) {
    return '';
  }

  const total = Number(reimbursement.value?.totalActualCost || 0);
  const parts =
    Number(purchaseRecordsTotal.value) + shippingFee.value + packagingFee.value +
    customFees.value.reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
  const diff = total - parts;
  if (Math.abs(diff) < 0.01) {
    return '';
  }
  return `明细合计 ¥${parts.toFixed(2)}，报销总额 ¥${total.toFixed(2)}，相差 ¥${Math.abs(diff).toFixed(2)}`;
});

/* ---------------- 价格变更 ---------------- */

const pendingPriceChanges = computed(() =>
  (reimbursement.value?.priceChanges || []).filter((change: any) => change.status === 'PENDING'),
);

const pendingPriceChangeCount = computed(() => pendingPriceChanges.value.length);

/**
 * 已经被价格闸挂起、通过后不会生效的（真实结果，不是预测）。
 * 只有跑过一次「通过」才会被打上 gateAction=HOLD，所以在审核前这里通常是 0，
 * 页面也就不会提前承诺「会自动生效」。
 */
const heldPriceChangeCount = computed(
  () => pendingPriceChanges.value.filter((change: any) => change.gateAction === 'HOLD').length,
);

const revertedPriceChangeCount = computed(
  () => (reimbursement.value?.priceChanges || []).filter((change: any) => change.status === 'APPROVED').length,
);

const maxDeltaRate = computed(() => {
  const rates = (reimbursement.value?.priceChanges || [])
    .filter((change: any) => change.status === 'PENDING')
    .map((change: any) => Math.abs(Number(change.deltaRate || 0)));
  return rates.length > 0 ? Math.max(...rates) : 0;
});

/* ---------------- 摘要提示 ---------------- */

const manualRecordCount = computed(
  () => auditPurchaseRecords.value.filter((record: any) => isManualRecord(record)).length,
);

const summaryAlerts = computed<Array<{ tone: string; text: string }>>(() => {
  const alerts: Array<{ tone: string; text: string }> = [];

  if (isPending.value && isAdmin.value && !hasPaymentProof.value) {
    alerts.push({ tone: 'warn', text: '还没有付款凭证，暂不能审核通过' });
  }

  if (pendingPriceChangeCount.value > 0) {
    // 只陈述事实：有多少项待确认。不预先承诺「会自动生效」——
    // 是否生效由价格闸按历史中位数判断，前端猜不准（2026-11-07 终验 P0）
    alerts.push({
      tone: 'info',
      text:
        heldPriceChangeCount.value > 0
          ? `${pendingPriceChangeCount.value} 项价格变更待确认（最大 ${formatDeltaPercent(maxDeltaRate.value)}），其中 ${heldPriceChangeCount.value} 项已被闸门判定需放行`
          : `${pendingPriceChangeCount.value} 项价格变更待确认（最大 ${formatDeltaPercent(maxDeltaRate.value)}）`,
    });
  }

  if (heldPriceChangeCount.value > 0) {
    // 已经被闸门挂起：通过后价格不会变，等于还要去电脑端放行
    alerts.push({
      tone: 'danger',
      text: `${heldPriceChangeCount.value} 项调价被闸门挂起：审核可以通过，但这几项价格不会变，要在明细里点「放行」`,
    });
  }

  if (manualRecordCount.value > 0) {
    alerts.push({
      tone: 'info',
      text: `${manualRecordCount.value} 条记录没有订单截图，只能人工核对转账记录`,
    });
  }

  const voucherAmount = reimbursement.value?.voucherAmount;
  if (voucherAmount === null || voucherAmount === undefined) {
    alerts.push({ tone: 'info', text: '没有填凭证金额，差额没法自动核对' });
  }

  const differenceAmount = Number(reimbursement.value?.differenceAmount || 0);
  if (differenceAmount > 0.01) {
    alerts.push({ tone: 'info', text: `凭证比报销多 ¥${money(differenceAmount)}` });
  }

  return alerts;
});

/* ---------------- 消费凭证 ---------------- */

const receiptPhotos = computed<Array<{ url: string; removableIndex: number }>>(() => {
  const publicUrls: string[] = reimbursement.value?.receiptUrls || [];
  const signedUrls: string[] = reimbursement.value?.receiptSignedUrls || [];

  return [
    ...publicUrls.map((url, index) => ({ url, removableIndex: index })),
    ...signedUrls.map((url) => ({ url, removableIndex: -1 })),
  ];
});

/* ---------------- 审核记录 ---------------- */

const reviewEventLabels: Record<string, string> = {
  SUBMIT: '员工提交',
  RESUBMIT: '员工重新提交',
  APPROVE: '审核通过',
  REJECT: '已驳回',
  REQUIRE_RESUBMIT: '要求补充后重提',
  REVERT: '审核已撤销',
};

const reviewEvents = computed<any[]>(() => {
  const events = reimbursement.value?.reviewEvents;
  return Array.isArray(events) ? events : [];
});

const timeline = computed(() => {
  const items: Array<{ title: string; desc: string; tone: string }> = [];

  // 2026-11-07：有事件表就读真实记录；老单据没有事件，退回用当前状态拼一条
  if (reviewEvents.value.length > 0) {
    const eventItems = reviewEvents.value.map((event: any) => ({
      title: reviewEventLabels[event.action] || event.action,
      desc: `${event.actorName || '-'} · ${formatFullDateTime(event.createdAt)}${
        event.comment ? ` · ${event.comment}` : ''
      }`,
      tone:
        event.action === 'APPROVE'
          ? 'done'
          : event.action === 'REJECT'
            ? 'danger'
            : event.action === 'REVERT'
              ? 'pending'
              : 'done',
    }));

    // 老单据没有「提交」事件：补在最前面，保证时间线是从提交开始的
    if (!reviewEvents.value.some((event: any) => event.action === 'SUBMIT')) {
      eventItems.unshift({
        title: '员工提交',
        desc: `${submitterName.value} · ${formatFullDateTime(reimbursement.value?.submittedAt)}`,
        tone: 'done',
      });
    }

    return eventItems;
  }

  items.push({
    title: '员工提交',
    desc: `${submitterName.value} · ${formatFullDateTime(reimbursement.value?.submittedAt)}`,
    tone: 'done',
  });

  if (reimbursement.value?.reviewedAt) {
    const isReverted = isPending.value;
    const decisionMap: Record<string, string> = {
      REIMBURSED: '审核通过',
      REJECTED: '已驳回',
      REQUIRES_RESUBMIT: '要求补充后重提',
    };
    items.push({
      title: isReverted ? '审核已撤销' : decisionMap[status.value] || '已处理',
      desc: `${reviewerName.value} · ${formatFullDateTime(reimbursement.value.reviewedAt)}${
        reimbursement.value.reviewComment ? ` · ${reimbursement.value.reviewComment}` : ''
      }`,
      tone: isReverted ? 'pending' : status.value === 'REIMBURSED' ? 'done' : 'danger',
    });
  }

  if (proofPhotos.value.length > 0) {
    items.push({
      title: '已上传报销转账凭证',
      desc: `${proofPhotos.value.length} 张`,
      tone: 'done',
    });
  }

  return items;
});

/* ---------------- 数据加载 ---------------- */

onLoad((options: any) => {
  reimbursementId.value = options.id;
  loadDetail();
});

const loadDetail = async () => {
  loading.value = true;

  try {
    const res: any = await getReimbursementDetail(reimbursementId.value);

    if (res.code === 0) {
      reimbursement.value = res.data;
      await loadPurchaseRecordsForReimbursement();
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载报销单详情失败', error);
    uni.showToast({ title: error?.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const loadPurchaseRecordsForReimbursement = async () => {
  purchaseRecordsByListId.value = {};
  recordsLoadFailed.value = false;

  const purchaseLists = reimbursement.value?.purchaseLists || [];
  if (purchaseLists.length === 0) {
    return;
  }

  const results = await Promise.all(
    purchaseLists.map(async (list: any) => {
      try {
        const res: any = await getPurchaseRecords(list.id);

        if (res.code !== 0) {
          throw new Error(res.message || '加载采购记录失败');
        }

        return {
          listId: list.id,
          records: Array.isArray(res.data) ? res.data : [],
          success: true,
        };
      } catch (error) {
        return { listId: list.id, records: [], success: false, error };
      }
    }),
  );

  const nextMap: Record<string, any[]> = {};
  let failedCount = 0;

  results.forEach((result) => {
    if (result.success) {
      nextMap[result.listId] = result.records;
      return;
    }
    failedCount += 1;
    console.error('加载报销单关联采购记录失败', result.error);
  });

  purchaseRecordsByListId.value = nextMap;
  recordsLoadFailed.value = failedCount > 0;

  if (failedCount > 0) {
    uni.showToast({
      title: `有${failedCount}个采购清单的记录加载失败`,
      icon: 'none',
    });
  }
};

/* ---------------- 图片 ---------------- */

const previewPaymentProof = (currentUrl: string) => {
  if (proofPhotos.value.length > 0) {
    uni.previewImage({ urls: proofPhotos.value, current: currentUrl });
  }
};

const previewReceipt = (photo: { url: string }) => {
  const urls = receiptPhotos.value.map((item) => item.url);
  if (urls.length > 0) {
    uni.previewImage({ urls, current: photo.url });
  }
};

/* ---------------- 弹层 ---------------- */

const openSheet = (sheet: 'reject' | 'approve' | 'revert') => {
  if (sheet === 'approve' && !canApprove.value) {
    uni.showToast({ title: '请先上传报销转账凭证', icon: 'none' });
    return;
  }
  rejectComment.value = '';
  revertComment.value = '';
  activeSheet.value = sheet;
};

const closeSheet = () => {
  activeSheet.value = '';
};

const submitReject = async () => {
  if (submitting.value) return;

  const reason = rejectReason.value;
  const extra = rejectComment.value.trim();

  // 「其它」必须写一句，否则员工看到的原因只有「其它」两个字
  if (reason === '其它' && !extra) {
    uni.showToast({ title: '选「其它」时请写一句原因', icon: 'none' });
    return;
  }

  const comment = extra ? `${reason}：${extra}` : reason;

  submitting.value = true;
  try {
    const res: any = await reviewReimbursement(reimbursementId.value, 'REJECT', comment);
    if (res.code !== 0) {
      throw new Error(res.message || '驳回失败');
    }
    closeSheet();
    uni.showToast({ title: '已驳回', icon: 'success' });
    await loadDetail();
  } catch (error: any) {
    uni.showToast({ title: error?.message || '驳回失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

const submitApprove = async () => {
  if (submitting.value) return;

  submitting.value = true;
  try {
    const res: any = await reviewReimbursement(reimbursementId.value, 'APPROVE');
    if (res.code !== 0) {
      throw new Error(res.message || '审核失败');
    }
    closeSheet();
    uni.showToast({ title: '已通过', icon: 'success' });
    await loadDetail();
  } catch (error: any) {
    uni.showToast({ title: error?.message || '审核失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

const submitRevert = async () => {
  if (submitting.value) return;

  submitting.value = true;
  try {
    const res: any = await revertReimbursementReview(
      reimbursementId.value,
      revertComment.value.trim() || undefined,
    );
    if (res.code !== 0) {
      throw new Error(res.message || '撤销失败');
    }
    closeSheet();
    uni.showToast({ title: '已撤销审核', icon: 'success' });
    await loadDetail();
  } catch (error: any) {
    uni.showToast({ title: error?.message || '撤销失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

/* ---------------- 凭证管理 ---------------- */

const uploadProof = async () => {
  if (uploading.value) return;

  const remain = Math.max(0, 10 - proofPhotos.value.length);
  if (remain <= 0) {
    uni.showToast({ title: '最多只能上传10张', icon: 'none' });
    return;
  }

  const res = await uni.chooseImage({ count: remain, sizeType: ['compressed'] });
  if (!res.tempFilePaths || res.tempFilePaths.length === 0) {
    return;
  }

  uploading.value = true;
  try {
    await uploadPaymentProofFiles(reimbursementId.value, res.tempFilePaths);
    uni.showToast({ title: '已上传，待审核通过', icon: 'none' });
  } catch (error: any) {
    uni.showToast({ title: error?.message || '上传失败', icon: 'none' });
  } finally {
    // 中途失败也要刷新：已经传上去的那几张要看得见
    await loadDetail();
    uploading.value = false;
  }
};

const clearProof = () => {
  uni.showModal({
    title: '清空付款凭证？',
    content: '凭证会全部删除，但审核状态不变。',
    confirmText: '清空',
    confirmColor: '#a8402f',
    success: async (res) => {
      if (!res.confirm) return;

      uploading.value = true;
      try {
        await clearPaymentProofApi(reimbursementId.value);
        uni.showToast({ title: '已清空', icon: 'success' });
        await loadDetail();
      } catch (error: any) {
        uni.showToast({ title: error?.message || '清空失败', icon: 'none' });
      } finally {
        uploading.value = false;
      }
    },
  });
};

const appendReceiptPhotos = async () => {
  const currentCount = receiptPhotos.value.length;
  const canUpload = 10 - currentCount;
  if (canUpload <= 0) {
    uni.showToast({ title: '最多只能上传10张', icon: 'none' });
    return;
  }

  const res = await uni.chooseImage({ count: canUpload, sizeType: ['compressed'] });
  if (!res.tempFilePaths || res.tempFilePaths.length === 0) {
    return;
  }

  uploadingReceipts.value = true;
  try {
    await appendReceiptUrls(reimbursementId.value, res.tempFilePaths);
    uni.showToast({ title: '上传成功', icon: 'success' });
    await loadDetail();
  } catch (error: any) {
    uni.showToast({ title: error?.message || '上传失败', icon: 'none' });
  } finally {
    uploadingReceipts.value = false;
  }
};

const removeReceiptPhoto = (index: number) => {
  uni.showModal({
    title: '删除这张凭证？',
    content: '删除后需要重新上传。',
    confirmText: '删除',
    confirmColor: '#a8402f',
    success: async (res) => {
      if (!res.confirm) return;

      try {
        await removeReceiptUrl(reimbursementId.value, index);
        uni.showToast({ title: '已删除', icon: 'success' });
        await loadDetail();
      } catch (error: any) {
        uni.showToast({ title: error?.message || '删除失败', icon: 'none' });
      }
    },
  });
};

/* ---------------- 员工动作 ---------------- */

const withdrawReimbursement = () => {
  if (!canWithdraw.value || withdrawing.value) return;

  uni.showModal({
    title: '撤回报销？',
    content: '撤回后这张报销单会删除，采购清单解锁，可以改完采购记录再重新提交。',
    confirmText: '撤回',
    confirmColor: '#a8402f',
    success: async (res) => {
      if (!res.confirm) return;

      withdrawing.value = true;
      try {
        const result: any = await deleteReimbursementApi(reimbursementId.value);
        if (result.code !== 0) {
          throw new Error(result.message || '撤回失败');
        }
        uni.showToast({ title: '已撤回', icon: 'success' });
        uni.navigateBack();
      } catch (error: any) {
        withdrawing.value = false;
        uni.showToast({ title: error?.message || '撤回失败', icon: 'none' });
      }
    },
  });
};

const resubmit = () => {
  uni.showModal({
    title: '重新提交',
    content: '重新提交需要重新确认采购清单和发票照片',
    confirmText: '继续',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        uni.navigateTo({
          url: `/pages/staff-purchasing/reimbursement/submit?resubmitId=${reimbursementId.value}`,
        });
      }
    },
  });
};
</script>

<style scoped lang="scss">
.reimbursement-detail-page {
  min-height: 100vh;
  background-color: #fbfcf7;
  padding-top: 20rpx;
  padding-bottom: calc(220rpx + env(safe-area-inset-bottom));
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 32rpx;

  text {
    font-size: 28rpx;
    color: #6b6653;
  }

  .error-icon {
    font-size: 120rpx;
    margin-bottom: 16rpx;
  }
}

.detail-content {
  padding: 0 24rpx;
}

.section {
  background-color: #fbfaf6;
  border: 1rpx solid #eae2cf;
  border-radius: 20rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 20rpx;

  .section-title {
    font-size: 30rpx;
    font-weight: bold;
    color: #26261f;
  }

  .section-hint {
    font-size: 24rpx;
    color: #6b6653;
  }
}

/* ① 单据头 */
.header-card {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;

    .claim-number {
      font-size: 32rpx;
      font-weight: bold;
      color: #26261f;
      letter-spacing: 0.5rpx;
    }
  }

  .submit-line {
    display: flex;
    align-items: center;
    font-size: 26rpx;
    color: #6b6653;

    .submitter {
      color: #26261f;
      font-weight: 500;
    }

    .dot {
      margin: 0 8rpx;
    }

    .waiting {
      margin-left: auto;
      font-size: 24rpx;
      color: #7a5c28;
      background-color: #f6efe0;
      border-radius: 8rpx;
      padding: 4rpx 12rpx;
    }
  }

  .revert-notice {
    margin-top: 16rpx;
    padding: 12rpx 16rpx;
    border-radius: 8rpx;
    background-color: #f8eeea;
    font-size: 24rpx;
    color: #a8402f;
    line-height: 1.5;
  }

  .reject-notice {
    margin-top: 16rpx;
    padding: 16rpx;
    border-radius: 8rpx;
    background-color: #f8eeea;
    border-left: 6rpx solid #a8402f;
    font-size: 24rpx;
    color: #7d2d22;
    line-height: 1.6;
  }
}

/* ② 审核摘要 */
.summary-card {
  background-color: #f6f2e6;
  border-color: #e3d8bf;

  .summary-main {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 20rpx;
    border-bottom: 1rpx solid #e3d8bf;

    .summary-label {
      font-size: 26rpx;
      color: #6b6653;
    }

    .summary-amount {
      font-size: 52rpx;
      font-weight: bold;
      color: #22301f;
      font-variant-numeric: tabular-nums;
    }
  }

  .summary-grid {
    display: flex;
    padding: 20rpx 0 4rpx;

    .summary-cell {
      flex: 1;
      display: flex;
      flex-direction: column;

      .cell-label {
        font-size: 22rpx;
        color: #6b6653;
        margin-bottom: 6rpx;
      }

      .cell-value {
        font-size: 28rpx;
        font-weight: 600;
        color: #26261f;
        font-variant-numeric: tabular-nums;

        &.warn {
          color: #a8402f;
        }
      }
    }
  }

  .summary-alerts {
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid #e3d8bf;

    .alert-line {
      display: flex;
      align-items: flex-start;
      margin-bottom: 10rpx;

      &:last-child {
        margin-bottom: 0;
      }

      .alert-dot {
        font-size: 16rpx;
        line-height: 1.8;
        margin-right: 8rpx;
        color: #7a5c28;
      }

      .alert-text {
        flex: 1;
        font-size: 24rpx;
        line-height: 1.6;
        color: #4a4636;
      }

      &.danger {
        .alert-dot,
        .alert-text {
          color: #a8402f;
        }
      }

      &.warn {
        .alert-dot,
        .alert-text {
          color: #8a6420;
        }
      }
    }
  }

  .difference-note {
    display: block;
    margin-top: 12rpx;
    font-size: 24rpx;
    color: #6b6653;
    line-height: 1.6;
  }
}

/* ③ 金额构成 */
.breakdown {
  .breakdown-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 10rpx 0;
    font-size: 26rpx;
    color: #4a4636;

    .breakdown-value {
      font-variant-numeric: tabular-nums;
      color: #26261f;
    }

    &.total {
      margin-top: 8rpx;
      padding-top: 16rpx;
      border-top: 1rpx solid #eae2cf;

      .breakdown-label {
        font-weight: bold;
        color: #26261f;
      }

      .breakdown-value {
        font-size: 32rpx;
        font-weight: bold;
        color: #22301f;
      }
    }
  }
}

.breakdown-hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #8a6420;
  line-height: 1.5;
}

/* 图片 */
.photos-grid {
  display: flex;
  flex-wrap: wrap;
  margin: 0 -8rpx;

  .photo-item-wrapper {
    position: relative;
    width: 25%;
    padding: 8rpx;
    box-sizing: border-box;
  }

  .photo-item {
    width: 100%;
    height: 140rpx;
    border-radius: 10rpx;
    overflow: hidden;
    background-color: #efeade;

    image {
      width: 100%;
      height: 100%;
    }
  }
}

.delete-btn {
  position: absolute;
  top: 0;
  right: 0;
  width: 40rpx;
  height: 40rpx;
  border-radius: 20rpx;
  background-color: rgba(168, 64, 47, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;

  text {
    color: #fff;
    font-size: 26rpx;
    line-height: 1;
  }
}

.empty-block {
  padding: 24rpx;
  border-radius: 12rpx;
  background-color: #f7f4ea;
  display: flex;
  flex-direction: column;

  .empty-text {
    font-size: 26rpx;
    color: #4a4636;
  }

  .empty-sub {
    margin-top: 8rpx;
    font-size: 22rpx;
    color: #6b6653;
    line-height: 1.5;
  }
}

.inline-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;

  .ghost-btn {
    flex: 1;
    height: 72rpx;
    line-height: 72rpx;
    font-size: 26rpx;
    color: #22301f;
    background-color: #eef2e4;
    border: 1rpx solid #d8dfc6;
    border-radius: 12rpx;
    padding: 0;

    &::after {
      border: none;
    }

    &.danger {
      color: #a8402f;
      background-color: #f8eeea;
      border-color: #ecd6ce;
    }
  }
}

/* ⑥ 采购明细 */
.record-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.record-card {
  background-color: #fffefb;
  border: 1rpx solid #ece4d2;
  border-radius: 14rpx;
  padding: 22rpx;
  transition: background-color 0.2s ease;

  .record-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;

    .record-title-wrap {
      flex: 1;
      padding-right: 16rpx;

      .record-name {
        display: block;
        font-size: 28rpx;
        font-weight: 600;
        color: #26261f;
        line-height: 1.4;
      }

      .record-sub {
        display: block;
        margin-top: 4rpx;
        font-size: 22rpx;
        color: #6b6653;
      }
    }

    .record-cost {
      font-size: 30rpx;
      font-weight: bold;
      color: #26261f;
      font-variant-numeric: tabular-nums;
    }
  }

  .record-meta {
    display: flex;
    flex-wrap: wrap;
    margin-top: 12rpx;

    .meta-chip {
      font-size: 20rpx;
      color: #6b6653;
      background-color: #f4f1e6;
      border-radius: 6rpx;
      padding: 4rpx 10rpx;
      margin-right: 10rpx;
      margin-bottom: 8rpx;

      &.warn {
        color: #8a6420;
        background-color: #f8efd9;
      }

      &.accent {
        color: #a8402f;
        background-color: #f8eeea;
      }

      &.danger {
        color: #fff;
        background-color: #a8402f;
      }

      &.done {
        color: #2f6b4f;
        background-color: #eef2e4;
      }

      &.muted {
        color: #8a8472;
        background-color: #f0eee5;
      }

      &.release {
        color: #fbfcf7;
        background-color: #22301f;
        font-weight: 600;
      }
    }
  }

  .record-metrics {
    display: flex;
    margin-top: 6rpx;

    .metric {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      padding-right: 8rpx;

      &:last-child {
        padding-right: 0;
      }

      .metric-label {
        font-size: 19rpx;
        color: #8a8472;
        margin-bottom: 4rpx;
      }

      .metric-value {
        font-size: 22rpx;
        color: #26261f;
        line-height: 1.4;
        word-break: break-word;
        font-variant-numeric: tabular-nums;

        &.muted {
          color: #6b6653;
        }

        &.up {
          color: #a8402f;
          font-weight: 600;
        }

        &.down {
          color: #2f6b4f;
          font-weight: 600;
        }

        &.flat {
          color: #8a8472;
        }
      }
    }
  }

  .record-note {
    display: block;
    margin-top: 12rpx;
    font-size: 22rpx;
    color: #6b6653;
    line-height: 1.5;
  }
}

.pending-price-hint {
  display: block;
  margin: -4rpx 0 18rpx;
  font-size: 22rpx;
  color: #8a6420;
  line-height: 1.5;
}

/* ⑦ 处理进度 */
.timeline {
  .timeline-item {
    display: flex;
    padding-bottom: 22rpx;

    &:last-child {
      padding-bottom: 0;
    }

    .timeline-dot {
      width: 14rpx;
      height: 14rpx;
      border-radius: 7rpx;
      margin-top: 10rpx;
      margin-right: 14rpx;
      background-color: #c8bfa4;
    }

    .timeline-body {
      flex: 1;

      .timeline-title {
        display: block;
        font-size: 26rpx;
        color: #26261f;
        font-weight: 500;
      }

      .timeline-desc {
        display: block;
        margin-top: 4rpx;
        font-size: 22rpx;
        color: #6b6653;
        line-height: 1.5;
      }
    }

    &.done .timeline-dot {
      background-color: #2f6b4f;
    }

    &.pending .timeline-dot {
      background-color: #8a6420;
    }

    &.danger .timeline-dot {
      background-color: #a8402f;
    }
  }
}

/* 底部操作 */
.bottom-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background-color: rgba(251, 252, 247, 0.96);
  border-top: 1rpx solid #eae2cf;

  .bottom-hint {
    display: block;
    font-size: 22rpx;
    color: #8a6420;
    line-height: 1.4;
    margin-bottom: 10rpx;
  }

  .action-row {
    display: flex;
    gap: 16rpx;

    .action-btn {
      flex: 1;
      height: 88rpx;
      line-height: 88rpx;
      border-radius: 14rpx;
      font-size: 30rpx;
      font-weight: 600;
      padding: 0;

      &::after {
        border: none;
      }

      &.reject {
        flex: 0 0 200rpx;
        color: #a8402f;
        background-color: #f8eeea;
        border: 1rpx solid #ecd6ce;
      }

      &.approve {
        color: #fbfcf7;
        background-color: #22301f;
      }

      &.approve.disabled {
        background-color: #b9bfae;
      }

      &.revert {
        color: #a8402f;
        background-color: #f8eeea;
        border: 1rpx solid #ecd6ce;
      }

      &.withdraw {
        color: #6b6653;
        background-color: #f4f1e6;
        border: 1rpx solid #e0d8c4;
      }

      &.resubmit {
        color: #fbfcf7;
        background-color: #22301f;
      }
    }
  }
}

/* 弹层 */
.sheet-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-color: rgba(20, 22, 16, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 20;
}

.sheet {
  width: 100%;
  background-color: #fbfcf7;
  border-radius: 24rpx 24rpx 0 0;
  padding: 32rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;

  .sheet-title {
    display: block;
    font-size: 32rpx;
    font-weight: bold;
    color: #26261f;
  }

  .sheet-sub {
    display: block;
    margin-top: 8rpx;
    font-size: 24rpx;
    color: #6b6653;
    line-height: 1.6;
  }

  .reason-chips {
    display: flex;
    flex-wrap: wrap;
    margin: 20rpx -6rpx 0;

    .chip {
      margin: 0 6rpx 12rpx;
      padding: 12rpx 20rpx;
      border-radius: 999rpx;
      font-size: 24rpx;
      color: #4a4636;
      background-color: #f4f1e6;
      border: 1rpx solid #e6ddc7;

      &.active {
        color: #a8402f;
        background-color: #f8eeea;
        border-color: #dfb9ae;
      }
    }
  }

  .sheet-textarea {
    width: 100%;
    height: 140rpx;
    margin-top: 16rpx;
    padding: 16rpx;
    box-sizing: border-box;
    background-color: #f7f4ea;
    border-radius: 12rpx;
    font-size: 26rpx;
    color: #26261f;
  }

  .confirm-rows {
    margin-top: 20rpx;
    padding: 8rpx 20rpx;
    background-color: #f7f4ea;
    border-radius: 12rpx;

    .confirm-row {
      display: flex;
      justify-content: space-between;
      padding: 14rpx 0;
      font-size: 26rpx;
      border-bottom: 1rpx solid #ebe4d2;

      &:last-child {
        border-bottom: none;
      }

      .confirm-label {
        color: #6b6653;
      }

      .confirm-value {
        color: #26261f;
        font-weight: 600;

        &.warn {
          color: #a8402f;
        }
      }
    }
  }

  .sheet-actions {
    display: flex;
    gap: 16rpx;
    margin-top: 24rpx;

    .sheet-btn {
      flex: 1;
      height: 88rpx;
      line-height: 88rpx;
      border-radius: 14rpx;
      font-size: 30rpx;
      padding: 0;
      color: #4a4636;
      background-color: #f1eee3;
      border: 1rpx solid #e2dac6;

      &::after {
        border: none;
      }

      &.primary {
        color: #fbfcf7;
        background-color: #22301f;
        border-color: #22301f;
      }

      &.primary.danger {
        background-color: #a8402f;
        border-color: #a8402f;
      }

      &.warning {
        background-color: #8a6420;
        border-color: #8a6420;
      }
    }
  }
}

/* ---------------- 价格对比（2026-11-10） ---------------- */

.metric-delta-line {
  display: flex;
  align-items: center;
}

.metric-help {
  width: 28rpx;
  height: 28rpx;
  line-height: 28rpx;
  text-align: center;
  border-radius: 50%;
  border: 1rpx solid #d3c8ae;
  background-color: #fffdf7;
  color: #6b6653;
  font-size: 20rpx;
  font-weight: 700;
  margin-left: 6rpx;
  flex: none;
}

.price-compare-sheet {
  max-height: 82vh;
  overflow-y: auto;
}

.pc-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.pc-head-text {
  flex: 1;
  min-width: 0;
}

.pc-close {
  width: 52rpx;
  height: 52rpx;
  line-height: 52rpx;
  text-align: center;
  border-radius: 50%;
  background-color: #f1eee3;
  color: #6b6653;
  font-size: 32rpx;
  flex: none;
  margin-left: 16rpx;
}

.pc-state {
  display: block;
  padding: 60rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: #8a8472;
}

.pc-summary {
  display: flex;
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  background-color: #f4f1e6;
  border-radius: 14rpx;
}

.pc-sum-cell {
  flex: 1;
  min-width: 0;

  & + & {
    border-left: 1rpx solid #e2dac6;
    padding-left: 18rpx;
  }
}

.pc-sum-label {
  display: block;
  font-size: 20rpx;
  color: #8a8472;
}

.pc-sum-value {
  display: block;
  margin-top: 4rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: #26261f;
  font-variant-numeric: tabular-nums;

  &.up {
    color: #a8402f;
  }

  &.down {
    color: #2f6b4f;
  }

  &.flat {
    color: #8a8472;
  }
}

.pc-note {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  color: #6b6653;
  line-height: 1.55;
}

.pc-section {
  margin-top: 26rpx;
}

.pc-list-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.pc-list-title {
  font-size: 26rpx;
  font-weight: 700;
  color: #26261f;
}

.pc-list-hint {
  font-size: 20rpx;
  color: #8a8472;
}

.pc-list-cap {
  display: block;
  margin: 6rpx 0 4rpx;
  font-size: 21rpx;
  color: #6b6653;
  line-height: 1.5;
}

.pc-rows {
  border-top: 1rpx solid #ece4d2;
}

.pc-row {
  display: flex;
  align-items: center;
  padding: 16rpx 2rpx;
  border-bottom: 1rpx solid #f0e9da;
}

.pc-row-left {
  flex: 1;
  min-width: 0;
  padding-right: 16rpx;
}

.pc-row-date {
  display: block;
  font-size: 20rpx;
  color: #8a8472;
}

.pc-row-name {
  display: block;
  margin-top: 2rpx;
  font-size: 25rpx;
  font-weight: 600;
  color: #26261f;
}

.pc-row-meta {
  display: block;
  margin-top: 2rpx;
  font-size: 20rpx;
  color: #6b6653;
}

.pc-row-right {
  flex: none;
  text-align: right;
}

.pc-row-price-line {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.pc-row-price {
  font-size: 26rpx;
  font-weight: 700;
  color: #26261f;
  font-variant-numeric: tabular-nums;
}

.pc-base-tag {
  margin-left: 8rpx;
  padding: 2rpx 8rpx;
  border-radius: 6rpx;
  background-color: #f8efd9;
  color: #8a6420;
  font-size: 18rpx;
  line-height: 1.4;
}

.pc-row-delta {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #8a8472;

  &.up {
    color: #a8402f;
  }

  &.down {
    color: #2f6b4f;
  }

  &.flat {
    color: #8a8472;
  }
}

.pc-empty {
  display: block;
  padding: 26rpx 0;
  font-size: 22rpx;
  color: #8a8472;
  text-align: center;
}

.pc-foot {
  display: block;
  margin-top: 22rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed #e2dac6;
  font-size: 20rpx;
  color: #8a8472;
  line-height: 1.55;
}
</style>
