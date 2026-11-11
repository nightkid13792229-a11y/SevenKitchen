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

    <view v-else-if="lines.length === 0" class="state">
      <text class="state-title">没有可盘点的原料</text>
      <text class="state-hint">
        这张盘点单是空的。重新开一张试试；如果还是空，说明库存里还没有原料。
      </text>
      <button class="btn primary" @tap="restart">重新开单</button>
      <button class="btn ghost" @tap="onCancel">取消这张草稿</button>
    </view>

    <template v-else>
      <view class="top">
        <view class="top-line">
          <text class="progress-text">已盘 {{ countedLines }} / {{ lines.length }}</text>
          <text class="cancel" @tap="onCancel">取消盘点</text>
        </view>
        <view class="bar">
          <view class="bar-fill" :style="{ width: progressPercent + '%' }" />
        </view>
      </view>

      <view class="search">
        <input
          v-model="keyword"
          class="search-input"
          placeholder="搜原料 / 商品"
          confirm-type="search"
        />
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

      <view class="filters type-filters">
        <view
          v-for="item in typeFilters"
          :key="item.value"
          class="chip"
          :class="{ active: typeFilter === item.value }"
          @tap="typeFilter = item.value"
        >
          {{ item.label }}
        </view>
      </view>

      <scroll-view scroll-y class="list">
        <view
          v-for="line in visibleLines"
          :key="line.id"
          class="row"
          :class="{ done: isLineCounted(line) }"
        >
          <view class="row-head">
            <text class="name">{{ line.ingredientName }}</text>
            <text v-if="portionCount(line) > 1" class="line-total">
              合计 {{ fmt(lineTotal(line)) }}
            </text>
          </view>

          <view
            v-for="portion in line.portions || []"
            :key="portion.id"
            class="portion"
          >
            <text
              class="p-label"
              :class="{ expanded: expanded.has(portion.id) }"
              @tap="toggleLabel(portion)"
            >
              <text v-if="brandOf(line, portion)" class="p-brand">
                {{ brandOf(line, portion) }} ·
              </text>
              {{ portionLabel(line, portion) }}
            </text>
            <input
              class="input"
              type="digit"
              :value="values[portion.id] || ''"
              confirm-type="next"
              placeholder="未盘"
              @input="onPortionInput(portion, $event)"
            />
            <text class="unit-inline">{{ line.stockUnitLabel }}</text>
            <text class="check" :class="{ on: isPortionCounted(portion) }">
              {{ isPortionCounted(portion) ? '✓' : '' }}
            </text>
            <text class="add-one" @tap.stop="addPortion(line, portion)">＋</text>
          </view>

          <view v-if="!line.portions || line.portions.length === 0" class="portion">
            <text
              class="p-label"
              :class="{ expanded: expanded.has(line.id) }"
              @tap="toggleLabel({ id: line.id } as any)"
            >
              <text v-if="line.brand" class="p-brand">{{ line.brand }} ·</text>
              {{ lineLabel(line) }}
            </text>
            <input
              class="input"
              type="digit"
              :value="lineValues[line.id] || ''"
              confirm-type="next"
              placeholder="未盘"
              @input="onLineInput(line, $event)"
            />
            <text class="unit-inline">{{ line.stockUnitLabel }}</text>
            <text class="check" :class="{ on: isLineCounted(line) }">
              {{ isLineCounted(line) ? '✓' : '' }}
            </text>
            <text class="add-one" @tap.stop="addPortion(line)">＋</text>
          </view>
        </view>

        <view v-if="visibleLines.length === 0" class="state soft">
          <text>{{ keyword ? '没搜到' : '这个筛选下没有原料' }}</text>
        </view>
      </scroll-view>

      <view v-if="saving || savedAt" class="autosave">
        {{ saving ? '保存中…' : `已自动保存 ${savedAt}` }}
      </view>
      <view class="bottom">
        <button class="btn primary" :loading="saving" @tap="onNext">
          下一步（核对）
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onUnload } from '@dcloudio/uni-app';
import {
  cancelStocktake,
  getStocktakeDraft,
  previewStocktake,
  saveStocktakeLines,
  startStocktake,
  type InventoryStocktakePortion,
  type StocktakeDraftItem,
} from './api/inventory';

type DraftLine = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientType?: string | null;
  stockUnitLabel: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  countedQuantityG: number | null;
  portions: InventoryStocktakePortion[];
};

const filters = [
  { value: 'ALL', label: '全部' },
  { value: 'TODO', label: '未盘' },
  { value: 'DONE', label: '已盘' },
] as const;

const typeFilters = [
  { value: 'ALL', label: '全部类型' },
  { value: 'FOOD', label: '食材' },
  { value: 'SUPPLEMENT', label: '补剂' },
  { value: 'PACKAGING', label: '包材' },
] as const;

