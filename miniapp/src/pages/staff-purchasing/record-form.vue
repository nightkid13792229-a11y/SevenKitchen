<template>
  <view class="record-form-page">
    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 表单内容 -->
    <view v-else class="form-content">
      <!-- 原料选择 -->
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
        <text v-if="getSelectedItemProcurementLabel(selectedItem)" class="section-hint">
          采购 SKU：{{ getSelectedItemProcurementLabel(selectedItem) }}
        </text>
        <text v-if="selectedItem?.suggestedProductName" class="section-hint">
          推荐参考：{{ selectedItem.suggestedProductName }}
        </text>
      </view>

      <!-- 采购SKU -->
      <view v-if="procurementSkuOptions.length > 1" class="form-section">
        <text class="section-title">采购 SKU（可选）</text>
        <picker
          mode="selector"
          :range="procurementSkuOptions"
          range-key="label"
          :value="procurementSkuIndex"
          @change="onProcurementSkuChange"
        >
          <view class="picker">
            <text v-if="formData.procurementSkuId" class="picker-text">
              {{ selectedProcurementSku?.label }}
            </text>
            <text v-else class="picker-placeholder">请选择生产采购 SKU</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
        <text class="section-hint">优先选生产采购 SKU；如果没有合适项，可保持不选。</text>
      </view>

      <!-- 采购渠道 -->
      <view class="form-section">
        <text class="section-title">采购渠道 *</text>
        <input
          v-model="formData.purchaseChannel"
          class="form-input"
          placeholder="如：京东、淘宝、本地市场"
          placeholder-class="input-placeholder"
        />
      </view>

      <!-- 实际购买件数 -->
      <view class="form-section">
        <text class="section-title">实际购买件数 *</text>
        <input
          v-model="formData.actualPackageCount"
          type="digit"
          class="form-input"
          placeholder="请输入本次实际买了几件，如：2"
          placeholder-class="input-placeholder"
        />
        <text class="section-hint">按实际买到的件数填写，不需要先折算成 {{ getPurchaseRecordUnit(selectedItem) }}</text>
      </view>

      <!-- 单件规格 -->
      <view class="form-section">
        <text class="section-title">单件规格 *</text>
        <input
          v-model="formData.actualPackageSize"
          type="digit"
          class="form-input"
          placeholder="请输入单件规格数值，如：1000"
          placeholder-class="input-placeholder"
        />
      </view>

      <!-- 规格单位 -->
      <view class="form-section">
        <text class="section-title">规格单位 *</text>
        <picker
          mode="selector"
          :range="packageUnitOptions"
          :value="packageUnitIndex"
          @change="onPackageUnitChange"
        >
          <view class="picker">
            <text v-if="formData.actualPackageUnit" class="picker-text">{{ formData.actualPackageUnit }}</text>
            <text v-else class="picker-placeholder">请选择规格单位</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
        <text class="section-hint">例如 1件 x 1000g，系统会自动折算为标准采购单位</text>
      </view>

      <!-- 实际采购金额 -->
      <view class="form-section">
        <text class="section-title">实际采购金额（元） *</text>
        <input
          v-model="formData.actualCost"
          type="digit"
          class="form-input"
          placeholder="请输入金额，如：156.50"
          placeholder-class="input-placeholder"
        />
        <text class="section-hint">精确到分，单位：元</text>
      </view>

      <!-- 产品型号（选填） -->
      <view class="form-section">
        <text class="section-title">产品型号（选填）</text>
        <input
          v-model="formData.productModel"
          class="form-input"
          placeholder="如：500g装"
          placeholder-class="input-placeholder"
        />
      </view>

      <!-- 备注信息（选填） -->
      <view class="form-section">
        <text class="section-title">备注信息（选填）</text>
        <textarea
          v-model="formData.notes"
          class="form-textarea"
          placeholder="请输入备注信息"
          placeholder-class="input-placeholder"
          :maxlength="200"
        />
        <text class="char-count">{{ formData.notes.length }}/200</text>
      </view>

      <!-- 底部操作按钮 -->
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

