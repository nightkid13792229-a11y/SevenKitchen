<template>
  <view class="page">
    <view v-if="loading" class="state">正在加载盘点结果…</view>
    <view v-else-if="error" class="state">
      <text>{{ error }}</text>
      <text class="retry" @tap="load">重试</text>
    </view>

    <template v-else>
      <view class="summary">
        <text class="big">{{ countedCount }} 项已盘</text>
        <text class="sub">
          {{ skippedCount }} 项未盘 · 差异 {{ varianceCount }} 项
        </text>
        <text v-if="mode === 'preview'" class="sub">
          小差异自动入账，大差异等管理员复核。
        </text>
      </view>

      <view v-for="group in groups" :key="group.key" class="group">
        <view class="group-title">
          {{ group.title }}
          <text class="count">{{ group.lines.length }}</text>
        </view>

        <view
          v-for="line in group.lines"
          :key="line.ingredientId"
          class="row"
        >
          <view class="row-top">
            <text class="name">{{ line.ingredientName }}</text>
            <text class="badge" :class="badgeClass(line)">{{ badgeText(line) }}</text>
          </view>
          <view class="row-nums">
            <text>账面 {{ fmt(line.expectedQuantityG) }}</text>
            <text>
              实盘 {{ line.countedQuantityG === null ? '未盘' : fmt(line.countedQuantityG) }}
            </text>
            <text :class="deltaClass(line)">
              差 {{ signed(line.deltaG) }}
            </text>
          </view>
        </view>
      </view>

      <view v-if="mode === 'preview'" class="note">
        <textarea
          v-model="note"
          class="note-input"
          maxlength="120"
          auto-height
          placeholder="备注（可选）：这次盘点的范围或异常"
        />
      </view>

      <view class="bottom">
        <button
          v-if="mode === 'preview'"
          class="btn primary"
          :loading="submitting"
          :disabled="submitting"
          @tap="onSubmit"
        >
          {{ overCount > 0 ? '提交复核' : '提交并入账' }}
        </button>
        <button v-else class="btn primary" @tap="goRecords">返回记录</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  getStocktake,
  previewStocktake,
  submitStocktake,
} from './api/inventory';

type Line = {
  ingredientId: string;
  ingredientName: string;
  stockUnitLabel: string;
  expectedQuantityG: number | null;
  countedQuantityG: number | null;
  deltaG: number | null;
  isCounted: boolean;
  withinTolerance: boolean | null;
};

const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const mode = ref<'preview' | 'result'>('result');
const stocktakeId = ref('');
const note = ref('');
const lines = ref<Line[]>([]);

const countedCount = computed(() => lines.value.filter((line) => line.isCounted).length);
const skippedCount = computed(() => lines.value.length - countedCount.value);
const varianceCount = computed(
  () => lines.value.filter((line) => line.isCounted && Number(line.deltaG || 0) !== 0).length,
);
const overCount = computed(
  () => lines.value.filter((line) => line.isCounted && line.withinTolerance === false).length,
);

const groups = computed(() => {
  const over = lines.value.filter((line) => line.isCounted && line.withinTolerance === false);
  const auto = lines.value.filter((line) => line.isCounted && line.withinTolerance === true);
  const skipped = lines.value.filter((line) => !line.isCounted);
  return [
    {
      key: 'over',
      title: mode.value === 'preview' ? '大差异，待复核' : '待复核',
      lines: over,
    },
    {
      key: 'auto',
      title: mode.value === 'preview' ? '小差异，自动入账' : '已自动入账',
      lines: auto,
    },
    {
      key: 'skipped',
      title: '未盘',
      lines: skipped,
    },
  ].filter((group) => group.lines.length > 0);
});

const fmt = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
};

