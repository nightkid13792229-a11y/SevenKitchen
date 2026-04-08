<template>
  <view class="purchase-detail-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">采购清单详情</text>
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
              <text class="kind-badge" :class="getListKindClass(purchaseList.kind)">
                {{ getListKindText(purchaseList.kind) }}
              </text>
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

        <view class="creator">
          <text class="label">采购类型:</text>
          <text class="value">{{ getListKindText(purchaseList.kind) }}</text>
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
                    <text class="item-name">{{ item.ingredientName || '未知原料' }}</text>
                    <view v-if="item.resolvedProcurementSkuName || item.resolvedSuggestedProductName" class="item-sku-lines">
                      <text v-if="item.resolvedProcurementSkuName" class="item-sku primary">
                        采购SKU：{{ item.resolvedProcurementSkuName }}
                      </text>
                      <text
                        v-if="item.resolvedSuggestedProductName && item.resolvedSuggestedProductName !== item.resolvedProcurementSkuName"
                        class="item-sku secondary"
                      >
                        推荐参考：{{ item.resolvedSuggestedProductName }}
                      </text>
                    </view>
                    <view v-if="item.resolvedPurchaseChannel || item.resolvedProductModel" class="item-specs">
                      <text v-if="item.resolvedPurchaseChannel" class="spec">{{ item.resolvedPurchaseChannel }}</text>
                      <text v-if="item.resolvedProductModel" class="spec">{{ item.resolvedProductModel }}</text>
                    </view>
                    <view class="item-quantity">
                      <text class="quantity-label">需求: </text>
                      <text class="quantity-value">{{ formatQuantity(item) }}</text>
                      <text class="quantity-unit">{{ getDisplayUnit(item) }}</text>
                    </view>
                  </view>

                  <view class="item-actions">
                    <!-- 删除原料按钮 (仅PENDING状态且未开始采购时显示) -->
                    <button
                      v-if="purchaseList.status === 'PENDING' && !purchaseList.startedAt"
                      class="delete-item-btn"
                      @tap="confirmDeleteItem(item)"
                    >
                      删除
                    </button>

                    <!-- 开始采购后显示的添加按钮 -->
                    <button
                      v-if="canManagePurchaseRecords"
                      class="continue-add-btn"
                      @tap="handleContinueAdd(item)"
                    >
                      添加采购记录
                    </button>
                  </view>
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
                          采购SKU：{{ record.resolvedProcurementSkuName }}
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
              <text class="summary-demand">
                需求 {{ formatQuantity(selectedIngredient) }}{{ getDisplayUnit(selectedIngredient) }}
              </text>
            </view>
            <text
              v-if="getItemSuggestedProductLabel(selectedIngredient)"
              class="summary-subtext suggestion"
            >
              推荐参考：{{ getItemSuggestedProductLabel(selectedIngredient) }}
            </text>
            <text v-if="getItemProcurementSkuLabel(selectedIngredient)" class="summary-subtext suggestion">
              采购 SKU：{{ getItemProcurementSkuLabel(selectedIngredient) }}
            </text>
            <text v-if="latestRecordSummary" class="summary-subtext">{{ latestRecordSummary }}</text>
          </view>

          <view v-if="recordProcurementSkuOptions.length > 1" class="form-section">
            <text class="form-label">采购 SKU（可选）</text>
            <picker
              mode="selector"
              :range="recordProcurementSkuOptions"
              range-key="label"
              :value="recordProcurementSkuIndex"
              @change="onProcurementSkuChange"
            >
              <view class="channel-input-wrapper">
                <view class="picker">
                  <text v-if="recordForm.procurementSkuId" class="picker-text">
                    {{ selectedRecordProcurementSku?.label }}
                  </text>
                  <text v-else class="picker-placeholder">请选择生产采购 SKU</text>
                  <text class="picker-arrow">›</text>
                </view>
              </view>
            </picker>
            <text class="form-hint">优先录入生产采购 SKU，没有配置时可直接留空。</text>
          </view>

          <view class="form-section">
            <text class="form-label">采购渠道 *</text>
            <view v-if="recordChannelChoices.length > 0" class="channel-chip-group">
              <view
                v-for="channel in recordChannelChoices"
                :key="channel"
                class="channel-chip"
                :class="{ active: isPresetChannelSelected(channel) }"
                @tap.stop="selectChannel(channel)"
              >
                <text>{{ channel }}</text>
              </view>
              <view
                class="channel-chip custom-entry"
                :class="{ active: isCustomChannelMode }"
                @tap.stop="activateCustomChannelInput"
              >
                <text>其它渠道</text>
              </view>
            </view>

            <view v-if="isCustomChannelMode" class="channel-input-wrapper">
              <input
                v-model="recordForm.purchaseChannel"
                class="form-input channel-input"
                placeholder="请输入采购渠道"
                placeholder-class="input-placeholder"
              />
            </view>
            <text class="form-hint">
              {{ isCustomChannelMode ? '手动输入不会新增按钮，只作为这次采购记录使用' : '直接点选一个常用渠道即可，点“其它渠道”时再手动输入' }}
            </text>
          </view>

          <view class="form-section">
            <text class="form-label">实际购买件数 *</text>
            <input
              v-model="recordForm.actualPackageCount"
              type="digit"
              class="form-input"
              placeholder="请输入本次实际买了几件，如：2"
              placeholder-class="input-placeholder"
            />
            <text class="form-hint">
              按实际买到的件数填写，不需要先手算成 {{ getPurchaseRecordUnit(selectedIngredient) }}
            </text>
          </view>

          <view class="form-section">
            <text class="form-label">单件规格 *</text>
            <input
              v-model="recordForm.actualPackageSize"
              type="digit"
              class="form-input"
              placeholder="请输入单件规格数值，如：1000"
              placeholder-class="input-placeholder"
            />
          </view>

          <view class="form-section">
            <text class="form-label">规格单位 *</text>
            <view class="channel-chip-group">
              <view
                v-for="unit in currentPackageUnitOptions"
                :key="unit"
                class="channel-chip"
                :class="{ active: recordForm.actualPackageUnit === unit }"
                @tap.stop="selectPackageUnit(unit)"
              >
                <text>{{ unit }}</text>
              </view>
            </view>
            <text class="form-hint">
              例如 1件 x 1000g、2件 x 500ml，系统会自动折算成标准采购单位
            </text>
          </view>

          <view class="form-section">
            <text class="form-label">实际采购金额（元） *</text>
            <input
              v-model="recordForm.actualCost"
              type="digit"
              class="form-input"
              placeholder="请输入金额，如：156.50"
              placeholder-class="input-placeholder"
            />
          </view>

          <view v-if="recordInputSummary" class="price-preview-card">
            <text class="price-preview-label">系统自动折算</text>
            <text class="price-preview-value">{{ recordInputSummary }}</text>
            <text class="price-preview-hint">{{ recordAutoConvertHint }}</text>
          </view>

          <view class="extra-toggle" @tap="toggleExtraFields">
            <text class="extra-toggle-text">{{ showExtraFields ? '收起补充信息' : '补充信息（选填）' }}</text>
            <text class="extra-toggle-arrow">{{ showExtraFields ? '▲' : '▼' }}</text>
          </view>

          <view v-if="showExtraFields" class="extra-fields">
            <view class="form-section">
              <text class="form-label">产品型号（选填）</text>
              <input
                v-model="recordForm.productModel"
                class="form-input"
                placeholder="如：500g装"
                placeholder-class="input-placeholder"
              />
            </view>

            <view class="form-section">
              <text class="form-label">备注信息（选填）</text>
              <textarea
                v-model="recordForm.notes"
                class="form-textarea"
                placeholder="例如：缺货换了规格、临时涨价等"
                placeholder-class="input-placeholder"
                :maxlength="200"
              />
              <text class="char-count">{{ recordForm.notes.length }}/200</text>
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
  startPurchase as startPurchaseApi,
  getPurchaseRecords,
  deletePurchaseRecord as deletePurchaseRecordApi,
  addPurchaseRecord,
  updatePurchaseRecord as updatePurchaseRecordApi,
  removeItemFromList,
  checkOrderDateChanges,
  getPurchaseChannels,
  previewPurchaseList,
  addOrdersToList,
  resolveProcurementSkuProfile,
  resolvePurchaseItemDisplay,
  resolvePurchaseRecordDisplay,
} from '@/api/purchasing';

