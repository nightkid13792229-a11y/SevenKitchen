<template>
  <view class="purchase-detail-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">{{ detailTitle }}</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 详情内容 -->
    <view v-else-if="purchaseList" class="detail-content">
      <!-- 日期变更警告横幅 -->
      <view v-if="dateChanges.hasChanges" class="date-change-warning">
        <view class="warning-header">
          <text class="warning-icon">⚠️</text>
          <text class="warning-title">检测到 {{ dateChanges.changedOrders.length }} 个订单的制作日期已变更</text>
        </view>
        <view class="warning-list">
          <view
            v-for="(order, index) in dateChanges.changedOrders"
            :key="index"
            class="warning-item"
          >
            <text class="order-info">{{ order.orderNumber }}: {{ order.originalDate }} → {{ order.currentDate }}</text>
            <text class="order-detail">{{ order.customerName }} · {{ order.dogName }}</text>
          </view>
        </view>
        <view class="warning-actions">
          <button class="warning-btn ignore" @tap="ignoreDateChanges">忽略</button>
        </view>
      </view>

      <!-- 状态卡片 -->
      <view class="section status-card">
        <view class="card-header">
          <view class="header-left">
            <view class="target-line">
              <text class="target-date">{{ formatDate(purchaseList.targetDate) }}</text>
              <text class="time-badge">采购时间</text>
            </view>
            <text class="create-time">创建于 {{ formatFullDateTime(purchaseList.createdAt) }}</text>
          </view>
          <view class="status-badge" :class="getStatusClass(purchaseList.status)">
            <text>{{ getStatusText(purchaseList.status) }}</text>
          </view>
        </view>

        <!-- 完成时间 -->
        <view v-if="purchaseList.completedAt" class="complete-time">
          <text class="label">完成时间:</text>
          <text class="value">{{ formatFullDateTime(purchaseList.completedAt) }}</text>
        </view>

        <!-- 创建人 -->
        <view class="creator">
          <text class="label">创建人:</text>
          <text class="value">{{ purchaseList.createdBy?.nickname || '-' }}</text>
        </view>
      </view>

      <view
        v-if="purchaseList.kind === 'ORDER_DEMAND' && purchaseList.status === 'PENDING' && (pendingAppendLoading || pendingAppendOrders.length > 0)"
        class="section pending-append-card"
      >
        <view class="section-header">
          <text class="section-title pending-title">新增订单待合并</text>
          <text v-if="pendingAppendOrders.length > 0" class="pending-count">
            {{ pendingAppendOrders.length }} 单
          </text>
        </view>

        <text v-if="pendingAppendLoading" class="pending-hint">正在检查同日新增订单...</text>

        <template v-else>
          <text class="pending-hint">
            该日期已有采购清单，但又来了同一天的已付款订单。合并后会自动补齐原料需求，并把这些订单一起纳入当前清单。
          </text>

          <view class="pending-summary">
            <text>新增订单 {{ pendingAppendOrders.length }} 个</text>
            <text v-if="pendingAppendEstimatedCost > 0">
              新增预估 ¥{{ pendingAppendEstimatedCost.toFixed(2) }}
            </text>
          </view>

          <view class="pending-order-list">
            <view
              v-for="order in pendingAppendOrders"
              :key="order.orderId"
              class="pending-order-item"
            >
              <text class="pending-order-id">{{ formatOrderId(order.orderId) }}</text>
              <text class="pending-order-date">{{ formatDate(order.targetProductionDate) }}</text>
            </view>
          </view>

          <button
            class="merge-orders-btn"
            :loading="appendingOrders"
            @tap="appendPendingOrders"
          >
            {{ appendingOrders ? '合并中...' : `一键合并新增订单（${pendingAppendOrders.length}）` }}
          </button>
        </template>
      </view>

      <!-- 原料明细 -->
      <view class="section">
        <text class="section-title">原料明细 ({{ items.length }})</text>

        <!-- 按类型分组显示原料 -->
        <view v-if="groupedItems.length > 0" class="grouped-items">
          <view
            v-for="group in groupedItems"
            :key="group.type"
            class="ingredient-group"
          >
            <!-- 类型标题 -->
            <view class="group-header">
              <text class="group-title">{{ getTypeLabel(group.type) }} ({{ group.items.length }})</text>
            </view>

            <!-- 该类型的原料列表 -->
            <view class="items-list">
              <view
                v-for="(item, index) in group.items"
                :key="index"
                class="item-card"
              >
                <!-- 原料基本信息（始终显示） -->
                <view class="item-basic">
                  <view class="item-info">
                    <view class="item-heading">
                      <text class="item-name">{{ getPurchaseItemTitle(item) }}</text>
                      <text v-if="formatSkuReferencePrice(item)" class="sku-price">{{ formatSkuReferencePrice(item) }}</text>
                    </view>
                    <view v-if="item.resolvedSuggestedProductName && item.resolvedSuggestedProductName !== getPurchaseItemTitle(item)" class="item-sku-lines">
                      <text
                        class="item-sku secondary"
                      >
                        推荐参考：{{ item.resolvedSuggestedProductName }}
                      </text>
                    </view>
                    <view
                      v-if="formatBrandLabel(item.resolvedBrand) || item.resolvedPurchaseChannel || item.resolvedProductModel"
                      class="item-specs"
                    >
                      <text v-if="formatBrandLabel(item.resolvedBrand)" class="spec brand">{{ formatBrandLabel(item.resolvedBrand) }}</text>
                      <text v-if="item.resolvedPurchaseChannel" class="spec">{{ item.resolvedPurchaseChannel }}</text>
                      <text v-if="item.resolvedProductModel" class="spec">{{ item.resolvedProductModel }}</text>
                    </view>
                    <view class="item-demand-row">
                      <view class="stock-audit-inline">
                        <text>订单需求 {{ formatResolvedQuantity(item.resolvedGrossQuantityNeeded, item) }}</text>
                        <text class="audit-divider">|</text>
                        <text>库存抵扣 {{ formatResolvedQuantity(item.resolvedStockDeductedQuantity, item) }}</text>
                      </view>
                      <view class="item-quantity">
                        <text class="quantity-label">仍需采购</text>
                        <text class="quantity-value">{{ formatQuantity(item) }}</text>
                        <text class="quantity-unit">{{ getDisplayUnit(item) }}</text>
                      </view>
                    </view>
                  </view>

                  <view class="item-actions">
                    <!-- 删除原料按钮：仅补货清单允许人工删除，日采清单由订单生成不允许删除 -->
                    <button
                      v-if="purchaseList.kind === 'STOCK_REPLENISHMENT' && purchaseList.status === 'PENDING' && !purchaseList.startedAt"
                      class="delete-item-btn"
                      @tap="confirmDeleteItem(item)"
                    >
                      删除
                    </button>

                    <!-- 开始采购后显示的添加按钮 -->
                    <button
                      v-if="canManagePurchaseRecords && !item.noPurchaseNeeded"
                      class="continue-add-btn"
                      @tap="handleContinueAdd(item)"
                    >
                      添加采购记录
                    </button>
                    <button
                      v-if="canManagePurchaseRecords && shouldShowNoPurchaseButton(item)"
                      class="no-purchase-btn"
                      @tap="markItemNoPurchase(item)"
                      :loading="noPurchaseMarkingItemId === item.id"
                      :disabled="Boolean(noPurchaseMarkingItemId)"
                    >
                      无需采购
                    </button>
                  </view>
                </view>

                <view v-if="item.noPurchaseNeeded" class="no-purchase-card">
                  <view class="no-purchase-main">
                    <text class="no-purchase-title">无需采购</text>
                    <text v-if="item.noPurchaseReason" class="no-purchase-reason">{{ item.noPurchaseReason }}</text>
                  </view>
                  <button
                    v-if="canManagePurchaseRecords"
                    class="clear-no-purchase-btn"
                    @tap="clearItemNoPurchase(item)"
                  >
                    取消标记
                  </button>
                </view>

                <!-- 已开始采购且有记录：显示采购记录列表 -->
                <view v-if="purchaseList.startedAt && item.records.length > 0" class="item-expanded">
                  <view class="divider"></view>

                  <!-- 采购记录列表 -->
                  <view class="records-list">
                    <view
                      v-for="record in item.records"
                      :key="record.id"
                      class="record-item"
                    >
                      <view class="record-main">
                        <text v-if="record.resolvedProcurementSkuName" class="record-sku">
                          {{ record.resolvedProcurementSkuName }}
                        </text>
                        <view class="record-info">
                          <text class="record-quantity">{{ formatRecordQuantity(record, item) }}</text>
                          <text class="record-cost">¥{{ record.actualCost.toFixed(2) }}</text>
                          <text class="record-channel">{{ record.resolvedPurchaseChannel || getRecordSkuLabel(record, item) }}</text>
                        </view>
                        <view class="record-details">
                          <text v-if="record.resolvedProductModel || record.productModel" class="detail">
                            {{ record.resolvedProductModel || record.productModel }}
                          </text>
                          <text v-if="formatRecordNormalizedSummary(record, item)" class="detail">
                            {{ formatRecordNormalizedSummary(record, item) }}
                          </text>
                          <text class="detail-time">{{ formatFullDateTime(record.createdAt) }}</text>
                        </view>
                      </view>
                      <view v-if="canManagePurchaseRecords" class="record-actions">
                        <button class="edit-btn" @tap="editRecord(record)">编辑</button>
                        <button class="delete-btn" @tap="deleteRecord(record.id)">删除</button>
                      </view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 空状态 -->
        <view v-else class="empty-items">
          <text class="empty-text">该采购清单暂无原料</text>
        </view>

      </view>

      <!-- 关联订单 -->
      <view v-if="purchaseList.sourceOrderIds && purchaseList.sourceOrderIds.length > 0" class="section">
        <text class="section-title">关联订单 ({{ purchaseList.sourceOrderIds.length }})</text>
        <view class="order-list">
          <view
            v-for="(orderId, index) in purchaseList.sourceOrderIds"
            :key="index"
            class="order-item"
          >
            <text class="order-id">{{ formatOrderId(orderId) }}</text>
            <button class="copy-btn" @tap="copyOrderId(orderId)">
              <text class="copy-btn-text">复制</text>
            </button>
          </view>
        </view>
      </view>

      <!-- 底部操作栏 -->
      <view
        v-if="purchaseList.status === 'PENDING'"
        class="bottom-actions"
      >
        <!-- 未开始采购：显示开始采购按钮 -->
        <button
          v-if="!purchaseList.startedAt"
          class="action-btn start"
          @tap="startPurchase"
        >
          开始采购
        </button>

        <!-- 已开始采购：显示确认完成按钮 -->
        <template v-else>
          <button
            class="action-btn complete"
            @tap="completePurchase"
            :loading="completing"
          >
            <text v-if="!completing">确认采购完成</text>
            <text v-else>提交中...</text>
          </button>
        </template>
      </view>

      <!-- 已完成提示 -->
      <view
        v-if="purchaseList.status === 'COMPLETED'"
        class="bottom-actions completed"
      >
        <text class="completed-text">✓ 采购已完成</text>
        <button
          v-if="canReopenCompletedPurchase"
          class="action-btn reopen"
          @tap="reopenCompletedPurchase"
          :loading="reopening"
        >
          撤回完成
        </button>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败</text>
      <button class="retry-btn" @tap="loadDetail">重试</button>
    </view>

    <!-- 采购表单弹窗 -->
    <view v-if="showRecordForm" class="record-form-modal" @tap="closeRecordForm">
      <view class="modal-content" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">{{ modalTitle }}</text>
          <text class="modal-close" @tap="closeRecordForm">×</text>
        </view>

        <view class="modal-body">
          <view class="ingredient-summary-card">
            <view class="summary-main">
              <text class="summary-name">{{ selectedIngredient.ingredientName }}</text>
              <text class="summary-demand">采购任务</text>
            </view>
            <view class="record-demand-metrics">
              <view class="record-demand-metric">
                <text class="metric-label">订单需求</text>
                <text class="metric-value">{{ formatResolvedQuantity(selectedIngredient.resolvedGrossQuantityNeeded, selectedIngredient) }}</text>
              </view>
              <view class="record-demand-metric">
                <text class="metric-label">库存抵扣</text>
                <text class="metric-value">{{ formatResolvedQuantity(selectedIngredient.resolvedStockDeductedQuantity, selectedIngredient) }}</text>
              </view>
              <view class="record-demand-metric primary">
                <text class="metric-label">仍需采购</text>
                <text class="metric-value">{{ formatQuantity(selectedIngredient) }}{{ getDisplayUnit(selectedIngredient) }}</text>
              </view>
            </view>
            <text v-if="latestRecordSummary" class="summary-subtext">{{ latestRecordSummary }}</text>
          </view>

          <view class="form-section">
            <view class="form-section-head">
              <text class="form-label">采购商品</text>
              <text class="form-title-hint">选择本次实际买到的商品</text>
            </view>
            <view v-if="recordProcurementSkuOptions.length > 0" class="record-sku-list">
              <view
                v-for="sku in recordProcurementSkuOptions"
                :key="sku.id || sku.name"
                class="record-sku-option"
                :class="{ active: recordForm.procurementSkuId === sku.id }"
                @tap.stop="selectRecordSku(sku)"
              >
                <view class="record-sku-main">
                  <view class="record-sku-title-row">
                    <text class="record-sku-badge">{{ isRecommendedRecordSku(sku) ? '推荐' : '可替换' }}</text>
                    <text class="record-sku-name">{{ sku.name }}</text>
                  </view>
                  <view class="record-sku-meta">
                    <text v-if="sku.purchaseChannel">{{ sku.purchaseChannel }}</text>
                    <text v-if="sku.productModel">{{ sku.productModel }}</text>
                    <text v-if="formatProcurementSkuReferencePrice(sku)">历史单价 {{ formatProcurementSkuReferencePrice(sku) }}</text>
                  </view>
                </view>
                <text class="record-sku-check">✓</text>
              </view>
            </view>
            <view v-else class="record-sku-empty">
              <text class="empty-title">暂无可用采购商品</text>
              <text class="empty-desc">请联系管理员在该标准原料下新增采购 SKU 后再记录采购。</text>
            </view>
          </view>

          <view class="record-entry-grid">
            <view class="form-section record-entry-card">
              <view class="field-label-row">
                <text class="form-label">购买数量 *</text>
              </view>
              <view class="input-with-unit">
                <input
                  v-model="recordForm.actualPackageCount"
                  type="digit"
                  class="form-input unit-input"
                  :placeholder="recordPurchaseQuantityPlaceholder"
                  placeholder-class="input-placeholder"
                />
                <text v-if="recordPurchaseUnitLabel" class="input-unit-label">{{ recordPurchaseUnitLabel }}</text>
              </view>
              <view v-if="recordQuantityMetaRows.length > 0" class="record-entry-meta">
                <view
                  v-for="row in recordQuantityMetaRows"
                  :key="row.label"
                  class="record-entry-meta-row"
                >
                  <text class="meta-label">{{ row.label }}</text>
                  <text class="meta-value" :class="row.tone ? `price-tone-${row.tone}` : ''">{{ row.value }}</text>
                </view>
              </view>
            </view>

            <view class="form-section record-entry-card">
              <view class="field-label-row">
                <text class="form-label">付款金额 *</text>
              </view>
              <view class="input-with-unit">
                <input
                  v-model="recordForm.actualCost"
                  type="digit"
                  class="form-input unit-input"
                  placeholder="请输入金额，如：156.50"
                  placeholder-class="input-placeholder"
                />
                <text class="input-unit-label">元</text>
              </view>
              <view v-if="recordPriceMetaRows.length > 0" class="record-entry-meta">
                <view
                  v-for="row in recordPriceMetaRows"
                  :key="row.label"
                  class="record-entry-meta-row"
                >
                  <text class="meta-label">{{ row.label }}</text>
                  <text class="meta-value" :class="row.tone ? `price-tone-${row.tone}` : ''">{{ row.value }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view class="modal-footer">
          <button class="modal-btn cancel" @tap="closeRecordForm">取消</button>
          <button class="modal-btn submit" @tap="submitRecord" :loading="submitting">
            {{ modalSubmitText }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  getPurchaseListDetail,
  completePurchase as completePurchaseApi,
  reopenPurchaseList as reopenPurchaseListApi,
  startPurchase as startPurchaseApi,
  getPurchaseRecords,
  deletePurchaseRecord as deletePurchaseRecordApi,
  addPurchaseRecord,
  updatePurchaseRecord as updatePurchaseRecordApi,
  markPurchaseItemNoPurchase as markPurchaseItemNoPurchaseApi,
  clearPurchaseItemNoPurchase as clearPurchaseItemNoPurchaseApi,
  removeItemFromList,
  checkOrderDateChanges,
  getPurchaseChannels,
  previewPurchaseList,
  addOrdersToList,
  resolveProcurementSkuProfile,
  resolvePurchaseItemDisplay,
  resolvePurchaseRecordDisplay,
} from './api/purchasing';

// 状态管理
const purchaseListId = ref('');
const purchaseList = ref<any>(null);
const items = ref<any[]>([]);
const loading = ref(true);
const completing = ref(false);
const reopening = ref(false);
const noPurchaseMarkingItemId = ref('');
const allPurchaseChannels = ref<string[]>([]); // 所有采购渠道列表
const pendingAppendLoading = ref(false);
const appendingOrders = ref(false);
const pendingAppendEstimatedCost = ref(0);
const pendingAppendOrders = ref<
  Array<{
    orderId: string;
    targetProductionDate: string;
  }>
>([]);

const detailTitle = computed(() => {
  return purchaseList.value?.kind === 'STOCK_REPLENISHMENT'
    ? '补货清单详情'
    : '日采清单详情';
});

// 按类型分组的原料（计算属性）
const groupedItems = computed(() => {
  if (items.value.length === 0) {
    return [];
  }

  // 定义类型顺序
  const typeOrder = ['FOOD', 'SUPPLEMENT', 'PACKAGING'];

  // 按类型分组
  const groups = new Map<string, any[]>();
  items.value.forEach(item => {
    const type = item.type || 'FOOD';
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(item);
  });

  // 按定义的顺序返回分组
  return typeOrder
    .filter(type => groups.has(type))
    .map(type => ({
      type,
      items: groups.get(type)!,
    }));
});

// 获取类型标签
const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    'FOOD': '🥩 食材',
    'SUPPLEMENT': '💊 补剂',
    'PACKAGING': '📦 包装材料',
  };
  return labels[type] || type;
};

