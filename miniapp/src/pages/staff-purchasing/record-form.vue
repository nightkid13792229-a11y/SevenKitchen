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

      <view v-if="selectedItemProcurementSkus.length > 0" class="form-section">
        <text class="section-title">生产采购SKU</text>
        <picker
          mode="selector"
          :range="selectedItemProcurementSkus"
          range-key="name"
          :value="selectedProcurementSkuIndex"
          @change="onProcurementSkuChange"
        >
          <view class="picker">
            <text class="picker-text">{{ selectedProcurementSkuLabel }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
        <text class="section-hint">如已配置生产采购 SKU，建议在这里选定实际采购的商品版本</text>
      </view>

      <!-- 实际采购数量 -->
      <view class="form-section">
        <text class="section-title">实际采购数量（{{ getPurchaseUnit(selectedItem) }}） *</text>
        <input
          v-model.number="formData.actualQuantity"
          type="digit"
          class="form-input"
          :placeholder="`请输入${getPurchaseUnit(selectedItem)}数量`"
          placeholder-class="input-placeholder"
        />
        <text class="section-hint">请输入正整数，单位：{{ getPurchaseUnit(selectedItem) }}</text>
      </view>

      <!-- 实际采购金额 -->
      <view class="form-section">
        <text class="section-title">实际采购金额（元） *</text>
        <input
          v-model.number="formData.actualCost"
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
  type ProcurementSkuOption,
} from '@/api/purchasing';

// 状态管理
const purchaseListId = ref('');
const items = ref<any[]>([]);
const selectedItem = ref<any>(null);
const selectedItemIndex = ref(0);
const selectedProcurementSkuIndex = ref(0);
const loading = ref(true);
const submitting = ref(false);

// 表单数据
const formData = ref({
  purchaseItemId: '',
  ingredientId: '',
  ingredientName: '',
  procurementSkuId: '',
  purchaseChannel: '',
  actualQuantity: '',
  actualCost: '',
  productModel: '',
  notes: '',
});

const selectedItemProcurementSkus = computed<ProcurementSkuOption[]>(() => {
  return selectedItem.value?.procurementSkuOptions || [];
});

const selectedProcurementSkuLabel = computed(() => {
  if (selectedItemProcurementSkus.value.length === 0) {
    return '未配置生产采购 SKU';
  }

  return (
    selectedItemProcurementSkus.value[selectedProcurementSkuIndex.value]?.name ||
    selectedItemProcurementSkus.value[0]?.name ||
    '请选择生产采购 SKU'
  );
});

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

  applySelectedItemDefaults(selectedItem.value);
};

const getPurchaseUnit = (item: any): string => {
  if (item?.resolvedDisplayUnit) {
    return item.resolvedDisplayUnit;
  }

  if (item?.displayUnit) {
    return item.displayUnit;
  }

  if (item?.quantityUnit) {
    return item.quantityUnit;
  }

  if (item?.ingredient?.purchaseUnit) {
    return item.ingredient.purchaseUnit;
  }

  return 'g';
};

const applyProcurementSkuSelection = (
  sku?: ProcurementSkuOption,
  overrideExistingValues = true
) => {
  if (!sku) {
    formData.value.procurementSkuId = '';
    return;
  }

  formData.value.procurementSkuId = sku.id || '';

  if (overrideExistingValues || !formData.value.purchaseChannel) {
    formData.value.purchaseChannel = sku.purchaseChannel || formData.value.purchaseChannel;
  }

  if (overrideExistingValues || !formData.value.productModel) {
    formData.value.productModel = sku.productModel || formData.value.productModel;
  }
};

const applySelectedItemDefaults = (item: any) => {
  if (!item) {
    return;
  }

  formData.value.purchaseItemId = item.id;
  formData.value.ingredientId = item.ingredientId;
  formData.value.ingredientName = item.ingredientName;
  formData.value.purchaseChannel = item.resolvedPurchaseChannel || '';
  formData.value.actualQuantity = '';
  formData.value.actualCost = '';
  formData.value.productModel = item.resolvedProductModel || '';
  formData.value.notes = '';
  formData.value.procurementSkuId = '';

  const procurementSkus = item.procurementSkuOptions || [];
  const matchedIndex = procurementSkus.findIndex((sku: ProcurementSkuOption) => {
    if (item.resolvedProcurementSkuId && sku.id) {
      return sku.id === item.resolvedProcurementSkuId;
    }

    return sku.name === item.resolvedProcurementSkuName;
  });

  if (matchedIndex >= 0) {
    selectedProcurementSkuIndex.value = matchedIndex;
    applyProcurementSkuSelection(procurementSkus[matchedIndex], false);
  } else {
    selectedProcurementSkuIndex.value = 0;
    applyProcurementSkuSelection(procurementSkus[0], false);
  }
};

const onProcurementSkuChange = (e: any) => {
  selectedProcurementSkuIndex.value = Number(e.detail.value || 0);
  applyProcurementSkuSelection(selectedItemProcurementSkus.value[selectedProcurementSkuIndex.value]);
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

  if (!formData.value.actualQuantity || formData.value.actualQuantity.toString().trim().length === 0) {
    uni.showToast({ title: `请输入实际采购${getPurchaseUnit(selectedItem.value)}`, icon: 'none' });
    return false;
  }

  // 验证重量是否为整数
  const quantity = Number(formData.value.actualQuantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    uni.showToast({ title: '数量必须为正整数', icon: 'none' });
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
      ingredientId: formData.value.ingredientId,
      ingredientName: formData.value.ingredientName,
      procurementSkuId: formData.value.procurementSkuId || undefined,
      purchaseChannel: formData.value.purchaseChannel.trim(),
      actualQuantity: Number(formData.value.actualQuantity),
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