// 状态管理
const purchaseListId = ref('');
const purchaseList = ref<any>(null);
const items = ref<any[]>([]);
const loading = ref(true);
const completing = ref(false);
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
const showExtraFields = ref(false);
const channelInputMode = ref<'preset' | 'custom'>('preset');
const recordChannelChoices = ref<string[]>([]);
const editingRecord = ref<any>(null);

const recordForm = ref({
  procurementSkuId: '',
  procurementSkuName: '',
  purchaseChannel: '',
  actualPackageCount: '',
  actualPackageSize: '',
  actualPackageUnit: '',
  actualCost: '',
  productModel: '',
  notes: '',
});

const canManagePurchaseRecords = computed(() => {
  return Boolean(purchaseList.value?.startedAt) && !purchaseList.value?.reimbursementId;
});

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

const getPackageUnitOptions = (item: any): string[] => {
  const baseUnit = getIngredientBaseUnit(item);
  const hasDensity = Number(item?.ingredient?.properties?.density_g_per_ml || 0) > 0;

  if (baseUnit === 'ML') {
    return hasDensity ? ['ml', 'L', 'g', 'kg'] : ['ml', 'L'];
  }

  if (baseUnit === 'G') {
    return hasDensity ? ['g', 'kg', '斤', 'ml', 'L'] : ['g', 'kg', '斤'];
  }

  return ['个', '件', '袋', '包', '盒', '瓶', '罐', '张', '片'];
};

