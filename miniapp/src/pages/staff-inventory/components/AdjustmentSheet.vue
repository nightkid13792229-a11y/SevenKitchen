<template>
  <view v-if="visible" class="mask" @tap="close">
    <view class="sheet" @tap.stop>
      <view class="sheet-head">
        <text class="sheet-title">领用 / 报废</text>
        <view class="head-right">
          <text class="records" @tap="goRecords">记录 ›</text>
          <text class="close" @tap="close">关闭</text>
        </view>
      </view>
      <text class="hint">领用不用批；报废满 50 元要管理员确认。</text>

      <scroll-view scroll-y class="body">
        <view class="block">
          <text class="label">原料</text>
          <view v-if="lockedIngredient" class="locked">
            <text class="locked-name">{{ lockedIngredient.name }}</text>
            <text class="meta">
              当前 {{ fmt(lockedIngredient.currentStock) }}{{ lockedIngredient.stockUnitLabel }}
              · 约 ¥{{ unitCostText }}/{{ lockedIngredient.stockUnitLabel }}
            </text>
          </view>
          <template v-else>
            <input
              v-model="keyword"
              class="search"
              placeholder="搜原料"
              confirm-type="search"
            />
            <picker
              mode="selector"
              :range="filteredNames"
              :value="pickerIndex"
              @change="onPickerChange"
            >
              <view class="picker">
                <text>{{ selected?.name || '选择原料' }}</text>
                <text class="chevron">›</text>
              </view>
            </picker>
            <text v-if="selected" class="meta">
              当前 {{ fmt(selected.currentStock) }}{{ selected.stockUnitLabel }}
              · 约 ¥{{ unitCostText }}/{{ selected.stockUnitLabel }}
            </text>
            <text v-else-if="keyword" class="meta">没有匹配的原料。</text>
          </template>
        </view>

        <view class="block">
          <text class="label">数量（{{ selected?.stockUnitLabel || '克' }}）</text>
          <input
            v-model="quantityText"
            class="qty"
            type="digit"
            maxlength="9"
            placeholder="拿走多少"
          />
          <text v-if="estimatedAmount !== null" class="meta">
            约 ¥{{ estimatedAmount.toFixed(2) }}
            <text v-if="needsReview">，会进待复核</text>
          </text>
          <text v-if="willGoNegative" class="warn">
            提交后账面会变成 {{ fmt(negativeAfter) }}{{ selected?.stockUnitLabel }}（待核实）
          </text>
        </view>

        <view class="block">
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

        <view class="block">
          <text class="label">备注（可选）</text>
          <textarea
            v-model="note"
            class="note"
            maxlength="120"
            auto-height
            placeholder="例如：试餐 / 包装破损"
          />
        </view>
      </scroll-view>

      <view class="sheet-bottom">
        <button
          class="submit"
          :loading="submitting"
          :disabled="submitting"
          @tap="onSubmit"
        >
          提交
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  createInventoryAdjustment,
  getInventoryOverview,
  type InventoryAdjustmentCategory,
  type InventoryOverviewItem,
} from '../api/inventory';

type IngredientForAdjustment = Pick<
  InventoryOverviewItem,
  | 'id'
  | 'name'
  | 'currentStock'
  | 'stockUnitLabel'
  | 'purchaseToBaseRatio'
  | 'currentPricePerPurchaseUnit'
>;

const props = defineProps<{
  visible: boolean;
  ingredient?: IngredientForAdjustment | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'submitted'): void;
}>();

const categories = [
  { value: 'INTERNAL_USE', label: '内部领用' },
  { value: 'EXPIRED', label: '过期报废' },
  { value: 'DAMAGED', label: '破损污染' },
  { value: 'OTHER', label: '其他' },
] as const;

const overview = ref<InventoryOverviewItem[]>([]);
const keyword = ref('');
const selectedId = ref('');
const quantityText = ref('');
const category = ref<InventoryAdjustmentCategory>('INTERNAL_USE');
const note = ref('');
const submitting = ref(false);

const lockedIngredient = computed(() => props.ingredient || null);
const selected = computed(() => {
  if (lockedIngredient.value) return lockedIngredient.value;
  return overview.value.find((item) => item.id === selectedId.value) || null;
});

const filtered = computed(() => {
  const term = keyword.value.trim().toLowerCase();
  if (!term) return overview.value;
  return overview.value.filter((item) =>
    [item.name, item.purchaseChannel, item.productModel]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)),
  );
});
const filteredNames = computed(() => filtered.value.map((item) => item.name));
const pickerIndex = computed(() => {
  const index = filtered.value.findIndex((item) => item.id === selectedId.value);
  return index < 0 ? 0 : index;
});

