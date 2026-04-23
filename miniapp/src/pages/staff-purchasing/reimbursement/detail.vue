<template>
  <view class="reimbursement-detail-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">报销单详情</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 详情内容 -->
    <view v-else-if="reimbursement" class="detail-content">
      <!-- 状态卡片 -->
      <view class="section status-card">
        <view class="card-header">
          <text class="claim-number">{{ reimbursement.claimNumber }}</text>
          <view class="status-badge" :class="getStatusClass(reimbursement.status)">
            <text>{{ getStatusText(reimbursement.status) }}</text>
          </view>
        </view>
        <view class="card-body">
          <view class="info-row">
            <text class="label">提交时间:</text>
            <text class="value">{{ formatFullDateTime(reimbursement.submittedAt) }}</text>
          </view>
          <view class="info-row">
            <text class="label">提交人:</text>
            <text class="value">{{ reimbursement.submittedBy?.nickname || '-' }}</text>
          </view>
        </view>
      </view>

      <!-- 费用汇总卡片 -->
      <view class="section cost-summary-card">
        <text class="section-title">费用明细</text>

        <view class="record-summary">
          <text class="record-summary-title">采购记录明细 ({{ auditPurchaseRecords.length }})</text>
          <text class="record-summary-total">¥{{ purchaseRecordsTotal }}</text>
        </view>

        <view v-if="auditPurchaseRecords.length > 0" class="record-audit-list">
          <view
            v-for="record in auditPurchaseRecords"
            :key="record.id"
            class="record-audit-card"
          >
            <view class="record-audit-top">
              <view class="record-audit-main">
                <view class="record-audit-heading">
                  <view class="record-audit-title">
                    <text class="record-audit-name">{{ record.procurementSkuName || record.ingredientName }}</text>
                    <text
                      v-if="record.procurementSkuName && record.procurementSkuName !== record.ingredientName"
                      class="record-audit-subtitle"
                    >
                      标准原料：{{ record.ingredientName }}
                    </text>
                  </view>
                  <text class="record-audit-cost">¥{{ formatMoney(record.actualCost) }}</text>
                </view>
                <view class="record-audit-meta">
                  <text class="meta-chip">{{ record.purchaseChannel || '未填写渠道' }}</text>
                  <text v-if="record.productModel" class="meta-chip">{{ record.productModel }}</text>
                </view>
              </view>
            </view>

            <view class="record-audit-metrics">
              <view class="metric-pill">
                <text class="metric-label">需要采购</text>
                <text class="metric-value">{{ record.neededQuantityText }}</text>
              </view>
              <view class="metric-pill">
                <text class="metric-label">实际采购</text>
                <text class="metric-value">{{ record.purchasedQuantityText }}</text>
              </view>
              <view class="metric-pill">
                <text class="metric-label">折算单价</text>
                <text class="metric-value">{{ record.unitPriceText }}</text>
              </view>
              <view class="metric-pill">
                <text class="metric-label">上次折算单价</text>
                <text class="metric-value">{{ record.previousUnitPriceText }}</text>
              </view>
              <view class="metric-pill">
                <text class="metric-label">当前库存</text>
                <text class="metric-value">{{ record.stockText }}</text>
              </view>
              <view class="metric-pill">
                <text class="metric-label">增减幅度</text>
                <text class="metric-value" :class="record.deltaRateClass">
                  {{ record.deltaRateText }}
                </text>
              </view>
            </view>

            <view v-if="record.normalizedQuantityText || record.notes" class="record-audit-extra">
              <text v-if="record.normalizedQuantityText" class="extra-text">
                {{ record.normalizedQuantityText }}
              </text>
              <text v-if="record.notes" class="extra-text">备注：{{ record.notes }}</text>
            </view>
          </view>
        </view>

        <view v-else class="record-empty-state">
          <text>暂无采购记录，当前仅展示其它费用与报销总额</text>
        </view>

        <!-- 平台运费 -->
        <view v-if="reimbursement.platformShippingFee > 0" class="cost-row">
          <text class="label">平台运费</text>
          <text class="value">¥{{ reimbursement.platformShippingFee.toFixed(2) }}</text>
        </view>

        <!-- 平台打包费 -->
        <view v-if="reimbursement.platformPackagingFee > 0" class="cost-row">
          <text class="label">平台打包费</text>
          <text class="value">¥{{ reimbursement.platformPackagingFee.toFixed(2) }}</text>
        </view>

        <!-- 自定义费用明细 -->
        <view v-if="hasCustomFees" class="custom-fees-section">
          <text class="custom-fees-title">其它费用</text>
          <view
            v-for="(fee, index) in reimbursement.customFees"
            :key="index"
            class="custom-fee-row"
          >
            <view class="fee-copy">
              <text class="fee-desc">{{ getCustomFeeHeading(fee) }}</text>
              <text
                v-if="getCustomFeeNote(fee)"
                class="fee-note"
              >
                {{ getCustomFeeNote(fee) }}
              </text>
            </view>
            <text class="fee-amount">¥{{ fee.amount.toFixed(2) }}</text>
          </view>
        </view>

        <!-- 总金额 -->
        <view class="total-row">
          <text class="total-label">报销总额</text>
          <text class="total-value">¥{{ reimbursement.totalActualCost.toFixed(2) }}</text>
        </view>
      </view>

      <!-- 采购清单 -->
      <view class="section">
        <text class="section-title">包含采购清单 ({{ reimbursement.purchaseLists?.length || 0 }})</text>
        <view class="purchase-lists">
          <view
            v-for="(list, index) in reimbursement.purchaseLists"
            :key="index"
            class="purchase-card"
          >
            <view class="card-header">
              <text class="date">{{ formatDate(list.targetDate) }}</text>
              <text class="status">{{ getListStatusText(list.status) }}</text>
            </view>
            <view class="card-body">
              <view class="info-row">
                <text class="label">原料种类:</text>
                <text class="value">{{ list.itemCount }} 种</text>
              </view>
              <view class="info-row">
                <text class="label">预估成本:</text>
                <text class="value">¥{{ list.totalEstimatedCost.toFixed(2) }}</text>
              </view>
              <view class="info-row">
                <text class="label">订单数量:</text>
                <text class="value">{{ list.sourceOrderIds?.length || 0 }} 个</text>
              </view>
            </view>
            <!-- 展开查看原料明细 -->
            <view class="items-expand" @tap="toggleItems(index)">
              <text class="expand-text">{{ expandedItems[index] ? '收起' : '展开' }}原料明细</text>
              <text class="expand-icon">{{ expandedItems[index] ? '▲' : '▼' }}</text>
            </view>
            <view v-if="expandedItems[index]" class="items-list">
              <view
                v-for="(item, idx) in list.items"
                :key="idx"
                class="item-row"
              >
                <text class="item-name">{{ item.ingredientName }}</text>
                <text class="item-quantity">{{ Number(item.quantityNeeded).toFixed(2) }}{{ item.quantityUnit }}</text>
                <text class="item-cost">¥{{ item.estimatedCost.toFixed(2) }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 发票照片 -->
      <view class="section">
        <view class="section-header">
          <text class="section-title">支付凭证</text>
          <!-- 上传按钮（可编辑状态下显示） -->
          <view
            v-if="canEditReceipts"
            class="upload-btn-mini"
            @tap="appendReceiptPhotos"
          >
            <text>+</text>
            <text>添加</text>
          </view>
        </view>

        <!-- 有图片时显示 -->
        <view v-if="reimbursement.receiptUrls && reimbursement.receiptUrls.length > 0" class="photos-grid">
          <view
            v-for="(url, index) in reimbursement.receiptUrls"
            :key="index"
            class="photo-item-wrapper"
          >
            <view
              class="photo-item"
              @tap="previewPhoto(url)"
            >
              <image :src="url" mode="aspectFill" />
            </view>
            <!-- 删除按钮（可编辑状态下显示） -->
            <view
              v-if="canEditReceipts"
              class="delete-btn"
              @tap.stop="removeReceiptPhoto(index)"
            >
              <text>×</text>
            </view>
          </view>
        </view>

        <!-- 无图片时显示提示 -->
        <view v-else class="empty-photos">
          <text>暂无支付凭证</text>
          <text v-if="canEditReceipts" class="upload-hint" @tap="appendReceiptPhotos">点击上传</text>
        </view>
      </view>

      <!-- 报销凭证（所有用户可见） -->
      <view v-if="reimbursement.paymentProofUrls && reimbursement.paymentProofUrls.length > 0" class="section">
        <view class="section-header">
          <text class="section-title">报销凭证</text>
          <!-- 管理员操作按钮 -->
          <view v-if="isAdmin" class="action-buttons">
            <view class="action-btn-mini replace" @tap="uploadPaymentProof">
              <text>替换</text>
            </view>
            <view class="action-btn-mini delete" @tap="clearPaymentProof">
              <text>清空</text>
            </view>
          </view>
        </view>
        <view class="photos-grid">
          <view
            v-for="(url, index) in reimbursement.paymentProofUrls"
            :key="index"
            class="photo-item"
            @tap="previewPaymentProof(url)"
          >
            <image :src="url" mode="aspectFill" />
          </view>
        </view>
      </view>

      <!-- 管理员上传报销凭证按钮（当没有报销凭证时显示） -->
      <view
        v-if="isAdmin && (!reimbursement.paymentProofUrls || reimbursement.paymentProofUrls.length === 0)"
        class="bottom-actions"
      >
        <view v-if="pendingPriceChangeCount > 0" class="payment-proof-note">
          <text>
            上传报销凭证后将确认本次价格变更并完成报销（{{ pendingPriceChangeCount }}项）。
          </text>
        </view>
        <button
          class="action-btn upload"
          @tap="uploadPaymentProof"
          :loading="uploading"
          :disabled="uploading"
        >
          <text v-if="!uploading">上传报销凭证</text>
          <text v-else>上传中...</text>
        </button>
      </view>

      <!-- 重新提交按钮 -->
      <view
        v-if="reimbursement.status === 'REJECTED' || reimbursement.status === 'REQUIRES_RESUBMIT'"
        class="bottom-actions"
      >
        <button
          class="action-btn resubmit"
          @tap="resubmit"
          :loading="resubmitting"
        >
          <text v-if="!resubmitting">重新提交</text>
          <text v-else>提交中...</text>
        </button>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败</text>
    </view>
  </view>
</template>

<script setup lang="ts">
// 强制重新编译标记 2026-01-26 20:47 - 清空报销凭证功能修复
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  getReimbursementDetail,
  getPurchaseRecords,
  uploadPaymentProofFiles,
  clearPaymentProof as clearPaymentProofApi,
  appendReceiptUrls,
  removeReceiptUrl
} from '@/api/purchasing';
import {
  formatReimbursementCustomFeeTitle,
  getReimbursementCustomFeeCategoryLabel,
} from '@/constants/reimbursement';

