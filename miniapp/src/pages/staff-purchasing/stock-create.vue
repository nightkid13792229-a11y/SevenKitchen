<template>
  <view class="stock-create-page">
    <view class="hero">
      <text class="hero-title">创建补货采购单</text>
      <text class="hero-subtitle">适合海产、冻品、补剂、包材等可提前备货的原料</text>
    </view>

    <view class="section">
      <text class="section-title">计划采购日期</text>
      <picker mode="date" :value="targetDate" @change="onTargetDateChange">
        <view class="picker-card">
          <text class="picker-value">{{ targetDate }}</text>
          <text class="picker-arrow">›</text>
        </view>
      </picker>
    </view>

    <view class="section">
      <view class="section-header">
        <text class="section-title">补货建议</text>
        <text class="section-subtitle">根据当前库存、补货点和目标库存自动计算</text>
      </view>

      <view class="suggestion-pills">
        <view class="suggestion-pill danger">
          <text>需补货 {{ replenishmentSuggestions.length }}</text>
        </view>
        <view class="suggestion-pill warning">
          <text>低库存 {{ lowStockSuggestions.length }}</text>
        </view>
        <view class="suggestion-pill neutral">
          <text>未设阈值 {{ noPolicyIngredients.length }}</text>
        </view>
      </view>

      <button
        class="suggestion-btn"
        :disabled="replenishmentSuggestions.length === 0"
        @tap="addAllSuggestions"
      >
        一键载入补货建议
      </button>

      <text class="suggestion-hint">
        会把“需要补货”的原料按建议采购量加入下方明细，你仍然可以继续改数量、渠道和型号。
      </text>
    </view>

    <view class="section">
      <view class="section-header">
        <text class="section-title">选择原料</text>
        <text class="section-subtitle">补货策略和库存预警排在前面，日采原料也可以临时加入补货单</text>
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

      <view v-if="loading" class="loading-state">
        <text>正在加载原料...</text>
      </view>

      <view v-else-if="ingredients.length === 0" class="empty-state">
        <text class="empty-text">暂无可选原料</text>
      </view>

      <view v-else class="ingredient-list">
        <view
          v-for="ingredient in ingredients"
          :key="ingredient.id"
          class="ingredient-card"
          :class="getStockStatusCardClass(ingredient.stockStatus)"
        >
          <view class="ingredient-main">
            <view class="ingredient-info">
              <view class="ingredient-top">
                <text class="ingredient-name">{{ ingredient.name }}</text>
                <text class="strategy-badge" :class="getStrategyClass(ingredient.procurementStrategy)">
                  {{ getStrategyLabel(ingredient.procurementStrategy) }}
                </text>
                <text class="stock-status-badge" :class="getStockStatusClass(ingredient.stockStatus)">
                  {{ getStockStatusLabel(ingredient.stockStatus) }}
                </text>
              </view>
              <view class="ingredient-meta">
                <text class="meta-tag">{{ getTypeLabel(ingredient.type) }}</text>
                <text class="meta-tag">采购单位 {{ ingredient.purchaseUnit }}</text>
                <text class="meta-tag">单价 ¥{{ formatPrice(getUnitPrice(ingredient)) }}</text>
              </view>
              <text class="ingredient-detail">
                当前库存 {{ formatQuantity(ingredient.currentStock) }} {{ ingredient.stockUnitLabel }}
                <text v-if="ingredient.reorderPoint !== null && ingredient.reorderPoint !== undefined">
                  · 补货点 {{ formatQuantity(ingredient.reorderPoint) }} {{ ingredient.stockUnitLabel }}
                </text>
                <text v-if="ingredient.targetStock !== null && ingredient.targetStock !== undefined">
                  · 目标 {{ formatQuantity(ingredient.targetStock) }} {{ ingredient.stockUnitLabel }}
                </text>
              </text>
              <text v-if="ingredient.purchaseChannel || ingredient.productModel" class="ingredient-detail">
                {{ ingredient.purchaseChannel || '未设置渠道' }}
                <text v-if="ingredient.productModel"> · {{ ingredient.productModel }}</text>
              </text>
              <text
                v-if="ingredient.suggestedPurchaseQuantity > 0"
                class="ingredient-suggestion"
              >
                建议补货 {{ formatQuantity(ingredient.suggestedPurchaseQuantity) }} {{ ingredient.purchaseUnit }}
                · 约 ¥{{ formatPrice(ingredient.suggestedEstimatedCost) }}
                <text v-if="ingredient.suggestedProductName"> · 推荐 {{ ingredient.suggestedProductName }}</text>
              </text>
            </view>
            <button
              class="add-btn"
              size="mini"
              :disabled="isSelected(ingredient.id)"
              @tap="addIngredient(ingredient)"
            >
              {{ isSelected(ingredient.id) ? '已添加' : ingredient.suggestedPurchaseQuantity > 0 ? '按建议添加' : '添加' }}
            </button>
          </view>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-header">
        <text class="section-title">补货明细</text>
        <text class="section-subtitle">按采购单位填写计划采购数量</text>
      </view>

      <view v-if="selectedItems.length === 0" class="empty-state soft">
        <text class="empty-text">还没有添加原料</text>
      </view>

      <view v-else class="selected-list">
        <view
          v-for="item in selectedItems"
          :key="item.ingredientId"
          class="selected-card"
        >
          <view class="selected-header">
            <view class="selected-copy">
              <text class="selected-name">{{ item.name }}</text>
              <text class="selected-meta">
                {{ getTypeLabel(item.type) }} · {{ item.purchaseUnit }} · 参考单价 ¥{{ formatPrice(item.unitPrice) }}
              </text>
            </view>
            <view class="remove-btn" @tap="removeIngredient(item.ingredientId)">
              <text>删除</text>
            </view>
          </view>

          <view class="field-row">
            <view class="field">
              <text class="field-label">计划数量</text>
              <view class="input-wrapper">
                <input
                  v-model="item.plannedQuantity"
                  type="digit"
                  class="field-input"
                  placeholder="请输入数量"
                />
                <text class="input-suffix">{{ item.purchaseUnit }}</text>
              </view>
            </view>
          </view>

          <view class="field-row">
            <view class="field">
              <text class="field-label">采购渠道</text>
              <input
                v-model="item.purchaseChannel"
                class="field-input"
                placeholder="可选，默认原料渠道"
              />
            </view>
            <view class="field">
              <text class="field-label">产品型号</text>
              <input
                v-model="item.productModel"
                class="field-input"
                placeholder="可选，默认原料型号"
              />
            </view>
          </view>

          <view class="selected-footer">
            <text>预估金额：¥{{ formatPrice(getSelectedItemEstimatedCost(item)) }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="bottom-bar">
      <view class="bottom-summary">
        <text class="summary-label">预估总金额</text>
        <text class="summary-amount">¥{{ formatPrice(totalEstimatedCost) }}</text>
      </view>
      <button class="submit-btn" :loading="submitting" @tap="submit">
        {{ submitting ? '创建中...' : '创建补货采购单' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  createStockPurchaseList,
  getStockPurchaseIngredients,
  type StockPurchaseIngredient,
} from '@/api/purchasing';

interface SelectedStockItem {
  ingredientId: string;
  name: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  procurementStrategy: 'DAILY_PURCHASE' | 'STOCK_REPLENISHMENT' | 'HYBRID';
  stockStatus: 'NO_POLICY' | 'SUFFICIENT' | 'LOW_STOCK' | 'NEEDS_REPLENISHMENT';
  purchaseUnit: string;
  unitPrice: number;
  purchaseChannel: string;
  productModel: string;
  plannedQuantity: string;
}

const typeOptions = [
  { label: '全部', value: '' },
  { label: '食材', value: 'FOOD' },
  { label: '补剂', value: 'SUPPLEMENT' },
  { label: '包材', value: 'PACKAGING' },
];

const ingredients = ref<StockPurchaseIngredient[]>([]);
const selectedItems = ref<SelectedStockItem[]>([]);
const loading = ref(false);
const submitting = ref(false);
const keyword = ref('');
const selectedType = ref('');
const targetDate = ref('');

const getTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const totalEstimatedCost = computed(() => {
  return selectedItems.value.reduce((sum, item) => {
    return sum + getSelectedItemEstimatedCost(item);
  }, 0);
});

const replenishmentSuggestions = computed(() => {
  return ingredients.value.filter(
    (item) =>
      item.stockStatus === 'NEEDS_REPLENISHMENT' &&
      item.suggestedPurchaseQuantity > 0,
  );
});

const lowStockSuggestions = computed(() => {
  return ingredients.value.filter((item) => item.stockStatus === 'LOW_STOCK');
});

const noPolicyIngredients = computed(() => {
  return ingredients.value.filter((item) => item.stockStatus === 'NO_POLICY');
});

onLoad(() => {
  targetDate.value = getTodayString();
  loadIngredients();
});

const getUnitPrice = (ingredient: StockPurchaseIngredient) => {
  if (
    ingredient.effectivePricePerPurchaseUnit !== null &&
    ingredient.effectivePricePerPurchaseUnit !== undefined
  ) {
    return ingredient.effectivePricePerPurchaseUnit;
  }

  if (
    ingredient.currentPricePerPurchaseUnit !== null &&
    ingredient.currentPricePerPurchaseUnit !== undefined
  ) {
    return ingredient.currentPricePerPurchaseUnit;
  }

  return 0;
};

const formatPrice = (value: number) => {
  return Number(value || 0).toFixed(2);
};

const formatQuantity = (value: number) => {
  return String(Number(Number(value || 0).toFixed(3)));
};

const getTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    FOOD: '食材',
    SUPPLEMENT: '补剂',
    PACKAGING: '包材',
  };
  return map[type] || type;
};

