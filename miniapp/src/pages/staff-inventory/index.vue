<template>
  <view class="inventory-page">
    <view class="header">
      <text class="title">库存管理</text>
      <text class="subtitle">查看库存预警、补货建议、最近流水和盘点记录</text>
    </view>

    <view class="summary-grid">
      <view class="summary-card">
        <text class="summary-value">{{ overviewItems.length }}</text>
        <text class="summary-label">库存条目</text>
      </view>
      <view class="summary-card danger">
        <text class="summary-value">{{ replenishmentCount }}</text>
        <text class="summary-label">需要补货</text>
      </view>
      <view class="summary-card warning">
        <text class="summary-value">{{ lowStockCount }}</text>
        <text class="summary-label">低于安全库存</text>
      </view>
      <view class="summary-card">
        <text class="summary-value">{{ noPolicyCount }}</text>
        <text class="summary-label">未设阈值</text>
      </view>
    </view>

    <view class="quick-actions">
      <button class="action-btn primary" @tap="goToStockCreate">创建补货采购单</button>
      <button class="action-btn" @tap="goToStocktakeCreate">开始盘点</button>
      <button class="action-btn" @tap="refreshActiveTab">刷新当前视图</button>
    </view>

    <view class="tabs">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-item"
        :class="{ active: activeTab === tab.value }"
        @tap="switchTab(tab.value)"
      >
        <text>{{ tab.label }}</text>
      </view>
    </view>

    <view v-if="activeTab === 'overview'" class="overview-section">
      <view class="filter-card">
        <input
          v-model="keyword"
          class="search-input"
          placeholder="搜索原料名称、采购渠道或规格"
          confirm-type="search"
        />

        <view class="filter-row">
          <view class="filter-group">
            <view
              v-for="option in typeOptions"
              :key="option.value || 'ALL'"
              class="filter-chip"
              :class="{ active: selectedType === option.value }"
              @tap="selectType(option.value)"
            >
              <text>{{ option.label }}</text>
            </view>
          </view>

          <view class="warning-toggle" @tap="toggleOnlyWarnings">
            <text class="toggle-label">仅看预警</text>
            <switch :checked="onlyWarnings" color="#0f766e" />
          </view>
        </view>
      </view>

      <view v-if="loadingOverview" class="state-card">
        <text>正在加载库存总览...</text>
      </view>

      <view v-else-if="displayOverview.length === 0" class="state-card">
        <text class="state-title">暂无符合条件的库存条目</text>
        <text class="state-hint">可以调整筛选条件，或者先在后台配置库存阈值。</text>
      </view>

      <view v-else class="inventory-list">
        <view
          v-for="item in displayOverview"
          :key="item.id"
          class="inventory-card"
        >
          <view class="card-header">
            <view class="title-block">
              <text class="ingredient-name">{{ item.name }}</text>
              <text class="ingredient-meta">
                {{ getTypeText(item.type) }} · {{ getStrategyText(item.procurementStrategy) }}
              </text>
            </view>
            <view class="status-badge" :class="getStatusClass(item.stockStatus)">
              <text>{{ getStockStatusText(item.stockStatus) }}</text>
            </view>
          </view>

          <view class="metric-grid">
            <view class="metric-item">
              <text class="metric-label">当前库存</text>
              <text class="metric-value">{{ formatQuantity(item.currentStock) }} {{ item.stockUnitLabel }}</text>
            </view>
            <view class="metric-item">
              <text class="metric-label">建议补货</text>
              <text class="metric-value">
                {{ item.suggestedPurchaseQuantity > 0 ? `${formatQuantity(item.suggestedPurchaseQuantity)} ${item.purchaseUnit}` : '暂无' }}
              </text>
            </view>
            <view class="metric-item">
              <text class="metric-label">预估金额</text>
              <text class="metric-value">¥{{ formatPrice(item.suggestedEstimatedCost) }}</text>
            </view>
          </view>

          <view class="detail-line">
            <text class="detail-label">阈值</text>
            <text class="detail-value">{{ formatThresholds(item) || '未设置' }}</text>
          </view>

          <view class="detail-line">
            <text class="detail-label">采购信息</text>
            <text class="detail-value">{{ formatPurchaseInfo(item) }}</text>
          </view>

          <view v-if="item.suggestedProductName" class="detail-line">
            <text class="detail-label">推荐商品</text>
            <text class="detail-value">{{ item.suggestedProductName }}</text>
          </view>

          <view class="card-actions">
            <button class="mini-btn" @tap="viewLedger(item)">查看流水</button>
            <button class="mini-btn primary" @tap="goToStockCreate">去补货</button>
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="activeTab === 'ledger'" class="ledger-section">
      <view class="sub-header">
        <view>
          <text class="section-title">最近库存流水</text>
          <text class="section-subtitle">库存余额始终来自流水累加，方便追溯来源</text>
        </view>
        <button v-if="selectedIngredientId" class="inline-btn" @tap="clearLedgerFilter">查看全部</button>
      </view>

      <view v-if="selectedIngredientId" class="filter-pill">
        <text>当前筛选：{{ selectedIngredientName }}</text>
      </view>

      <view v-if="loadingLedger" class="state-card">
        <text>正在加载库存流水...</text>
      </view>

      <view v-else-if="ledgerItems.length === 0" class="state-card">
        <text class="state-title">暂无库存流水</text>
        <text class="state-hint">采购入库、手工调整和盘点差异都会显示在这里。</text>
      </view>

      <view v-else class="ledger-list">
        <view
          v-for="item in ledgerItems"
          :key="item.id"
          class="ledger-card"
        >
          <view class="ledger-header">
            <view>
              <text class="ledger-name">{{ item.ingredientName }}</text>
              <text class="ledger-time">{{ formatDateTime(item.createdAt) }}</text>
            </view>
            <text class="ledger-delta" :class="item.deltaG >= 0 ? 'positive' : 'negative'">
              {{ formatSignedQuantity(item.deltaG) }} {{ item.stockUnitLabel }}
            </text>
          </view>

          <view class="ledger-line">
            <text class="ledger-tag">{{ item.sourceLabel || getSourceText(item.sourceType) }}</text>
            <text class="ledger-detail">{{ formatLedgerDetail(item) }}</text>
          </view>

          <view v-if="item.sourceDescription" class="ledger-note">
            <text>{{ item.sourceDescription }}</text>
          </view>
          <view v-else-if="item.procurementSkuName" class="ledger-note">
            <text>采购 SKU · {{ item.procurementSkuName }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-else class="stocktake-section">
      <view class="sub-header">
        <view>
          <text class="section-title">盘点记录</text>
          <text class="section-subtitle">这里展示最近的盘点结果和差异入账状态</text>
        </view>
        <button class="inline-btn primary" @tap="goToStocktakeCreate">开始盘点</button>
      </view>

      <view v-if="loadingStocktakes" class="state-card">
        <text>正在加载盘点记录...</text>
      </view>

      <view v-else-if="stocktakes.length === 0" class="state-card">
        <text class="state-title">暂无盘点记录</text>
        <text class="state-hint">后续在后台或移动端执行盘点后，会在这里显示。</text>
      </view>

      <view v-else class="stocktake-list">
        <view
          v-for="stocktake in stocktakes"
          :key="stocktake.id"
          class="stocktake-card"
        >
          <view class="stocktake-header">
            <view>
              <text class="stocktake-title">{{ stocktake.note || '库存盘点' }}</text>
              <text class="stocktake-time">创建于 {{ formatDateTime(stocktake.createdAt) }}</text>
            </view>
            <view class="stocktake-status" :class="stocktake.status === 'APPLIED' ? 'applied' : 'draft'">
              <text>{{ stocktake.status === 'APPLIED' ? '已入账' : '草稿' }}</text>
            </view>
          </view>

          <view class="stocktake-metrics">
            <text>原料 {{ stocktake.lineCount }} 项</text>
            <text>差异 {{ stocktake.varianceCount }} 项</text>
            <text>绝对值 {{ formatQuantity(stocktake.totalAbsDeltaG) }}</text>
          </view>

          <view
            v-for="line in stocktake.lines"
            :key="line.id"
            class="stocktake-line"
          >
            <view class="stocktake-line-head">
              <text class="line-name">{{ line.ingredientName }}</text>
              <text class="line-delta" :class="line.deltaG >= 0 ? 'positive' : 'negative'">
                {{ formatSignedQuantity(line.deltaG) }} {{ line.stockUnitLabel }}
              </text>
            </view>
            <text class="line-detail">
              账面 {{ formatQuantity(line.expectedQuantityG) }} / 盘点 {{ formatQuantity(line.countedQuantityG) }} {{ line.stockUnitLabel }}
            </text>
            <text v-if="line.procurementSkuName" class="line-detail">
              采购 SKU · {{ line.procurementSkuName }}
            </text>
          </view>

          <view v-if="stocktake.status === 'DRAFT'" class="stocktake-actions">
            <button
              class="inline-btn primary"
              :loading="applyingStocktakeId === stocktake.id"
              @tap="applyStocktake(stocktake)"
            >
              立即入账
            </button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  applyInventoryStocktake,
  getInventoryLedger,
  getInventoryOverview,
  getInventoryStocktakes,
  type InventoryIngredientType,
  type InventoryLedgerItem,
  type InventoryOverviewItem,
  type InventorySourceType,
  type InventoryStockStatus,
  type InventoryStocktakeItem,
} from '@/api/inventory';

