<template>
  <view class="manual-item-form-modal" @tap="handleClose">
    <view class="modal-content" @tap.stop>
      <view class="modal-header">
        <text class="modal-title">手动添加原料</text>
        <text class="modal-close" @tap="handleClose">×</text>
      </view>

      <view class="modal-body">
        <!-- 原料名称 -->
        <view class="form-section">
          <text class="form-label">原料名称 *</text>
          <input
            v-model="formData.ingredientName"
            class="form-input"
            placeholder="请输入原料名称"
            placeholder-class="input-placeholder"
          />
        </view>

        <!-- 原料类型 -->
        <view class="form-section">
          <text class="form-label">原料类型 *</text>
          <picker
            mode="selector"
            :range="ingredientTypes"
            range-key="label"
            :value="typeIndex"
            @change="onTypeChange"
          >
            <view class="picker-value">
              <text class="value">{{ formData.type ? ingredientTypes[typeIndex].label : '请选择原料类型' }}</text>
              <text class="arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 需求数量 -->
        <view class="form-section">
          <text class="form-label">需求数量 *</text>
          <input
            v-model.number="formData.quantityNeeded"
            type="digit"
            class="form-input"
            placeholder="请输入数量"
            placeholder-class="input-placeholder"
          />
        </view>

        <!-- 数量单位 -->
        <view class="form-section">
          <text class="form-label">数量单位 *</text>
          <picker
            mode="selector"
            :range="quantityUnits"
            :value="unitIndex"
            @change="onUnitChange"
          >
            <view class="picker-value">
              <text class="value">{{ formData.quantityUnit || '请选择单位' }}</text>
              <text class="arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 预估成本 -->
        <view class="form-section">
          <text class="form-label">预估成本（元） *</text>
          <input
            v-model.number="formData.estimatedCost"
            type="digit"
            class="form-input"
            placeholder="请输入金额，如：100.50"
            placeholder-class="input-placeholder"
          />
        </view>

        <!-- 采购渠道 -->
        <view class="form-section">
          <text class="form-label">采购渠道（可选）</text>
          <input
            v-model="formData.purchaseChannel"
            class="form-input"
            placeholder="如：京东、淘宝、本地市场"
            placeholder-class="input-placeholder"
          />
        </view>

        <!-- 产品型号 -->
        <view class="form-section">
          <text class="form-label">产品型号（可选）</text>
          <input
            v-model="formData.productModel"
            class="form-input"
            placeholder="如：500g装"
            placeholder-class="input-placeholder"
          />
        </view>
      </view>

      <view class="modal-footer">
        <button class="modal-btn cancel" @tap="handleClose">取消</button>
        <button class="modal-btn submit" @tap="handleSubmit" :loading="submitting">
          {{ submitting ? '提交中...' : '确定添加' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

// 原料类型选项
const ingredientTypes = [
  { label: '食材', value: 'FOOD' },
  { label: '补剂', value: 'SUPPLEMENT' },
  { label: '包装', value: 'PACKAGING' },
];

// 数量单位选项
const quantityUnits = ['kg', 'g', '个', '包', '瓶', '盒', '片', '粒', 'ml', 'L', '其他'];

// Emits
const emit = defineEmits<{
  (e: 'submit', data: any): void;
  (e: 'close'): void;
}>();

// 表单数据
const formData = ref({
  ingredientName: '',
  type: 'FOOD',
  quantityNeeded: '',
  quantityUnit: 'g',
  estimatedCost: '',
  purchaseChannel: '',
  productModel: '',
});

const submitting = ref(false);

// 当前选中的类型索引
const typeIndex = computed(() => {
  return ingredientTypes.findIndex(t => t.value === formData.value.type);
});

// 当前选中的单位索引
const unitIndex = computed(() => {
  return quantityUnits.indexOf(formData.value.quantityUnit);
});

// 类型变更
const onTypeChange = (e: any) => {
  const index = e.detail.value;
  formData.value.type = ingredientTypes[index].value;

  // 自动设置默认单位
  if (formData.value.type === 'FOOD' && !formData.value.quantityUnit) {
    formData.value.quantityUnit = 'kg';
  } else if (formData.value.type === 'SUPPLEMENT' && !formData.value.quantityUnit) {
    formData.value.quantityUnit = 'g';
  }
};

// 单位变更
const onUnitChange = (e: any) => {
  const index = e.detail.value;
  formData.value.quantityUnit = quantityUnits[index];
};

// 表单验证
const validateForm = (): boolean => {
  if (!formData.value.ingredientName || formData.value.ingredientName.trim().length === 0) {
    uni.showToast({ title: '请输入原料名称', icon: 'none' });
    return false;
  }

  if (!formData.value.type) {
    uni.showToast({ title: '请选择原料类型', icon: 'none' });
    return false;
  }

  if (!formData.value.quantityNeeded || formData.value.quantityNeeded.toString().trim().length === 0) {
    uni.showToast({ title: '请输入需求数量', icon: 'none' });
    return false;
  }

  const quantity = Number(formData.value.quantityNeeded);
  if (isNaN(quantity) || quantity <= 0) {
    uni.showToast({ title: '数量必须大于0', icon: 'none' });
    return false;
  }

  if (!formData.value.quantityUnit) {
    uni.showToast({ title: '请选择数量单位', icon: 'none' });
    return false;
  }

  if (!formData.value.estimatedCost || formData.value.estimatedCost.toString().trim().length === 0) {
    uni.showToast({ title: '请输入预估成本', icon: 'none' });
    return false;
  }

  const cost = Number(formData.value.estimatedCost);
  if (isNaN(cost) || cost <= 0) {
    uni.showToast({ title: '成本必须大于0', icon: 'none' });
    return false;
  }

  const costStr = formData.value.estimatedCost.toString();
  const decimalIndex = costStr.indexOf('.');
  if (decimalIndex !== -1 && costStr.length - decimalIndex - 1 > 2) {
    uni.showToast({ title: '金额最多两位小数', icon: 'none' });
    return false;
  }

  return true;
};

// 提交表单
const handleSubmit = () => {
  if (!validateForm()) {
    return;
  }

  const data = {
    ingredientId: `manual-${Date.now()}`, // 生成临时ID
    ingredientName: formData.value.ingredientName.trim(),
    type: formData.value.type,
    quantityNeeded: Number(formData.value.quantityNeeded),
    quantityUnit: formData.value.quantityUnit,
    estimatedCost: Number(formData.value.estimatedCost),
    purchaseChannel: formData.value.purchaseChannel?.trim() || undefined,
    productModel: formData.value.productModel?.trim() || undefined,
  };

  emit('submit', data);
};

// 关闭弹窗
const handleClose = () => {
  emit('close');
};
</script>

<style scoped lang="scss">
.manual-item-form-modal {
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
  max-height: 85vh;
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
  flex-shrink: 0;

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

.form-section {
  margin-bottom: 24rpx;

  &:last-child {
    margin-bottom: 0;
  }

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

  .picker-value {
    height: 80rpx;
    padding: 0 24rpx;
    background-color: #f5f5f5;
    border-radius: 8rpx;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .value {
      font-size: 28rpx;
      color: #333;
    }

    .arrow {
      font-size: 40rpx;
      color: #999;
      font-weight: 300;
      line-height: 1;
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
  flex-shrink: 0;

  .modal-btn {
    flex: 1;
    height: 88rpx;
    border-radius: 12rpx;
    font-size: 32rpx;
    font-weight: 500;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;

    &.cancel {
      background-color: #f5f5f5;
      color: #666;
    }

    &.submit {
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      color: #fff;
    }

    &:active {
      opacity: 0.8;
    }
  }
}
</style>