// 采购表单相关
const showRecordForm = ref(false);
const selectedIngredient = ref<any>(null);
const submitting = ref(false);
const channelInputMode = ref<'preset' | 'custom'>('preset');
const recordChannelChoices = ref<string[]>([]);
const editingRecord = ref<any>(null);

const recordForm = ref({
  procurementSkuId: '',
  procurementSkuName: '',
  purchaseChannel: '',
  purchaseUnit: '',
  actualPackageCount: '',
  actualPackageSize: '',
  actualPackageUnit: '',
  actualCost: '',
  productModel: '',
  notes: '',
});

const canManagePurchaseRecords = computed(() => {
  return (
    Boolean(purchaseList.value?.startedAt) &&
    purchaseList.value?.status === 'PENDING' &&
    !purchaseList.value?.reimbursementId
  );
});

const canReopenCompletedPurchase = computed(() => {
  return (
    purchaseList.value?.status === 'COMPLETED' &&
    !purchaseList.value?.reimbursementId
  );
});

const getItemRequiredQuantity = (item: any) => {
  return Number(
    item?.resolvedPurchaseShortageQuantity ??
      item?.purchaseShortageQuantity ??
      item?.quantityNeeded ??
      0,
  );
};

const requiresItemHandling = (item: any) => {
  const requiredQuantity = getItemRequiredQuantity(item);
  return Number.isFinite(requiredQuantity) && requiredQuantity > 0;
};

const isItemHandled = (item: any) => {
  return (
    !requiresItemHandling(item) ||
    item.noPurchaseNeeded === true ||
    (item.records || []).length > 0
  );
};

const shouldShowNoPurchaseButton = (item: any) => {
  return (
    requiresItemHandling(item) &&
    !item.noPurchaseNeeded &&
    (item.records || []).length === 0
  );
};

const getUnhandledPurchaseItems = () => {
  return items.value.filter((item) => !isItemHandled(item));
};

const modalTitle = computed(() => {
  return editingRecord.value ? '编辑采购记录' : '添加采购记录';
});

const modalSubmitText = computed(() => {
  if (submitting.value) {
    return '保存中...';
  }
  return editingRecord.value ? '保存修改' : '保存';
});

const normalizeChannelLabel = (channel?: string | null) => {
  return (channel || '').trim();
};

const formatCompactLabel = (parts: Array<string | null | undefined>) => {
  return parts.map((part) => (part || '').trim()).filter(Boolean).join(' · ');
};

