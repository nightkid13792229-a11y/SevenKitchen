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

      <!-- 实际采购重量 -->
      <view class="form-section">
        <text class="section-title">实际采购重量（克） *</text>
        <input
          v-model.number="formData.actualQuantity"
          type="digit"
          class="form-input"
          placeholder="请输入整数，如：5200"
          placeholder-class="input-placeholder"
        />
        <text class="section-hint">请输入整数，单位：克</text>
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
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getPurchaseListDetail, addPurchaseRecord } from '@/api/purchasing';

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
  ingredientId: '',
  ingredientName: '',
  purchaseChannel: '',
  actualQuantity: '',
  actualCost: '',
  productModel: '',
  notes: '',
});

// 页面加载
onLoad((options: any) => {
  purchaseListId.value = options.id;
  loadPurchaseListDetail();
});

// 加载采购清单详情
const loadPurchaseListDetail = async () => {
  loading.value = true;

  try {
    const res: any = await getPurchaseListDetail(purchaseListId.value);

    if (res.code === 0) {
      items.value = res.data.items || [];
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
    }
  } catch (error: any) {
    console.error('加载采购清单详情失败', error);
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
  formData.value.purchaseItemId = selectedItem.value.id;
  formData.value.ingredientId = selectedItem.value.ingredientId;
  formData.value.ingredientName = selectedItem.value.ingredientName;
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
    uni.showToast({ title: '请输入实际采购重量', icon: 'none' });
    return false;
  }

  // 验证重量是否为整数
  const quantity = Number(formData.value.actualQuantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    uni.showToast({ title: '重量必须为正整数', icon: 'none' });
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
    text-align: right;
    font-size: 22rpx;
    color: #999;
    margin-top: 8rpx;
  }
}

.picker {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;

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

.form-input {
  width: 100%;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #333;
  border: none;

  &.input-placeholder {
    color: #999;
  }
}

.form-textarea {
  width: 100%;
  min-height: 160rpx;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #333;
  border: none;
  box-sizing: border-box;

  &.input-placeholder {
    color: #999;
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
  display: flex;
  gap: 16rpx;
  z-index: 100;

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

    &.cancel {
      background-color: #f0f0f0;
      color: #666;
    }

    &.submit {
      background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
      color: #333;
      box-shadow: 0 8rpx 16rpx rgba(253, 203, 110, 0.3);
    }

    &:active {
      opacity: 0.8;
    }
  }
}
</style>