const currentPackageUnitOptions = computed(() => {
  return getPackageUnitOptions(selectedIngredient.value);
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

const recordProcurementSkuOptions = computed(() => [
  { id: '', label: '不选择采购 SKU' },
  ...procurementSkuProfile.value.procurementSkuChoices.map((sku) => ({
    ...sku,
    label: formatCompactLabel([sku.name, sku.productModel, sku.purchaseChannel]),
  })),
]);

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

const recordInputSummary = computed(() => {
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
    return '';
  }

  return `${formatDecimal(packageCount)}件 x ${formatDecimal(packageSize)}${packageUnit}`;
});

const recordAutoConvertHint = computed(() => {
  if (!selectedIngredient.value) {
    return '保存后由后端自动折算，不需要手算';
  }

  const purchaseUnit = getPurchaseRecordUnit(selectedIngredient.value);
  const baseUnit = formatMeasurementUnit(getIngredientBaseUnit(selectedIngredient.value));
  return `保存后会自动换算为 ${purchaseUnit}，并沉淀为 ${baseUnit} 口径用于后续价格学习`;
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

const formatRecordRawSummary = (record: any) => {
  const packageCount = Number(record.actualPackageCount || 0);
  const packageSize = Number(record.actualPackageSize || 0);
  const packageUnit = record.actualPackageUnit;

  if (
    Number.isFinite(packageCount) &&
    packageCount > 0 &&
    Number.isFinite(packageSize) &&
    packageSize > 0 &&
    packageUnit
  ) {
    return `${formatDecimal(packageCount)}件 x ${formatDecimal(packageSize)}${packageUnit}`;
  }

  return '';
};

const formatRecordQuantity = (record: any, item: any) => {
  const rawSummary = formatRecordRawSummary(record);
  if (rawSummary) {
    return rawSummary;
  }

  const quantity = Number(record.actualQuantity || 0);
  return `${formatDecimal(quantity)}${getPurchaseRecordUnit(item)}`;
};

const formatRecordNormalizedSummary = (record: any, item: any) => {
  const quantity = Number(record.actualQuantity || 0);
  const baseQuantity = Number(record.actualBaseQuantity || 0);
  const parts: string[] = [];

  if (Number.isFinite(baseQuantity) && baseQuantity > 0 && record.actualBaseUnit) {
    parts.push(`${formatDecimal(baseQuantity, 3)}${formatMeasurementUnit(record.actualBaseUnit)}`);
  }

  if (Number.isFinite(quantity) && quantity > 0) {
    parts.push(`${formatDecimal(quantity, 3)}${getPurchaseRecordUnit(item)}`);
  }

  if (parts.length <= 1) {
    return '';
  }

  return `折算 ${parts.join(' ≈ ')}`;
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
        const key = record.ingredientId;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(record);
      });

      // 将采购记录关联到对应的原料卡片
      items.value.forEach(item => {
        item.records = grouped.get(item.ingredientId) || [];
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

  recordForm.value.procurementSkuId = latestProfile.procurementSkuId || '';
  recordForm.value.procurementSkuName = latestProfile.procurementSkuName || '';
  recordForm.value.productModel = latest?.productModel || latestProfile.productModel || '';
  recordForm.value.actualPackageCount = latest?.actualPackageCount
    ? formatDecimal(Number(latest.actualPackageCount || 0))
    : '';
  recordForm.value.actualPackageSize = latest?.actualPackageSize
    ? formatDecimal(Number(latest.actualPackageSize || 0))
    : getSuggestedPackageSize(item);
  recordForm.value.actualPackageUnit =
    latest?.actualPackageUnit || getSuggestedPackageUnit(item);

  // 预填充采购渠道
  recordForm.value.purchaseChannel =
    latestProfile.purchaseChannel ||
    normalizeChannelLabel(latest?.purchaseChannel) ||
    '';

  showExtraFields.value = false;
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
  recordForm.value.procurementSkuId = recordProfile.procurementSkuId || '';
  recordForm.value.procurementSkuName = recordProfile.procurementSkuName || '';
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
  recordForm.value.notes = record.notes || '';

  showExtraFields.value = Boolean(record.productModel || record.notes);
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

  const profile = resolveProcurementSkuProfile(selectedIngredient.value);
  recordForm.value.procurementSkuId = sku.id || '';
  recordForm.value.procurementSkuName = sku.id ? sku.name : '';

  if (sku.id) {
    recordForm.value.purchaseChannel = sku.purchaseChannel || recordForm.value.purchaseChannel;
    recordForm.value.productModel = sku.productModel || recordForm.value.productModel;
    channelInputMode.value =
      recordForm.value.purchaseChannel && recordChannelChoices.value.includes(recordForm.value.purchaseChannel)
        ? 'preset'
        : 'custom';
  } else {
    recordForm.value.purchaseChannel = profile.purchaseChannel || '';
    recordForm.value.productModel = profile.productModel || '';
    channelInputMode.value =
      recordForm.value.purchaseChannel && recordChannelChoices.value.includes(recordForm.value.purchaseChannel)
        ? 'preset'
        : 'custom';
  }
};

const selectPackageUnit = (unit: string) => {
  recordForm.value.actualPackageUnit = unit;
};

const activateCustomChannelInput = () => {
  const currentChannel = normalizeChannelLabel(recordForm.value.purchaseChannel);
  channelInputMode.value = 'custom';
  if (!currentChannel || recordChannelChoices.value.includes(currentChannel)) {
    recordForm.value.purchaseChannel = '';
  }
};

const toggleExtraFields = () => {
  showExtraFields.value = !showExtraFields.value;
};

// 重置表单
const resetRecordForm = () => {
  recordForm.value = {
    procurementSkuId: '',
    procurementSkuName: '',
    purchaseChannel: '',
    actualPackageCount: '',
    actualPackageSize: '',
    actualPackageUnit: '',
    actualCost: '',
    productModel: '',
    notes: '',
  };
  showExtraFields.value = false;
  recordChannelChoices.value = [];
  channelInputMode.value = 'preset';
};

// 提交采购记录
const submitRecord = async () => {
  // 表单验证
  if (!recordForm.value.purchaseChannel || recordForm.value.purchaseChannel.trim().length === 0) {
    uni.showToast({ title: '请输入采购渠道', icon: 'none' });
    return;
  }

  if (!recordForm.value.actualPackageCount || recordForm.value.actualPackageCount.toString().trim().length === 0) {
    uni.showToast({ title: '请输入实际购买件数', icon: 'none' });
    return;
  }

  const packageCount = Number(recordForm.value.actualPackageCount);
  if (isNaN(packageCount) || packageCount <= 0) {
    uni.showToast({ title: '件数必须大于0', icon: 'none' });
    return;
  }

  if (!hasMaxDecimalPlaces(recordForm.value.actualPackageCount, 3)) {
    uni.showToast({ title: '件数最多三位小数', icon: 'none' });
    return;
  }

  if (!recordForm.value.actualPackageSize || recordForm.value.actualPackageSize.toString().trim().length === 0) {
    uni.showToast({ title: '请输入单件规格', icon: 'none' });
    return;
  }

  const packageSize = Number(recordForm.value.actualPackageSize);
  if (isNaN(packageSize) || packageSize <= 0) {
    uni.showToast({ title: '单件规格必须大于0', icon: 'none' });
    return;
  }

  if (!hasMaxDecimalPlaces(recordForm.value.actualPackageSize, 3)) {
    uni.showToast({ title: '单件规格最多三位小数', icon: 'none' });
    return;
  }

  if (!recordForm.value.actualPackageUnit) {
    uni.showToast({ title: '请选择规格单位', icon: 'none' });
    return;
  }

  if (!recordForm.value.actualCost || recordForm.value.actualCost.toString().trim().length === 0) {
    uni.showToast({ title: '请输入实际采购金额', icon: 'none' });
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
    const data: any = {
      procurementSkuId: recordForm.value.procurementSkuId || undefined,
      procurementSkuName: recordForm.value.procurementSkuName || undefined,
      purchaseChannel: recordForm.value.purchaseChannel.trim(),
      actualPackageCount: Number(packageCount.toFixed(3)),
      actualPackageSize: Number(packageSize.toFixed(3)),
      actualPackageUnit: recordForm.value.actualPackageUnit,
      actualCost: Number(cost.toFixed(2)),
      productModel: recordForm.value.productModel?.trim() || undefined,
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

// 确认采购完成
const completePurchase = () => {
  uni.showModal({
    title: '确认采购完成',
    content: '确认该采购清单的所有原料已采购完成？',
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
    ORDER_DEMAND: '订单采购',
    STOCK_REPLENISHMENT: '库存补货',
  };
  return kindMap[kind || 'ORDER_DEMAND'] || '订单采购';
};

const getListKindClass = (kind?: string) => {
  return kind === 'STOCK_REPLENISHMENT' ? 'stock' : 'order';
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

const resolveFoodDisplayMeta = (item: any) => {
  const quantity = Number(item.quantityNeeded || 0);
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

const formatQuantity = (item: any) => {
  if (item.type === 'FOOD') {
    const meta = resolveFoodDisplayMeta(item);
    return formatDisplayValue(meta.value, meta.unit);
  }

  // 补剂类型和其他：保留两位小数
  return Number(item.quantityNeeded).toFixed(2);
};

// 获取显示单位
const getDisplayUnit = (item: any) => {
  if (item.type === 'FOOD') {
    return resolveFoodDisplayMeta(item).unit;
  }

  if (item.resolvedDisplayUnit) {
    return item.resolvedDisplayUnit;
  }

  // 补剂类型：优先使用displayUnit，回退到quantityUnit
  if (item.type === 'SUPPLEMENT') {
    return item.displayUnit || item.quantityUnit || 'g';
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
    content: `确认删除原料"${item.ingredientName}"？`,
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

      .kind-badge {
        padding: 6rpx 14rpx;
        border-radius: 999rpx;
        font-size: 22rpx;
        font-weight: 600;

        &.order {
          background: rgba(255, 202, 40, 0.18);
          color: #8a5a00;
        }

        &.stock {
          background: rgba(34, 197, 94, 0.14);
          color: #15803d;
        }
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

      .item-name {
        font-size: 30rpx;
        font-weight: 500;
        color: #333;
        margin-bottom: 12rpx;
        display: block;
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
        }
      }

      .item-quantity {
        display: flex;
        align-items: baseline;
        gap: 4rpx;

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
}

.form-section {
  margin-bottom: 24rpx;

  .form-label {
    display: block;
    font-size: 28rpx;
    font-weight: 500;
    color: #333;
    margin-bottom: 12rpx;
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

.price-preview-card {
  margin-top: -4rpx;
  margin-bottom: 24rpx;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  background: #f6ffed;
  border: 1rpx solid rgba(82, 196, 26, 0.18);
  display: flex;
  flex-direction: column;
  gap: 8rpx;

  .price-preview-label {
    font-size: 22rpx;
    color: #666;
  }

  .price-preview-value {
    font-size: 30rpx;
    font-weight: 700;
    color: #389e0d;
  }

  .price-preview-hint {
    font-size: 22rpx;
    color: #666;
    line-height: 1.5;
  }
}

.extra-toggle {
  margin-bottom: 20rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .extra-toggle-text {
    font-size: 26rpx;
    color: #333;
    font-weight: 500;
  }

  .extra-toggle-arrow {
    font-size: 24rpx;
    color: #999;
  }
}

.extra-fields {
  padding-top: 4rpx;
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
}
</style>