// 状态管理
const reimbursementId = ref('');
const reimbursement = ref<any>(null);
const loading = ref(true);
const resubmitting = ref(false);
const uploading = ref(false);
const uploadingReceipts = ref(false);
const expandedItems = ref<Record<number, boolean>>({});
const purchaseRecordsByListId = ref<Record<string, any[]>>({});

// 判断是否为管理员
const isAdmin = computed(() => {
  const user = uni.getStorageSync('user');
  return user && user.role === 'ADMIN';
});

// 立即输出管理员状态测试
console.log('🔴 立即执行测试 - isAdmin:', isAdmin.value);

// 判断是否可以编辑支付凭证
const canEditReceipts = computed(() => {
  const user = uni.getStorageSync('user');
  if (!user || !reimbursement.value) return false;

  // 管理员或提交者可以编辑
  const isOwner = user.id === reimbursement.value.submittedById;
  const canEdit = isAdmin.value || isOwner;

  // 只有待报销、被驳回、需重新提交状态可以编辑
  const editableStatuses = ['PENDING_REVIEW', 'REJECTED', 'REQUIRES_RESUBMIT'];
  const statusEditable = editableStatuses.includes(reimbursement.value.status);

  return canEdit && statusEditable;
});

const pendingPriceChangeCount = computed(() => {
  const changes = reimbursement.value?.priceChanges || [];
  return changes.filter((change: any) => change?.status === 'PENDING').length;
});