const quantity = computed(() => {
  const value = Number(quantityText.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
});

const unitCostText = computed(() => {
  if (!selected.value) return '-';
  const ratio = Number(selected.value.purchaseToBaseRatio || 0);
  if (!ratio) return '-';
  return (
    Number(selected.value.currentPricePerPurchaseUnit || 0) / ratio
  ).toFixed(2);
});

const estimatedAmount = computed(() => {
  if (!selected.value || quantity.value <= 0) return null;
  const ratio = Number(selected.value.purchaseToBaseRatio || 0);
  if (!ratio) return null;
  return (
    (quantity.value / ratio) *
    Number(selected.value.currentPricePerPurchaseUnit || 0)
  );
});

const needsReview = computed(
  () =>
    category.value !== 'INTERNAL_USE' &&
    (estimatedAmount.value === null || estimatedAmount.value >= 50),
);

const willGoNegative = computed(
  () =>
    Boolean(selected.value) &&
    quantity.value > Number(selected.value!.currentStock),
);
const negativeAfter = computed(() =>
  selected.value ? Number(selected.value.currentStock) - quantity.value : 0,
);

const fmt = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '0';
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
};

const reset = () => {
  keyword.value = '';
  selectedId.value = '';
  quantityText.value = '';
  category.value = 'INTERNAL_USE';
  note.value = '';
  submitting.value = false;
};

const loadOverview = async () => {
  if (lockedIngredient.value) return;
  try {
    overview.value = await getInventoryOverview({});
  } catch {
    uni.showToast({ title: '加载原料失败', icon: 'none' });
  }
};

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    reset();
    void loadOverview();
  },
  { immediate: true },
);

watch(keyword, () => {
  if (!lockedIngredient.value) selectedId.value = '';
});

const onPickerChange = (event: any) => {
  const item = filtered.value[Number(event?.detail?.value || 0)];
  if (item) selectedId.value = item.id;
};

const goRecords = () => {
  if (submitting.value) return;
  emit('close');
  uni.navigateTo({ url: '/pages/staff-inventory/adjustments' });
};

const close = () => {
  if (!submitting.value) emit('close');
};

const onSubmit = async () => {
  if (submitting.value) return;
  if (!selected.value) {
    uni.showToast({ title: '先选原料', icon: 'none' });
    return;
  }
  if (quantity.value <= 0) {
    uni.showToast({ title: '数量必须大于 0', icon: 'none' });
    return;
  }

  submitting.value = true;
  try {
    await createInventoryAdjustment({
      ingredientId: selected.value.id,
      quantity: quantity.value,
      category: category.value,
      note: note.value.trim() || undefined,
    });
    uni.showToast({ title: '已记上', icon: 'success' });
    emit('submitted');
    emit('close');
  } catch (err: any) {
    uni.showToast({ title: err?.message || '提交失败', icon: 'none' });
    submitting.value = false;
  }
};
</script>

<style scoped>
.mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 60;
  background: rgba(20, 30, 24, 0.45);
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  max-height: 86vh;
  padding: 20rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  border-radius: 28rpx 28rpx 0 0;
  background: #fbfcf7;
  display: flex;
  flex-direction: column;
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8rpx;
}
.sheet-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1e3a2f;
}
.head-right { display: flex; align-items: center; gap: 20rpx; }
.records { font-size: 24rpx; color: #1e3a2f; }
.close {
  font-size: 24rpx;
  color: #7a8a80;
}
.hint {
  font-size: 24rpx;
  color: #7a8a80;
  line-height: 1.5;
}
.body {
  flex: 1;
  height: 0;
  margin-top: 8rpx;
}
.block {
  padding: 18rpx 0;
  border-bottom: 1rpx solid #e8ede7;
}
.block:last-child {
  border-bottom: none;
}
.label {
  display: block;
  margin-bottom: 10rpx;
  font-size: 24rpx;
  color: #7a8a80;
}
.search {
  height: 64rpx;
  margin-bottom: 12rpx;
  padding: 0 18rpx;
  border-radius: 12rpx;
  background: #f2f5ef;
  font-size: 26rpx;
}
.picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72rpx;
  padding: 0 18rpx;
  border-radius: 12rpx;
  background: #f2f5ef;
  font-size: 28rpx;
  color: #1e3a2f;
}
.chevron {
  color: #7a8a80;
}
.locked {
  padding: 4rpx 0;
}
.locked-name {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #1e3a2f;
}
.meta {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #7a8a80;
}
.qty {
  height: 72rpx;
  padding: 0 18rpx;
  border-radius: 12rpx;
  background: #f2f5ef;
  font-size: 30rpx;
}
.warn {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #a33a2a;
  line-height: 1.5;
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
.note {
  width: 100%;
  min-height: 90rpx;
  padding: 14rpx 18rpx;
  box-sizing: border-box;
  border-radius: 12rpx;
  background: #f2f5ef;
  font-size: 26rpx;
}
.sheet-bottom {
  padding-top: 12rpx;
  background: #fbfcf7;
}
.submit {
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  background: #1e3a2f;
  color: #fbfcf7;
  font-size: 28rpx;
}
</style>
