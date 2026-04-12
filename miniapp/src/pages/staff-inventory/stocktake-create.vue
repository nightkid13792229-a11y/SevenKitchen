<template>
  <view class="stocktake-create-page">
    <view class="hero">
      <text class="hero-title">移动端盘点录入</text>
      <text class="hero-subtitle">选择已盘点原料，录入实际库存，可先存草稿，也可直接入账</text>
    </view>

    <view class="section">
      <view class="section-header">
        <text class="section-title">盘点说明</text>
        <text class="section-subtitle">可选填写班次、区域或盘点备注，方便后续追溯</text>
      </view>

      <textarea
        v-model="note"
        class="note-input"
        maxlength="120"
        auto-height
        placeholder="例如：4月2日晚班海产盘点"
      />

      <view class="summary-pills">
        <view class="summary-pill">
          <text>可选原料 {{ ingredients.length }}</text>
        </view>
        <view class="summary-pill accent">
          <text>已选 {{ selectedLines.length }}</text>
        </view>
        <view class="summary-pill warning">
          <text>有差异 {{ varianceCount }}</text>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-header">
        <text class="section-title">选择原料</text>
        <text class="section-subtitle">默认会带入当前账面库存，你可以再改成实际盘点值</text>
      </view>

      <input
        v-model="keyword"
        class="search-input"
        placeholder="搜索原料名 / 渠道 / 型号"
        confirm-type="search"
        @confirm="loadIngredients"
      />

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

      <view v-if="loading" class="state-card">
        <text>正在加载原料...</text>
      </view>

      <view v-else-if="ingredients.length === 0" class="state-card">
        <text class="state-title">暂无可盘点原料</text>
        <text class="state-hint">可以调整筛选条件，或者稍后再试。</text>
      </view>

      <view v-else class="ingredient-list">
        <view
          v-for="ingredient in ingredients"
          :key="ingredient.id"
          class="ingredient-card"
          :class="getStatusClass(ingredient.stockStatus)"
        >
          <view class="ingredient-main">
            <view class="ingredient-copy">
              <view class="ingredient-top">
                <text class="ingredient-name">{{ ingredient.name }}</text>
                <text class="status-badge" :class="getStatusClass(ingredient.stockStatus)">
                  {{ getStockStatusLabel(ingredient.stockStatus) }}
                </text>
              </view>
              <text class="ingredient-meta">
                {{ getTypeLabel(ingredient.type) }} · 当前库存 {{ formatQuantity(ingredient.currentStock) }} {{ ingredient.stockUnitLabel }}
              </text>
              <text class="ingredient-meta">
                {{ ingredient.purchaseChannel || '未设置渠道' }}
                <text v-if="ingredient.productModel"> · {{ ingredient.productModel }}</text>
              </text>
              <text v-if="ingredient.procurementSkuName" class="ingredient-meta">
                默认采购 SKU · {{ ingredient.procurementSkuName }}
              </text>
            </view>
            <button
              class="add-btn"
              size="mini"
              :disabled="isSelected(ingredient.id)"
              @tap="addIngredient(ingredient)"
            >
              {{ isSelected(ingredient.id) ? '已选择' : '加入盘点' }}
            </button>
          </view>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-header">
        <text class="section-title">盘点明细</text>
        <text class="section-subtitle">请按库存单位录入实际盘点值</text>
      </view>

      <view v-if="selectedLines.length === 0" class="state-card soft">
        <text class="state-title">还没有选择盘点原料</text>
        <text class="state-hint">从上方原料列表中加入需要盘点的项目。</text>
      </view>

      <view v-else class="selected-list">
        <view
          v-for="line in selectedLines"
          :key="line.ingredientId"
          class="selected-card"
        >
          <view class="selected-header">
            <view>
              <text class="selected-name">{{ line.name }}</text>
              <text class="selected-meta">
                {{ getTypeLabel(line.type) }} · 账面 {{ formatQuantity(line.currentStock) }} {{ line.stockUnitLabel }}
              </text>
            </view>
            <view class="remove-btn" @tap="removeIngredient(line.ingredientId)">
              <text>删除</text>
            </view>
          </view>

          <view class="field-row">
            <view class="field">
              <text class="field-label">实际盘点值</text>
              <view class="input-wrapper">
                <input
                  v-model="line.countedQuantity"
                  type="digit"
                  class="field-input"
                  placeholder="请输入盘点值"
                />
                <text class="input-suffix">{{ line.stockUnitLabel }}</text>
              </view>
            </view>
          </view>

          <view class="selected-actions">
            <view class="ghost-btn" @tap="setCountedToCurrent(line)">
              <text>带入账面值</text>
            </view>
            <text class="delta-text" :class="getDeltaClass(line)">
              差异 {{ formatSignedQuantity(getLineDelta(line)) }} {{ line.stockUnitLabel }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <view class="bottom-bar">
      <view class="bottom-summary">
        <text class="summary-label">盘点项目</text>
        <text class="summary-value">{{ selectedLines.length }} 项</text>
      </view>
      <button
        class="submit-btn secondary"
        :disabled="submittingImmediately"
        :loading="submittingDraft"
        @tap="submit(false)"
      >
        存草稿
      </button>
      <button
        class="submit-btn primary"
        :disabled="submittingDraft"
        :loading="submittingImmediately"
        @tap="submit(true)"
      >
        立即入账
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  createInventoryStocktake,
  getInventoryOverview,
  type InventoryIngredientType,
  type InventoryOverviewItem,
  type InventoryStockStatus,
} from '@/api/inventory';