// 是否有自定义费用
const hasCustomFees = computed(() => {
  if (!reimbursement.value?.customFees) return false;
  return reimbursement.value.customFees.length > 0;
});

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

const formatDecimal = (value: number, maxDecimalPlaces = 3) => {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(maxDecimalPlaces);
  return fixed.replace(/\.?0+$/, '');
};

const formatMoney = (value?: number | null) => {
  return Number(value || 0).toFixed(2);
};

const formatCustomFeeTitle = (fee: any) => {
  return formatReimbursementCustomFeeTitle(fee);
};

const getCustomFeeHeading = (fee: any) => {
  if (fee?.category) {
    return getReimbursementCustomFeeCategoryLabel(fee.category);
  }

  return formatCustomFeeTitle(fee);
};

const getCustomFeeNote = (fee: any) => {
  if (!fee?.category || !fee?.description) return '';

  const categoryLabel = getReimbursementCustomFeeCategoryLabel(fee.category);
  return fee.description.trim() === categoryLabel ? '' : fee.description.trim();
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

const formatNeededQuantity = (item?: any) => {
  if (!item) return '-';

  const quantity = Number(item.quantityNeeded || 0);
  const unit = formatMeasurementUnit(item.quantityUnit || item?.ingredient?.purchaseUnit);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return unit || '-';
  }

  return `${formatDecimal(quantity)}${unit}`;
};