const getStrategyLabel = (strategy: string) => {
  const map: Record<string, string> = {
    DAILY_PURCHASE: '日采',
    STOCK_REPLENISHMENT: '补货',
    HYBRID: '混合',
  };
  return map[strategy] || '未分类';
};

const getStrategyClass = (strategy: string) => {
  return {
    stock: strategy === 'STOCK_REPLENISHMENT',
    hybrid: strategy === 'HYBRID',
    daily: strategy === 'DAILY_PURCHASE',
  };
};

const getStockStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    NEEDS_REPLENISHMENT: '需要补货',
    LOW_STOCK: '低库存',
    SUFFICIENT: '库存充足',
    NO_POLICY: '未设阈值',
  };
  return map[status] || '未分类';
};

const getStockStatusClass = (status: string) => {
  return {
    danger: status === 'NEEDS_REPLENISHMENT',
    warning: status === 'LOW_STOCK',
    success: status === 'SUFFICIENT',
    muted: status === 'NO_POLICY',
  };
};

const getStockStatusCardClass = (status: string) => {
  return {
    'is-danger': status === 'NEEDS_REPLENISHMENT',
    'is-warning': status === 'LOW_STOCK',
  };
};

const isSelected = (ingredientId: string) => {
  return selectedItems.value.some((item) => item.ingredientId === ingredientId);
};