const PENDING_TAB_STORAGE_KEY = 'staff_inventory_pending_tab';

interface SelectedStocktakeLine {
  ingredientId: string;
  procurementSkuId?: string;
  name: string;
  type: InventoryIngredientType;
  stockUnitLabel: string;
  currentStock: number;
  countedQuantity: string;
}

const typeOptions: Array<{ label: string; value: InventoryIngredientType | '' }> = [
  { label: '全部', value: '' },
  { label: '食材', value: 'FOOD' },
  { label: '补剂', value: 'SUPPLEMENT' },
  { label: '包材', value: 'PACKAGING' },
];

const note = ref('');
const keyword = ref('');
const selectedType = ref<InventoryIngredientType | ''>('');
const ingredients = ref<InventoryOverviewItem[]>([]);
const selectedLines = ref<SelectedStocktakeLine[]>([]);
const loading = ref(false);
const submittingDraft = ref(false);
const submittingImmediately = ref(false);

const varianceCount = computed(() => {
  return selectedLines.value.filter((line) => Math.abs(getLineDelta(line)) > 0.0001).length;
});

onLoad(() => {
  loadIngredients();
});

onShow(() => {
  loadIngredients();
});

const loadIngredients = async () => {
  loading.value = true;

  try {
    const res = await getInventoryOverview({
      keyword: keyword.value.trim() || undefined,
      type: selectedType.value || undefined,
    });
    ingredients.value = res.data || [];
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加载原料失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const selectType = (value: InventoryIngredientType | '') => {
  selectedType.value = value;
  loadIngredients();
};

const formatQuantity = (value: number | null | undefined) => {
  return String(Number(Number(value || 0).toFixed(3)));
};

const formatSignedQuantity = (value: number | null | undefined) => {
  const num = Number(value || 0);
  return `${num >= 0 ? '+' : ''}${Number(num.toFixed(3))}`;
};

const parseQuantity = (value: string) => {
  return Number.parseFloat(String(value || '').trim());
};

const isSelected = (ingredientId: string) => {
  return selectedLines.value.some((line) => line.ingredientId === ingredientId);
};

const addIngredient = (ingredient: InventoryOverviewItem) => {
  if (isSelected(ingredient.id)) {
    return;
  }

  selectedLines.value.push({
    ingredientId: ingredient.id,
    procurementSkuId: ingredient.procurementSkuId || undefined,
    name: ingredient.name,
    type: ingredient.type,
    stockUnitLabel: ingredient.stockUnitLabel,
    currentStock: ingredient.currentStock,
    countedQuantity: formatQuantity(ingredient.currentStock),
  });
};

const removeIngredient = (ingredientId: string) => {
  selectedLines.value = selectedLines.value.filter((line) => line.ingredientId !== ingredientId);
};

const setCountedToCurrent = (line: SelectedStocktakeLine) => {
  line.countedQuantity = formatQuantity(line.currentStock);
};

const getLineDelta = (line: SelectedStocktakeLine) => {
  const counted = parseQuantity(line.countedQuantity);
  if (!Number.isFinite(counted)) {
    return 0;
  }

  return counted - line.currentStock;
};

const getDeltaClass = (line: SelectedStocktakeLine) => {
  const delta = getLineDelta(line);
  if (delta > 0.0001) {
    return 'positive';
  }
  if (delta < -0.0001) {
    return 'negative';
  }
  return 'neutral';
};

const getTypeLabel = (type: InventoryIngredientType) => {
  const labels: Record<InventoryIngredientType, string> = {
    FOOD: '食材',
    SUPPLEMENT: '补剂',
    PACKAGING: '包材',
  };
  return labels[type] || type;
};

const getStockStatusLabel = (status: InventoryStockStatus) => {
  const labels: Record<InventoryStockStatus, string> = {
    NO_POLICY: '未设阈值',
    SUFFICIENT: '库存充足',
    LOW_STOCK: '低库存',
    NEEDS_REPLENISHMENT: '需要补货',
  };
  return labels[status] || status;
};

const getStatusClass = (status: InventoryStockStatus) => {
  if (status === 'NEEDS_REPLENISHMENT') {
    return 'danger';
  }
  if (status === 'LOW_STOCK') {
    return 'warning';
  }
  if (status === 'SUFFICIENT') {
    return 'success';
  }
  return 'neutral';
};

const backToInventory = () => {
  try {
    uni.setStorageSync(PENDING_TAB_STORAGE_KEY, 'stocktakes');
  } catch (error) {
    console.warn('写入库存页跳转偏好失败', error);
  }

  const pages = getCurrentPages();
  if (pages.length > 1) {
    uni.navigateBack();
    return;
  }

  uni.redirectTo({ url: '/pages/staff-inventory/index' });
};

const submit = async (applyImmediately: boolean) => {
  if (selectedLines.value.length === 0) {
    uni.showToast({ title: '请先选择盘点原料', icon: 'none' });
    return;
  }

  const lines = selectedLines.value.map((line) => ({
    ingredientId: line.ingredientId,
    procurementSkuId: line.procurementSkuId,
    countedQuantityG: parseQuantity(line.countedQuantity),
  }));

  const invalidLine = lines.find(
    (line) => !Number.isFinite(line.countedQuantityG) || line.countedQuantityG < 0,
  );
  if (invalidLine) {
    uni.showToast({ title: '请填写有效的盘点值', icon: 'none' });
    return;
  }

  if (applyImmediately) {
    submittingImmediately.value = true;
  } else {
    submittingDraft.value = true;
  }

  try {
    await createInventoryStocktake({
      note: note.value.trim() || undefined,
      applyImmediately,
      lines,
    });

    uni.showToast({
      title: applyImmediately ? '盘点已入账' : '盘点草稿已保存',
      icon: 'success',
    });

    setTimeout(() => {
      backToInventory();
    }, 500);
  } catch (error: any) {
    uni.showToast({
      title: error?.message || (applyImmediately ? '盘点入账失败' : '盘点草稿保存失败'),
      icon: 'none',
    });
  } finally {
    submittingDraft.value = false;
    submittingImmediately.value = false;
  }
};
</script>

<style scoped lang="scss">
.stocktake-create-page {
  min-height: 100vh;
  padding-bottom: 240rpx;
  background: linear-gradient(180deg, #f6fbfa 0%, #f7f7fb 100%);
}

.hero {
  padding: 40rpx 32rpx 28rpx;
  background: linear-gradient(135deg, #d7f4ea 0%, #f5f5d8 100%);
}

.hero-title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #12312b;
}

.hero-subtitle {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(18, 49, 43, 0.72);
}

.section {
  margin: 24rpx 24rpx 0;
  padding: 28rpx;
  border-radius: 24rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 28rpx rgba(18, 49, 43, 0.06);
}

.section-header {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 20rpx;
}

.section-title,
.state-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #12312b;
}

.section-subtitle,
.state-hint,
.ingredient-meta,
.selected-meta,
.field-label,
.summary-label,
.summary-pill,
.delta-text {
  font-size: 24rpx;
  color: #60756f;
}

.section-subtitle,
.state-hint {
  line-height: 1.6;
}

.note-input,
.search-input,
.field-input {
  width: 100%;
  box-sizing: border-box;
  border-radius: 18rpx;
  background: #f4f7f6;
  color: #12312b;
  font-size: 26rpx;
}

.note-input {
  min-height: 140rpx;
  padding: 22rpx 24rpx;
}

.search-input {
  height: 80rpx;
  padding: 0 24rpx;
}

.summary-pills,
.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.summary-pills {
  margin-top: 18rpx;
}

.summary-pill,
.filter-chip,
.status-badge {
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
}

.summary-pill {
  background: #edf3f2;
}

.summary-pill.accent {
  background: #d9f5ef;
  color: #0f766e;
}

.summary-pill.warning {
  background: #fff4dd;
  color: #b45309;
}

.filter-group {
  margin-top: 18rpx;
}

.filter-chip {
  background: #edf3f2;
  color: #5d726b;
  font-size: 24rpx;
}

.filter-chip.active {
  background: #d9f5ef;
  color: #0f766e;
  font-weight: 700;
}

.state-card,
.ingredient-card,
.selected-card {
  padding: 24rpx;
  border-radius: 22rpx;
  background: #ffffff;
  box-shadow: 0 8rpx 24rpx rgba(18, 49, 43, 0.05);
}

.state-card.soft {
  background: #f8fbfa;
  box-shadow: none;
}

.ingredient-list,
.selected-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.ingredient-card.danger {
  background: linear-gradient(135deg, #fff4f4 0%, #ffffff 100%);
}

.ingredient-card.warning {
  background: linear-gradient(135deg, #fff9ef 0%, #ffffff 100%);
}

.ingredient-main,
.ingredient-top,
.selected-header,
.selected-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.ingredient-copy {
  flex: 1;
}

.ingredient-name,
.selected-name {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #12312b;
}

.ingredient-meta,
.selected-meta {
  display: block;
  margin-top: 10rpx;
  line-height: 1.6;
}

.status-badge {
  flex-shrink: 0;
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

.status-badge.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.status-badge.neutral {
  background: #eef2ff;
  color: #4f46e5;
}

.add-btn,
.submit-btn {
  border: none;
  border-radius: 999rpx;
}

.add-btn {
  flex-shrink: 0;
  min-width: 156rpx;
  height: 68rpx;
  line-height: 68rpx;
  background: #0f766e;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 600;
}

.add-btn[disabled] {
  background: #d7e4e1;
  color: #7f938d;
}

.field-row {
  margin-top: 18rpx;
}

.field-label {
  display: block;
  margin-bottom: 10rpx;
}

.input-wrapper {
  display: flex;
  align-items: center;
  padding-right: 24rpx;
  border-radius: 18rpx;
  background: #f4f7f6;
}

.field-input {
  flex: 1;
  height: 80rpx;
  padding: 0 24rpx;
  background: transparent;
}

.input-suffix {
  font-size: 24rpx;
  color: #60756f;
}

.remove-btn,
.ghost-btn {
  flex-shrink: 0;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: #edf3f2;
  font-size: 22rpx;
  color: #12312b;
}

.selected-actions {
  margin-top: 16rpx;
  align-items: center;
}

.delta-text.positive {
  color: #15803d;
}

.delta-text.negative {
  color: #b91c1c;
}

.delta-text.neutral {
  color: #60756f;
}

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -10rpx 30rpx rgba(18, 49, 43, 0.08);
}

.bottom-summary {
  min-width: 120rpx;
}

.summary-value {
  display: block;
  margin-top: 6rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: #12312b;
}

.submit-btn {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.submit-btn.secondary {
  background: #edf3f2;
  color: #12312b;
}

.submit-btn.primary {
  background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%);
  color: #ffffff;
}

.submit-btn[disabled] {
  opacity: 0.6;
}

.add-btn::after,
.submit-btn::after {
  border: none;
}
</style>