const PENDING_TAB_STORAGE_KEY = 'staff_inventory_pending_tab';

const tabs = [
  { label: '库存总览', value: 'overview' },
  { label: '库存流水', value: 'ledger' },
  { label: '盘点记录', value: 'stocktakes' },
] as const;

const typeOptions: Array<{ label: string; value: InventoryIngredientType | '' }> = [
  { label: '全部', value: '' },
  { label: '食材', value: 'FOOD' },
  { label: '补剂', value: 'SUPPLEMENT' },
  { label: '包材', value: 'PACKAGING' },
];

const activeTab = ref<'overview' | 'ledger' | 'stocktakes'>('overview');
const loadingOverview = ref(false);
const loadingLedger = ref(false);
const loadingStocktakes = ref(false);
const overviewItems = ref<InventoryOverviewItem[]>([]);
const ledgerItems = ref<InventoryLedgerItem[]>([]);
const stocktakes = ref<InventoryStocktakeItem[]>([]);
const keyword = ref('');
const selectedType = ref<InventoryIngredientType | ''>('');
const onlyWarnings = ref(false);
const selectedIngredientId = ref('');
const selectedIngredientName = ref('');
const hasLoadedLedger = ref(false);
const hasLoadedStocktakes = ref(false);
const applyingStocktakeId = ref('');