// 状态管理
const purchaseListId = ref('');
const items = ref<any[]>([]);
const selectedItem = ref<any>(null);
const selectedItemIndex = ref(0);
const loading = ref(true);
const submitting = ref(false);

// 表单数据
const formData = ref({
  purchaseItemId: '',
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

const procurementSkuProfile = computed(() => resolveProcurementSkuProfile(selectedItem.value));
const procurementSkuOptions = computed(() => [
  { id: '', label: '不选择采购 SKU' },
  ...procurementSkuProfile.value.procurementSkuChoices.map((sku) => ({
    ...sku,
    label: [sku.name, sku.productModel, sku.purchaseChannel].filter(Boolean).join(' · '),
  })),
]);
const selectedProcurementSku = computed(() => {
  return procurementSkuOptions.value.find((sku) => sku.id === formData.value.procurementSkuId) || null;
});
const procurementSkuIndex = computed(() => {
  const index = procurementSkuOptions.value.findIndex((sku) => sku.id === formData.value.procurementSkuId);
  return index >= 0 ? index : 0;
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

const getIngredientBaseUnit = (item: any): string => {
  return item?.ingredient?.baseUnit || item?.quantityUnit || 'PCS';
};

const getSuggestedPackageSize = (item: any): string => {
  const ratio = Number(item?.ingredient?.purchaseToBaseRatio || 0);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return '';
  }
  return `${ratio}`.replace(/\.?0+$/, '');
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

const getPurchaseRecordUnit = (item: any): string => {
  if (item?.ingredient?.purchaseUnit) {
    return item.ingredient.purchaseUnit;
  }

  if (item?.quantityUnit) {
    return item.quantityUnit;
  }

  return '个';
};

const getSelectedItemProcurementLabel = (item: any) => {
  if (!item) {
    return '';
  }

  const profile = resolveProcurementSkuProfile(item);
  return (
    profile.procurementSkuName ||
    [profile.purchaseChannel, profile.productModel].filter(Boolean).join(' · ') ||
    item.purchaseChannel ||
    item.productModel ||
    ''
  );
};

const packageUnitOptions = computed(() => getPackageUnitOptions(selectedItem.value));
const packageUnitIndex = computed(() => {
  const index = packageUnitOptions.value.indexOf(formData.value.actualPackageUnit);
  return index >= 0 ? index : 0;
});

const hasMaxDecimalPlaces = (value: string | number, maxDecimalPlaces: number) => {
  const normalized = `${value}`;
  const decimalPart = normalized.split('.')[1];
  return !decimalPart || decimalPart.length <= maxDecimalPlaces;
};

const applySelectedItemDefaults = (item: any) => {
  if (!item) {
    return;
  }

  formData.value.purchaseItemId = item.id;
  const profile = resolveProcurementSkuProfile(item);
  formData.value.procurementSkuId = profile.procurementSkuId || '';
  formData.value.procurementSkuName = profile.procurementSkuName || '';
  formData.value.purchaseChannel = profile.purchaseChannel || '';
  formData.value.productModel = profile.productModel || '';
  formData.value.actualPackageSize = getSuggestedPackageSize(item);
  formData.value.actualPackageUnit = getSuggestedPackageUnit(item);
};
// 页面加载
onLoad((options: any) => {
  console.log('[RecordForm] onLoad options:', options);
  purchaseListId.value = options.id;
  console.log('[RecordForm] purchaseListId:', purchaseListId.value);
  loadPurchaseListDetail();
});

// 加载采购清单详情
const loadPurchaseListDetail = async () => {
  console.log('[RecordForm] loadPurchaseListDetail called, purchaseListId:', purchaseListId.value);
  loading.value = true;

  try {
    const res: any = await getPurchaseListDetail(purchaseListId.value);
    console.log('[RecordForm] API response:', res);

    if (res.code === 0) {
      items.value = (res.data.items || []).map((item: any) =>
        resolvePurchaseItemDisplay(item)
      );
      console.log('[RecordForm] items loaded:', items.value.length);

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

// 选择原料
const onItemChange = (e: any) => {
  selectedItemIndex.value = e.detail.value;
  selectedItem.value = items.value[e.detail.value];

  // 自动填充原料信息
  applySelectedItemDefaults(selectedItem.value);
};

const onPackageUnitChange = (e: any) => {
  const unit = packageUnitOptions.value[e.detail.value];
  if (unit) {
    formData.value.actualPackageUnit = unit;
  }
};

const onProcurementSkuChange = (e: any) => {
  const sku = procurementSkuOptions.value[e.detail.value];
  if (!sku) {
    return;
  }

  const profile = resolveProcurementSkuProfile(selectedItem.value);
  formData.value.procurementSkuId = sku.id || '';
  formData.value.procurementSkuName = sku.id ? sku.name : '';

  if (sku.id) {
    formData.value.purchaseChannel = sku.purchaseChannel || formData.value.purchaseChannel;
    formData.value.productModel = sku.productModel || formData.value.productModel;
  } else {
    formData.value.purchaseChannel = profile.purchaseChannel || '';
    formData.value.productModel = profile.productModel || '';
  }
};

// 表单验证
const validateForm = (): boolean => {
  if (!selectedItem.value) {
    uni.showToast({ title: '请选择原料', icon: 'none' });
    return false;
  }

  if (!formData.value.purchaseChannel || formData.value.purchaseChannel.trim().length === 0) {
    uni.showToast({ title: '请输入采购渠道', icon: 'none' });
    return false;
  }

  if (!formData.value.actualPackageCount || formData.value.actualPackageCount.toString().trim().length === 0) {
    uni.showToast({ title: '请输入实际购买件数', icon: 'none' });
    return false;
  }

  const packageCount = Number(formData.value.actualPackageCount);
  if (isNaN(packageCount) || packageCount <= 0) {
    uni.showToast({ title: '件数必须大于0', icon: 'none' });
    return false;
  }

  if (!hasMaxDecimalPlaces(formData.value.actualPackageCount, 3)) {
    uni.showToast({ title: '件数最多三位小数', icon: 'none' });
    return false;
  }

  if (!formData.value.actualPackageSize || formData.value.actualPackageSize.toString().trim().length === 0) {
    uni.showToast({ title: '请输入单件规格', icon: 'none' });
    return false;
  }

  const packageSize = Number(formData.value.actualPackageSize);
  if (isNaN(packageSize) || packageSize <= 0) {
    uni.showToast({ title: '单件规格必须大于0', icon: 'none' });
    return false;
  }

  if (!hasMaxDecimalPlaces(formData.value.actualPackageSize, 3)) {
    uni.showToast({ title: '单件规格最多三位小数', icon: 'none' });
    return false;
  }

  if (!formData.value.actualPackageUnit) {
    uni.showToast({ title: '请选择规格单位', icon: 'none' });
    return false;
  }

  if (!formData.value.actualCost || formData.value.actualCost.toString().trim().length === 0) {
    uni.showToast({ title: '请输入实际采购金额', icon: 'none' });
    return false;
  }

  // 验证金额格式（最多两位小数）
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

// 提交表单
const submit = async () => {
  if (!validateForm()) {
    return;
  }

  submitting.value = true;

  try {
    const data = {
      purchaseItemId: formData.value.purchaseItemId,
      procurementSkuId: formData.value.procurementSkuId || undefined,
      procurementSkuName: formData.value.procurementSkuName || undefined,
      purchaseChannel: formData.value.purchaseChannel.trim(),
      actualPackageCount: Number(Number(formData.value.actualPackageCount).toFixed(3)),
      actualPackageSize: Number(Number(formData.value.actualPackageSize).toFixed(3)),
      actualPackageUnit: formData.value.actualPackageUnit,
      actualCost: Number(formData.value.actualCost),
      productModel: formData.value.productModel?.trim() || undefined,
      notes: formData.value.notes?.trim() || undefined,
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

// 返回上一页
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
  }

  .section-hint {
    display: block;
    font-size: 22rpx;
    color: #999;
    margin-top: 8rpx;
  }

  .char-count {
    display: block;
    font-size: 22rpx;
    color: #999;
    text-align: right;
    margin-top: 8rpx;
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