const loadIngredients = async () => {
  loading.value = true;

  try {
    const res: any = await getStockPurchaseIngredients({
      keyword: keyword.value.trim() || undefined,
      type: (selectedType.value as any) || undefined,
    });

    if (res.code === 0) {
      ingredients.value = res.data || [];
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    uni.showToast({ title: error.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const selectType = (value: string) => {
  selectedType.value = value;
  loadIngredients();
};

const toPlannedQuantityInput = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }
  return formatQuantity(value);
};

const addIngredient = (ingredient: StockPurchaseIngredient) => {
  const existing = selectedItems.value.find(
    (item) => item.ingredientId === ingredient.id,
  );
  const suggestedQuantity = toPlannedQuantityInput(
    ingredient.suggestedPurchaseQuantity,
  );

  if (existing) {
    if (!existing.plannedQuantity && suggestedQuantity) {
      existing.plannedQuantity = suggestedQuantity;
    }
    return;
  }

  selectedItems.value.push({
    ingredientId: ingredient.id,
    name: ingredient.name,
    type: ingredient.type,
    procurementStrategy: ingredient.procurementStrategy,
    stockStatus: ingredient.stockStatus,
    purchaseUnit: ingredient.purchaseUnit,
    unitPrice: getUnitPrice(ingredient),
    purchaseChannel: ingredient.purchaseChannel || '',
    productModel: ingredient.productModel || '',
    plannedQuantity: suggestedQuantity,
  });
};

const addAllSuggestions = () => {
  if (replenishmentSuggestions.value.length === 0) {
    uni.showToast({ title: '当前没有需要补货的原料', icon: 'none' });
    return;
  }

  replenishmentSuggestions.value.forEach((ingredient) => addIngredient(ingredient));
  uni.showToast({
    title: `已载入 ${replenishmentSuggestions.value.length} 条补货建议`,
    icon: 'success',
  });
};

const removeIngredient = (ingredientId: string) => {
  selectedItems.value = selectedItems.value.filter(
    (item) => item.ingredientId !== ingredientId,
  );
};

const getSelectedItemEstimatedCost = (item: SelectedStockItem) => {
  const quantity = parseFloat(item.plannedQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }
  return quantity * item.unitPrice;
};

const onTargetDateChange = (event: any) => {
  targetDate.value = event.detail.value;
};

const submit = async () => {
  if (selectedItems.value.length === 0) {
    uni.showToast({ title: '请先添加原料', icon: 'none' });
    return;
  }

  const payloadItems = selectedItems.value.map((item) => {
    const plannedQuantity = parseFloat(item.plannedQuantity);
    return {
      ingredientId: item.ingredientId,
      plannedQuantity,
      purchaseChannel: item.purchaseChannel || undefined,
      productModel: item.productModel || undefined,
    };
  });

  const invalidItem = payloadItems.find(
    (item) => !Number.isFinite(item.plannedQuantity) || item.plannedQuantity <= 0,
  );
  if (invalidItem) {
    uni.showToast({ title: '请填写有效的计划采购数量', icon: 'none' });
    return;
  }

  submitting.value = true;

  try {
    const res: any = await createStockPurchaseList({
      targetDate: targetDate.value,
      items: payloadItems,
    });

    if (res.code === 0) {
      uni.showToast({ title: '创建成功', icon: 'success' });
      setTimeout(() => {
        uni.redirectTo({
          url: `/pages/staff-purchasing/detail?id=${res.data.id}`,
        });
      }, 500);
      return;
    }

    uni.showToast({ title: res.message || '创建失败', icon: 'none' });
  } catch (error: any) {
    uni.showToast({ title: error.message || '创建失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped lang="scss">
.stock-create-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 220rpx;
}

.hero {
  padding: 40rpx 32rpx 28rpx;
  background: linear-gradient(135deg, #c7f0d8 0%, #f2f7c9 100%);
}

.hero-title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #1f2937;
}

.hero-subtitle {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: rgba(31, 41, 55, 0.72);
}

.section {
  margin: 24rpx 24rpx 0;
  padding: 28rpx;
  background: #fff;
  border-radius: 20rpx;
}

.section-header {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 20rpx;
}

.section-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #111827;
}

.section-subtitle {
  font-size: 24rpx;
  color: #6b7280;
}

.suggestion-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.suggestion-pill {
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
}

.suggestion-pill.danger {
  background: #fee2e2;
  color: #991b1b;
}

.suggestion-pill.warning {
  background: #fef3c7;
  color: #92400e;
}

.suggestion-pill.neutral {
  background: #e2e8f0;
  color: #475569;
}

.suggestion-btn {
  margin-top: 20rpx;
  height: 78rpx;
  line-height: 78rpx;
  border-radius: 999rpx;
  background: #0f766e;
  color: #fff;
  font-size: 28rpx;
}

.suggestion-btn[disabled] {
  background: #cbd5e1;
  color: #fff;
}

.suggestion-hint {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #64748b;
  line-height: 1.6;
}

.picker-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  background: #f8fafc;
  border-radius: 16rpx;
}

.picker-value {
  font-size: 28rpx;
  color: #111827;
}

.picker-arrow {
  font-size: 32rpx;
  color: #94a3b8;
}

.search-input,
.field-input {
  width: 100%;
  min-height: 84rpx;
  padding: 0 24rpx;
  border-radius: 16rpx;
  background: #f8fafc;
  font-size: 28rpx;
  box-sizing: border-box;
}

.filter-group {
  display: flex;
  gap: 16rpx;
  margin: 20rpx 0 12rpx;
  flex-wrap: wrap;
}

.filter-chip {
  padding: 14rpx 24rpx;
  border-radius: 999rpx;
  background: #eef2f7;
  color: #475569;
  font-size: 24rpx;
}

.filter-chip.active {
  background: #d9f99d;
  color: #365314;
}

.ingredient-list,
.selected-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.ingredient-card,
.selected-card {
  padding: 24rpx;
  border-radius: 18rpx;
  background: #f8fafc;
}

.ingredient-card.is-danger {
  background: #fff7f7;
  box-shadow: inset 0 0 0 2rpx #fecaca;
}

.ingredient-card.is-warning {
  background: #fffbeb;
  box-shadow: inset 0 0 0 2rpx #fde68a;
}

.ingredient-main,
.selected-header {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
}

.ingredient-info,
.selected-copy {
  flex: 1;
}

.ingredient-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
}

.ingredient-name,
.selected-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #111827;
}

.strategy-badge {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
}

.strategy-badge.stock {
  background: #dcfce7;
  color: #166534;
}

.strategy-badge.hybrid {
  background: #fef3c7;
  color: #92400e;
}

.strategy-badge.daily {
  background: #e5e7eb;
  color: #4b5563;
}

.stock-status-badge {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
}

.stock-status-badge.danger {
  background: #fee2e2;
  color: #991b1b;
}

.stock-status-badge.warning {
  background: #fef3c7;
  color: #92400e;
}

.stock-status-badge.success {
  background: #dcfce7;
  color: #166534;
}

.stock-status-badge.muted {
  background: #e2e8f0;
  color: #475569;
}

.ingredient-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 12rpx;
}

.meta-tag,
.selected-meta {
  font-size: 22rpx;
  color: #64748b;
}

.ingredient-detail {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #475569;
}

.ingredient-suggestion {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #166534;
}

.add-btn {
  min-width: 120rpx;
  height: 68rpx;
  line-height: 68rpx;
  border-radius: 999rpx;
  background: #1f8f55;
  color: #fff;
  font-size: 24rpx;
}

.add-btn[disabled] {
  background: #cbd5e1;
  color: #fff;
}

.field-row {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.field {
  flex: 1;
}

.field-label {
  display: block;
  margin-bottom: 10rpx;
  font-size: 24rpx;
  color: #475569;
}

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.input-suffix {
  font-size: 26rpx;
  color: #475569;
}

.remove-btn {
  padding: 8rpx 0 8rpx 24rpx;
  font-size: 24rpx;
  color: #dc2626;
}

.selected-footer {
  margin-top: 18rpx;
  font-size: 24rpx;
  color: #166534;
}

.loading-state,
.empty-state {
  padding: 48rpx 24rpx;
  text-align: center;
  color: #64748b;
}

.empty-state.soft {
  padding: 36rpx 16rpx;
}

.empty-text {
  font-size: 26rpx;
}

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 24rpx 28rpx calc(24rpx + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -8rpx 24rpx rgba(15, 23, 42, 0.08);
}

.bottom-summary {
  display: flex;
  flex-direction: column;
}

.summary-label {
  font-size: 22rpx;
  color: #64748b;
}

.summary-amount {
  margin-top: 6rpx;
  font-size: 36rpx;
  font-weight: 700;
  color: #111827;
}

.submit-btn {
  flex-shrink: 0;
  min-width: 280rpx;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  background: #111827;
  color: #fff;
  font-size: 28rpx;
}
</style>
