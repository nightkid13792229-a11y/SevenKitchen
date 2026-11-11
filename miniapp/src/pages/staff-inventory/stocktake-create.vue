<template>
  <view class="page">
    <view v-if="loading" class="state">
      <text>正在准备盘点…</text>
    </view>

    <view v-else-if="error" class="state">
      <text class="state-title">盘点没开起来</text>
      <text class="state-hint">{{ error }}</text>
      <button class="btn primary" @tap="bootstrap">重试</button>
    </view>

    <template v-else>
      <view class="top">
        <view class="top-line">
          <text class="progress-text">已盘 {{ countedCount }} / {{ lines.length }}</text>
          <text class="cancel" @tap="onCancel">取消盘点</text>
        </view>
        <view class="bar">
          <view class="bar-fill" :style="{ width: progressPercent + '%' }" />
        </view>
        <text class="hint">只填实称；留空 = 没盘，不会改库存。</text>
      </view>

      <view class="filters">
        <view
          v-for="item in filters"
          :key="item.value"
          class="chip"
          :class="{ active: filter === item.value }"
          @tap="filter = item.value"
        >
          {{ item.label }}
        </view>
      </view>

      <scroll-view scroll-y class="list">
        <view
          v-for="(line, index) in visibleLines"
          :key="line.ingredientId"
          class="row"
          :class="{ done: isCounted(line) }"
        >
          <view class="row-copy">
            <text class="name">{{ line.ingredientName }}</text>
            <text class="unit">{{ line.stockUnitLabel }}</text>
          </view>
          <input
            class="input"
            type="digit"
            :value="inputs[line.ingredientId] || ''"
            :focus="focusIndex === index"
            confirm-type="next"
            placeholder="未盘"
            @input="onInput(line, $event)"
            @confirm="focusNext(index)"
          />
          <text class="check" :class="{ on: isCounted(line) }">
            {{ isCounted(line) ? '✓' : '' }}
          </text>
        </view>

        <view v-if="visibleLines.length === 0" class="state soft">
          <text>这个分组里没有原料</text>
        </view>
      </scroll-view>

      <view class="bottom">
        <button class="btn ghost" :loading="saving" @tap="saveDraft()">存草稿</button>
        <button class="btn primary" :loading="saving" @tap="onNext">
          下一步（核对）
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  cancelStocktake,
  getStocktakeDraft,
  previewStocktake,
  saveStocktakeLines,
  startStocktake,
} from './api/inventory';

type DraftLine = {
  ingredientId: string;
  ingredientName: string;
  ingredientType?: string | null;
  stockUnitLabel: string;
  countedQuantityG: number | null;
};

const filters = [
  { value: 'ALL', label: '全部' },
  { value: 'FOOD', label: '食材' },
  { value: 'SUPPLEMENT', label: '补剂' },
  { value: 'PACKAGING', label: '包材' },
] as const;

const loading = ref(true);
const error = ref('');
const saving = ref(false);
const stocktakeId = ref('');
const lines = ref<DraftLine[]>([]);
const inputs = ref<Record<string, string>>({});
const filter = ref<(typeof filters)[number]['value']>('ALL');
const focusIndex = ref(-1);

const isCounted = (line: DraftLine) =>
  (inputs.value[line.ingredientId] || '').trim() !== '';

const countedCount = computed(
  () => lines.value.filter((line) => isCounted(line)).length,
);

const progressPercent = computed(() =>
  lines.value.length
    ? Math.round((countedCount.value / lines.value.length) * 100)
    : 0,
);

const visibleLines = computed(() =>
  filter.value === 'ALL'
    ? lines.value
    : lines.value.filter((line) => line.ingredientType === filter.value),
);

const hydrate = (draft: any) => {
  stocktakeId.value = draft.id;
  lines.value = (draft.lines || []).map((line: any) => ({
    ingredientId: line.ingredientId,
    ingredientName: line.ingredientName,
    ingredientType: line.ingredientType,
    stockUnitLabel: line.stockUnitLabel,
    countedQuantityG: line.countedQuantityG,
  }));
  const nextInputs: Record<string, string> = {};
  for (const line of lines.value) {
    nextInputs[line.ingredientId] =
      line.countedQuantityG === null || line.countedQuantityG === undefined
        ? ''
        : String(line.countedQuantityG);
  }
  inputs.value = nextInputs;
};

const bootstrap = async () => {
  loading.value = true;
  error.value = '';
  try {
    const draft = await getStocktakeDraft();
    const current = draft || (await startStocktake());
    hydrate(current);
  } catch (err: any) {
    error.value = err?.message || '加载失败，请重试';
  } finally {
    loading.value = false;
  }
};

onLoad(() => {
  bootstrap();
});

const onInput = (line: DraftLine, event: any) => {
  inputs.value = {
    ...inputs.value,
    [line.ingredientId]: event?.detail?.value ?? '',
  };
};

