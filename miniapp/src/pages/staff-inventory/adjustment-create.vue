<template>
  <view class="page">
    <view class="header">
      <text class="title">记一笔</text>
      <text class="hint">报废 / 内部领用，约 30 秒。内部领用免审批；报废单笔 ≥50 元进待复核。</text>
    </view>

    <view class="card">
      <text class="label">原料</text>
      <picker
        mode="selector"
        :range="ingredientNames"
        :value="ingredientIndex"
        @change="onIngredientChange"
      >
        <view class="picker">
          <text>{{ selected?.name || '选择原料' }}</text>
          <text class="chevron">›</text>
        </view>
      </picker>
      <text v-if="selected" class="meta">
        当前 {{ fmt(selected.currentStock) }} {{ selected.stockUnitLabel }}
        · 约 ¥{{ unitCostText }}/{{ selected.stockUnitLabel }}
      </text>
    </view>

    <view class="card">
      <text class="label">数量（{{ selected?.stockUnitLabel || '克' }}）</text>
      <input
        v-model="quantityText"
        class="input"
        type="digit"
        placeholder="例如 300"
      />
      <text class="meta" v-if="estimatedAmount !== null">
        按当前单价约 ¥{{ estimatedAmount.toFixed(2) }}
        <text v-if="estimatedAmount >= 50 && category !== 'INTERNAL_USE'">，会进待复核</text>
      </text>
    </view>

    <view class="card">
      <text class="label">分类</text>
      <view class="chips">
        <view
          v-for="item in categories"
          :key="item.value"
          class="chip"
          :class="{ active: category === item.value }"
          @tap="category = item.value"
        >
          {{ item.label }}
        </view>
      </view>
    </view>

    <view class="card">
      <text class="label">备注（可选）</text>
      <textarea
        v-model="note"
        class="textarea"
        maxlength="120"
        auto-height
        placeholder="例如：试餐 / 包装破损"
      />
    </view>

    <view class="bottom">
      <button class="btn" :loading="submitting" @tap="onSubmit">提交</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  createInventoryAdjustment,
  getInventoryOverview,
  type InventoryAdjustmentCategory,
  type InventoryOverviewItem,
} from './api/inventory';

const categories = [
  { value: 'INTERNAL_USE', label: '内部领用' },
  { value: 'EXPIRED', label: '过期报废' },
  { value: 'DAMAGED', label: '破损污染' },
  { value: 'OTHER', label: '其他' },
] as const;

const ingredients = ref<InventoryOverviewItem[]>([]);
const ingredientIndex = ref(0);
const quantityText = ref('');
const category = ref<InventoryAdjustmentCategory>('INTERNAL_USE');
const note = ref('');
const submitting = ref(false);

const ingredientNames = computed(() =>
  ingredients.value.map((item) => item.name),
);
const selected = computed(() => ingredients.value[ingredientIndex.value]);

const fmt = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
};

const unitCostText = computed(() => {
  const item = selected.value;
  if (!item) return '-';
  const ratio = Number(item.purchaseToBaseRatio || 0);
  if (!ratio) return '-';
  return (Number(item.currentPricePerPurchaseUnit || 0) / ratio).toFixed(2);
});

const quantity = computed(() => {
  const value = Number(quantityText.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
});

const estimatedAmount = computed(() => {
  const item = selected.value;
  if (!item || quantity.value <= 0) return null;
  const ratio = Number(item.purchaseToBaseRatio || 0);
  if (!ratio) return null;
  return (quantity.value / ratio) * Number(item.currentPricePerPurchaseUnit || 0);
});

onLoad(async () => {
  try {
    const rows = await getInventoryOverview({});
    ingredients.value = rows;
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加载原料失败', icon: 'none' });
  }
});

const onIngredientChange = (event: any) => {
  ingredientIndex.value = Number(event?.detail?.value || 0);
};

const onSubmit = async () => {
  if (!selected.value) {
    uni.showToast({ title: '先选原料', icon: 'none' });
    return;
  }
  if (quantity.value <= 0) {
    uni.showToast({ title: '数量必须大于 0', icon: 'none' });
    return;
  }
  if (submitting.value) return;

  submitting.value = true;
  try {
    await createInventoryAdjustment({
      ingredientId: selected.value.id,
      quantity: quantity.value,
      category: category.value,
      note: note.value.trim() || undefined,
    });
    uni.showToast({ title: '已记账', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 500);
  } catch (error: any) {
    uni.showToast({ title: error?.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(140rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: #fbfcf7;
}
.header {
  padding: 8rpx 8rpx 20rpx;
}
.title {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
  color: #1e3a2f;
}
.hint {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #7a8a80;
  line-height: 1.6;
}
.card {
  padding: 20rpx;
  margin-bottom: 16rpx;
  border-radius: 20rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
}
.label {
  display: block;
  font-size: 24rpx;
  color: #7a8a80;
  margin-bottom: 10rpx;
}
.picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: 12rpx;
  background: #f7f9f5;
  font-size: 28rpx;
  color: #1e3a2f;
}
.chevron {
  color: #7a8a80;
}
.meta {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #7a8a80;
}
.input {
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: 12rpx;
  background: #f7f9f5;
  font-size: 30rpx;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}
.chip {
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  background: #f1f4ee;
  color: #4b5b51;
  font-size: 24rpx;
}
.chip.active {
  background: #1e3a2f;
  color: #fbfcf7;
}
.textarea {
  width: 100%;
  min-height: 100rpx;
  padding: 14rpx 18rpx;
  box-sizing: border-box;
  border-radius: 12rpx;
  background: #f7f9f5;
  font-size: 26rpx;
}
.bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #e8ede7;
}
.btn {
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #fbfcf7;
  font-size: 28rpx;
}
</style>