const formatMeasurementUnit = (unit?: string | null) => {
  if (!unit) {
    return '';
  }

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

const getIngredientBaseUnit = (item: any): string => {
  return item?.ingredient?.baseUnit || item?.quantityUnit || 'PCS';
};

const getSuggestedPackageSize = (item: any): string => {
  const rawRatio = Number(item?.ingredient?.purchaseToBaseRatio || 0);
  if (Number.isFinite(rawRatio) && rawRatio > 0) {
    return formatDecimal(rawRatio, 3);
  }
  return '';
};

const getSuggestedPackageUnit = (item: any): string => {
  return formatMeasurementUnit(getIngredientBaseUnit(item)) || '个';
};

const parsePurchaseUnitFromProductModel = (productModel?: string | null) => {
  const normalized = (productModel || '').trim();
  if (!normalized.includes('/')) {
    return '';
  }

  return formatMeasurementUnit(normalized.split('/').pop()?.trim()) || '';
};

const getSkuPurchaseUnit = (sku: any, item: any): string => {
  return (
    formatMeasurementUnit(sku?.purchaseUnit) ||
    parsePurchaseUnitFromProductModel(sku?.productModel) ||
    formatMeasurementUnit(sku?.displayUnit) ||
    formatMeasurementUnit(item?.ingredient?.purchaseUnit) ||
    '件'
  );
};

const recordPurchaseUnitLabel = computed(() => {
  return formatMeasurementUnit(recordForm.value.purchaseUnit) || '件';
});

const recordPurchaseQuantityPlaceholder = computed(() => {
  const unit = recordPurchaseUnitLabel.value || '件';
  return `请输入本次实际买了多少${unit}，如：2`;
});

// 采购渠道选项（从所有原料数据库中加载）
const channelOptions = computed(() => {
  const uniqueChannels = new Set<string>();

  allPurchaseChannels.value.forEach((channel) => {
    const normalized = normalizeChannelLabel(channel);
    if (normalized) {
      uniqueChannels.add(normalized);
    }
  });

  return Array.from(uniqueChannels);
});

const getLatestPurchaseRecord = (item: any) => {
  const records = Array.isArray(item?.records) ? item.records : [];
  if (records.length === 0) {
    return null;
  }

  return [...records].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0];
};

const latestRecord = computed(() => getLatestPurchaseRecord(selectedIngredient.value));

const latestRecordSummary = computed(() => {
  if (editingRecord.value) {
    return `正在编辑 ${formatFullDateTime(editingRecord.value.createdAt)} 添加的采购记录`;
  }

  if (!latestRecord.value) {
    return '';
  }

  const parts = [
    '已预填上次采购习惯',
    latestRecord.value.procurementSkuName || latestRecord.value.purchaseChannel,
  ].filter(Boolean);

  if (latestRecord.value.productModel) {
    parts.push(latestRecord.value.productModel);
  }

  return parts.join(' · ');
});

const isCustomChannelMode = computed(() => {
  return channelInputMode.value === 'custom' || recordChannelChoices.value.length === 0;
});

const isPresetChannelSelected = (channel: string) => {
  return channelInputMode.value === 'preset' && normalizeChannelLabel(recordForm.value.purchaseChannel) === channel;
};

const procurementSkuProfile = computed(() => resolveProcurementSkuProfile(selectedIngredient.value));
const recordProcurementSkuOptions = computed(() =>
  procurementSkuProfile.value.procurementSkuChoices.map((sku) => ({
    ...sku,
    label: formatCompactLabel([sku.name, sku.productModel, sku.purchaseChannel]),
  })),
);

const selectedRecordProcurementSku = computed(() => {
  return (
    recordProcurementSkuOptions.value.find((sku) => sku.id === recordForm.value.procurementSkuId) ||
    null
  );
});

const recordProcurementSkuIndex = computed(() => {
  const index = recordProcurementSkuOptions.value.findIndex(
    (sku) => sku.id === recordForm.value.procurementSkuId,
  );
  return index >= 0 ? index : 0;
});

const getReferencePriceParts = (sku: any) => {
  const price = Number(sku?.currentPurchasePrice || sku?.referencePricePerPurchaseUnit || 0);
  const ratio = Number(sku?.purchaseToBaseRatio || 0);
  const baseUnit = getIngredientBaseUnit(selectedIngredient.value);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  if (Number.isFinite(ratio) && ratio > 0) {
    if (baseUnit === 'G') {
      return {
        price: price / ratio * 500,
        unit: '500g',
      };
    }

    if (baseUnit === 'ML') {
      return {
        price: price / ratio * 500,
        unit: '500ml',
      };
    }

    if (baseUnit === 'PCS') {
      return {
        price: price / ratio,
        unit: formatMeasurementUnit(selectedIngredient.value?.ingredient?.unitDisplayLabel) || '个',
      };
    }
  }

  return {
    price,
    unit: sku?.purchaseUnit || sku?.displayUnit || '件',
  };
};

const formatProcurementSkuReferencePrice = (sku: any) => {
  const parts = getReferencePriceParts(sku);
  if (!parts) {
    return '';
  }

  return `¥${formatDecimal(parts.price, 2)}/${parts.unit}`;
};

const isRecommendedRecordSku = (sku: any) => {
  const profile = procurementSkuProfile.value;
  if (profile.procurementSkuId && sku.id) {
    return profile.procurementSkuId === sku.id;
  }
  return Boolean(profile.procurementSkuName && profile.procurementSkuName === sku.name);
};

const getSkuPackageFacts = (sku: any, item: any) => {
  const ratio = Number(sku?.purchaseToBaseRatio || 0);
  const baseUnit = getIngredientBaseUnit(item);
  const purchaseUnit = getSkuPurchaseUnit(sku, item);

  if (Number.isFinite(ratio) && ratio > 0) {
    if (baseUnit === 'G') {
      if (ratio >= 1000) {
        return { size: formatDecimal(ratio / 1000, 3), unit: 'kg', purchaseUnit };
      }
      return { size: formatDecimal(ratio, 3), unit: 'g', purchaseUnit };
    }

    if (baseUnit === 'ML') {
      if (ratio >= 1000) {
        return { size: formatDecimal(ratio / 1000, 3), unit: 'L', purchaseUnit };
      }
      return { size: formatDecimal(ratio, 3), unit: 'ml', purchaseUnit };
    }

    return {
      size: formatDecimal(ratio, 3),
      unit: item?.ingredient?.unitDisplayLabel || item?.quantityUnit || '个',
      purchaseUnit,
    };
  }

  return {
    size: getSuggestedPackageSize(item),
    unit: getSuggestedPackageUnit(item),
    purchaseUnit,
  };
};

const applyRecordSkuDefaults = (sku: any) => {
  if (!selectedIngredient.value || !sku) {
    return;
  }

  const facts = getSkuPackageFacts(sku, selectedIngredient.value);
  recordForm.value.procurementSkuId = sku.id || '';
  recordForm.value.procurementSkuName = sku.name || '';
  recordForm.value.purchaseChannel = sku.purchaseChannel || '';
  recordForm.value.productModel = sku.productModel || '';
  recordForm.value.purchaseUnit = facts.purchaseUnit || '件';
  recordForm.value.actualPackageSize = facts.size || '';
  recordForm.value.actualPackageUnit = facts.unit || '';
  channelInputMode.value =
    recordForm.value.purchaseChannel && recordChannelChoices.value.includes(recordForm.value.purchaseChannel)
      ? 'preset'
      : 'custom';
};

const selectRecordSku = (sku: any) => {
  applyRecordSkuDefaults(sku);
};

const buildRecordProductModel = () => {
  return recordForm.value.productModel;
};

const getRecordBaseQuantity = () => {
  const packageCount = Number(recordForm.value.actualPackageCount);
  const packageSize = Number(recordForm.value.actualPackageSize);
  const packageUnit = recordForm.value.actualPackageUnit;

  if (
    !Number.isFinite(packageCount) ||
    packageCount <= 0 ||
    !Number.isFinite(packageSize) ||
    packageSize <= 0 ||
    !packageUnit
  ) {
    return 0;
  }

  return convertToBaseQuantity(packageCount * packageSize, packageUnit, selectedIngredient.value);
};

const convertToBaseQuantity = (amount: number, unit: string, item: any) => {
  const baseUnit = getIngredientBaseUnit(item);
  const normalized = `${unit}`.trim().toUpperCase();
  const density = Number(item?.ingredient?.properties?.density_g_per_ml || 0);

  if (baseUnit === 'G') {
    if (normalized === 'KG') return amount * 1000;
    if (normalized === 'JIN') return amount * 500;
    if (normalized === 'G') return amount;
    if (normalized === 'ML' && density > 0) return amount * density;
    if (normalized === 'L' && density > 0) return amount * 1000 * density;
  }

  if (baseUnit === 'ML') {
    if (normalized === 'L') return amount * 1000;
    if (normalized === 'ML') return amount;
    if (normalized === 'G' && density > 0) return amount / density;
    if (normalized === 'KG' && density > 0) return amount * 1000 / density;
  }

  return amount;
};

const getBaseUnitLabel = (item: any) => {
  const baseUnit = getIngredientBaseUnit(item);
  if (baseUnit === 'G') return 'g';
  if (baseUnit === 'ML') return 'ml';
  return item?.ingredient?.unitDisplayLabel || item?.quantityUnit || '个';
};

const recordTotalQuantityText = computed(() => {
  const baseQuantity = getRecordBaseQuantity();
  if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) {
    return '';
  }

  return `${formatDecimal(baseQuantity, 3)}${getBaseUnitLabel(selectedIngredient.value)}`;
});

const recordQuantityBalanceRow = computed(() => {
  const baseQuantity = getRecordBaseQuantity();
  const shortageBaseQuantity = convertToBaseQuantity(
    Number(selectedIngredient.value?.quantityNeeded || 0),
    selectedIngredient.value?.quantityUnit || getDisplayUnit(selectedIngredient.value),
    selectedIngredient.value,
  );

  if (!Number.isFinite(baseQuantity) || baseQuantity <= 0 || !Number.isFinite(shortageBaseQuantity) || shortageBaseQuantity <= 0) {
    return null;
  }

  const diff = baseQuantity - shortageBaseQuantity;
  const unit = getBaseUnitLabel(selectedIngredient.value);
  if (diff >= 0) {
    return { label: '余量', value: `${formatDecimal(diff, 3)}${unit}`, tone: 'good' };
  }
  return { label: '缺口', value: `${formatDecimal(Math.abs(diff), 3)}${unit}`, tone: 'bad' };
});

const recordQuantityMetaRows = computed(() => {
  const rows: Array<{ label: string; value: string; tone?: string }> = [];
  if (recordTotalQuantityText.value) {
    rows.push({ label: '总量', value: recordTotalQuantityText.value });
  }
  if (recordQuantityBalanceRow.value) {
    rows.push(recordQuantityBalanceRow.value);
  }
  return rows;
});

const recordActualUnitPriceValue = computed(() => {
  const cost = Number(recordForm.value.actualCost);
  const baseQuantity = getRecordBaseQuantity();
  const baseUnit = getIngredientBaseUnit(selectedIngredient.value);

  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(baseQuantity) || baseQuantity <= 0) {
    return null;
  }

  if (baseUnit === 'G' || baseUnit === 'ML') {
    return cost / baseQuantity * 500;
  }

  return cost / baseQuantity;
});

const recordActualUnitPriceText = computed(() => {
  const value = recordActualUnitPriceValue.value;
  if (value === null) {
    return '';
  }

  const baseUnit = getIngredientBaseUnit(selectedIngredient.value);
  if (baseUnit === 'G') {
    return `¥${formatDecimal(value, 2)}/500g`;
  }
  if (baseUnit === 'ML') {
    return `¥${formatDecimal(value, 2)}/500ml`;
  }
  return `¥${formatDecimal(value, 2)}/${getBaseUnitLabel(selectedIngredient.value)}`;
});