const loading = ref(true);
const error = ref('');
const saving = ref(false);
const savedAt = ref('');
const stocktakeId = ref('');
const stocktakeType = ref<'OPENING' | 'ROUTINE'>('ROUTINE');
const lines = ref<DraftLine[]>([]);
const values = ref<Record<string, string>>({});
const lineValues = ref<Record<string, string>>({});
const keyword = ref('');
const filter = ref<(typeof filters)[number]['value']>('ALL');
const typeFilter = ref<(typeof typeFilters)[number]['value']>('ALL');
/** 名称太长时点一下展开（默认单行省略）。 */
const expanded = ref(new Set<string>());
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** 只把改动过的点发上去，避免一次全量提交几百个明细点。 */
const dirtyPortions = new Set<string>();
const dirtyLines = new Set<string>();
/** 正在进行的保存；点“下一步”时先等它落地，避免核对到旧数据。 */
let inFlight: Promise<boolean> | null = null;

const isOpening = computed(() => stocktakeType.value === 'OPENING');

const fmt = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
};

const isPortionCounted = (portion: InventoryStocktakePortion) =>
  (values.value[portion.id] || '').trim() !== '';

const isLineCounted = (line: DraftLine) => {
  if (line.portions && line.portions.length > 0) {
    return line.portions.some((portion) => isPortionCounted(portion));
  }
  return (lineValues.value[line.id] || '').trim() !== '';
};

const countedLines = computed(
  () => lines.value.filter((line) => isLineCounted(line)).length,
);

const progressPercent = computed(() =>
  lines.value.length
    ? Math.round((countedLines.value / lines.value.length) * 100)
    : 0,
);

const portionCount = (line: DraftLine) => (line.portions || []).length;

const brandOf = (
  line: DraftLine,
  portion?: InventoryStocktakePortion,
) => portion?.brand || line.brand || '';

const joinLabel = (...parts: Array<string | null | undefined>) =>
  parts.filter((part) => !!part && String(part).trim() !== '').join(' · ');

const portionLabel = (line: DraftLine, portion: InventoryStocktakePortion) => {
  const base = portion.procurementSkuName
    ? joinLabel(portion.procurementSkuName, portion.purchaseChannel)
    : lineLabel(line);
  return portion.locationLabel ? joinLabel(base, portion.locationLabel) : base;
};

/** 补剂/包材没有商品层：显示规格 + 采购渠道，不再写“整件”。 */
const lineLabel = (line: DraftLine) => {
  const parts = joinLabel(line.productModel, line.purchaseChannel);
  return parts || '规格 / 渠道未填';
};

const toggleLabel = (item: { id: string }) => {
  const next = new Set(expanded.value);
  if (next.has(item.id)) next.delete(item.id);
  else next.add(item.id);
  expanded.value = next;
};

const lineTotal = (line: DraftLine) =>
  (line.portions || []).reduce(
    (sum, portion) => sum + Number(values.value[portion.id] || 0),
    0,
  );

