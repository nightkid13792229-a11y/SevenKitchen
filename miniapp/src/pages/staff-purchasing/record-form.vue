<template>
  <view class="record-form-page">
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <view v-else class="form-content">
      <view class="form-section">
        <text class="section-title">原料名称 *</text>
        <picker
          mode="selector"
          :range="items"
          range-key="ingredientName"
          :value="selectedItemIndex"
          @change="onItemChange"
        >
          <view class="picker">
            <text v-if="selectedItem" class="picker-text">{{ selectedItem.ingredientName }}</text>
            <text v-else class="picker-placeholder">请选择原料</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <view class="form-section">
        <text class="section-title">采购商品 *</text>
        <view v-if="procurementSkuOptions.length > 0" class="sku-list">
          <view
            v-for="sku in procurementSkuOptions"
            :key="sku.id"
            class="sku-card"
            :class="{ active: formData.procurementSkuId === sku.id }"
            @tap="selectProcurementSku(sku)"
          >
            <view class="sku-main">
              <view class="sku-title-row">
                <text class="sku-name">{{ sku.name }}</text>
                <text v-if="isRecommendedSku(sku)" class="sku-badge">推荐</text>
              </view>
              <view class="sku-meta">
                <text v-if="sku.purchaseChannel">{{ sku.purchaseChannel }}</text>
                <text v-if="sku.productModel">{{ sku.productModel }}</text>
                <text v-if="formatProcurementSkuReferencePrice(sku)">
                  {{ formatProcurementSkuReferencePrice(sku) }}
                </text>
              </view>
            </view>
            <text class="sku-check">✓</text>
          </view>
        </view>
        <view v-else class="sku-empty">
          <text class="empty-title">暂无可用采购商品</text>
          <text class="empty-desc">请联系管理员在该标准原料下新增采购 SKU 后再记录采购。</text>
        </view>
      </view>

      <view class="form-section">
        <view class="field-label-row">
          <text class="section-title inline">购买数量 *</text>
        </view>
        <view class="input-with-unit">
          <input
            v-model="formData.actualPackageCount"
            type="digit"
            class="form-input unit-input"
            :placeholder="purchaseQuantityPlaceholder"
            placeholder-class="input-placeholder"
          />
          <text class="input-unit">{{ purchaseUnitLabel }}</text>
        </view>
      </view>

      <view class="form-section">
        <view class="field-label-row">
          <text class="section-title inline">付款金额 *</text>
          <text v-if="actualUnitPriceText" class="price-hint">单价 {{ actualUnitPriceText }}</text>
        </view>
        <input
          v-model="formData.actualCost"
          type="digit"
          class="form-input"
          placeholder="请输入金额，如：156.50"
          placeholder-class="input-placeholder"
        />
      </view>

      <view class="bottom-actions">
        <button class="action-btn cancel" @tap="goBack">取消</button>
        <button class="action-btn submit" @tap="submit" :loading="submitting">
          <text v-if="!submitting">保存</text>
          <text v-else>保存中...</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  getPurchaseListDetail,
  addPurchaseRecord,
  resolvePurchaseItemDisplay,
  resolveProcurementSkuProfile,
} from '@/api/purchasing';
import type { ProcurementSkuOption } from '@/api/purchasing';

type RecordSkuOption = ProcurementSkuOption & {
  id: string;
  label: string;
};

const purchaseListId = ref('');
const items = ref<any[]>([]);
const selectedItem = ref<any>(null);
const selectedItemIndex = ref(0);
const loading = ref(true);
const submitting = ref(false);

const formData = ref({
  purchaseItemId: '',
  procurementSkuId: '',
  purchaseChannel: '',
  purchaseUnit: '',
  actualPackageCount: '',
  actualPackageSize: '',
  actualPackageUnit: '',
  actualCost: '',
  productModel: '',
});

