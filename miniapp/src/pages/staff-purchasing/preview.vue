<template>
  <view class="preview-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">日采需求预览</text>
    </view>

    <!-- 日期选择器 -->
    <view class="date-selector-section">
      <view class="form-item">
        <text class="label">开始日期 *</text>
        <picker
          mode="date"
          :value="formData.startDate"
          @change="onStartDateChange"
        >
          <view class="picker-value">
            <text v-if="formData.startDate" class="value">{{ formData.startDate }}</text>
            <text v-else class="placeholder">请选择开始日期</text>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <text class="label">结束日期（可选）</text>
        <picker
          mode="date"
          :value="formData.endDate"
          @change="onEndDateChange"
        >
          <view class="picker-value">
            <text v-if="formData.endDate" class="value">{{ formData.endDate }}</text>
            <text v-else class="placeholder">请选择结束日期</text>
          </view>
        </picker>
      </view>

      <!-- 快速选择日期范围 -->
      <view class="quick-select-section">
        <text class="section-label">快速选择：</text>
        <view class="quick-select-buttons">
          <button
            class="quick-btn"
            :class="{ active: isQuickSelectActive(3) }"
            @tap="selectFutureDays(3)"
          >
            未来3天
          </button>
          <button
            class="quick-btn"
            :class="{ active: isQuickSelectActive(7) }"
            @tap="selectFutureDays(7)"
          >
            未来7天
          </button>
        </view>
      </view>

      <view class="action-buttons">
        <button class="preview-btn" @tap="handlePreview" :loading="loading">
          {{ loading ? '预览中...' : '预览日采需求' }}
        </button>
      </view>
    </view>

    <!-- 预览结果 -->
    <view v-if="previewResult" class="preview-result">
      <!-- 统计信息 -->
      <view class="stats-card">
        <view class="stat-item">
          <text class="stat-value">{{ previewResult.itemCount }}</text>
          <text class="stat-label">原料种类</text>
        </view>
        <view class="divider"></view>
        <view class="stat-item">
          <text class="stat-value">{{ previewResult.affectedOrders.length }}</text>
          <text class="stat-label">关联订单</text>
        </view>
        <view class="divider"></view>
        <view class="stat-item">
          <text class="stat-value">{{ formatAmount(previewResult.totalEstimatedCost || 0) }}</text>
          <text class="stat-label">预估金额</text>
        </view>
      </view>

      <!-- 日期范围 -->
      <view class="date-range-section">
        <text class="section-title">📅 制作日期范围</text>
        <view class="date-range">
          <text class="date">{{ formatDate(previewResult.targetDateRange.start) }}</text>
          <text v-if="previewResult.targetDateRange.end" class="separator">至</text>
          <text v-if="previewResult.targetDateRange.end" class="date">{{ formatDate(previewResult.targetDateRange.end) }}</text>
        </view>
      </view>

      <!-- 原料汇总 -->
      <view class="ingredients-section">
        <text class="section-title">📊 原料汇总</text>
        <text v-if="hasPreparationHints" class="section-hint">
          带有制备方法的原料可据此安排提前预处理，避免正式生产时临时备料。
        </text>

        <!-- 按类型分组显示 -->
        <view v-if="previewResult.items.length > 0" class="grouped-ingredients">
          <view v-for="group in groupedIngredients" :key="group.type" class="ingredient-group">
            <!-- 类型标题 -->
            <view class="group-header">
              <text class="group-title">{{ getTypeLabel(group.type) }} ({{ group.items.length }})</text>
            </view>

            <!-- 该类型的原料列表 -->
            <view class="ingredients-list">
              <view
                v-for="(item, index) in group.items"
                :key="index"
                class="ingredient-item"
                :class="{ 'fully-covered': item.resolvedUsesInventory && item.resolvedPurchaseShortageQuantity <= 0 }"
              >
                <view class="ingredient-main">
                  <view class="ingredient-info">
                    <text class="ingredient-name">{{ item.ingredientName }}</text>
                  <view v-if="item.resolvedProcurementSkuName || item.resolvedSuggestedProductName" class="ingredient-sku-lines">
                    <text v-if="item.resolvedProcurementSkuName" class="procurement-sku">
                      {{ item.resolvedProcurementSkuName }}
                    </text>
                    <text
                      v-if="item.resolvedSuggestedProductName && item.resolvedSuggestedProductName !== item.resolvedProcurementSkuName"
                      class="suggested-sku"
                    >
                      推荐参考：{{ item.resolvedSuggestedProductName }}
                    </text>
                  </view>
                  <view class="ingredient-meta">
                    <text v-if="item.resolvedPurchaseChannel" class="channel">{{ item.resolvedPurchaseChannel }}</text>
                    <text v-if="item.resolvedProductModel" class="model">{{ item.resolvedProductModel }}</text>
                  </view>
                  </view>
                  <view class="ingredient-quantity">
                    <text class="quantity">{{ formatQuantity(item) }}</text>
                    <text class="unit">{{ getDisplayUnit(item) }}</text>
                  </view>
                </view>

                <view v-if="item.resolvedUsesInventory" class="stock-offset-lines">
                  <text>订单需求：{{ formatResolvedQuantity(item.resolvedGrossQuantityNeeded, item) }}</text>
                  <text>可用库存：{{ formatResolvedQuantity(item.resolvedAvailableQuantity, item) }}</text>
                  <text>库存抵扣：{{ formatResolvedQuantity(item.resolvedStockDeductedQuantity, item) }}</text>
                  <text>仍需采购：{{ formatResolvedQuantity(item.resolvedPurchaseShortageQuantity, item) }}</text>
                </view>

                <view
                  v-if="item.preparationMethods && item.preparationMethods.length > 0"
                  class="preparation-section"
                >
                  <text class="preparation-label">{{ getPreparationLabel(item) }}</text>
                  <view class="preparation-tags">
                    <text
                      v-for="method in item.preparationMethods"
                      :key="`${item.ingredientId}-${method}`"
                      class="preparation-tag"
                    >
                      {{ method }}
                    </text>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view v-else class="empty-state">
          <text class="empty-text">暂无采购需求</text>
        </view>
      </view>

      <!-- 关联订单列表 -->
      <view v-if="previewResult.affectedOrders.length > 0" class="orders-section">
        <text class="section-title">📦 关联订单 ({{ previewResult.affectedOrders.length }})</text>

        <!-- 列标题 -->
        <view class="orders-header">
          <text class="header-id">订单编号</text>
          <text class="header-date">制作日期</text>
        </view>

        <view class="orders-list">
          <view
            v-for="(order, index) in previewResult.affectedOrders"
            :key="index"
            class="order-item"
          >
            <text class="order-id">{{ formatOrderId(order.orderId) }}</text>
            <text class="order-date">{{ formatDate(order.targetProductionDate) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else-if="!loading" class="empty-state">
      <text class="empty-icon">📋</text>
      <text class="empty-text">请选择日期并预览日采需求</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { previewPurchaseList, resolvePurchaseItemDisplay } from './api/purchasing';

// 表单数据
const formData = ref({
  startDate: '',
  endDate: '',
});

// 预览结果
const previewResult = ref<any>(null);
const loading = ref(false);

// 按类型分组的原料（计算属性）
const groupedIngredients = computed(() => {
  if (!previewResult.value || !previewResult.value.items) {
    return [];
  }

  // 定义类型顺序
  const typeOrder = ['FOOD', 'SUPPLEMENT', 'PACKAGING'];

  // 按类型分组
  const groups = new Map<string, any[]>();
  previewResult.value.items.forEach((item: any) => {
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

const hasPreparationHints = computed(() => {
  if (!previewResult.value?.items?.length) {
    return false;
  }

  return previewResult.value.items.some(
    (item: any) =>
      Array.isArray(item.preparationMethods) && item.preparationMethods.length > 0,
  );
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

// 开始日期变更
const onStartDateChange = (e: any) => {
  formData.value.startDate = e.detail.value;
};

// 结束日期变更
const onEndDateChange = (e: any) => {
  formData.value.endDate = e.detail.value;
};

// 快速选择未来日期范围
const selectFutureDays = (days: number) => {
  const today = new Date();
  const startDate = new Date(today);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + days - 1);

  // 格式化为 YYYY-MM-DD
  const formatDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  formData.value.startDate = formatDateString(startDate);
  formData.value.endDate = formatDateString(endDate);
};

// 检查是否是快速选择激活状态
const isQuickSelectActive = (days: number) => {
  if (!formData.value.startDate || !formData.value.endDate) {
    return false;
  }

  const today = new Date();
  const expectedStart = new Date(today);
  const expectedEnd = new Date(today);
  expectedEnd.setDate(today.getDate() + days - 1);

  const formatDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    formData.value.startDate === formatDateString(expectedStart) &&
    formData.value.endDate === formatDateString(expectedEnd)
  );
};

// 预览采购需求
const handlePreview = async () => {
  // 验证必填项
  if (!formData.value.startDate) {
    uni.showToast({ title: '请选择开始日期', icon: 'none' });
    return;
  }

  loading.value = true;
  previewResult.value = null;

  try {
    const params: any = {
      startDate: formData.value.startDate,
    };

    if (formData.value.endDate) {
      params.endDate = formData.value.endDate;
    }

    const res: any = await previewPurchaseList(params);

    if (res.code === 0) {
      previewResult.value = {
        ...res.data,
        items: (res.data?.items || []).map((item: any) =>
          resolvePurchaseItemDisplay(item)
        ),
      };
      uni.showToast({ title: '预览成功', icon: 'success' });
    } else {
      uni.showToast({ title: res.message || '预览失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('预览采购需求失败', error);
    uni.showToast({ title: error.message || '预览失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

onLoad((options: Record<string, string>) => {
  if (!options?.startDate) {
    return;
  }

  formData.value.startDate = options.startDate;
  formData.value.endDate = options.endDate || '';
  handlePreview();
});

// 格式化订单ID（简化显示）
const formatOrderId = (orderId: string) => {
  if (orderId.length > 12) {
    return orderId.substring(0, 8) + '...';
  }
  return orderId;
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

const formatAmount = (amount: number) => {
  const value = Number(amount);
  return Number.isFinite(value) ? `¥${value.toFixed(2)}` : '¥0.00';
};

const formatBaseQuantity = (value: number) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  const rounded = Number(numeric.toFixed(1));
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
};

// 格式化原料数量
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
  const ingredientBaseUnit = String(item.ingredientBaseUnit || '').toUpperCase();
  const density = Number(item.foodDensityGPerMl || 0);

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

const getPreparationLabel = (item: any) => {
  return item.type === 'SUPPLEMENT' ? '添加时机' : '制备方法';
};
</script>

<style scoped lang="scss">
.preview-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 32rpx;
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

// 日期选择器区域
.date-selector-section {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  border-radius: 16rpx;
  padding: 32rpx;

  .form-item {
    margin-bottom: 24rpx;

    &:last-child {
      margin-bottom: 0;
    }

    .label {
      display: block;
      font-size: 28rpx;
      font-weight: 500;
      color: #333;
      margin-bottom: 12rpx;
    }

    .picker-value {
      height: 80rpx;
      padding: 0 24rpx;
      background-color: #f5f5f5;
      border-radius: 8rpx;
      display: flex;
      align-items: center;

      .value {
        font-size: 28rpx;
        color: #333;
      }

      .placeholder {
        font-size: 28rpx;
        color: #999;
      }
    }
  }

  .quick-select-section {
    margin-top: 24rpx;
    padding-top: 24rpx;
    border-top: 1rpx solid #f0f0f0;
    display: flex;
    align-items: center;
    gap: 16rpx;

    .section-label {
      font-size: 26rpx;
      color: #666;
      white-space: nowrap;
    }

    .quick-select-buttons {
      display: flex;
      gap: 12rpx;
      flex: 1;
    }

    .quick-btn {
      flex: 1;
      height: 64rpx;
      background: #f5f5f5;
      color: #666;
      border-radius: 8rpx;
      font-size: 26rpx;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s;

      &.active {
        background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
        color: #fff;
        font-weight: 500;
      }

      &:active {
        opacity: 0.8;
      }
    }
  }

  .action-buttons {
    margin-top: 32rpx;

    .preview-btn {
      width: 100%;
      height: 88rpx;
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      color: #fff;
      border-radius: 16rpx;
      font-size: 32rpx;
      font-weight: bold;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;

      &:active {
        opacity: 0.8;
      }
    }
  }
}

// 预览结果区域
.preview-result {
  padding: 0 32rpx;
}

// 统计卡片
.stats-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  display: flex;
  justify-content: space-around;
  align-items: center;

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;

    .stat-value {
      font-size: 48rpx;
      font-weight: bold;
      color: #1890ff;
    }

    .stat-label {
      font-size: 24rpx;
      color: #666;
    }
  }

  .divider {
    width: 1rpx;
    height: 60rpx;
    background-color: #f0f0f0;
  }
}

// 各个section
.date-range-section,
.ingredients-section,
.orders-section {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;

  .section-title {
    display: block;
    font-size: 30rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 24rpx;
  }

  .section-hint {
    display: block;
    margin: -8rpx 0 24rpx;
    font-size: 24rpx;
    color: #8c6d1f;
    line-height: 1.6;
  }
}

// 原料分组
.grouped-ingredients {
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

  .ingredients-list {
    padding: 16rpx;
  }
}

// 日期范围
.date-range {
  display: flex;
  align-items: center;
  gap: 12rpx;

  .date {
    font-size: 28rpx;
    color: #1890ff;
    font-weight: 500;
  }

  .separator {
    font-size: 24rpx;
    color: #666;
  }
}

// 原料列表
.ingredients-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.ingredient-item {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 20rpx 16rpx;
  background-color: #fff;
  border-radius: 8rpx;
  border: 1rpx solid #f0f0f0;

  &.fully-covered {
    border-color: #6bbf8f;
    background-color: #f2fbf6;
  }

  .ingredient-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16rpx;
  }

  .ingredient-info {
    flex: 1;
    min-width: 0;

    .ingredient-name {
      font-size: 28rpx;
      font-weight: 500;
      color: #333;
      margin-bottom: 8rpx;
      display: block;
    }

    .ingredient-sku-lines {
      display: flex;
      flex-direction: column;
      gap: 4rpx;
      margin-bottom: 8rpx;

      .procurement-sku {
        font-size: 22rpx;
        color: #1890ff;
        font-weight: 500;
      }

      .suggested-sku {
        font-size: 22rpx;
        color: #8c8c8c;
      }
    }

    .ingredient-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8rpx;

      .channel,
      .model {
        font-size: 22rpx;
        color: #666;
        padding: 4rpx 12rpx;
        background-color: #f0f0f0;
        border-radius: 4rpx;
      }
    }
  }

  .ingredient-quantity {
    display: flex;
    align-items: baseline;
    gap: 4rpx;
    flex-shrink: 0;

    .quantity {
      font-size: 32rpx;
      font-weight: bold;
      color: #1890ff;
    }

    .unit {
      font-size: 22rpx;
      color: #999;
    }
  }

  .stock-offset-lines {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    padding: 12rpx 16rpx;
    background-color: rgba(107, 191, 143, 0.1);
    border-radius: 6rpx;
    color: #4f735b;
    font-size: 24rpx;
    line-height: 1.45;
  }

  .preparation-section {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    padding-top: 16rpx;
    border-top: 1rpx dashed #f0d58a;

    .preparation-label {
      font-size: 22rpx;
      color: #8c6d1f;
      font-weight: 600;
    }

    .preparation-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 12rpx;
    }

    .preparation-tag {
      padding: 8rpx 16rpx;
      border-radius: 999rpx;
      background: linear-gradient(135deg, #fff4cc 0%, #ffe39a 100%);
      color: #7a5200;
      font-size: 22rpx;
      line-height: 1.4;
    }
  }
}

// 订单列表
.orders-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

// 订单列表标题
.orders-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 24rpx;
  background-color: #f5f5f5;
  border-radius: 8rpx;
  margin-bottom: 8rpx;

  .header-id {
    font-size: 24rpx;
    color: #666;
    font-weight: 500;
  }

  .header-date {
    font-size: 24rpx;
    color: #666;
    font-weight: 500;
  }
}

.order-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 24rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;

  .order-id {
    font-size: 24rpx;
    color: #1890ff;
    font-family: monospace;
  }

  .order-date {
    font-size: 24rpx;
    color: #666;
  }
}

// 空状态
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 32rpx;

  .empty-icon {
    font-size: 120rpx;
    margin-bottom: 16rpx;
  }

  .empty-text {
    font-size: 28rpx;
    color: #999;
  }
}
</style>