const replenishmentCount = computed(() => (
  overviewItems.value.filter((item) => item.stockStatus === 'NEEDS_REPLENISHMENT').length
));

const lowStockCount = computed(() => (
  overviewItems.value.filter((item) => item.stockStatus === 'LOW_STOCK').length
));

const noPolicyCount = computed(() => (
  overviewItems.value.filter((item) => item.stockStatus === 'NO_POLICY').length
));

const displayOverview = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase();

  return overviewItems.value
    .filter((item) => !selectedType.value || item.type === selectedType.value)
    .filter((item) => !onlyWarnings.value || item.stockStatus === 'NEEDS_REPLENISHMENT' || item.stockStatus === 'LOW_STOCK')
    .filter((item) => {
      if (!normalizedKeyword) {
        return true;
      }

      return [item.name, item.procurementSkuName, item.purchaseChannel, item.productModel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedKeyword));
    });
});

onMounted(() => {
  if (applyPendingTabPreference()) {
    refreshActiveTab();
    return;
  }

  loadOverview();
});

onShow(() => {
  if (applyPendingTabPreference()) {
    refreshActiveTab();
    return;
  }

  if (activeTab.value === 'overview') {
    loadOverview();
    return;
  }

  if (activeTab.value === 'ledger') {
    loadLedger();
    return;
  }

  loadStocktakes();
});

const applyPendingTabPreference = () => {
  try {
    const pending = uni.getStorageSync(PENDING_TAB_STORAGE_KEY);
    if (
      pending === 'overview' ||
      pending === 'ledger' ||
      pending === 'stocktakes'
    ) {
      activeTab.value = pending;
      uni.removeStorageSync(PENDING_TAB_STORAGE_KEY);
      return true;
    }
  } catch (error) {
    console.warn('读取库存页待切换 tab 失败', error);
  }

  return false;
};