const formatRecordRawSummary = (record: any, item?: any, priceChange?: any) => {
  const packageCount = Number(record?.actualPackageCount || 0);
  const packageSize = Number(record?.actualPackageSize || 0);
  const packageUnit = record?.actualPackageUnit;

  if (
    Number.isFinite(packageCount) &&
    packageCount > 0 &&
    Number.isFinite(packageSize) &&
    packageSize > 0 &&
    packageUnit
  ) {
    return `${formatDecimal(packageCount)}${getRecordPurchaseUnit(record, item, priceChange)} x ${formatDecimal(packageSize)}${packageUnit}`;
  }

  return '';
};

const formatRecordQuantity = (record: any, item?: any, priceChange?: any) => {
  const rawSummary = formatRecordRawSummary(record, item, priceChange);
  if (rawSummary) {
    return rawSummary;
  }

  const quantity = Number(record?.actualQuantity || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return '-';
  }

  return `${formatDecimal(quantity)}${getRecordPurchaseUnit(record, item, priceChange)}`;
};

const formatRecordNormalizedSummary = (record: any, item?: any, priceChange?: any) => {
  if (formatRecordRawSummary(record, item, priceChange)) {
    return '';
  }

  const quantity = Number(record?.actualQuantity || 0);
  const baseQuantity = Number(record?.actualBaseQuantity || 0);
  const baseSummary =
    Number.isFinite(baseQuantity) && baseQuantity > 0 && record?.actualBaseUnit
      ? `${formatDecimal(baseQuantity, 3)}${formatMeasurementUnit(record.actualBaseUnit)}`
      : '';
  const purchaseSummary =
    Number.isFinite(quantity) && quantity > 0
      ? `${formatDecimal(quantity, 3)}${getPurchaseRecordUnit(item, priceChange)}`
      : '';

  if (!baseSummary || !purchaseSummary || purchaseSummary === baseSummary) {
    return '';
  }

  return `折算 ${baseSummary} ≈ ${purchaseSummary}`;
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

const formatSkuStockText = (record: any, item?: any) => {
  if (!record?.procurementSkuId) {
    return '-';
  }

  if (!record.procurementSkuHasStockLedger) {
    return '暂无库存记录';
  }

  const quantity = Number(record.procurementSkuStockBaseQuantity ?? 0);
  if (!Number.isFinite(quantity)) {
    return '-';
  }

  const unit = formatMeasurementUnit(
    record.procurementSkuStockBaseUnit || record.actualBaseUnit,
  );

  if (getRecordBaseUnit(record, item) === 'PCS') {
    return `${formatDecimal(quantity, 3)}${getPcsDisplayUnit(item)}`;
  }

  return `${formatDecimal(quantity, 3)}${unit}`;
};

const formatDeltaRate = (deltaRate?: number | null) => {
  if (deltaRate === undefined || deltaRate === null || !Number.isFinite(Number(deltaRate))) {
    return '暂无';
  }

  const percentage = Number(deltaRate) * 100;
  const prefix = percentage > 0 ? '+' : '';
  return `${prefix}${percentage.toFixed(1)}%`;
};

const getDeltaRateClass = (deltaRate?: number | null) => {
  if (deltaRate === undefined || deltaRate === null || !Number.isFinite(Number(deltaRate))) {
    return 'neutral';
  }

  if (Number(deltaRate) > 0) {
    return 'up';
  }

  if (Number(deltaRate) < 0) {
    return 'down';
  }

  return 'flat';
};

const priceChangeMap = computed(() => {
  const changes = reimbursement.value?.priceChanges || [];
  return new Map(
    changes
      .filter((change: any) => change?.purchaseRecordId)
      .map((change: any) => [change.purchaseRecordId, change]),
  );
});

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
          neededQuantityText: formatNeededQuantity(purchaseItem),
          purchasedQuantityText: formatRecordQuantity(record, purchaseItem, priceChange),
          normalizedQuantityText: formatRecordNormalizedSummary(record, purchaseItem, priceChange),
          unitPriceText: formatComparableUnitPrice(record, purchaseItem),
          previousUnitPriceText: formatComparablePreviousUnitPrice(purchaseItem, priceChange, record),
          deltaRateText: formatDeltaRate(priceChange?.deltaRate),
          deltaRateClass: getDeltaRateClass(priceChange?.deltaRate),
          stockText: formatSkuStockText(record, purchaseItem),
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

// 页面加载
onLoad((options: any) => {
  reimbursementId.value = options.id;
  loadDetail();
});

// 加载详情
const loadDetail = async () => {
  loading.value = true;

  try {
    const res: any = await getReimbursementDetail(reimbursementId.value);

    if (res.code === 0) {
      reimbursement.value = res.data;
      await loadPurchaseRecordsForReimbursement();

      // 调试日志 - 强制触发重新编译
      console.log('='.repeat(50));
      console.log('=== 报销单详情调试信息 ===');
      console.log('1. 完整数据:', res.data);
      console.log('2. paymentProofUrls:', res.data.paymentProofUrls);
      console.log('3. paymentProofUrls长度:', res.data.paymentProofUrls?.length || 0);
      console.log('4. 用户信息:', uni.getStorageSync('user'));
      console.log('5. isAdmin:', isAdmin.value);
      console.log('6. 是否显示上传按钮:', isAdmin.value && (!res.data.paymentProofUrls || res.data.paymentProofUrls.length === 0));
      console.log('='.repeat(50));
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载报销单详情失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const loadPurchaseRecordsForReimbursement = async () => {
  purchaseRecordsByListId.value = {};

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
        return {
          listId: list.id,
          records: [],
          success: false,
          error,
        };
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

  if (failedCount > 0) {
    uni.showToast({
      title: `有${failedCount}个采购清单的记录加载失败`,
      icon: 'none',
    });
  }
};

// 展开/收起原料明细
const toggleItems = (index: number) => {
  expandedItems.value[index] = !expandedItems.value[index];
};

// 预览照片
const previewPhoto = (currentUrl: string) => {
  if (reimbursement.value && reimbursement.value.receiptUrls) {
    uni.previewImage({
      urls: reimbursement.value.receiptUrls,
      current: currentUrl,
    });
  }
};

// 预览报销凭证
const previewPaymentProof = (currentUrl: string) => {
  if (reimbursement.value && reimbursement.value.paymentProofUrls) {
    uni.previewImage({
      urls: reimbursement.value.paymentProofUrls,
      current: currentUrl,
    });
  }
};

// 重新提交
const resubmit = () => {
  uni.showModal({
    title: '重新提交',
    content: '重新提交需要选择采购清单和上传发票照片',
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

// 上传报销凭证
const uploadPaymentProof = async () => {
  // 选择图片
  const res = await uni.chooseImage({
    count: 9,
    sizeType: ['compressed'],
  });

  if (!res.tempFilePaths || res.tempFilePaths.length === 0) {
    return;
  }

  uploading.value = true;

  try {
    // 调用后端API上传文件（会自动处理COS上传）
    await uploadPaymentProofFiles(reimbursementId.value, res.tempFilePaths);

    uni.showToast({
      title: '上传成功',
      icon: 'success',
    });

    // 刷新详情
    await loadDetail();
  } catch (error: any) {
    console.error('上传报销凭证失败', error);
    uni.showToast({
      title: error.message || '上传失败',
      icon: 'none',
    });
  } finally {
    uploading.value = false;
  }
};

// 清空报销凭证
const clearPaymentProof = async () => {
  uni.showModal({
    title: '确认清空',
    content: '确定要清空所有报销凭证吗？此操作不可恢复。',
    confirmText: '清空',
    confirmColor: '#ff4444',
    success: async (res) => {
      if (res.confirm) {
        uploading.value = true;

        try {
          // 调用后端API清空报销凭证（DELETE请求）
          await clearPaymentProofApi(reimbursementId.value);

          uni.showToast({
            title: '清空成功',
            icon: 'success',
          });

          // 刷新详情
          await loadDetail();
        } catch (error: any) {
          console.error('清空报销凭证失败', error);
          uni.showToast({
            title: error.message || '清空失败',
            icon: 'none',
          });
        } finally {
          uploading.value = false;
        }
      }
    },
  });
};

// 追加支付凭证
const appendReceiptPhotos = async () => {
  // 检查当前图片数量
  const currentCount = reimbursement.value?.receiptUrls?.length || 0;
  const maxCount = 10;
  const canUpload = maxCount - currentCount;

  if (canUpload <= 0) {
    uni.showToast({
      title: '最多只能上传10张图片',
      icon: 'none',
    });
    return;
  }

  // 选择图片
  const res = await uni.chooseImage({
    count: canUpload,
    sizeType: ['compressed'],
  });

  if (!res.tempFilePaths || res.tempFilePaths.length === 0) {
    return;
  }

  uploadingReceipts.value = true;

  try {
    // 调用后端API上传文件
    await appendReceiptUrls(reimbursementId.value, res.tempFilePaths);

    uni.showToast({
      title: '上传成功',
      icon: 'success',
    });

    // 刷新详情
    await loadDetail();
  } catch (error: any) {
    console.error('上传支付凭证失败', error);
    uni.showToast({
      title: error.message || '上传失败',
      icon: 'none',
    });
  } finally {
    uploadingReceipts.value = false;
  }
};

// 删除支付凭证
const removeReceiptPhoto = async (index: number) => {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这张支付凭证吗？',
    confirmText: '删除',
    confirmColor: '#ff4444',
    success: async (res) => {
      if (res.confirm) {
        try {
          await removeReceiptUrl(reimbursementId.value, index);

          uni.showToast({
            title: '删除成功',
            icon: 'success',
          });

          // 刷新详情
          await loadDetail();
        } catch (error: any) {
          console.error('删除支付凭证失败', error);
          uni.showToast({
            title: error.message || '删除失败',
            icon: 'none',
          });
        }
      }
    },
  });
};

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'PENDING_REVIEW': '待报销',
    'REIMBURSED': '已报销',
    'REJECTED': '已驳回',
    'REQUIRES_RESUBMIT': '需重新提交',
  };
  return statusMap[status] || status;
};

// 获取状态样式类
const getStatusClass = (status: string) => {
  const classMap: Record<string, string> = {
    'PENDING_REVIEW': 'pending',
    'REIMBURSED': 'reimbursed',
    'REJECTED': 'rejected',
    'REQUIRES_RESUBMIT': 'resubmit',
  };
  return classMap[status] || '';
};

// 获取清单状态文本
const getListStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'DRAFT': '草稿',
    'PENDING': '待采购',
    'COMPLETED': '已完成',
    'CANCELLED': '已取消',
  };
  return statusMap[status] || status;
};

// 格式化完整日期时间
const formatFullDateTime = (dateStr?: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

</script>

<style scoped lang="scss">
.reimbursement-detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx;
}

.header {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;

  .title {
    font-size: 44rpx;
    font-weight: bold;
    color: #333;
  }
}

.loading-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 32rpx;

  text {
    font-size: 28rpx;
    color: #999;
  }

  .error-icon {
    font-size: 120rpx;
    margin-bottom: 16rpx;
  }
}