const recordHistoricalUnitPriceText = computed(() => {
  const label = formatProcurementSkuReferencePrice(selectedRecordProcurementSku.value);
  return label || '暂无';
});

const recordPriceDiffRow = computed(() => {
  const actual = recordActualUnitPriceValue.value;
  const reference = getReferencePriceParts(selectedRecordProcurementSku.value);
  if (actual === null || !reference || !reference.price) {
    return null;
  }

  const diff = (actual - reference.price) / reference.price * 100;
  if (diff >= 0) {
    return { label: '价格提醒', value: `高于历史 ${Math.round(diff)}%`, tone: 'bad' };
  }
  return { label: '价格提醒', value: `低于历史 ${Math.round(Math.abs(diff))}%`, tone: 'good' };
});

const recordPriceMetaRows = computed(() => {
  const rows: Array<{ label: string; value: string; tone?: string }> = [];
  if (recordActualUnitPriceText.value) {
    rows.push({ label: '单价', value: recordActualUnitPriceText.value });
  }
  if (recordHistoricalUnitPriceText.value) {
    rows.push({ label: '历史单价', value: recordHistoricalUnitPriceText.value });
  }
  if (recordPriceDiffRow.value) {
    rows.push(recordPriceDiffRow.value);
  }
  return rows;
});

// 获取系统内部标准采购单位（用于展示归一化结果）
const getPurchaseRecordUnit = (item: any): string => {
  if (item?.ingredient?.purchaseUnit) {
    return item.ingredient.purchaseUnit;
  }

  if (item?.quantityUnit) {
    return item.quantityUnit;
  }

  return '个';
};

const formatDecimal = (value: number, maxDecimalPlaces = 3) => {
  const fixed = value.toFixed(maxDecimalPlaces);
  return fixed.replace(/\.?0+$/, '');
};

const hasMaxDecimalPlaces = (value: string | number, maxDecimalPlaces: number) => {
  const normalized = `${value}`;
  const decimalPart = normalized.split('.')[1];
  return !decimalPart || decimalPart.length <= maxDecimalPlaces;
};

const formatRecordRawSummary = (record: any, item: any) => {
  const packageCount = Number(record.actualPackageCount || 0);
  const packageSize = Number(record.actualPackageSize || 0);
  const packageUnit = record.actualPackageUnit;
  const countUnit =
    parsePurchaseUnitFromProductModel(record.productModel) ||
    getRecordSkuPurchaseUnit(record, item) ||
    '件';

  if (
    Number.isFinite(packageCount) &&
    packageCount > 0 &&
    Number.isFinite(packageSize) &&
    packageSize > 0 &&
    packageUnit
  ) {
    return `${formatDecimal(packageCount)}${countUnit} x ${formatDecimal(packageSize)}${packageUnit}`;
  }

  return '';
};

const formatRecordQuantity = (record: any, item: any) => {
  const rawSummary = formatRecordRawSummary(record, item);
  if (rawSummary) {
    return rawSummary;
  }

  const quantity = Number(record.actualQuantity || 0);
  return `${formatDecimal(quantity)}${getPurchaseRecordUnit(item)}`;
};

const formatRecordNormalizedSummary = (record: any, item: any) => {
  const quantity = Number(record.actualQuantity || 0);
  const baseQuantity = Number(record.actualBaseQuantity || 0);

  if (!Number.isFinite(baseQuantity) || baseQuantity <= 0 || !record.actualBaseUnit) {
    return '';
  }

  const baseSummary = `${formatDecimal(baseQuantity, 3)}${formatMeasurementUnit(record.actualBaseUnit)}`;
  const purchaseSummary = Number.isFinite(quantity) && quantity > 0
    ? `${formatDecimal(quantity, 3)}${getPurchaseRecordUnit(item)}`
    : '';
  const rawSummary = formatRecordRawSummary(record, item);

  if (!rawSummary && purchaseSummary === baseSummary) {
    return '';
  }

  return `总量 ${baseSummary}`;
};