const focusNext = (index: number) => {
  focusIndex.value = -1;
  if (index >= visibleLines.value.length - 1) return;
  nextTick(() => {
    focusIndex.value = index + 1;
  });
};

const buildPayload = () =>
  lines.value.map((line) => {
    const text = (inputs.value[line.ingredientId] || '').trim();
    return {
      ingredientId: line.ingredientId,
      countedQuantityG: text === '' ? null : Number(text),
    };
  });

const saveDraft = async (silent = false): Promise<boolean> => {
  if (!stocktakeId.value || saving.value) return false;
  saving.value = true;
  try {
    const payload = buildPayload();
    if (payload.some((line) => line.countedQuantityG !== null && (!Number.isFinite(line.countedQuantityG) || line.countedQuantityG < 0))) {
      throw new Error('实盘数量必须是非负数字');
    }
    await saveStocktakeLines(stocktakeId.value, payload);
    if (!silent) {
      uni.showToast({ title: '已存草稿', icon: 'success' });
    }
    return true;
  } catch (err: any) {
    if (!silent) {
      uni.showToast({ title: err?.message || '保存失败', icon: 'none' });
    }
    return false;
  } finally {
    saving.value = false;
  }
};

const onNext = async () => {
  if (saving.value) return;
  if (countedCount.value === 0) {
    uni.showToast({ title: '先填至少一项实称', icon: 'none' });
    return;
  }
  const skipped = lines.value.length - countedCount.value;
  if (skipped > 0) {
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '还有未盘项',
        content: `还有 ${skipped} 项没盘，这些不会调整库存。继续吗？`,
        confirmText: '继续',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }

  const saved = await saveDraft(true);
  if (!saved) {
    uni.showToast({ title: '草稿没保存上，检查网络后重试', icon: 'none' });
    return;
  }
  try {
    await previewStocktake(stocktakeId.value, skipped > 0);
    uni.redirectTo({
      url: `/pages/staff-inventory/stocktake-result?id=${stocktakeId.value}&mode=preview`,
    });
  } catch (err: any) {
    uni.showToast({ title: err?.message || '预览失败', icon: 'none' });
  }
};

const onCancel = async () => {
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '取消盘点',
      content: '已填的数字会丢失，库存流水不会有变化。确定取消吗？',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  try {
    await cancelStocktake(stocktakeId.value);
    uni.navigateBack();
  } catch (err: any) {
    uni.showToast({ title: err?.message || '取消失败，请重试', icon: 'none' });
  }
};
</script>

<style scoped>
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fbfcf7;
}
.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  padding: 48rpx;
  color: #4b5b51;
  font-size: 26rpx;
}
.state.soft {
  padding: 40rpx;
  color: #7a8a80;
}
.state-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1e3a2f;
}
.state-hint {
  text-align: center;
  line-height: 1.6;
}
.top {
  padding: 24rpx 32rpx 16rpx;
  background: #fff;
  border-bottom: 1rpx solid #e8ede7;
}
.top-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.progress-text {
  font-size: 30rpx;
  font-weight: 600;
  color: #1e3a2f;
}
.cancel {
  font-size: 24rpx;
  color: #8a5a44;
}
.bar {
  margin-top: 14rpx;
  height: 10rpx;
  border-radius: 999rpx;
  background: #eef2ec;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: #1e3a2f;
  transition: width 0.2s ease;
}
.hint {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #7a8a80;
}
.filters {
  display: flex;
  gap: 16rpx;
  padding: 20rpx 32rpx 8rpx;
  background: #fff;
}
.chip {
  padding: 10rpx 28rpx;
  border-radius: 999rpx;
  background: #f1f4ee;
  color: #4b5b51;
  font-size: 24rpx;
}
.chip.active {
  background: #1e3a2f;
  color: #fbfcf7;
}
.list {
  flex: 1;
  height: 0;
  padding: 12rpx 24rpx;
  box-sizing: border-box;
}
.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 16rpx;
  margin-bottom: 10rpx;
  border-radius: 20rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
}
.row.done {
  border-color: #bcd3c3;
  background: #f4f8f2;
}
.row-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
.name {
  font-size: 28rpx;
  color: #1e3a2f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unit {
  font-size: 24rpx;
  color: #7a8a80;
}
.input {
  width: 180rpx;
  height: 64rpx;
  padding: 0 16rpx;
  border-radius: 12rpx;
  background: #f7f9f5;
  border: 1rpx solid #dde5da;
  font-size: 28rpx;
  text-align: right;
}
.check {
  width: 36rpx;
  font-size: 30rpx;
  color: #1e3a2f;
  text-align: center;
}
.bottom {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #e8ede7;
}
.btn {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  font-size: 28rpx;
}
.btn.ghost {
  background: #f1f4ee;
  color: #1e3a2f;
}
.btn.primary {
  background: #1e3a2f;
  color: #fbfcf7;
}
</style>