const formatMeasurementUnit = (unit?: string | null): string => {
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

const formatDecimal = (value: number, maxDecimalPlaces = 3) => {
  if (!Number.isFinite(value)) {
    return '';
  }
  return Number(value.toFixed(maxDecimalPlaces)).toString();
};

const formatMoney = (value: number) => {
  if (!Number.isFinite(value)) {
    return '';
  }
  return Number(value.toFixed(2)).toString();
};

const formatCompactLabel = (parts: Array<string | null | undefined>) => {
  return parts.map((part) => (part || '').trim()).filter(Boolean).join(' · ');
};

const getIngredientBaseUnit = (item: any): string => {
  return item?.ingredient?.baseUnit || item?.resolvedBaseUnit || item?.quantityUnit || 'PCS';
};

const getSuggestedPackageSize = (item: any): string => {
  const rawRatio = Number(item?.ingredient?.purchaseToBaseRatio || item?.resolvedPurchaseToBaseRatio || 0);
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

const getSkuPurchaseUnit = (sku: ProcurementSkuOption | null | undefined, item: any): string => {
  return (
    formatMeasurementUnit(sku?.purchaseUnit) ||
    parsePurchaseUnitFromProductModel(sku?.productModel) ||
    formatMeasurementUnit(sku?.displayUnit) ||
    formatMeasurementUnit(item?.ingredient?.purchaseUnit) ||
    '件'
  );
};

const getSkuPackageFacts = (sku: ProcurementSkuOption, item: any) => {
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

const procurementSkuProfile = computed(() => resolveProcurementSkuProfile(selectedItem.value));
const procurementSkuOptions = computed<RecordSkuOption[]>(() =>
  procurementSkuProfile.value.procurementSkuChoices
    .filter((sku) => Boolean(sku.id))
    .map((sku) => ({
      ...sku,
      id: sku.id as string,
      label: formatCompactLabel([sku.name, sku.productModel, sku.purchaseChannel]),
    })),
);

const selectedProcurementSku = computed(() => {
  return procurementSkuOptions.value.find((sku) => sku.id === formData.value.procurementSkuId) || null;
});

const purchaseUnitLabel = computed(() => {
  return formatMeasurementUnit(formData.value.purchaseUnit) || '件';
});

const purchaseQuantityPlaceholder = computed(() => {
  return `请输入本次实际买了多少${purchaseUnitLabel.value}，如：2`;
});

const isRecommendedSku = (sku: RecordSkuOption) => {
  const profile = procurementSkuProfile.value;
  if (profile.procurementSkuId && sku.id) {
    return profile.procurementSkuId === sku.id;
  }
  return Boolean(profile.procurementSkuName && profile.procurementSkuName === sku.name);
};

const convertPackageSizeToBaseQuantity = (size: number, unit: string, item: any) => {
  const baseUnit = getIngredientBaseUnit(item);
  const normalizedUnit = formatMeasurementUnit(unit);

  if (baseUnit === 'G') {
    if (normalizedUnit === 'kg') {
      return size * 1000;
    }
    if (normalizedUnit === '斤') {
      return size * 500;
    }
    return size;
  }

  if (baseUnit === 'ML') {
    if (normalizedUnit === 'L') {
      return size * 1000;
    }
    return size;
  }

  return size;
};

const getReferencePriceParts = (sku: ProcurementSkuOption) => {
  const price = Number(sku?.currentPurchasePrice || sku?.referencePricePerPurchaseUnit || 0);
  const ratio = Number(sku?.purchaseToBaseRatio || 0);
  const baseUnit = getIngredientBaseUnit(selectedItem.value);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  if (Number.isFinite(ratio) && ratio > 0) {
    if (baseUnit === 'G') {
      return { price: price / ratio * 500, unit: '500g' };
    }

    if (baseUnit === 'ML') {
      return { price: price / ratio * 500, unit: '500ml' };
    }

    if (baseUnit === 'PCS') {
      return {
        price: price / ratio,
        unit: formatMeasurementUnit(selectedItem.value?.ingredient?.unitDisplayLabel) || '个',
      };
    }
  }

  return {
    price,
    unit: getSkuPurchaseUnit(sku, selectedItem.value),
  };
};

const formatProcurementSkuReferencePrice = (sku: ProcurementSkuOption) => {
  const parts = getReferencePriceParts(sku);
  if (!parts) {
    return '';
  }
  return `历史单价 ¥${formatMoney(parts.price)}/${parts.unit}`;
};

const actualUnitPriceText = computed(() => {
  const packageCount = Number(formData.value.actualPackageCount);
  const packageSize = Number(formData.value.actualPackageSize);
  const cost = Number(formData.value.actualCost);

  if (
    !Number.isFinite(packageCount) ||
    packageCount <= 0 ||
    !Number.isFinite(packageSize) ||
    packageSize <= 0 ||
    !Number.isFinite(cost) ||
    cost <= 0
  ) {
    return '';
  }

  const singleBaseQuantity = convertPackageSizeToBaseQuantity(
    packageSize,
    formData.value.actualPackageUnit,
    selectedItem.value,
  );
  const totalBaseQuantity = packageCount * singleBaseQuantity;

  if (!Number.isFinite(totalBaseQuantity) || totalBaseQuantity <= 0) {
    return '';
  }

  const baseUnit = getIngredientBaseUnit(selectedItem.value);
  if (baseUnit === 'G') {
    return `¥${formatMoney(cost / totalBaseQuantity * 500)}/500g`;
  }
  if (baseUnit === 'ML') {
    return `¥${formatMoney(cost / totalBaseQuantity * 500)}/500ml`;
  }

  const unit = formatMeasurementUnit(selectedItem.value?.ingredient?.unitDisplayLabel) || formData.value.actualPackageUnit || '个';
  return `¥${formatMoney(cost / totalBaseQuantity)}/${unit}`;
});

const applyProcurementSkuDefaults = (sku: RecordSkuOption) => {
  if (!selectedItem.value) {
    return;
  }

  const facts = getSkuPackageFacts(sku, selectedItem.value);
  formData.value.procurementSkuId = sku.id;
  formData.value.purchaseChannel = sku.purchaseChannel || '';
  formData.value.productModel = sku.productModel || '';
  formData.value.purchaseUnit = facts.purchaseUnit || '件';
  formData.value.actualPackageSize = facts.size || '';
  formData.value.actualPackageUnit = facts.unit || '';
};

const applySelectedItemDefaults = (item: any) => {
  if (!item) {
    return;
  }

  formData.value = {
    purchaseItemId: item.id,
    procurementSkuId: '',
    purchaseChannel: '',
    purchaseUnit: '',
    actualPackageCount: '',
    actualPackageSize: '',
    actualPackageUnit: '',
    actualCost: '',
    productModel: '',
  };

  const profile = resolveProcurementSkuProfile(item);
  const choices = profile.procurementSkuChoices
    .filter((sku) => Boolean(sku.id))
    .map((sku) => ({
      ...sku,
      id: sku.id as string,
      label: formatCompactLabel([sku.name, sku.productModel, sku.purchaseChannel]),
    }));
  const preferredSku =
    choices.find((sku) => profile.procurementSkuId && sku.id === profile.procurementSkuId) ||
    choices.find((sku) => profile.procurementSkuName && sku.name === profile.procurementSkuName) ||
    choices[0] ||
    null;

  if (preferredSku) {
    applyProcurementSkuDefaults(preferredSku);
  }
};

onLoad((options: any) => {
  purchaseListId.value = options.id;
  loadPurchaseListDetail();
});

const loadPurchaseListDetail = async () => {
  loading.value = true;

  try {
    const res: any = await getPurchaseListDetail(purchaseListId.value);

    if (res.code === 0) {
      items.value = (res.data.items || []).map((item: any) =>
        resolvePurchaseItemDisplay(item)
      );

      if (items.value.length > 0) {
        selectedItem.value = items.value[0];
        selectedItemIndex.value = 0;
        applySelectedItemDefaults(selectedItem.value);
      }
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
    }
  } catch (error: any) {
    console.error('[RecordForm] 加载采购清单详情失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
    setTimeout(() => {
      uni.navigateBack();
    }, 1500);
  } finally {
    loading.value = false;
  }
};

const onItemChange = (e: any) => {
  selectedItemIndex.value = e.detail.value;
  selectedItem.value = items.value[e.detail.value];
  applySelectedItemDefaults(selectedItem.value);
};

const selectProcurementSku = (sku: RecordSkuOption) => {
  applyProcurementSkuDefaults(sku);
};

const hasMaxDecimalPlaces = (value: string | number, maxDecimalPlaces: number) => {
  const normalized = `${value}`;
  const decimalPart = normalized.split('.')[1];
  return !decimalPart || decimalPart.length <= maxDecimalPlaces;
};

const validateForm = (): boolean => {
  if (!selectedItem.value) {
    uni.showToast({ title: '请选择原料', icon: 'none' });
    return false;
  }

  if (!formData.value.procurementSkuId || formData.value.procurementSkuId.trim().length === 0) {
    uni.showToast({ title: '请选择采购商品', icon: 'none' });
    return false;
  }

  if (!selectedProcurementSku.value) {
    uni.showToast({ title: '采购商品不存在，请重新选择', icon: 'none' });
    return false;
  }

  if (!formData.value.purchaseChannel || formData.value.purchaseChannel.trim().length === 0) {
    uni.showToast({ title: '采购商品缺少采购渠道，请联系管理员补充', icon: 'none' });
    return false;
  }

  if (!formData.value.purchaseUnit || formData.value.purchaseUnit.trim().length === 0) {
    uni.showToast({ title: '采购商品缺少采购单位，请联系管理员补充', icon: 'none' });
    return false;
  }

  if (!formData.value.actualPackageCount || formData.value.actualPackageCount.toString().trim().length === 0) {
    uni.showToast({ title: '请输入购买数量', icon: 'none' });
    return false;
  }

  const packageCount = Number(formData.value.actualPackageCount);
  if (isNaN(packageCount) || packageCount <= 0) {
    uni.showToast({ title: '购买数量必须大于0', icon: 'none' });
    return false;
  }

  if (!hasMaxDecimalPlaces(formData.value.actualPackageCount, 3)) {
    uni.showToast({ title: '购买数量最多三位小数', icon: 'none' });
    return false;
  }

  if (!formData.value.actualPackageSize || formData.value.actualPackageSize.toString().trim().length === 0) {
    uni.showToast({ title: '采购商品缺少换算规格，请联系管理员补充', icon: 'none' });
    return false;
  }

  const packageSize = Number(formData.value.actualPackageSize);
  if (isNaN(packageSize) || packageSize <= 0) {
    uni.showToast({ title: '采购商品换算规格必须大于0', icon: 'none' });
    return false;
  }

  if (!formData.value.actualPackageUnit) {
    uni.showToast({ title: '采购商品缺少换算单位，请联系管理员补充', icon: 'none' });
    return false;
  }

  if (!formData.value.actualCost || formData.value.actualCost.toString().trim().length === 0) {
    uni.showToast({ title: '请输入付款金额', icon: 'none' });
    return false;
  }

  const cost = Number(formData.value.actualCost);
  if (isNaN(cost) || cost <= 0) {
    uni.showToast({ title: '金额必须大于0', icon: 'none' });
    return false;
  }

  const costStr = formData.value.actualCost.toString();
  const decimalIndex = costStr.indexOf('.');
  if (decimalIndex !== -1 && costStr.length - decimalIndex - 1 > 2) {
    uni.showToast({ title: '金额最多两位小数', icon: 'none' });
    return false;
  }

  return true;
};

const submit = async () => {
  if (!validateForm()) {
    return;
  }

  submitting.value = true;

  try {
    const packageCount = Number(formData.value.actualPackageCount);
    const packageSize = Number(formData.value.actualPackageSize);
    const cost = Number(formData.value.actualCost);
    const data = {
      purchaseItemId: formData.value.purchaseItemId,
      procurementSkuId: formData.value.procurementSkuId,
      purchaseChannel: formData.value.purchaseChannel.trim(),
      actualPackageCount: Number(packageCount.toFixed(3)),
      actualPackageSize: Number(packageSize.toFixed(3)),
      actualPackageUnit: formData.value.actualPackageUnit,
      actualCost: Number(cost.toFixed(2)),
      productModel: formData.value.productModel?.trim() || undefined,
    };

    const response: any = await addPurchaseRecord(purchaseListId.value, data);

    if (response.code === 0) {
      uni.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
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

const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped lang="scss">
.record-form-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 120rpx 32rpx;

  text {
    font-size: 28rpx;
    color: #999;
  }
}

.form-content {
  padding: 24rpx 32rpx;
}

.form-section {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;

  .section-title {
    display: block;
    font-size: 28rpx;
    font-weight: 500;
    color: #333;
    margin-bottom: 16rpx;

    &.inline {
      margin-bottom: 0;
    }
  }
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.unit-badge,
.price-hint {
  flex-shrink: 0;
  font-size: 24rpx;
  font-weight: 600;
  color: #1677ff;
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

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding-right: 24rpx;
  background-color: #f5f5f5;
  border-radius: 8rpx;
}

.unit-input {
  flex: 1;
  background-color: transparent;
}

.input-unit {
  flex-shrink: 0;
  font-size: 28rpx;
  font-weight: 600;
  color: #666;
}

.input-placeholder {
  color: #999;
}

.picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 80rpx;
  padding: 0 24rpx;
  background-color: #f5f5f5;
  border-radius: 8rpx;

  .picker-text {
    font-size: 28rpx;
    color: #333;
  }

  .picker-placeholder {
    font-size: 28rpx;
    color: #999;
  }

  .picker-arrow {
    font-size: 40rpx;
    color: #999;
  }
}

.sku-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.sku-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  border: 2rpx solid #eef0f5;
  border-radius: 12rpx;
  background-color: #fafafa;

  &.active {
    border-color: #1677ff;
    background-color: #f0f7ff;

    .sku-check {
      color: #1677ff;
      opacity: 1;
    }
  }
}

.sku-main {
  flex: 1;
  min-width: 0;
}

.sku-title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 10rpx;
}

.sku-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}

.sku-badge {
  flex-shrink: 0;
  padding: 3rpx 10rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  color: #1677ff;
  background-color: #eaf3ff;
}

.sku-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;

  text {
    padding: 3rpx 8rpx;
    border-radius: 6rpx;
    font-size: 22rpx;
    color: #666;
    background-color: #eef0f5;
  }
}

.sku-check {
  flex-shrink: 0;
  font-size: 32rpx;
  font-weight: 700;
  color: #bbb;
  opacity: 0.45;
}

.sku-empty {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 24rpx;
  border-radius: 12rpx;
  background-color: #fff7e8;
}

.empty-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #5f3b00;
}

.empty-desc {
  font-size: 24rpx;
  line-height: 1.5;
  color: #8a5a00;
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 24rpx;
  padding: 24rpx 32rpx;
  background-color: #fff;
  box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
}

.action-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 12rpx;
  font-size: 32rpx;
  font-weight: 500;
  border: none;

  &.cancel {
    background-color: #f5f5f5;
    color: #666;
  }

  &.submit {
    background-color: #ffd700;
    color: #333;
  }
}
</style>