.detail-content {
  padding: 0 32rpx;
}

.section {
  background-color: #fff;
  margin-bottom: 24rpx;
  border-radius: 16rpx;
  padding: 32rpx;

  .section-title {
    display: block;
    font-size: 30rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 24rpx;
  }
}

.status-card {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .claim-number {
      font-size: 32rpx;
      font-weight: bold;
      color: #333;
    }

    .status-badge {
      padding: 12rpx 24rpx;
      border-radius: 8rpx;
      font-size: 24rpx;
      font-weight: bold;

      &.pending {
        background-color: #fff7e6;
        color: #fa8c16;
      }

      &.reimbursed {
        background-color: #e8f5e9;
        color: #37b24d;
      }

      &.rejected {
        background-color: #ffebee;
        color: #f44336;
      }

      &.resubmit {
        background-color: #fff3e0;
        color: #f57c00;
      }
    }
  }

  .card-body {
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12rpx;

      &:last-child {
        margin-bottom: 0;
      }

      .label {
        font-size: 26rpx;
        color: #666;
      }

      .value {
        font-size: 26rpx;
        color: #333;
        font-weight: 500;
      }
    }
  }
}

.purchase-lists {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.purchase-card {
  background-color: #f9f9f9;
  border-radius: 12rpx;
  padding: 24rpx;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;

    .date {
      font-size: 28rpx;
      font-weight: bold;
      color: #333;
    }

    .status {
      font-size: 22rpx;
      color: #51cf66;
      padding: 4rpx 12rpx;
      background-color: #e8f5e9;
      border-radius: 4rpx;
    }
  }

  .card-body {
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8rpx;

      &:last-child {
        margin-bottom: 0;
      }

      .label {
        font-size: 24rpx;
        color: #999;
      }

      .value {
        font-size: 24rpx;
        color: #333;
      }
    }
  }

  .items-expand {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid #e8e8e8;

    .expand-text {
      font-size: 24rpx;
      color: #1890ff;
    }

    .expand-icon {
      font-size: 20rpx;
      color: #1890ff;
    }
  }

  .items-list {
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid #e8e8e8;
  }

  .item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12rpx;

    &:last-child {
      margin-bottom: 0;
    }

    .item-name {
      flex: 1;
      font-size: 24rpx;
      color: #333;
    }

    .item-quantity {
      font-size: 24rpx;
      color: #666;
      margin-right: 16rpx;
    }

    .item-cost {
      font-size: 24rpx;
      font-weight: bold;
      color: #ff6b6b;
    }
  }
}