const visibleLines = computed(() => {
  const term = keyword.value.trim().toLowerCase();
  return lines.value.filter((line) => {
    if (typeFilter.value !== 'ALL' && line.ingredientType !== typeFilter.value) {
      return false;
    }
    if (filter.value === 'TODO' && isLineCounted(line)) return false;
    if (filter.value === 'DONE' && !isLineCounted(line)) return false;
    if (!term) return true;
    const haystack = [line.ingredientName]
      .concat((line.portions || []).map((p) => p.procurementSkuName || ''))
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
});

const hydrate = (draft: StocktakeDraftItem) => {
  if (!draft?.id) throw new Error('盘点单没有生成，请重试');
  stocktakeId.value = draft.id;
  stocktakeType.value = draft.type === 'OPENING' ? 'OPENING' : 'ROUTINE';
  lines.value = (draft.lines || []).map((line: any) => ({
    id: line.id,
    ingredientId: line.ingredientId,
    ingredientName: line.ingredientName,
    ingredientType: line.ingredientType,
    stockUnitLabel: line.stockUnitLabel,
    brand: line.brand,
    productModel: line.productModel,
    purchaseChannel: line.purchaseChannel,
    countedQuantityG: line.countedQuantityG,
    portions: line.portions || [],
  }));

  const nextValues: Record<string, string> = {};
  const nextLineValues: Record<string, string> = {};
  for (const line of lines.value) {
    if (line.portions.length === 0) {
      nextLineValues[line.id] =
        line.countedQuantityG === null ? '' : String(line.countedQuantityG);
      continue;
    }
    for (const portion of line.portions) {
      nextValues[portion.id] =
        portion.countedQuantityG === null
          ? ''
          : String(portion.countedQuantityG);
    }
  }
  values.value = nextValues;
  lineValues.value = nextLineValues;
  dirtyPortions.clear();
  dirtyLines.clear();
};

const bootstrap = async () => {
  loading.value = true;
  error.value = '';
  try {
    const wantOpening = stocktakeType.value === 'OPENING';
    let current = await getStocktakeDraft();

    // 想要期初，却拿到一张"日常盘点"的空草稿：取消它，重新开期初单。
    if (wantOpening && current && current.type !== 'OPENING') {
      const hasCounted = (current.lines || []).some(
        (line: any) => line.countedQuantityG !== null,
      );
      if (!hasCounted) {
        try {
          await cancelStocktake(current.id);
        } catch {
          // 草稿可能已被取消
        }
        current = null;
      }
    }

    current = current || (await startStocktake(undefined, stocktakeType.value));
    if (current.lines?.length === 0 && current.id) {
      try {
        await cancelStocktake(current.id);
      } catch {
        // 草稿可能已被取消；继续尝试开新单
      }
      current = await startStocktake(undefined, stocktakeType.value);
    }
    hydrate(current);
  } catch (err: any) {
    error.value = err?.message || '加载失败，请重试';
  } finally {
    loading.value = false;
  }
};

onLoad((options: any) => {
  stocktakeType.value = options?.type === 'OPENING' ? 'OPENING' : 'ROUTINE';
  bootstrap();
});

onHide(() => {
  void flushSave();
});

onUnload(() => {
  void flushSave();
});

const buildPortionPayload = () =>
  lines.value.flatMap((line) =>
    (line.portions || [])
      .filter((portion) => dirtyPortions.has(portion.id))
      .map((portion) => {
      const text = (values.value[portion.id] || '').trim();
      return {
        id: portion.id,
        countedQuantityG: text === '' ? null : Number(text),
      };
    }),
  );

const buildLinePayload = () =>
  lines.value
    .filter((line) => (line.portions || []).length === 0 && dirtyLines.has(line.id))
    .map((line) => {
      const text = (lineValues.value[line.id] || '').trim();
      return {
        ingredientId: line.ingredientId,
        countedQuantityG: text === '' ? null : Number(text),
      };
    });

const tooBigNumber = () =>
  Object.values(values.value).some(
    (text) => text.trim() !== '' && !Number.isFinite(Number(text)),
  ) ||
  Object.values(lineValues.value).some(
    (text) => text.trim() !== '' && !Number.isFinite(Number(text)),
  );

const saveNow = async (): Promise<boolean> => {
  if (inFlight) {
    await inFlight;
  }
  if (!stocktakeId.value) return true;
  if (dirtyPortions.size === 0 && dirtyLines.size === 0) return true;
  if (tooBigNumber()) {
    uni.showToast({ title: '数量只能填数字', icon: 'none' });
    return false;
  }

  const task = (async () => {
    saving.value = true;
    try {
      await saveStocktakeLines(stocktakeId.value, {
        portions: buildPortionPayload(),
        lines: buildLinePayload(),
      });
      dirtyPortions.clear();
      dirtyLines.clear();
      const now = new Date();
      savedAt.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      return true;
    } catch (err: any) {
      uni.showToast({
        title: err?.message || '没存上，稍后自动重试',
        icon: 'none',
      });
      return false;
    } finally {
      saving.value = false;
      inFlight = null;
    }
  })();

  inFlight = task;
  return task;
};

/** 输入停止 800ms 后自动保存（不是每次按键都发请求）。 */
const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveNow();
  }, 800);
};

const flushSave = async () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (stocktakeId.value) await saveNow();
};

const onPortionInput = (portion: InventoryStocktakePortion, event: any) => {
  values.value = {
    ...values.value,
    [portion.id]: event?.detail?.value ?? '',
  };
  dirtyPortions.add(portion.id);
  scheduleSave();
};

const onLineInput = (line: DraftLine, event: any) => {
  lineValues.value = {
    ...lineValues.value,
    [line.id]: event?.detail?.value ?? '',
  };
  dirtyLines.add(line.id);
  scheduleSave();
};

const addPortion = async (
  line: DraftLine,
  portion?: InventoryStocktakePortion,
) => {
  const context = portion
    ? portionLabel(line, portion)
    : lineLabel(line);
  const result = await new Promise<any>((resolve) => {
    uni.showModal({
      title: `再记一处：${context}`,
      editable: true,
      placeholderText: '位置或批次，例如 冰柜2（可留空）',
      success: (res) => resolve(res),
      fail: () => resolve({}),
    });
  });
  if (!result?.confirm) return;

  const locationLabel = String(result.content || '').trim() || null;
  await flushSave();
  try {
    const draft = await saveStocktakeLines(stocktakeId.value, {
      newPortions: [
        {
          lineId: line.id,
          procurementSkuId: portion?.procurementSkuId ?? null,
          locationLabel,
        },
      ],
    });
    hydrate(draft as any);
  } catch (err: any) {
    uni.showToast({ title: err?.message || '加不上，稍后再试', icon: 'none' });
  }
};