const loadOverview = async () => {
  loadingOverview.value = true;
  try {
    const res = await getInventoryOverview();
    overviewItems.value = res.data || [];
  } catch (error: any) {
    console.error('加载库存总览失败', error);
    uni.showToast({
      title: error?.message || '加载库存总览失败',
      icon: 'none',
    });
  } finally {
    loadingOverview.value = false;
  }
};

const loadLedger = async () => {
  loadingLedger.value = true;
  try {
    const res = await getInventoryLedger({
      ingredientId: selectedIngredientId.value || undefined,
      limit: 50,
    });
    ledgerItems.value = res.data || [];
    hasLoadedLedger.value = true;
  } catch (error: any) {
    console.error('加载库存流水失败', error);
    uni.showToast({
      title: error?.message || '加载库存流水失败',
      icon: 'none',
    });
  } finally {
    loadingLedger.value = false;
  }
};

const loadStocktakes = async () => {
  loadingStocktakes.value = true;
  try {
    const res = await getInventoryStocktakes({ limit: 10 });
    stocktakes.value = res.data || [];
    hasLoadedStocktakes.value = true;
  } catch (error: any) {
    console.error('加载盘点记录失败', error);
    uni.showToast({
      title: error?.message || '加载盘点记录失败',
      icon: 'none',
    });
  } finally {
    loadingStocktakes.value = false;
  }
};

const switchTab = async (tab: 'overview' | 'ledger' | 'stocktakes') => {
  activeTab.value = tab;

  if (tab === 'ledger' && !hasLoadedLedger.value) {
    await loadLedger();
    return;
  }

  if (tab === 'stocktakes' && !hasLoadedStocktakes.value) {
    await loadStocktakes();
  }
};

const refreshActiveTab = async () => {
  if (activeTab.value === 'overview') {
    await loadOverview();
    return;
  }

  if (activeTab.value === 'ledger') {
    await loadLedger();
    return;
  }

  await loadStocktakes();
};

const selectType = (value: InventoryIngredientType | '') => {
  selectedType.value = value;
};

const toggleOnlyWarnings = () => {
  onlyWarnings.value = !onlyWarnings.value;
};

const viewLedger = async (item: InventoryOverviewItem) => {
  selectedIngredientId.value = item.id;
  selectedIngredientName.value = item.name;
  activeTab.value = 'ledger';
  await loadLedger();
};

const clearLedgerFilter = async () => {
  selectedIngredientId.value = '';
  selectedIngredientName.value = '';
  await loadLedger();
};

const goToStockCreate = () => {
  uni.navigateTo({ url: '/pages/staff-purchasing/stock-create' });
};

const goToStocktakeCreate = () => {
  uni.navigateTo({ url: '/pages/staff-inventory/stocktake-create' });
};

const applyStocktake = async (stocktake: InventoryStocktakeItem) => {
  if (applyingStocktakeId.value) {
    return;
  }

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '确认入账',
      content: '这会把盘点差异写入库存流水，是否继续？',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });

  if (!confirmed) {
    return;
  }

  applyingStocktakeId.value = stocktake.id;

  try {
    await applyInventoryStocktake(stocktake.id);
    uni.showToast({ title: '盘点差异已入账', icon: 'success' });

    await Promise.all([
      loadStocktakes(),
      loadOverview(),
      hasLoadedLedger.value ? loadLedger() : Promise.resolve(),
    ]);
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '盘点入账失败',
      icon: 'none',
    });
  } finally {
    applyingStocktakeId.value = '';
  }
};

const getTypeText = (type: InventoryIngredientType) => {
  const labels: Record<InventoryIngredientType, string> = {
    FOOD: '食材',
    SUPPLEMENT: '补剂',
    PACKAGING: '包材',
  };
  return labels[type] || type;
};

const getStrategyText = (strategy: string) => {
  const labels: Record<string, string> = {
    DAILY_PURCHASE: '日采',
    STOCK_REPLENISHMENT: '库存补货',
    HYBRID: '混合',
  };
  return labels[strategy] || strategy;
};