.photos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.photo-item-wrapper {
  position: relative;
  width: 200rpx;
  height: 200rpx;
}

.photo-item {
  width: 200rpx;
  height: 200rpx;

  image {
    width: 100%;
    height: 100%;
    border-radius: 12rpx;
  }
}

.delete-btn {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 44rpx;
  height: 44rpx;
  background-color: #ff4444;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.2);
  z-index: 10;

  text {
    color: #fff;
    font-size: 32rpx;
    font-weight: bold;
    line-height: 1;
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;

  .section-title {
    font-size: 30rpx;
    font-weight: bold;
    color: #333;
  }

  .action-buttons {
    display: flex;
    gap: 12rpx;
  }
}

.action-btn-mini {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8rpx 20rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  font-weight: bold;

  &.replace {
    background: linear-gradient(135deg, #4dabf7 0%, #339af0 100%);
    color: #fff;
    box-shadow: 0 2rpx 8rpx rgba(51, 154, 240, 0.2);
  }

  &.delete {
    background: linear-gradient(135deg, #ff8787 0%, #ff6b6b 100%);
    color: #fff;
    box-shadow: 0 2rpx 8rpx rgba(255, 107, 107, 0.2);
  }

  text {
    color: inherit;
  }
}

.upload-btn-mini {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 8rpx 16rpx;
  background: linear-gradient(135deg, #4dabf7 0%, #339af0 100%);
  border-radius: 8rpx;
  box-shadow: 0 4rpx 12rpx rgba(51, 154, 240, 0.2);

  text {
    color: #fff;
    font-size: 24rpx;
    font-weight: bold;

    &:first-child {
      font-size: 32rpx;
      line-height: 1;
    }
  }
}

.empty-photos {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60rpx 32rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;

  text {
    font-size: 26rpx;
    color: #999;

    &:not(.upload-hint) {
      margin-bottom: 16rpx;
    }
  }

  .upload-hint {
    color: #1890ff;
    text-decoration: underline;
  }
}

.review-section {
  .review-info {
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12rpx;

      &:last-child {
        margin-bottom: 0;
      }

      .label {
        font-size: 26rpx;
        color: #666;
      }

      .value {
        flex: 1;
        font-size: 26rpx;
        color: #333;
        text-align: right;
      }

      &.comment {
        .value {
          color: #ff6b6b;
        }
      }
    }
  }
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 24rpx 32rpx;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
  z-index: 100;

  .action-btn {
    width: 100%;
    height: 88rpx;
    border-radius: 16rpx;
    font-size: 32rpx;
    font-weight: bold;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;

    &.resubmit {
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(255, 107, 107, 0.3);

      &:active {
        opacity: 0.8;
      }
    }

     &.upload {
       background: linear-gradient(135deg, #4dabf7 0%, #339af0 100%);
       color: #fff;
       box-shadow: 0 8rpx 16rpx rgba(51, 154, 240, 0.3);

       &:active {
         opacity: 0.8;
       }

       &[disabled] {
         background: #d9d9d9;
         color: #999;
         box-shadow: none;
       }
     }
   }
 }

.payment-proof-note {
  margin-bottom: 16rpx;
  padding: 16rpx 20rpx;
  border: 1rpx solid #91d5ff;
  border-radius: 12rpx;
  background-color: #e6f7ff;

  text {
    font-size: 24rpx;
    line-height: 1.5;
    color: #096dd9;
  }
}

.cost-summary-card {
  background: linear-gradient(135deg, #fff9e6 0%, #fff3d3 100%);
  border: 2rpx solid #ffd666;

  .section-title {
    color: #d48806;
    border-bottom: 2rpx solid #ffd666;
    padding-bottom: 16rpx;
  }

  .record-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16rpx;
    margin-bottom: 16rpx;
    padding: 16rpx 20rpx;
    background: rgba(255, 255, 255, 0.72);
    border: 1rpx solid rgba(212, 136, 6, 0.12);
    border-radius: 14rpx;

    .record-summary-title {
      flex: 1;
      font-size: 28rpx;
      font-weight: bold;
      color: #8c5a00;
      line-height: 1.3;
    }

    .record-summary-total {
      flex-shrink: 0;
      font-size: 32rpx;
      font-weight: bold;
      color: #ff6b6b;
      line-height: 1;
    }
  }

  .record-audit-list {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
    margin-bottom: 20rpx;
  }

  .record-audit-card {
    padding: 18rpx 20rpx;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 14rpx;
    box-shadow: inset 0 0 0 1rpx rgba(255, 214, 102, 0.45);
  }

  .record-audit-top {
    margin-bottom: 12rpx;
  }

  .record-audit-main {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  .record-audit-heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16rpx;
  }

  .record-audit-title {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    min-width: 0;
  }

  .record-audit-name {
    font-size: 28rpx;
    font-weight: bold;
    color: #333;
    line-height: 1.4;
  }

  .record-audit-subtitle {
    font-size: 22rpx;
    color: #9c7b39;
    line-height: 1.35;
  }

  .record-audit-cost {
    flex-shrink: 0;
    font-size: 28rpx;
    font-weight: bold;
    color: #ff6b6b;
  }

  .record-audit-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6rpx;
  }

  .meta-chip {
    padding: 2rpx 10rpx;
    border-radius: 999rpx;
    background: rgba(212, 136, 6, 0.08);
    font-size: 22rpx;
    color: #8c7a5d;
    line-height: 1.35;
  }

  .record-audit-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8rpx;
  }

  .metric-pill {
    display: flex;
    align-items: center;
    gap: 8rpx;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 10rpx 12rpx;
    background: rgba(255, 249, 230, 0.92);
    border-radius: 10rpx;

    .metric-label {
      font-size: 22rpx;
      color: #999;
      white-space: nowrap;
    }

    .metric-value {
      flex: 1;
      min-width: 0;
      font-size: 24rpx;
      font-weight: 600;
      color: #333;
      line-height: 1.4;
      word-break: break-word;
      text-align: right;

      &.up {
        color: #f03e3e;
      }

      &.down {
        color: #2f9e44;
      }

      &.flat,
      &.neutral {
        color: #666;
      }
    }

    &.full-width {
      grid-column: 1 / -1;
    }
  }

  .record-audit-extra {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    margin-top: 10rpx;
    padding-top: 10rpx;
    border-top: 1rpx dashed rgba(212, 136, 6, 0.2);

    .extra-text {
      font-size: 22rpx;
      color: #8c7a5d;
      line-height: 1.4;
    }
  }

  .record-empty-state {
    margin-bottom: 24rpx;
    padding: 32rpx 24rpx;
    border-radius: 16rpx;
    background: rgba(255, 255, 255, 0.72);
    text-align: center;

    text {
      font-size: 24rpx;
      color: #999;
      line-height: 1.6;
    }
  }

  .cost-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16rpx 0;
    border-bottom: 1rpx solid rgba(0, 0, 0, 0.05);

    &:last-child {
      border-bottom: none;
    }

    .label {
      font-size: 28rpx;
      color: #666;
    }

    .value {
      font-size: 30rpx;
      font-weight: bold;
      color: #333;
    }
  }

  .custom-fees-section {
    margin: 16rpx 0;
    padding: 16rpx;
    background-color: rgba(255, 255, 255, 0.6);
    border-radius: 12rpx;

    .custom-fees-title {
      display: block;
      font-size: 26rpx;
      color: #d48806;
      margin-bottom: 12rpx;
      font-weight: bold;
    }

    .custom-fee-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 8rpx 0;

      .fee-copy {
        flex: 1;
        padding-right: 16rpx;

        .fee-desc {
          display: block;
          font-size: 26rpx;
          color: #666;
        }

        .fee-note {
          display: block;
          margin-top: 6rpx;
          font-size: 22rpx;
          color: #999;
        }
      }

      .fee-amount {
        font-size: 26rpx;
        font-weight: bold;
        color: #ff6b6b;
      }
    }
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 2rpx solid #ffd666;

    .total-label {
      font-size: 32rpx;
      font-weight: bold;
      color: #d48806;
    }

    .total-value {
      font-size: 40rpx;
      font-weight: bold;
      color: #ff6b6b;
    }
  }
}
</style>