const buildRecordChannelChoices = (item: any) => {
  const channels: string[] = [];
  const seen = new Set<string>();

  const appendChannel = (value?: string | null) => {
    const normalized = normalizeChannelLabel(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    channels.push(normalized);
  };

  appendChannel(getLatestPurchaseRecord(item)?.purchaseChannel);
  appendChannel(item?.purchaseChannel);
  appendChannel(item?.ingredient?.purchaseChannel);
  channelOptions.value.forEach((channel) => appendChannel(channel));

  return channels;
};

const findItemForRecord = (record: any) => {
  return (
    items.value.find((item) => item.id === record.purchaseItemId) ||
    items.value.find((item) => item.ingredientId === record.ingredientId) ||
    null
  );
};

const getItemProcurementSkuLabel = (item: any) => {
  const profile = resolveProcurementSkuProfile(item);
  return (
    profile.procurementSkuName ||
    formatCompactLabel([profile.purchaseChannel, profile.productModel]) ||
    item?.purchaseChannel ||
    item?.productModel ||
    ''
  );
};

const getItemSuggestedProductLabel = (item: any) => {
  return resolveProcurementSkuProfile(item).suggestedProductName;
};

const getItemPurchaseChannel = (item: any) => {
  const profile = resolveProcurementSkuProfile(item);
  return profile.purchaseChannel || item?.purchaseChannel || item?.ingredient?.purchaseChannel || '';
};

const getItemProductModel = (item: any) => {
  const profile = resolveProcurementSkuProfile(item);
  return profile.productModel || item?.productModel || item?.ingredient?.productModel || '';
};

const getRecordSkuLabel = (record: any, item: any) => {
  const profile = resolveProcurementSkuProfile(item, record.procurementSkuId);
  return (
    record.procurementSkuName ||
    profile.procurementSkuName ||
    formatCompactLabel([profile.purchaseChannel, profile.productModel]) ||
    record.purchaseChannel ||
    '-'
  );
};

const getRecordSkuPurchaseUnit = (record: any, item: any) => {
  const profile = resolveProcurementSkuProfile(item, record.procurementSkuId);
  const sku = profile.procurementSkuChoices.find((choice: any) => {
    return record.procurementSkuId
      ? choice.id === record.procurementSkuId
      : record.procurementSkuName && choice.name === record.procurementSkuName;
  });

  return getSkuPurchaseUnit(sku || profile, item);
};

// 日期变更检测
const dateChanges = ref<any>({
  hasChanges: false,
  changedOrders: [],
});

// 页面加载
onLoad((options: any) => {
  purchaseListId.value = options.id;
  loadDetail();
});

// 加载详情
const loadDetail = async () => {
  loading.value = true;

  try {
    // 加载采购渠道列表
    await loadPurchaseChannels();

    const res: any = await getPurchaseListDetail(purchaseListId.value);

    if (res.code === 0) {
      purchaseList.value = res.data;
      uni.setNavigationBarTitle({ title: detailTitle.value });
      items.value = (res.data.items || []).map((item: any) => ({
        ...resolvePurchaseItemDisplay(item),
        records: [],
        expanded: false,
      }));

      // 如果已开始采购，加载采购记录
      if (res.data.startedAt) {
        await loadPurchaseRecords();
      }

      // 检测日期变更
      if (res.data.kind === 'ORDER_DEMAND') {
        await checkDateChanges();
      } else {
        dateChanges.value = {
          hasChanges: false,
          changedOrders: [],
        };
      }
      await loadPendingAppendOrders();
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载采购清单详情失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const toDateOnlyString = (value?: string) => {
  if (!value) {
    return '';
  }
  return new Date(value).toISOString().split('T')[0];
};

const loadPendingAppendOrders = async () => {
  if (
    !purchaseList.value ||
    purchaseList.value.kind !== 'ORDER_DEMAND' ||
    purchaseList.value.status !== 'PENDING'
  ) {
    pendingAppendOrders.value = [];
    pendingAppendEstimatedCost.value = 0;
    return;
  }

  const targetDate = toDateOnlyString(purchaseList.value.targetDate);
  if (!targetDate) {
    pendingAppendOrders.value = [];
    pendingAppendEstimatedCost.value = 0;
    return;
  }

  pendingAppendLoading.value = true;

  try {
    const res: any = await previewPurchaseList({ startDate: targetDate });
    if (res.code !== 0) {
      pendingAppendOrders.value = [];
      pendingAppendEstimatedCost.value = 0;
      return;
    }

    const existingOrderIds = new Set<string>(purchaseList.value.sourceOrderIds || []);
    const orders = Array.isArray(res.data?.affectedOrders)
      ? res.data.affectedOrders.filter(
          (order: any) => order?.orderId && !existingOrderIds.has(order.orderId),
        )
      : [];

    pendingAppendOrders.value = orders;
    pendingAppendEstimatedCost.value = Number(res.data?.totalEstimatedCost || 0);
  } catch (error) {
    console.error('加载待合并订单失败', error);
    pendingAppendOrders.value = [];
    pendingAppendEstimatedCost.value = 0;
  } finally {
    pendingAppendLoading.value = false;
  }
};

const appendPendingOrders = async () => {
  if (pendingAppendOrders.value.length === 0) {
    uni.showToast({ title: '当前没有待合并订单', icon: 'none' });
    return;
  }

  uni.showModal({
    title: '合并新增订单',
    content: `将把 ${pendingAppendOrders.value.length} 个同日新增订单并入当前采购清单，并同步补齐原料需求，确认继续？`,
    success: async (res) => {
      if (!res.confirm) {
        return;
      }

      appendingOrders.value = true;

      try {
        const response: any = await addOrdersToList(purchaseListId.value, {
          orderIds: pendingAppendOrders.value.map((order) => order.orderId),
        });

        if (response.code === 0) {
          uni.showToast({ title: '合并成功', icon: 'success' });
          await loadDetail();
        } else {
          uni.showToast({ title: response.message || '合并失败', icon: 'none' });
        }
      } catch (error: any) {
        console.error('合并新增订单失败', error);
        uni.showToast({ title: error.message || '合并失败', icon: 'none' });
      } finally {
        appendingOrders.value = false;
      }
    },
  });
};

// 检测日期变更
const checkDateChanges = async () => {
  try {
    const res: any = await checkOrderDateChanges(purchaseListId.value);
    if (res.code === 0) {
      dateChanges.value = res.data;
    }
  } catch (error: any) {
    console.error('检测日期变更失败', error);
  }
};

// 加载所有采购渠道
const loadPurchaseChannels = async () => {
  try {
    const res: any = await getPurchaseChannels();
    if (res.code === 0) {
      allPurchaseChannels.value = res.data || [];
    } else {
      console.error('加载采购渠道失败:', res.message);
    }
  } catch (error) {
    console.error('加载采购渠道失败', error);
  }
};

// 加载采购记录并按原料分组
const loadPurchaseRecords = async () => {
  try {
    const res: any = await getPurchaseRecords(purchaseListId.value);
    if (res.code === 0) {
      const allRecords = (res.data || []).map((record: any) =>
        resolvePurchaseRecordDisplay(record)
      );

      // 按原料ID分组
      const grouped = new Map<string, any[]>();
      allRecords.forEach((record: any) => {
        const key = record.purchaseItemId || record.ingredientId;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(record);
      });

      // 将采购记录关联到对应的原料卡片
      items.value.forEach(item => {
        item.records = grouped.get(item.id) || grouped.get(item.ingredientId) || [];
      });
    }
  } catch (error: any) {
    console.error('加载采购记录失败', error);
  }
};

// 点击"继续添加采购记录"按钮
const handleContinueAdd = (item: any) => {
  selectedIngredient.value = item;
  editingRecord.value = null;
  resetRecordForm();
  recordChannelChoices.value = buildRecordChannelChoices(item);

  const latest = getLatestPurchaseRecord(item);
  const latestProfile = resolveProcurementSkuProfile(item, latest?.procurementSkuId);
  const selectedSku =
    recordProcurementSkuOptions.value.find((sku) => {
      return latest?.procurementSkuId
        ? sku.id === latest.procurementSkuId
        : sku.id === latestProfile.procurementSkuId || sku.name === latestProfile.procurementSkuName;
    }) || recordProcurementSkuOptions.value[0];

  if (selectedSku) {
    applyRecordSkuDefaults(selectedSku);
  }

  recordForm.value.actualPackageCount = latest?.actualPackageCount
    ? formatDecimal(Number(latest.actualPackageCount || 0))
    : '';

  if (latest?.actualPackageSize) {
    recordForm.value.actualPackageSize = formatDecimal(Number(latest.actualPackageSize || 0));
  }
  if (latest?.actualPackageUnit) {
    recordForm.value.actualPackageUnit = latest.actualPackageUnit;
  }
  if (latest?.purchaseChannel) {
    recordForm.value.purchaseChannel = normalizeChannelLabel(latest.purchaseChannel);
  }
  if (latest?.productModel) {
    recordForm.value.productModel = latest.productModel;
    recordForm.value.purchaseUnit =
      parsePurchaseUnitFromProductModel(latest.productModel) ||
      recordForm.value.purchaseUnit ||
      '件';
  }

  channelInputMode.value =
    recordForm.value.purchaseChannel && recordChannelChoices.value.includes(recordForm.value.purchaseChannel)
      ? 'preset'
      : 'custom';

  showRecordForm.value = true;
};

const editRecord = (record: any) => {
  const item = findItemForRecord(record);

  if (!item) {
    uni.showToast({ title: '未找到对应原料', icon: 'none' });
    return;
  }

  selectedIngredient.value = item;
  editingRecord.value = record;
  resetRecordForm();
  recordChannelChoices.value = buildRecordChannelChoices(item);

  const recordProfile = resolveProcurementSkuProfile(item, record.procurementSkuId);
  const selectedSku = record.procurementSkuId
    ? recordProcurementSkuOptions.value.find((sku) => sku.id === record.procurementSkuId)
    : null;

  if (selectedSku) {
    applyRecordSkuDefaults(selectedSku);
  }
  recordForm.value.purchaseChannel = normalizeChannelLabel(record.purchaseChannel);
  recordForm.value.actualPackageCount = record.actualPackageCount
    ? formatDecimal(Number(record.actualPackageCount || 0))
    : formatDecimal(Number(record.actualQuantity || 0));
  recordForm.value.actualPackageSize = record.actualPackageSize
    ? formatDecimal(Number(record.actualPackageSize || 0))
    : getSuggestedPackageSize(item);
  recordForm.value.actualPackageUnit =
    record.actualPackageUnit || getSuggestedPackageUnit(item);
  recordForm.value.actualCost = Number(record.actualCost || 0)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
  recordForm.value.productModel = record.productModel || recordProfile.productModel || '';
  recordForm.value.purchaseUnit =
    parsePurchaseUnitFromProductModel(record.productModel) ||
    parsePurchaseUnitFromProductModel(recordProfile.productModel) ||
    recordForm.value.purchaseUnit ||
    '件';
  recordForm.value.notes = record.notes || '';

  channelInputMode.value =
    recordForm.value.purchaseChannel &&
    recordChannelChoices.value.includes(recordForm.value.purchaseChannel)
      ? 'preset'
      : 'custom';

  showRecordForm.value = true;
};

// 关闭采购表单
const closeRecordForm = () => {
  showRecordForm.value = false;
  selectedIngredient.value = null;
  editingRecord.value = null;
};

// 采购渠道快速选择
const onChannelChange = (e: any) => {
  const index = e.detail.value;
  const channel = recordChannelChoices.value[index];
  if (!channel) {
    return;
  }
  recordForm.value.purchaseChannel = channel;
  channelInputMode.value = 'preset';
};

const selectChannel = (channel: string) => {
  recordForm.value.purchaseChannel = channel;
  channelInputMode.value = 'preset';
};

const onProcurementSkuChange = (e: any) => {
  const sku = recordProcurementSkuOptions.value[e.detail.value];
  if (!sku) {
    return;
  }

  applyRecordSkuDefaults(sku);
};

const activateCustomChannelInput = () => {
  const currentChannel = normalizeChannelLabel(recordForm.value.purchaseChannel);
  channelInputMode.value = 'custom';
  if (!currentChannel || recordChannelChoices.value.includes(currentChannel)) {
    recordForm.value.purchaseChannel = '';
  }
};

// 重置表单
const resetRecordForm = () => {
  recordForm.value = {
    procurementSkuId: '',
    procurementSkuName: '',
    purchaseChannel: '',
    purchaseUnit: '',
    actualPackageCount: '',
    actualPackageSize: '',
    actualPackageUnit: '',
    actualCost: '',
    productModel: '',
    notes: '',
  };
  recordChannelChoices.value = [];
  channelInputMode.value = 'preset';
};

// 提交采购记录
const submitRecord = async () => {
  // 表单验证
  if (!recordForm.value.procurementSkuId || recordForm.value.procurementSkuId.trim().length === 0) {
    uni.showToast({ title: '请选择采购商品', icon: 'none' });
    return;
  }

  if (!recordForm.value.purchaseChannel || recordForm.value.purchaseChannel.trim().length === 0) {
    uni.showToast({ title: '采购商品缺少采购渠道，请联系管理员补充', icon: 'none' });
    return;
  }

  if (!recordForm.value.purchaseUnit || recordForm.value.purchaseUnit.trim().length === 0) {
    uni.showToast({ title: '采购商品缺少采购单位，请联系管理员补充', icon: 'none' });
    return;
  }

  if (!recordForm.value.actualPackageCount || recordForm.value.actualPackageCount.toString().trim().length === 0) {
    uni.showToast({ title: '请输入购买数量', icon: 'none' });
    return;
  }

  const packageCount = Number(recordForm.value.actualPackageCount);
  if (isNaN(packageCount) || packageCount <= 0) {
    uni.showToast({ title: '购买数量必须大于0', icon: 'none' });
    return;
  }

  if (!hasMaxDecimalPlaces(recordForm.value.actualPackageCount, 3)) {
    uni.showToast({ title: '购买数量最多三位小数', icon: 'none' });
    return;
  }

  if (!recordForm.value.actualPackageSize || recordForm.value.actualPackageSize.toString().trim().length === 0) {
    uni.showToast({ title: '采购商品缺少换算规格', icon: 'none' });
    return;
  }

  const packageSize = Number(recordForm.value.actualPackageSize);
  if (isNaN(packageSize) || packageSize <= 0) {
    uni.showToast({ title: '采购商品换算规格必须大于0', icon: 'none' });
    return;
  }

  if (!hasMaxDecimalPlaces(recordForm.value.actualPackageSize, 3)) {
    uni.showToast({ title: '采购商品换算规格最多三位小数', icon: 'none' });
    return;
  }

  if (!recordForm.value.actualPackageUnit) {
    uni.showToast({ title: '采购商品缺少换算单位', icon: 'none' });
    return;
  }

  if (!recordForm.value.actualCost || recordForm.value.actualCost.toString().trim().length === 0) {
    uni.showToast({ title: '请输入付款金额', icon: 'none' });
    return;
  }

  const cost = Number(recordForm.value.actualCost);
  if (isNaN(cost) || cost <= 0) {
    uni.showToast({ title: '金额必须大于0', icon: 'none' });
    return;
  }

  const costStr = recordForm.value.actualCost.toString();
  const decimalIndex = costStr.indexOf('.');
  if (decimalIndex !== -1 && costStr.length - decimalIndex - 1 > 2) {
    uni.showToast({ title: '金额最多两位小数', icon: 'none' });
    return;
  }

  submitting.value = true;

  try {
    const productModel = buildRecordProductModel();
    const data: any = {
      procurementSkuId: recordForm.value.procurementSkuId || undefined,
      purchaseChannel: recordForm.value.purchaseChannel.trim(),
      actualPackageCount: Number(packageCount.toFixed(3)),
      actualPackageSize: Number(packageSize.toFixed(3)),
      actualPackageUnit: recordForm.value.actualPackageUnit,
      actualCost: Number(cost.toFixed(2)),
      productModel: productModel?.trim() || undefined,
      notes: recordForm.value.notes?.trim() || undefined,
    };

    const response: any = editingRecord.value
      ? await updatePurchaseRecordApi(
          purchaseListId.value,
          editingRecord.value.id,
          data,
        )
      : await addPurchaseRecord(purchaseListId.value, {
          ...data,
          purchaseItemId: selectedIngredient.value.id,
        });

    if (response.code === 0) {
      uni.showToast({
        title: editingRecord.value ? '修改成功' : '保存成功',
        icon: 'success',
      });

      // 刷新采购记录
      await loadPurchaseRecords();

      // 如果是清单内原料，保持展开状态
      if (selectedIngredient.value) {
        const item = items.value.find(
          i => i.ingredientId === selectedIngredient.value.ingredientId
        );
        if (item) {
          item.expanded = true;
        }
      }

      closeRecordForm();
    } else {
      uni.showToast({ title: response.message || '保存失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('保存采购记录失败', error);
    uni.showToast({ title: error.message || '保存失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

// 删除采购记录
const deleteRecord = (recordId: string) => {
  uni.showModal({
    title: '删除采购记录',
    content: '确认删除该采购记录？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await deletePurchaseRecordApi(
            purchaseListId.value,
            recordId,
          );

          if (response.code === 0) {
            uni.showToast({ title: '删除成功', icon: 'success' });
            // 刷新采购记录
            await loadPurchaseRecords();
          } else {
            uni.showToast({ title: response.message || '删除失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('删除采购记录失败', error);
          uni.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    },
  });
};

const markItemNoPurchase = async (item: any) => {
  if (noPurchaseMarkingItemId.value) {
    return;
  }

  noPurchaseMarkingItemId.value = item.id;

  try {
    const response: any = await markPurchaseItemNoPurchaseApi(
      purchaseListId.value,
      item.id,
      { reason: '现场确认无需采购' },
    );

    if (response.code === 0) {
      uni.showToast({ title: '已标记，可点取消标记撤销', icon: 'none' });
      await loadDetail();
    } else {
      uni.showToast({ title: response.message || '标记失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('标记无需采购失败', error);
    uni.showToast({ title: error.message || '标记失败', icon: 'none' });
  } finally {
    noPurchaseMarkingItemId.value = '';
  }
};

const clearItemNoPurchase = (item: any) => {
  uni.showModal({
    title: '取消无需采购',
    content: `确认取消"${getPurchaseItemTitle(item)}"的无需采购标记？`,
    success: async (res) => {
      if (!res.confirm) {
        return;
      }

      try {
        const response: any = await clearPurchaseItemNoPurchaseApi(
          purchaseListId.value,
          item.id,
        );

        if (response.code === 0) {
          uni.showToast({ title: '已取消', icon: 'success' });
          await loadDetail();
        } else {
          uni.showToast({ title: response.message || '取消失败', icon: 'none' });
        }
      } catch (error: any) {
        console.error('取消无需采购标记失败', error);
        uni.showToast({ title: error.message || '取消失败', icon: 'none' });
      }
    },
  });
};

// 确认采购完成
const completePurchase = () => {
  const unhandledItems = getUnhandledPurchaseItems();
  if (unhandledItems.length > 0) {
    uni.showToast({
      title: `还有 ${unhandledItems.length} 个原料未处理`,
      icon: 'none',
    });
    return;
  }

  uni.showModal({
    title: '确认采购完成',
    content: '确认该采购清单的所有原料都已处理？',
    success: async (res) => {
      if (res.confirm) {
        completing.value = true;

        try {
          const response: any = await completePurchaseApi(purchaseListId.value);

          if (response.code === 0) {
            uni.showToast({ title: '操作成功', icon: 'success' });
            // 刷新详情
            await loadDetail();
          } else {
            uni.showToast({ title: response.message || '操作失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('确认采购完成失败', error);
          uni.showToast({ title: error.message || '操作失败', icon: 'none' });
        } finally {
          completing.value = false;
        }
      }
    },
  });
};

const reopenCompletedPurchase = () => {
  uni.showModal({
    title: '撤回完成',
    content: '撤回后可继续修改采购记录，已入库的采购记录会先回滚。确认继续？',
    success: async (res) => {
      if (!res.confirm) {
        return;
      }

      reopening.value = true;

      try {
        const response: any = await reopenPurchaseListApi(purchaseListId.value);

        if (response.code === 0) {
          uni.showToast({ title: '已撤回', icon: 'success' });
          await loadDetail();
        } else {
          uni.showToast({ title: response.message || '撤回失败', icon: 'none' });
        }
      } catch (error: any) {
        console.error('撤回采购完成失败', error);
        uni.showToast({ title: error.message || '撤回失败', icon: 'none' });
      } finally {
        reopening.value = false;
      }
    },
  });
};

// 开始采购
const startPurchase = () => {
  uni.showModal({
    title: '开始采购',
    content: '开始采购后可以录入采购记录，确认继续？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await startPurchaseApi(purchaseListId.value);

          if (response.code === 0) {
            uni.showToast({ title: '操作成功', icon: 'success' });
            // 刷新详情
            await loadDetail();
          } else {
            uni.showToast({ title: response.message || '操作失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('开始采购失败', error);
          uni.showToast({ title: error.message || '操作失败', icon: 'none' });
        }
      }
    },
  });
};

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'DRAFT': '草稿',
    'PENDING': '待采购',
    'COMPLETED': '已完成',
    'CANCELLED': '已取消',
  };
  return statusMap[status] || status;
};

// 获取状态样式类
const getStatusClass = (status: string) => {
  const classMap: Record<string, string> = {
    'DRAFT': 'draft',
    'PENDING': 'pending',
    'COMPLETED': 'completed',
    'CANCELLED': 'cancelled',
  };
  return classMap[status] || '';
};

const getListKindText = (kind?: string) => {
  const kindMap: Record<string, string> = {
    ORDER_DEMAND: '日采',
    STOCK_REPLENISHMENT: '补货',
  };
  return kindMap[kind || 'ORDER_DEMAND'] || '日采';
};

const getPurchaseItemTitle = (item: any) => {
  return (
    item?.resolvedProcurementSkuName ||
    item?.resolvedSuggestedProductName ||
    item?.ingredientName ||
    '未知原料'
  );
};

const formatBrandLabel = (brand?: string | null) => {
  const normalized = (brand || '').trim();
  if (!normalized || normalized === '-' || normalized === '无') {
    return '';
  }
  return normalized;
};

const formatSkuReferencePrice = (item: any) => {
  const price = Number(item?.resolvedCurrentPurchasePrice || 0);
  const ratio = Number(item?.resolvedPurchaseToBaseRatio || 0);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ratio) || ratio <= 0) {
    return '';
  }

  const baseUnit = String(item?.resolvedBaseUnit || item?.ingredient?.baseUnit || '').toUpperCase();
  const unitPrice = price / ratio;
  if (baseUnit === 'G' || baseUnit === 'ML') {
    const unitLabel = baseUnit === 'ML' ? 'ml' : 'g';
    return `参考单价 ¥${(unitPrice * 500).toFixed(2)}/500${unitLabel}`;
  }

  const unitLabel =
    item?.resolvedUnitDisplayLabel ||
    item?.quantityUnit ||
    item?.resolvedDisplayUnit ||
    '个';
  return `参考单价 ¥${unitPrice.toFixed(2)}/${unitLabel}`;
};

// 格式化订单ID（简化显示）
const formatOrderId = (orderId: string) => {
  if (orderId.length > 12) {
    return orderId.substring(0, 8) + '...';
  }
  return orderId;
};

// 复制订单ID
const copyOrderId = (orderId: string) => {
  uni.setClipboardData({
    data: orderId,
    success: () => {
      uni.showToast({
        title: '订单ID已复制',
        icon: 'success',
        duration: 2000
      });
    },
    fail: () => {
      uni.showToast({
        title: '复制失败',
        icon: 'none',
        duration: 2000
      });
    }
  });
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
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

const formatBaseQuantity = (value: number) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  const rounded = Number(numeric.toFixed(1));
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
};

// 格式化原料用量（根据原料类型处理）
const formatDisplayValue = (value: number, unit: string) => {
  if (unit === 'g') {
    return Math.round(value);
  }

  if (unit === 'ml') {
    const rounded = Number(value.toFixed(1));
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  }

  return value.toFixed(2);
};

const resolveFoodDisplayMeta = (item: any, quantityOverride?: number) => {
  const quantity = Number(quantityOverride ?? item.quantityNeeded ?? 0);
  const quantityUnit = String(item.quantityUnit || '').toLowerCase();
  const ingredientBaseUnit = String(item?.ingredient?.baseUnit || '').toUpperCase();
  const density = Number(item?.ingredient?.properties?.density_g_per_ml || 0);

  if (ingredientBaseUnit === 'ML') {
    if (quantityUnit === 'kg' && density > 0) {
      return { value: (quantity * 1000) / density, unit: 'ml' };
    }

    if (quantityUnit === 'g' && density > 0) {
      return { value: quantity / density, unit: 'ml' };
    }

    if (quantityUnit === 'ml') {
      return { value: quantity, unit: 'ml' };
    }
  }

  if (quantityUnit === 'kg') {
    return { value: quantity * 1000, unit: 'g' };
  }

  if (quantityUnit === 'g') {
    return { value: quantity, unit: 'g' };
  }

  return { value: quantity, unit: item.displayUnit || item.quantityUnit || '' };
};

const formatSupplementDisplayValue = (value: number) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return '0';
  }

  const rounded = Number(numeric.toFixed(2));
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2);
};

const formatQuantity = (item: any) => {
  if (item.type === 'FOOD') {
    const meta = resolveFoodDisplayMeta(item);
    return formatDisplayValue(meta.value, meta.unit);
  }

  // 补剂类型和其他：保留两位小数
  return formatSupplementDisplayValue(Number(item.quantityNeeded || 0));
};

const formatResolvedQuantity = (value: number, item: any) => {
  if (item.type === 'FOOD') {
    const meta = resolveFoodDisplayMeta(item, value);
    return `${formatDisplayValue(meta.value, meta.unit)}${meta.unit}`;
  }

  return `${formatSupplementDisplayValue(Number(value || 0))}${getDisplayUnit(item)}`;
};

// 获取显示单位
const getDisplayUnit = (item: any) => {
  if (item.type === 'FOOD') {
    return resolveFoodDisplayMeta(item).unit;
  }

  // 补剂的需求量应使用配方计算单位；SKU的瓶、罐只作为规格信息展示。
  if (item.type === 'SUPPLEMENT') {
    return item.quantityUnit || item.displayUnit || 'g';
  }

  if (item.resolvedDisplayUnit) {
    return item.resolvedDisplayUnit;
  }

  // 其他类型：使用quantityUnit
  return item.quantityUnit || '';
};

// ==========================================
// 新增功能：日期变更处理
// ==========================================

// 忽略日期变更
const ignoreDateChanges = () => {
  dateChanges.value = {
    hasChanges: false,
    changedOrders: [],
  };
  uni.showToast({ title: '已忽略日期变更', icon: 'success' });
};

// ==========================================
// 新增功能：删除原料
// ==========================================

// 确认删除原料
const confirmDeleteItem = (item: any) => {
  uni.showModal({
    title: '删除原料',
    content: `确认删除"${getPurchaseItemTitle(item)}"？`,
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await removeItemFromList(purchaseListId.value, item.id);

          if (response.code === 0) {
            uni.showToast({ title: '删除成功', icon: 'success' });

            // 刷新详情
            await loadDetail();
          } else {
            uni.showToast({ title: response.message || '删除失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('删除原料失败', error);
          uni.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    },
  });
};

</script>

<style scoped lang="scss">
.purchase-detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
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

  .error-text {
    font-size: 28rpx;
    color: #666;
    margin-bottom: 24rpx;
  }

  .retry-btn {
    padding: 16rpx 48rpx;
    background-color: #1890ff;
    color: #fff;
    border-radius: 8rpx;
    font-size: 28rpx;
    border: none;
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

  .section-header {
    margin-bottom: 16rpx;
  }

  .divider {
    height: 1rpx;
    background-color: #f0f0f0;
    margin: 24rpx 0;
  }
}

.status-card {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16rpx;

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 8rpx;

      .target-line {
        display: flex;
        align-items: center;
        gap: 12rpx;
        flex-wrap: wrap;
      }

      .target-date {
        font-size: 32rpx;
        font-weight: bold;
        color: #333;
      }

      .time-badge {
        padding: 6rpx 14rpx;
        border-radius: 999rpx;
        font-size: 22rpx;
        font-weight: 600;
        background: rgba(255, 202, 40, 0.18);
        color: #8a5a00;
      }

      .create-time {
        font-size: 22rpx;
        color: #999;
      }
    }

    .status-badge {
      padding: 12rpx 24rpx;
      border-radius: 8rpx;
      font-size: 24rpx;
      font-weight: bold;

      &.draft {
        background-color: #f0f0f0;
        color: #666;
      }

      &.pending {
        background-color: #fff7e6;
        color: #fa8c16;
      }

      &.completed {
        background-color: #f6ffed;
        color: #52c41a;
      }

      &.cancelled {
        background-color: #ffebee;
        color: #f44336;
      }
    }
  }

  .complete-time, .creator {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12rpx;
    padding: 16rpx 0;
    border-top: 1rpx solid #f5f5f5;

    &:last-child {
      margin-bottom: 0;
      border-bottom: none;
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

.pending-append-card {
  border: 2rpx solid #ffe08a;
  background: linear-gradient(180deg, #fffdf5 0%, #fff7e6 100%);

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;
  }

  .pending-title {
    margin-bottom: 0;
    color: #8c5b00;
  }

  .pending-count {
    font-size: 24rpx;
    color: #ad6800;
    background-color: rgba(250, 173, 20, 0.12);
    padding: 8rpx 16rpx;
    border-radius: 999rpx;
  }

  .pending-hint {
    display: block;
    font-size: 24rpx;
    color: #8c6d1f;
    line-height: 1.6;
  }

  .pending-summary {
    margin-top: 20rpx;
    display: flex;
    justify-content: space-between;
    gap: 16rpx;
    font-size: 24rpx;
    color: #7a5d1c;
    flex-wrap: wrap;
  }

  .pending-order-list {
    margin-top: 20rpx;
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  .pending-order-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16rpx;
    padding: 18rpx 20rpx;
    border-radius: 12rpx;
    background-color: rgba(255, 255, 255, 0.78);
  }

  .pending-order-id {
    font-size: 26rpx;
    color: #333;
    font-weight: 500;
  }

  .pending-order-date {
    font-size: 24rpx;
    color: #999;
  }

  .merge-orders-btn {
    margin-top: 24rpx;
    width: 100%;
    height: 80rpx;
    line-height: 80rpx;
    border-radius: 40rpx;
    border: none;
    background: linear-gradient(135deg, #faad14 0%, #f59e0b 100%);
    color: #fff;
    font-size: 28rpx;
    font-weight: 600;
  }
}

// 原料分组容器
.grouped-items {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.ingredient-group {
  background-color: #f9f9f9;
  border-radius: 12rpx;
  overflow: hidden;

  .group-header {
    background: linear-gradient(135deg, #f0f0f0 0%, #e8e8e8 100%);
    padding: 16rpx 24rpx;
    border-bottom: 1rpx solid #e5e5e5;

    .group-title {
      font-size: 26rpx;
      font-weight: bold;
      color: #333;
    }
  }

  .items-list {
    padding: 16rpx;
    background-color: transparent;
  }
}

// 原料卡片
.items-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.item-card {
  background-color: #f9f9f9;
  border-radius: 16rpx;
  overflow: hidden;
  transition: all 0.3s;

  .item-basic {
    padding: 24rpx;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16rpx;

    .item-info {
      flex: 1;
      min-width: 0;

      .item-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16rpx;
        margin-bottom: 10rpx;

        .item-name {
          flex: 1;
          min-width: 0;
          font-size: 30rpx;
          font-weight: 600;
          color: #333;
          line-height: 1.45;
        }

        .sku-price {
          flex-shrink: 0;
          max-width: 260rpx;
          font-size: 22rpx;
          font-weight: 600;
          color: #fa541c;
          line-height: 1.4;
          text-align: right;
        }
      }

      .item-sku-lines {
        display: flex;
        flex-direction: column;
        gap: 6rpx;
        margin-bottom: 12rpx;

        .item-sku {
          font-size: 24rpx;

          &.primary {
            color: #1890ff;
            font-weight: 500;
          }

          &.secondary {
            color: #8c8c8c;
          }
        }
      }

      .item-specs {
        display: flex;
        flex-wrap: wrap;
        gap: 8rpx;
        margin-bottom: 12rpx;

        .spec {
          font-size: 22rpx;
          color: #666;
          padding: 4rpx 12rpx;
          background-color: #f0f0f0;
          border-radius: 4rpx;

          &.brand {
            background-color: #eef8f1;
            color: #2f855a;
          }
        }
      }

      .item-demand-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8rpx 16rpx;
        margin-top: 4rpx;

        .stock-audit-inline {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4rpx;
          flex: 1;
          min-width: 260rpx;
          font-size: 22rpx;
          line-height: 1.45;
          color: #8c8c8c;

          .audit-divider {
            color: #d9d9d9;
          }
        }

        .item-quantity {
          display: flex;
          align-items: baseline;
          gap: 4rpx;
          flex-shrink: 0;

          .quantity-label {
            font-size: 24rpx;
            color: #666;
          }

          .quantity-value {
            font-size: 32rpx;
            font-weight: bold;
            color: #1890ff;
          }

          .quantity-unit {
            font-size: 22rpx;
            color: #999;
          }
        }
      }
    }

    .item-action {
      flex-shrink: 0;
      align-self: flex-end;

      .continue-add-btn {
        padding: 12rpx 20rpx;
        background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
        color: #fff;
        border-radius: 8rpx;
        font-size: 24rpx;
        border: none;
        line-height: 1.5;
        white-space: nowrap;

        &:active {
          opacity: 0.8;
        }
      }
    }
  }

  .item-expanded {
    background-color: #fff;

    .records-list {
      padding: 0 24rpx 24rpx;
      display: flex;
      flex-direction: column;
      gap: 16rpx;
    }

    .record-item {
      padding: 24rpx;
      background-color: #f9f9f9;
      border-radius: 12rpx;
      border-left: 4rpx solid #1890ff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16rpx;

      .record-main {
        flex: 1;
        min-width: 0;

        .record-sku {
          display: block;
          margin-bottom: 8rpx;
          font-size: 24rpx;
          color: #1890ff;
          font-weight: 500;
        }

        .record-info {
          display: flex;
          align-items: center;
          gap: 12rpx;
          margin-bottom: 8rpx;
          flex-wrap: wrap;

          .record-quantity {
            font-size: 28rpx;
            font-weight: bold;
            color: #1890ff;
          }

          .record-cost {
            font-size: 28rpx;
            font-weight: bold;
            color: #ff6b6b;
          }

          .record-channel {
            font-size: 24rpx;
            color: #666;
          }
        }

        .record-details {
          display: flex;
          flex-wrap: wrap;
          gap: 8rpx;

          .detail {
            font-size: 22rpx;
            color: #999;
            padding: 4rpx 8rpx;
            background-color: #f0f0f0;
            border-radius: 4rpx;
          }

          .detail-time {
            font-size: 22rpx;
            color: #999;
          }
        }
      }

      .record-actions {
        flex-shrink: 0;
        align-self: flex-start;
        display: flex;
        gap: 12rpx;

        .edit-btn {
          padding: 8rpx 24rpx;
          background-color: #1677ff;
          color: #fff;
          border-radius: 8rpx;
          font-size: 22rpx;
          border: none;
          line-height: 1.5;

          &:active {
            opacity: 0.8;
          }
        }

        .delete-btn {
          padding: 8rpx 24rpx;
          background-color: #ff4d4f;
          color: #fff;
          border-radius: 8rpx;
          font-size: 22rpx;
          border: none;
          line-height: 1.5;

          &:active {
            opacity: 0.8;
          }
        }
      }
    }
  }
}

.empty-items {
  display: flex;
  justify-content: center;
  padding: 60rpx 32rpx;

  .empty-text {
    font-size: 26rpx;
    color: #999;
  }
}

.order-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.order-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 16rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;

  .order-id {
    font-size: 24rpx;
    color: #1890ff;
    font-family: monospace;
  }

  .copy-btn {
    padding: 4rpx 12rpx;
    background-color: #1890ff;
    color: #fff;
    border-radius: 4rpx;
    font-size: 20rpx;
    border: none;
    line-height: 1.5;

    .copy-btn-text {
      color: #fff;
    }

    &:active {
      opacity: 0.8;
    }
  }
}

// 底部操作栏
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 24rpx 32rpx;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
  z-index: 100;
  display: flex;
  gap: 12rpx;

  .action-btn {
    flex: 1;
    height: 88rpx;
    border-radius: 16rpx;
    font-size: 32rpx;
    font-weight: bold;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;

    &.start {
      background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(82, 196, 26, 0.3);
    }

    &.complete {
      background: linear-gradient(135deg, #51cf66 0%, #37b24d 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(81, 207, 102, 0.3);
    }

    &.reopen {
      width: 100%;
      background: #fff7e6;
      color: #ad6800;
      border: 1rpx solid #ffd591;
      box-shadow: none;
    }

    &:active {
      opacity: 0.8;
    }
  }

  &.completed {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 32rpx;
    gap: 12rpx;

    .completed-text {
      font-size: 32rpx;
      font-weight: bold;
      color: #52c41a;
    }

    .reimburse,
    .view-reimburse {
      width: 100%;
      height: 88rpx;
      border-radius: 16rpx;
      font-size: 32rpx;
      font-weight: bold;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .reimburse {
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(24, 144, 255, 0.3);

      &:active {
        opacity: 0.8;
      }
    }

    .view-reimburse {
      background: linear-gradient(135deg, #722ed1 0%, #531dab 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(114, 46, 209, 0.3);

      &:active {
        opacity: 0.8;
      }
    }
  }
}

// 采购表单弹窗
.record-form-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.modal-content {
  width: 100%;
  max-height: 80vh;
  background-color: #fff;
  border-radius: 32rpx 32rpx 0 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .modal-title {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
  }

  .modal-close {
    font-size: 48rpx;
    color: #999;
    line-height: 1;
    padding: 0 16rpx;
  }
}

.modal-body {
  padding: 32rpx;
  overflow-y: auto;
}

.ingredient-summary-card {
  padding: 24rpx;
  margin-bottom: 24rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #fff9e6 0%, #fff2cc 100%);
  display: flex;
  flex-direction: column;
  gap: 10rpx;

  .summary-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16rpx;
  }

  .summary-name {
    font-size: 30rpx;
    font-weight: 700;
    color: #333;
  }

  .summary-demand {
    font-size: 24rpx;
    color: #8c6d1f;
    flex-shrink: 0;
  }

  .summary-subtext {
    font-size: 22rpx;
    color: #8c6d1f;
    line-height: 1.5;
  }

  .summary-subtext.suggestion {
    font-weight: 500;
  }

  .record-demand-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10rpx;
  }

  .record-demand-metric {
    min-width: 0;
    padding: 14rpx 10rpx;
    border-radius: 12rpx;
    background-color: rgba(255, 255, 255, 0.72);
    border: 1rpx solid rgba(232, 197, 115, 0.48);

    .metric-label {
      display: block;
      margin-bottom: 6rpx;
      font-size: 20rpx;
      color: #8c6d1f;
      white-space: nowrap;
    }

    .metric-value {
      display: block;
      font-size: 26rpx;
      font-weight: 700;
      color: #333;
      white-space: nowrap;
    }

    &.primary .metric-value {
      color: #1890ff;
    }
  }
}

.form-section {
  margin-bottom: 24rpx;

  .form-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    margin-bottom: 12rpx;

    .form-label {
      margin-bottom: 0;
    }

    .form-title-hint {
      flex-shrink: 0;
      font-size: 22rpx;
      color: #999;
    }
  }

  .form-label {
    display: block;
    font-size: 28rpx;
    font-weight: 500;
    color: #333;
    margin-bottom: 12rpx;
  }

  .field-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    margin-bottom: 12rpx;

    .form-label {
      margin-bottom: 0;
    }
  }

  .field-unit-badge {
    flex-shrink: 0;
    padding: 4rpx 14rpx;
    border-radius: 999rpx;
    background-color: #e6f4ff;
    color: #096dd9;
    font-size: 22rpx;
    font-weight: 600;
  }

  .input-with-unit {
    position: relative;

    .unit-input {
      padding-right: 108rpx;
    }

    .input-unit-label {
      position: absolute;
      right: 24rpx;
      top: 50%;
      transform: translateY(-50%);
      color: #666;
      font-size: 26rpx;
      font-weight: 600;
      pointer-events: none;
    }
  }

  .form-input {
    width: 100%;
    height: 80rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    color: #333;
    background-color: #f5f5f5;
    border-radius: 8rpx;
    box-sizing: border-box;
  }

  .form-value {
    &.readonly {
      height: 80rpx;
      padding: 0 24rpx;
      font-size: 28rpx;
      color: #666;
      background-color: #f5f5f5;
      border-radius: 8rpx;
      display: flex;
      align-items: center;
    }
  }

  .form-hint {
    display: block;
    margin-top: 10rpx;
    font-size: 22rpx;
    line-height: 1.5;
    color: #8c8c8c;
  }

  .picker-input {
    height: 80rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    background-color: #f5f5f5;
    border-radius: 8rpx;
    display: flex;
    align-items: center;
    justify-content: space-between;

    .value {
      color: #333;
    }

    .placeholder {
      color: #999;
    }

    .arrow {
      font-size: 32rpx;
      color: #999;
    }
  }

  .channel-input-wrapper {
    display: flex;
    gap: 12rpx;
    align-items: center;

    .channel-input {
      flex: 1;
    }

    .quick-select-btn {
      flex-shrink: 0;
      padding: 0 24rpx;
      height: 80rpx;
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      border-radius: 8rpx;
      display: flex;
      align-items: center;
      justify-content: center;

      text {
        font-size: 26rpx;
        color: #fff;
        font-weight: 500;
      }

      &:active {
        opacity: 0.8;
      }
    }
  }

  .channel-chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .channel-chip {
    min-height: 64rpx;
    padding: 0 24rpx;
    border-radius: 999rpx;
    background: #f5f5f5;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    position: relative;
    z-index: 1;

    text {
      font-size: 24rpx;
      font-weight: 500;
    }

    &.active {
      background: linear-gradient(135deg, #ffd54f 0%, #ffca28 100%);
      color: #333;
      box-shadow: 0 6rpx 16rpx rgba(255, 202, 40, 0.24);
    }

    &.custom-entry {
      background: #fff7e6;
      color: #ad6800;
      border: 1rpx dashed rgba(250, 173, 20, 0.5);
    }
  }

  .record-sku-list {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
  }

  .record-sku-empty {
    padding: 24rpx;
    border-radius: 16rpx;
    background-color: #fff7e6;
    border: 1rpx solid rgba(250, 173, 20, 0.28);
    display: flex;
    flex-direction: column;
    gap: 8rpx;

    .empty-title {
      font-size: 28rpx;
      font-weight: 700;
      color: #ad6800;
    }

    .empty-desc {
      font-size: 24rpx;
      line-height: 1.5;
      color: #8c6d1f;
    }
  }

  .record-sku-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    padding: 18rpx 20rpx;
    border-radius: 16rpx;
    border: 2rpx solid #f0f0f0;
    background-color: #fafafa;

    &.active {
      border-color: #1890ff;
      background-color: #edf6ff;
      box-shadow: 0 8rpx 20rpx rgba(24, 144, 255, 0.12);

      .record-sku-check {
        border-color: #1890ff;
        background-color: #1890ff;
        color: #fff;
      }
    }

  }

  .record-sku-main {
    flex: 1;
    min-width: 0;
  }

  .record-sku-title-row {
    display: flex;
    align-items: center;
    gap: 10rpx;
    margin-bottom: 10rpx;
  }

  .record-sku-badge {
    flex-shrink: 0;
    padding: 4rpx 12rpx;
    border-radius: 999rpx;
    background-color: #f0f0f0;
    color: #666;
    font-size: 20rpx;
    font-weight: 600;
  }

  .record-sku-option.active .record-sku-badge {
    background-color: rgba(24, 144, 255, 0.12);
    color: #096dd9;
  }

  .record-sku-name {
    flex: 1;
    min-width: 0;
    font-size: 28rpx;
    color: #333;
    font-weight: 700;
    line-height: 1.35;
  }

  .record-sku-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8rpx;

    text {
      padding: 4rpx 10rpx;
      border-radius: 8rpx;
      background-color: #f0f0f0;
      color: #666;
      font-size: 22rpx;
      line-height: 1.35;
    }
  }

  .record-sku-check {
    flex-shrink: 0;
    width: 36rpx;
    height: 36rpx;
    border-radius: 50%;
    border: 3rpx solid #d9d9d9;
    color: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22rpx;
    font-weight: 700;
  }

  .form-textarea {
    width: 100%;
    min-height: 160rpx;
    padding: 16rpx 24rpx;
    font-size: 28rpx;
    color: #333;
    background-color: #f5f5f5;
    border-radius: 8rpx;
    box-sizing: border-box;
  }

  .form-hint {
    display: block;
    font-size: 22rpx;
    color: #999;
    margin-top: 8rpx;
    line-height: 1.4;
  }

  .char-count {
    display: block;
    font-size: 22rpx;
    color: #999;
    text-align: right;
    margin-top: 8rpx;
  }
}

.record-entry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.record-entry-card {
  min-width: 0;
  margin-bottom: 0;
  padding: 22rpx;
  border-radius: 16rpx;
  background-color: #fafafa;
}

.record-entry-meta {
  margin-top: 14rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.record-entry-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10rpx;
  font-size: 22rpx;
  line-height: 1.35;

  .meta-label {
    flex-shrink: 0;
    color: #777;
  }

  .meta-value {
    min-width: 0;
    color: #333;
    font-weight: 700;
    text-align: right;
    overflow-wrap: anywhere;

    &.price-tone-good {
      color: #2f855a;
    }

    &.price-tone-bad {
      color: #e5484d;
    }
  }
}

.input-placeholder {
  color: #999;
}

.modal-footer {
  padding: 24rpx 32rpx;
  border-top: 1rpx solid #f0f0f0;
  display: flex;
  gap: 24rpx;

  .modal-btn {
    flex: 1;
    height: 88rpx;
    border-radius: 12rpx;
    font-size: 32rpx;
    font-weight: 500;
    border: none;

    &.cancel {
      background-color: #f5f5f5;
      color: #666;
    }

    &.submit {
      background: linear-gradient(135deg, #faad14 0%, #d48806 100%);
      color: #fff;
    }

    &:active {
      opacity: 0.8;
    }
  }
}

// ==========================================
// 新增样式：日期变更警告横幅
// ==========================================
.date-change-warning {
  background: linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%);
  margin: 0 32rpx 24rpx;
  border-radius: 16rpx;
  padding: 24rpx;
  border-left: 6rpx solid #fa8c16;

  .warning-header {
    display: flex;
    align-items: center;
    gap: 12rpx;
    margin-bottom: 16rpx;

    .warning-icon {
      font-size: 32rpx;
    }

    .warning-title {
      font-size: 28rpx;
      font-weight: bold;
      color: #ad6800;
    }
  }

  .warning-list {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    margin-bottom: 16rpx;
    padding: 16rpx;
    background-color: rgba(255, 255, 255, 0.6);
    border-radius: 8rpx;

    .warning-item {
      display: flex;
      flex-direction: column;
      gap: 4rpx;

      .order-info {
        font-size: 26rpx;
        color: #ad6800;
        font-weight: 500;
      }

      .order-detail {
        font-size: 22rpx;
        color: #8c6800;
      }
    }
  }

  .warning-actions {
    display: flex;
    gap: 12rpx;

    .warning-btn {
      flex: 1;
      height: 72rpx;
      border-radius: 12rpx;
      font-size: 26rpx;
      font-weight: 500;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;

      &.ignore {
        background-color: rgba(250, 140, 22, 0.1);
        color: #ad6800;
      }

      &:active {
        opacity: 0.8;
      }
    }
  }
}

// ==========================================
// 修改样式：原料卡片操作按钮
// ==========================================
.item-actions {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  align-self: flex-end;

  .delete-item-btn {
    padding: 8rpx 20rpx;
    background-color: #ff4d4f;
    color: #fff;
    border-radius: 8rpx;
    font-size: 24rpx;
    border: none;
    line-height: 1.5;
    white-space: nowrap;

    &:active {
      opacity: 0.8;
    }
  }

  .continue-add-btn {
    padding: 12rpx 20rpx;
    background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
    color: #fff;
    border-radius: 8rpx;
    font-size: 24rpx;
    border: none;
    line-height: 1.5;
    white-space: nowrap;

    &:active {
      opacity: 0.8;
    }
  }

  .no-purchase-btn {
    padding: 12rpx 20rpx;
    background-color: #fff7e6;
    color: #ad6800;
    border-radius: 8rpx;
    font-size: 24rpx;
    border: 1rpx solid #ffd591;
    line-height: 1.5;
    white-space: nowrap;

    &:active {
      opacity: 0.8;
    }
  }
}

.no-purchase-card {
  margin: 0 24rpx 24rpx;
  padding: 20rpx 24rpx;
  border-radius: 12rpx;
  background-color: #fff7e6;
  border: 1rpx solid #ffd591;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;

  .no-purchase-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  .no-purchase-title {
    font-size: 26rpx;
    font-weight: 600;
    color: #ad6800;
  }

  .no-purchase-reason {
    font-size: 22rpx;
    color: #8c8c8c;
  }

  .clear-no-purchase-btn {
    padding: 8rpx 18rpx;
    border-radius: 8rpx;
    background-color: #fff;
    color: #ad6800;
    border: 1rpx solid #ffd591;
    font-size: 22rpx;
    line-height: 1.5;
    white-space: nowrap;
  }
}
</style>