const onNext = async () => {
  if (saving.value) return;
  if (countedLines.value === 0) {
    uni.showToast({ title: '先填至少一项实称', icon: 'none' });
    return;
  }
  const skipped = lines.value.length - countedLines.value;
  if (skipped > 0 && !isOpening.value) {
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

  const saved = await saveNow();
  if (!saved) {
    uni.showToast({ title: '没保存上，检查网络后重试', icon: 'none' });
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

const restart = async () => {
  loading.value = true;
  try {
    if (stocktakeId.value) await cancelStocktake(stocktakeId.value);
  } catch {
    // 草稿可能已不存在；继续开新单
  }
  await bootstrap();
};

const onCancel = async () => {
  if (!stocktakeId.value) {
    uni.navigateBack();
    return;
  }
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
.state .btn { flex: none; width: 360rpx; }
.state.soft { padding: 40rpx; color: #7a8a80; }
.state-title { font-size: 32rpx; font-weight: 600; color: #1e3a2f; }
.state-hint { text-align: center; line-height: 1.6; }

.top {
  padding: 24rpx 32rpx 16rpx;
  background: #fff;
  border-bottom: 1rpx solid #e8ede7;
}
.top-line { display: flex; align-items: center; justify-content: space-between; }
.progress-text { font-size: 30rpx; font-weight: 600; color: #1e3a2f; }
.cancel { font-size: 24rpx; color: #8a5a44; padding: 8rpx 0 8rpx 16rpx; }
.bar { margin-top: 14rpx; height: 10rpx; border-radius: 999rpx; background: #eef2ec; overflow: hidden; }
.bar-fill { height: 100%; background: #1e3a2f; transition: width 0.2s ease; }
.hint { display: block; margin-top: 12rpx; font-size: 24rpx; color: #7a8a80; }

.search { margin: 16rpx 24rpx 0; }
.search-input {
  height: 68rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
  font-size: 26rpx;
}
.filters { display: flex; gap: 16rpx; padding: 16rpx 24rpx 4rpx; }
.type-filters { padding-top: 6rpx; }
.type-filters .chip { background: #fff; border: 1rpx solid #e8ede7; }
.type-filters .chip.active { background: #1e3a2f; border-color: #1e3a2f; }
.chip {
  height: 56rpx;
  padding: 0 26rpx;
  display: flex;
  align-items: center;
  border-radius: 28rpx;
  background: #f1f4ee;
  color: #4b5b51;
  font-size: 24rpx;
}
.chip.active { background: #1e3a2f; color: #fbfcf7; }

.list { flex: 1; height: 0; padding: 12rpx 24rpx; box-sizing: border-box; }
.row {
  padding: 16rpx 16rpx 8rpx;
  margin-bottom: 10rpx;
  border-radius: 20rpx;
  background: #fff;
  border: 1rpx solid #e8ede7;
}
.row.done { border-color: #bcd3c3; background: #f4f8f2; }
.row-head { display: flex; align-items: baseline; gap: 8rpx; margin-bottom: 8rpx; }
.name { font-size: 28rpx; color: #1e3a2f; font-weight: 500; }
.unit-inline {
  flex: 0 0 auto;
  min-width: 30rpx;
  font-size: 24rpx;
  color: #7a8a80;
}
.line-total { margin-left: auto; font-size: 24rpx; color: #4b5b51; }

.portion { display: flex; align-items: center; gap: 12rpx; padding: 6rpx 0; }
.p-label {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: #4b5b51;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
.p-brand {
  color: #1e3a2f;
  font-weight: 500;
}
.p-label.expanded {
  white-space: normal;
  word-break: break-all;
}
.input {
  width: 150rpx;
  height: 60rpx;
  padding: 0 16rpx;
  border-radius: 12rpx;
  background: #f7f9f5;
  border: 1rpx solid #dde5da;
  font-size: 28rpx;
  text-align: right;
}
.check { width: 26rpx; font-size: 28rpx; color: #1e3a2f; text-align: center; }
.add-one {
  width: 44rpx;
  height: 60rpx;
  line-height: 60rpx;
  text-align: center;
  font-size: 30rpx;
  color: #1e3a2f;
}
.add {
  margin-top: 4rpx;
  padding: 8rpx 0 6rpx;
  font-size: 24rpx;
  color: #5f6f64;
}

.autosave { text-align: center; font-size: 24rpx; color: #7a8a80; padding: 6rpx 0; }
.bottom {
  display: flex;
  gap: 16rpx;
  padding: 10rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
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
.btn.ghost { background: #f1f4ee; color: #1e3a2f; }
.btn.primary { background: #1e3a2f; color: #fbfcf7; }
</style>