const signed = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${fmt(number)}`;
};

const badgeText = (line: Line) => {
  if (!line.isCounted) return '未盘';
  return line.withinTolerance ? '自动入账' : '待复核';
};

const badgeClass = (line: Line) => {
  if (!line.isCounted) return 'muted';
  return line.withinTolerance ? 'ok' : 'warn';
};

const deltaClass = (line: Line) => {
  if (line.deltaG === null) return 'muted';
  return line.deltaG > 0 ? 'positive' : line.deltaG < 0 ? 'negative' : 'muted';
};

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    if (mode.value === 'preview') {
      const preview = await previewStocktake(stocktakeId.value, true);
      lines.value = preview.lines.map((line) => ({
        ingredientId: line.ingredientId,
        ingredientName: line.ingredientName,
        stockUnitLabel: line.stockUnitLabel,
        expectedQuantityG: line.expectedQuantityG,
        countedQuantityG: line.countedQuantityG,
        deltaG: line.deltaG,
        isCounted: line.isCounted,
        withinTolerance: line.withinTolerance,
      }));
    } else {
      const detail: any = await getStocktake(stocktakeId.value);
      lines.value = (detail.lines || []).map((line: any) => ({
        ingredientId: line.ingredientId,
        ingredientName: line.ingredientName,
        stockUnitLabel: line.stockUnitLabel,
        expectedQuantityG: line.expectedQuantityG,
        countedQuantityG: line.countedQuantityG,
        deltaG: line.deltaG,
        isCounted: line.isCounted,
        withinTolerance: line.withinTolerance,
      }));
    }
  } catch (err: any) {
    error.value = err?.message || '加载失败，请重试';
  } finally {
    loading.value = false;
  }
};

onLoad((options: any) => {
  stocktakeId.value = options?.id || '';
  mode.value = options?.mode === 'preview' ? 'preview' : 'result';
  if (!stocktakeId.value) {
    loading.value = false;
    error.value = '缺少盘点单号';
    return;
  }
  load();
});

const backToRecords = () => {
  uni.redirectTo({ url: '/pages/staff-inventory/stocktake-records' });
};

const onSubmit = async () => {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const result = await submitStocktake(stocktakeId.value, note.value.trim() || undefined);
    uni.showToast({
      title: result.status === 'APPLIED' ? '已自动入账' : '已提交复核',
      icon: 'success',
    });
    setTimeout(backToRecords, 600);
  } catch (err: any) {
    uni.showToast({ title: err?.message || '提交失败', icon: 'none' });
    submitting.value = false;
  }
};

const goRecords = () => {
  backToRecords();
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(140rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: #fbfcf7;
}
.retry {
  display: block;
  margin-top: 12rpx;
  color: #1e3a2f;
  font-size: 24rpx;
}
.state {
  padding: 80rpx 0;
  text-align: center;
  color: #7a8a80;
  font-size: 26rpx;
}
.summary {
  padding: 28rpx;
  border-radius: 24rpx;
  background: #1e3a2f;
  color: #fbfcf7;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.big {
  font-size: 40rpx;
  font-weight: 600;
}
.sub {
  font-size: 24rpx;
  color: #d8e4da;
}
.group {
  margin-top: 24rpx;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 0 8rpx 12rpx;
  font-size: 26rpx;
  color: #4b5b51;
}
.count {
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  background: #e8ede7;
  font-size: 24rpx;
}
.row {
  padding: 18rpx 20rpx;
  margin-bottom: 10rpx;
  border-radius: 20rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
}
.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.name {
  flex: 1;
  font-size: 28rpx;
  color: #1e3a2f;
}
.badge {
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
}
.badge.ok {
  background: #e4f0e6;
  color: #1e3a2f;
}
.badge.warn {
  background: #f6ead9;
  color: #8a5a1e;
}
.badge.muted {
  background: #eef1ec;
  color: #5b6b60;
}
.row-nums {
  display: flex;
  gap: 20rpx;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #4b5b51;
}
.positive {
  color: #1f6b3a;
}
.negative {
  color: #a33a2a;
}
.muted {
  color: #7a8a80;
}
.note {
  margin-top: 24rpx;
}
.note-input {
  width: 100%;
  min-height: 100rpx;
  padding: 16rpx 20rpx;
  box-sizing: border-box;
  border-radius: 16rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
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
  font-size: 28rpx;
}
.btn.primary {
  background: #1e3a2f;
  color: #fbfcf7;
}
</style>