const getStockStatusText = (status: InventoryStockStatus) => {
  const labels: Record<InventoryStockStatus, string> = {
    NO_POLICY: '未设阈值',
    SUFFICIENT: '库存充足',
    LOW_STOCK: '低于安全库存',
    NEEDS_REPLENISHMENT: '需要补货',
  };
  return labels[status] || status;
};

const getStatusClass = (status: InventoryStockStatus) => {
  const classMap: Record<InventoryStockStatus, string> = {
    NO_POLICY: 'neutral',
    SUFFICIENT: 'success',
    LOW_STOCK: 'warning',
    NEEDS_REPLENISHMENT: 'danger',
  };
  return classMap[status] || 'neutral';
};

const getSourceText = (sourceType: InventorySourceType) => {
  const labels: Record<InventorySourceType, string> = {
    KITCHEN_TASK: '厨房领用',
    PURCHASE_RECORD: '采购入库',
    MANUAL_ADJUSTMENT: '手工调整',
    STOCKTAKE: '盘点差异',
  };
  return labels[sourceType] || sourceType;
};

const formatQuantity = (value: number | null | undefined) => Number(value || 0).toFixed(2);
const formatPrice = (value: number | null | undefined) => Number(value || 0).toFixed(2);

const formatSignedQuantity = (value: number | null | undefined) => {
  const num = Number(value || 0);
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}`;
};

const formatDateTime = (value: string) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const formatThresholds = (item: InventoryOverviewItem) => {
  const parts = [
    item.safetyStock !== null && item.safetyStock !== undefined
      ? `安全 ${formatQuantity(item.safetyStock)} ${item.stockUnitLabel}`
      : '',
    item.reorderPoint !== null && item.reorderPoint !== undefined
      ? `补货 ${formatQuantity(item.reorderPoint)} ${item.stockUnitLabel}`
      : '',
    item.targetStock !== null && item.targetStock !== undefined
      ? `目标 ${formatQuantity(item.targetStock)} ${item.stockUnitLabel}`
      : '',
  ].filter(Boolean);

  return parts.join(' / ');
};

const formatPurchaseInfo = (item: InventoryOverviewItem) => {
  const parts = [
    item.procurementSkuName,
    item.purchaseChannel || '未设置渠道',
    item.productModel || '未设置规格',
  ].filter(Boolean);

  return parts.join(' · ');
};

const formatLedgerDetail = (item: InventoryLedgerItem) => {
  if (item.quantityBeforeG !== null && item.quantityAfterG !== null) {
    return `${formatQuantity(item.quantityBeforeG)} -> ${formatQuantity(item.quantityAfterG)} ${item.stockUnitLabel}`;
  }

  if (item.expectedQuantityG !== null && item.countedQuantityG !== null) {
    return `账面 ${formatQuantity(item.expectedQuantityG)} / 盘点 ${formatQuantity(item.countedQuantityG)} ${item.stockUnitLabel}`;
  }

  return '库存变动';
};
</script>

<style scoped lang="scss">
.inventory-page {
  min-height: 100vh;
  padding: 32rpx 24rpx 48rpx;
  background: linear-gradient(180deg, #f5fbfa 0%, #f7f7fb 100%);
}

.header {
  margin-bottom: 24rpx;
}

.title {
  display: block;
  font-size: 44rpx;
  font-weight: 700;
  color: #12312b;
}

.subtitle {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #5d726b;
  line-height: 1.6;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.summary-card {
  padding: 24rpx;
  border-radius: 24rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 28rpx rgba(18, 49, 43, 0.06);
}

.summary-card.danger {
  background: linear-gradient(135deg, #fff2f2 0%, #ffffff 100%);
}

.summary-card.warning {
  background: linear-gradient(135deg, #fff8ec 0%, #ffffff 100%);
}

.summary-value {
  display: block;
  font-size: 42rpx;
  font-weight: 700;
  color: #12312b;
}

.summary-label {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #6b7f78;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.action-btn {
  flex: 1 1 calc(50% - 8rpx);
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  border: none;
  background: #ffffff;
  color: #12312b;
  font-size: 28rpx;
  font-weight: 600;
}

.action-btn::after,
.mini-btn::after,
.inline-btn::after {
  border: none;
}

.action-btn.primary,
.mini-btn.primary,
.inline-btn.primary {
  background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%);
  color: #ffffff;
}

.tabs {
  display: flex;
  padding: 8rpx;
  margin-bottom: 20rpx;
  border-radius: 999rpx;
  background: rgba(15, 118, 110, 0.08);
}

.tab-item {
  flex: 1;
  padding: 18rpx 0;
  text-align: center;
  border-radius: 999rpx;
  color: #52706a;
  font-size: 26rpx;
}

.tab-item.active {
  background: #ffffff;
  color: #0f766e;
  font-weight: 700;
  box-shadow: 0 8rpx 20rpx rgba(15, 118, 110, 0.12);
}

.filter-card,
.state-card,
.inventory-card,
.ledger-card,
.stocktake-card {
  padding: 24rpx;
  border-radius: 24rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 28rpx rgba(18, 49, 43, 0.06);
}

.filter-card,
.state-card {
  margin-bottom: 20rpx;
}

.search-input {
  width: 100%;
  height: 80rpx;
  padding: 0 24rpx;
  border-radius: 18rpx;
  background: #f3f7f6;
  font-size: 26rpx;
  color: #12312b;
  box-sizing: border-box;
}

.filter-row {
  margin-top: 18rpx;
}

.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.filter-chip {
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  background: #edf3f2;
  color: #5d726b;
  font-size: 24rpx;
}

.filter-chip.active {
  background: #d9f5ef;
  color: #0f766e;
  font-weight: 700;
}

.warning-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #edf1f0;
}

.toggle-label,
.section-subtitle,
.state-hint,
.ingredient-meta,
.detail-label,
.detail-value,
.ledger-time,
.ledger-detail,
.ledger-note,
.stocktake-time,
.line-detail,
.filter-pill text,
.stocktake-metrics text {
  font-size: 24rpx;
  color: #60756f;
}

.state-title,
.section-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #12312b;
}

.state-hint,
.section-subtitle {
  display: block;
  margin-top: 10rpx;
  line-height: 1.6;
}

.inventory-list,
.ledger-list,
.stocktake-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.card-header,
.ledger-header,
.stocktake-header,
.stocktake-line-head,
.sub-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.ingredient-name,
.ledger-name,
.stocktake-title,
.line-name {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #12312b;
}

.status-badge,
.stocktake-status,
.ledger-tag {
  flex-shrink: 0;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
}

.status-badge.success {
  background: #dcfce7;
  color: #15803d;
}

.status-badge.warning {
  background: #fef3c7;
  color: #b45309;
}

.status-badge.danger,
.stocktake-status.applied {
  background: #fee2e2;
  color: #b91c1c;
}

.status-badge.neutral,
.stocktake-status.draft {
  background: #eef2ff;
  color: #4f46e5;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  margin: 22rpx 0 18rpx;
}

.metric-item {
  padding: 18rpx;
  border-radius: 18rpx;
  background: #f6faf9;
}

.metric-label {
  display: block;
  font-size: 22rpx;
  color: #6b7f78;
}

.metric-value {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: #12312b;
  line-height: 1.4;
}

.detail-line,
.ledger-line {
  margin-top: 12rpx;
}

.detail-label {
  display: block;
}

.detail-value {
  display: block;
  margin-top: 6rpx;
  line-height: 1.6;
}

.card-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.mini-btn,
.inline-btn {
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  border: none;
  background: #edf3f2;
  color: #12312b;
  font-size: 24rpx;
  font-weight: 600;
}

.mini-btn {
  flex: 1;
}

.filter-pill {
  margin-bottom: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  background: #ecfdf5;
}

.ledger-delta,
.line-delta {
  font-size: 28rpx;
  font-weight: 700;
}

.positive {
  color: #15803d;
}

.negative {
  color: #b91c1c;
}

.ledger-tag {
  display: inline-flex;
  margin-bottom: 10rpx;
  background: #eef6ff;
  color: #2563eb;
}

.ledger-note {
  margin-top: 10rpx;
  padding-top: 10rpx;
  border-top: 1rpx solid #edf1f0;
  line-height: 1.6;
}

.stocktake-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 18rpx;
  margin: 18rpx 0;
}

.stocktake-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20rpx;
}

.stocktake-line {
  padding: 18rpx 0;
  border-top: 1rpx solid #edf1f0;
}
</style>
