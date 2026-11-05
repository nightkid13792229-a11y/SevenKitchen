<template>
  <view class="review-page">
    <view v-if="loading" class="loading">加载中...</view>

    <template v-else-if="loaded && imports.length === 0">
      <view class="empty">
        <text class="empty-title">还没有识别记录</text>
        <text class="empty-desc">回到清单详情，上传订单截图后再来核对。</text>
        <button class="primary-btn" @tap="goBack">返回清单</button>
        <text class="retry-link" @tap="load">重新加载</text>
      </view>
    </template>

    <template v-else>
      <scroll-view scroll-x class="tabs" :show-scrollbar="false">
        <view
          v-for="(item, index) in imports"
          :key="item.id"
          class="tab"
          :class="{ active: index === activeIndex }"
          @tap="selectOrder(index)"
        >
          <text class="tab-channel">{{ item.channel }} · {{ formatShortDate(item.orderTime) }}</text>
          <text class="tab-amount">¥{{ money(item.paid ?? item.subtotal) }}</text>
          <text class="tab-state">{{ tabState(item) }}</text>
        </view>
      </scroll-view>

      <view v-if="activeImport" class="summary">
        <view class="summary-cell">
          <text class="summary-k">凭证金额</text>
          <text class="summary-v">{{ money(activeImport.paid ?? activeImport.subtotal) }}</text>
        </view>
        <view class="summary-cell">
          <text class="summary-k">算采购</text>
          <text class="summary-v">{{ money(activeSummary.matchedAmount) }}</text>
        </view>
        <view class="summary-cell">
          <text class="summary-k">个人</text>
          <text class="summary-v">{{ money(activeSummary.personalAmount) }}</text>
        </view>
        <view class="summary-cell">
          <text class="summary-k">待处理</text>
          <text class="summary-v warn">{{ activeSummary.unmatched + activeSummary.needsSku }} 行</text>
        </view>
      </view>

      <view v-if="activeImport" class="meta-row">
        <text class="meta-text">共 {{ activeImport.lines.length }} 行 · {{ amountStateText(activeImport) }}</text>
        <text class="meta-channel" @tap="changeChannel">渠道 {{ activeImport.channel }} ›</text>
      </view>

      <view v-if="activeImport && activeWarnings.length > 0" class="warn-banner">
        <text v-for="(line, index) in activeWarnings" :key="index" class="warn-line">{{ line }}</text>
      </view>

      <view
        v-if="activeImport && activeWarnings.length > 0"
        class="ack-row"
        @tap="toggleAck"
      >
        <view class="ack-box" :class="{ checked: activeAcked }">
          <text v-if="activeAcked" class="ack-tick">✓</text>
        </view>
        <text class="ack-text">我已对照原图核对过，金额和截图没问题，可以生成</text>
      </view>

      <view v-if="activeImport" class="lines">
        <view
          v-for="line in activeImport.lines"
          :key="line.id"
          class="line"
          @tap="openEdit(line)"
        >
          <view class="line-main">
            <text class="line-name">{{ line.rawName }}</text>
            <text class="line-meta">
              {{ line.qty ?? '-' }}{{ line.unit || '' }} × ¥{{ money(line.unitPrice) }}
              <text v-if="line.editedByUser" class="edited"> · 已改动</text>
            </text>
          </view>
          <text class="line-amount">¥{{ money(line.lineTotal) }}</text>
          <text class="state" :class="stateClass(line)">{{ stateText(line) }}</text>
          <text class="chev">›</text>
        </view>
      </view>

      <view v-if="activeImport" class="diff-note">
        本单含个人采购 ¥{{ money(activeSummary.personalAmount) }}，不会进报销；点任意一行可改数量、金额或原料。
      </view>

      <view class="footer">
        <view class="footer-total">
          <text>将生成 {{ matchedLineCount }} 条采购记录</text>
          <text class="footer-amount">¥{{ money(matchedAmount) }}</text>
        </view>
        <button class="primary-btn" :disabled="!canConfirm || submitting" :loading="submitting" @tap="submit">
          {{ blockReason || '生成采购记录' }}
        </button>
        <text class="discard" @tap="discardActive">放弃这笔识别</text>
      </view>
    </template>

    <!-- 修改一行 -->
    <view v-if="editing" class="sheet-mask" @tap="closeEdit">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">修改「{{ editing.rawName }}」</text>
        <text class="sheet-sub">原图金额 ¥{{ money(editing._origTotal) }}；改动会在审核时和原图对照。</text>

        <view class="field">
          <text class="field-label">数量</text>
          <input v-model="editing.qtyText" type="digit" class="field-input" placeholder="1" />
          <input v-model="editing.unitText" class="field-input unit" placeholder="盒/袋" />
        </view>
        <view class="field">
          <text class="field-label">单价</text>
          <input v-model="editing.priceText" type="digit" class="field-input" placeholder="0.00" />
          <text class="field-label right">小计</text>
          <input v-model="editing.totalText" type="digit" class="field-input" placeholder="0.00" @input="editing.totalTouched = true" />
        </view>

        <view class="field tap" @tap="openIngredientPicker">
          <text class="field-label">匹配原料</text>
          <text class="field-value" :class="{ warn: !editing.ingredientName }">
            {{ editing.ingredientName || '未选择 ›' }}
          </text>
        </view>
        <view class="field tap" @tap="openSkuPicker">
          <text class="field-label">采购商品</text>
          <text class="field-value" :class="{ warn: !editing.skuName }">{{ editing.skuName || '未选择 ›' }}</text>
        </view>
        <view class="field">
          <text class="field-label">净含量/规格</text>
          <text class="field-value">
            {{ editing.skuModel || editing.spec || '—' }}
            <text class="field-hint">（截图：{{ editing.spec || '未读到' }}）</text>
          </text>
        </view>
        <view v-if="canSyncSkuName" class="sync-box">
          <view class="sync-head">
            <text class="sync-title">同步修改采购商品名</text>
            <switch
              :checked="editing.syncSkuName"
              color="#b4453a"
              @change="onSyncSkuNameChange"
            />
          </view>
          <text class="sync-diff">{{ editing.skuName }} → {{ editing.rawName.trim() }}</text>
          <text class="sync-tip">默认不改名。只有打开开关并保存，才会修改商品名并记录改名日志。</text>
        </view>
        <view class="field tap">
          <text class="field-label">算个人采购</text>
          <switch :checked="editing.isPersonal" color="#2f6b4f" @change="onPersonalChange" />
        </view>

        <view class="warn-banner small">
          <text>改完会标记「已改动」；各行金额加起来和截图对不上时，系统会拦住生成。</text>
        </view>

        <view class="sheet-actions">
          <button class="ghost-btn" @tap="closeEdit">取消</button>
          <button class="primary-btn" :loading="saving" @tap="saveEdit">保存</button>
        </view>
      </view>
    </view>

    <!-- 选原料 / 选商品 -->
    <view v-if="pickerMode !== 'none'" class="sheet-mask" @tap="closePicker">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">{{ pickerMode === 'ingredient' ? '选择清单里的原料' : '选择采购商品' }}</text>
        <text class="sheet-sub">
          {{ pickerMode === 'ingredient' ? '只列本次清单里的原料，不允许跨原料替代。' : '没有合适的商品可以新建一个。' }}
        </text>

        <scroll-view scroll-y class="picker-list">
          <template v-if="pickerMode === 'ingredient'">
            <view
              v-for="item in ingredientOptions"
              :key="item.ingredientId"
              class="picker-row"
              @tap="chooseIngredient(item)"
            >
              <view>
                <text class="picker-name">{{ item.ingredientName }}</text>
                <text class="picker-sub">{{ item.skus.length }} 个采购商品</text>
              </view>
              <text class="picker-go">选择</text>
            </view>
            <view class="picker-row" @tap="markPersonal">
              <view>
                <text class="picker-name">不列入本次采购</text>
                <text class="picker-sub">按个人采购处理，不报</text>
              </view>
              <text class="picker-go">标记</text>
            </view>
          </template>
          <template v-else>
            <view v-for="sku in skuOptions" :key="sku.id" class="picker-row" @tap="chooseSku(sku)">
              <view>
                <text class="picker-name">{{ sku.name }}</text>
                <text class="picker-sub">{{ sku.purchaseChannel || '' }} {{ sku.productModel || '' }}</text>
              </view>
              <text class="picker-go">选择</text>
            </view>
            <view class="picker-row" @tap="goNewSku">
              <view>
                <text class="picker-name">＋ 新建采购商品</text>
                <text class="picker-sub">挂到「{{ editing?.ingredientName || '当前原料' }}」下</text>
              </view>
              <text class="picker-go">去新建</text>
            </view>
          </template>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import {
  confirmOrderImports,
  discardOrderImport,
  extractProcurementSkuOptions,
  getOrderImports,
  getPurchaseListDetail,
  updateOrderImport,
  updateOrderImportLine,
} from '../api/purchasing';
import type { OrderImportLineView, OrderImportView } from '../api/purchasing';
import { checkOrderImportAmount } from '../../../utils/order-import-check';

interface IngredientOption {
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  skus: Array<{ id: string; name: string; productModel?: string | null; purchaseChannel?: string | null }>;
}

const listId = ref('');
const loading = ref(true);
const loaded = ref(false);
const submitted = ref(false);
const list = ref<any>(null);
const imports = ref<OrderImportView[]>([]);
const activeIndex = ref(0);
const editing = ref<any>(null);
const pickerMode = ref<'none' | 'ingredient' | 'sku'>('none');
const saving = ref(false);
const submitting = ref(false);
let loadedOnce = false;

const activeImport = computed(() => imports.value[activeIndex.value] || null);
const activeSummary = computed(() => activeImport.value?.summary ?? emptySummary());
/** 已勾选「我已对照原图核对」的识别记录（按 id 记，切 Tab 不丢） */
const ackedImportIds = ref<string[]>([]);
const activeWarnings = computed(() =>
  activeImport.value ? checkImport(activeImport.value).warnings : [],
);
const activeAcked = computed(() =>
  activeImport.value ? ackedImportIds.value.includes(activeImport.value.id) : false,
);
const ingredientOptions = computed<IngredientOption[]>(() => {
  const items = list.value?.items || [];
  const seen = new Set<string>();
  const result: IngredientOption[] = [];
  for (const item of items) {
    const ingredientId = item.ingredientId || item.ingredient?.id;
    if (!ingredientId || seen.has(ingredientId)) continue;
    seen.add(ingredientId);
    result.push({
      ingredientId,
      ingredientName: item.ingredientName || item.ingredient?.name || '原料',
      baseUnit: item.ingredientBaseUnit || item.baseUnit || 'G',
      skus: extractProcurementSkuOptions(item).map((sku) => ({
        id: sku.id as string,
        name: sku.name,
        productModel: sku.productModel,
        purchaseChannel: sku.purchaseChannel,
      })),
    });
  }
  return result;
});
const canSyncSkuName = computed(() => {
  const current = editing.value;
  if (!current) return false;
  return (
    Boolean(current.procurementSkuId) &&
    current.procurementSkuId !== current._origSkuId &&
    Boolean(current.skuName) &&
    Boolean(current.rawName?.trim()) &&
    current.skuName !== current.rawName.trim()
  );
});

const skuOptions = computed(() => {
  if (!editing.value?.ingredientId) return [];
  return (
    ingredientOptions.value.find((item) => item.ingredientId === editing.value.ingredientId)
      ?.skus ?? []
  );
});
const matchedLineCount = computed(() =>
  imports.value.reduce(
    (sum, item) => sum + item.lines.filter((line) => line.state === 'MATCHED').length,
    0,
  ),
);
const matchedAmount = computed(() =>
  imports.value.reduce((sum, item) => sum + item.summary.matchedAmount, 0),
);
const blockReason = computed(() => {
  if (submitted.value) return '已生成，正在返回';
  for (const item of imports.value) {
    const issue = importIssue(item);
    if (issue) {
      const label = `${item.channel}${item.orderTime ? ' ' + formatShortDate(item.orderTime) : ''}`;
      return `${label}：${issue}`;
    }
  }
  // 金额/完整性有提示时，逐单勾选「我已核对」才放行：只要求看一眼，不拦死。
  const unacked = imports.value.find(
    (item) =>
      checkImport(item).warnings.length > 0 &&
      !ackedImportIds.value.includes(item.id),
  );
  if (unacked) return `${unacked.channel}：请勾选「我已核对」`;
  if (matchedLineCount.value === 0) return '还没有可生成的采购记录';
  return '';
});

function checkImport(item: OrderImportView) {
  return checkOrderImportAmount({
    subtotal: item.subtotal ?? null,
    incomplete: item.incomplete,
    incompleteReason: item.incompleteReason ?? null,
    lineTotals: item.lines.map((line) => line.lineTotal ?? null),
  });
}

function amountStateText(item: OrderImportView): string {
  const check = checkImport(item);
  if (check.warnings.length === 0) return '金额一致';
  if (item.incomplete) return '模型说可能没读全';
  if (check.diff === null) return '没读到商品金额';
  return `与商品小计差 ¥${Math.abs(check.diff).toFixed(2)}`;
}

function toggleAck() {
  const current = activeImport.value;
  if (!current) return;
  ackedImportIds.value = activeAcked.value
    ? ackedImportIds.value.filter((id) => id !== current.id)
    : [...ackedImportIds.value, current.id];
}

function importIssue(item: OrderImportView): string | null {
  const active = item.lines.filter((line) => !line.isPersonal);
  const pending = item.summary.unmatched + item.summary.needsSku;
  if (pending > 0) return `还有 ${pending} 行待处理`;
  const badQty = active.filter((line) => !line.qty || line.qty <= 0);
  if (badQty.length > 0) return `${badQty.length} 行缺数量`;
  const badAmount = active.filter(
    (line) => line.lineTotal === null || line.lineTotal === undefined,
  );
  if (badAmount.length > 0) return `${badAmount.length} 行缺金额`;
  return null;
}
const canConfirm = computed(() => blockReason.value === '' && !submitted.value);

onLoad((options: Record<string, string>) => {
  listId.value = String(options?.id || '');
  uni.$on('procurement-sku:created', handleSkuCreated);
  void load().finally(() => {
    loadedOnce = true;
  });
});

onShow(() => {
  if (loadedOnce) void load();
});

onUnload(() => {
  uni.$off('procurement-sku:created', handleSkuCreated);
});

async function load() {
  if (!listId.value) return;
  if (imports.value.length === 0) loading.value = true;
  const settled = await Promise.allSettled([
    getPurchaseListDetail(listId.value),
    getOrderImports(listId.value),
  ]);
  const detailRes = settled[0];
  const importRes = settled[1];
  let failed = false;
  if (detailRes.status === 'fulfilled') {
    const res: any = detailRes.value;
    if (res.code === 0) list.value = res.data;
    else failed = true;
  } else {
    failed = true;
  }
  if (importRes.status === 'fulfilled') {
    const res: any = importRes.value;
    if (res.code === 0) {
      imports.value = (res.data || []).filter((item: any) => item.status === 'DRAFT');
      if (activeIndex.value >= imports.value.length) activeIndex.value = 0;
      loaded.value = true;
    } else {
      failed = true;
    }
  } else {
    failed = true;
  }
  if (failed && imports.value.length === 0) {
    uni.showToast({ title: '加载失败，请重试', icon: 'none' });
  }
  loading.value = false;
}

function handleSkuCreated() {
  void load();
}

function selectOrder(index: number) {
  activeIndex.value = index;
}

function stateText(line: OrderImportLineView) {
  if (line.state === 'MATCHED') return '已匹配';
  if (line.state === 'PERSONAL') return '个人';
  if (line.state === 'NEEDS_SKU') return '选商品';
  return '选原料';
}

function stateClass(line: OrderImportLineView) {
  return line.state.toLowerCase().replace('_', '-');
}

function tabState(item: OrderImportView) {
  const issue = importIssue(item);
  if (!issue) return '可生成';
  return issue.length > 8 ? `${issue.slice(0, 8)}…` : issue;
}

function openEdit(line: OrderImportLineView) {
  const ingredient = ingredientOptions.value.find(
    (item) => item.ingredientId === line.ingredientId,
  );
  const sku = ingredient?.skus.find((item) => item.id === line.procurementSkuId);
  editing.value = {
    ...line,
    qtyText: line.qty === null ? '' : String(line.qty),
    unitText: line.unit || '',
    priceText: line.unitPrice === null ? '' : String(line.unitPrice),
    totalText: line.lineTotal === null ? '' : String(line.lineTotal),
    ingredientName: ingredient?.ingredientName || '',
    skuName: sku?.name || '',
    skuModel: sku?.productModel || '',
    _origSkuId: line.procurementSkuId || '',
    syncSkuName: false,
    _origTotal: line.aiLineTotal ?? line.lineTotal ?? 0,
    _origQty: line.qty,
    _origPrice: line.unitPrice,
    totalTouched: false,
  };
}

function closeEdit() {
  editing.value = null;
  pickerMode.value = 'none';
}

function openIngredientPicker() {
  pickerMode.value = 'ingredient';
}

function openSkuPicker() {
  if (!editing.value?.ingredientId) {
    uni.showToast({ title: '请先选择原料', icon: 'none' });
    return;
  }
  pickerMode.value = 'sku';
}

function closePicker() {
  pickerMode.value = 'none';
}

function chooseIngredient(item: IngredientOption) {
  if (item.ingredientId !== editing.value.ingredientId) {
    editing.value.procurementSkuId = null;
    editing.value.skuName = '';
  }
  editing.value.ingredientId = item.ingredientId;
  editing.value.ingredientName = item.ingredientName;
  editing.value.isPersonal = false;
  pickerMode.value = 'none';
}

function chooseSku(sku: any) {
  editing.value.procurementSkuId = sku.id;
  editing.value.skuName = sku.name;
  editing.value.isPersonal = false;
  editing.value.syncSkuName = false;
  pickerMode.value = 'none';
}

function onSyncSkuNameChange(event: any) {
  editing.value.syncSkuName = Boolean(event?.detail?.value);
}

function onPersonalChange(event: any) {
  const value = Boolean(event?.detail?.value);
  editing.value.isPersonal = value;
  if (value) {
    // 标个人后不会再生成记录，界面上也不该继续显示“匹配到某个商品”。
    editing.value.ingredientId = null;
    editing.value.ingredientName = '';
    editing.value.procurementSkuId = null;
    editing.value.skuName = '';
  }
}

function markPersonal() {
  editing.value.isPersonal = true;
  editing.value.ingredientId = null;
  editing.value.ingredientName = '';
  editing.value.procurementSkuId = null;
  editing.value.skuName = '';
  pickerMode.value = 'none';
}

function goNewSku() {
  const ingredient = ingredientOptions.value.find(
    (item) => item.ingredientId === editing.value?.ingredientId,
  );
  if (!ingredient) {
    uni.showToast({ title: '请先选择原料', icon: 'none' });
    return;
  }
  pickerMode.value = 'none';
  uni.navigateTo({
    url:
      `/pages/staff-purchasing/procurement-sku-create?` +
      `ingredientId=${encodeURIComponent(ingredient.ingredientId)}` +
      `&ingredientName=${encodeURIComponent(ingredient.ingredientName)}` +
      `&baseUnit=${encodeURIComponent(ingredient.baseUnit)}`,
  });
}

async function saveEdit() {
  if (saving.value || !editing.value || !activeImport.value) return;

  if (canSyncSkuName.value && editing.value.syncSkuName) {
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '确认修改商品名？',
        content: `「${editing.value.skuName}」将改名为「${editing.value.rawName.trim()}」，并写入改名记录。`,
        confirmText: '确认改名',
        confirmColor: '#b4453a',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }

  const qty = parseNumber(editing.value.qtyText);
  const price = parseNumber(editing.value.priceText);
  let total = parseNumber(editing.value.totalText);
  if (!editing.value.totalTouched && qty !== null && price !== null) {
    total = Math.round(qty * price * 100) / 100;
  }

  saving.value = true;
  try {
    const res: any = await updateOrderImportLine(
      activeImport.value.id,
      editing.value.id,
      {
        qty,
        unit: editing.value.unitText || null,
        unitPrice: price,
        lineTotal: total,
        ingredientId: editing.value.isPersonal ? null : editing.value.ingredientId || null,
        procurementSkuId: editing.value.isPersonal
          ? null
          : editing.value.procurementSkuId || null,
        isPersonal: editing.value.isPersonal,
        syncSkuName: canSyncSkuName.value && editing.value.syncSkuName === true,
      },
    );
    if (res.code !== 0) throw new Error(res.message || '保存失败');
    if (res.data?.renamedTo) {
      uni.showToast({ title: '已同步商品名', icon: 'none' });
    }
    closeEdit();
    await load();
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
}

async function changeChannel() {
  if (!activeImport.value) return;
  const channels = ['山姆', '盒马', '沃尔玛', '其他'];
  uni.showActionSheet({
    itemList: channels,
    success: async (res) => {
      const channel = channels[res.tapIndex];
      try {
        await updateOrderImport(activeImport.value!.id, { channel });
        await load();
      } catch (error: any) {
        uni.showToast({ title: error?.message || '修改失败', icon: 'none' });
      }
    },
  });
}

async function discardActive() {
  if (!activeImport.value) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '放弃这笔识别？',
      content: '放弃后草稿会被删除，可以重新上传同一张截图。',
      confirmText: '放弃',
      success: (res) => resolve(Boolean(res.confirm)),
    });
  });
  if (!confirmed) return;
  try {
    await discardOrderImport(activeImport.value.id);
    await load();
    if (imports.value.length === 0) goBack();
  } catch (error: any) {
    uni.showToast({ title: error?.message || '操作失败', icon: 'none' });
  }
}

watch(
  () => [editing.value?.qtyText, editing.value?.priceText],
  () => {
    const current = editing.value;
    if (!current || current.totalTouched) return;
    const qty = parseNumber(current.qtyText);
    const price = parseNumber(current.priceText);
    // 刚打开时 qty/price 等于原值，不要在这里重算，否则“原图金额”会被悄悄改掉。
    if (qty === current._origQty && price === current._origPrice) return;
    if (qty !== null && price !== null) {
      current.totalText = String(Math.round(qty * price * 100) / 100);
    }
  },
);

async function submit() {
  if (!canConfirm.value || submitting.value) return;
  const ids = imports.value.filter((item) => item.status === 'DRAFT').map((item) => item.id);
  if (ids.length === 0) return;

  submitting.value = true;
  try {
    const res: any = await confirmOrderImports(ids);
    if (res.code !== 0) throw new Error(res.message || '生成失败');
    submitted.value = true;
    uni.showToast({ title: `已生成 ${res.data?.createdCount ?? ''} 条记录`, icon: 'success' });
    setTimeout(() => uni.navigateBack(), 700);
  } catch (error: any) {
    // 失败才解锁；成功时保持锁定，避免返回动画期间重复提交。
    submitting.value = false;
    uni.showModal({
      title: '生成失败',
      content: error?.message || '请检查后重试',
      showCancel: false,
    });
  }
}

function goBack() {
  uni.navigateBack();
}

function parseNumber(value: string): number | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '0.00';
  }
  return Number(value).toFixed(2);
}

function formatShortDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function emptySummary() {
  return {
    total: 0,
    matched: 0,
    personal: 0,
    unmatched: 0,
    needsSku: 0,
    matchedAmount: 0,
    personalAmount: 0,
  };
}
</script>

<style scoped lang="scss">
.review-page {
  min-height: 100vh;
  background: #f3eddd;
  padding: 20rpx 24rpx 260rpx;
  box-sizing: border-box;
}

.loading,
.empty {
  text-align: center;
  color: #6b6653;
  padding-top: 120rpx;
}

.empty-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.retry-link {
  display: block;
  margin-top: 24rpx;
  font-size: 22rpx;
  color: #7a5c28;
  text-decoration: underline;
}

.empty-desc {
  display: block;
  margin: 12rpx 0 32rpx;
  font-size: 24rpx;
  color: #6b6653;
}

.tabs {
  white-space: nowrap;
  margin-bottom: 16rpx;
}

.tab {
  display: inline-flex;
  flex-direction: column;
  gap: 4rpx;
  width: 260rpx;
  padding: 16rpx 18rpx;
  margin-right: 14rpx;
  border-radius: 20rpx;
  background: #fbfcf7;
  border: 2rpx solid #e2dcc9;
  box-sizing: border-box;
}

.tab.active {
  border-color: #1e3a2f;
  box-shadow: inset 0 0 0 2rpx #1e3a2f;
}

.tab-channel {
  font-size: 20rpx;
  color: #6b6653;
}

.tab-amount {
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.tab-state {
  font-size: 20rpx;
  color: #2f6b4f;
}

.summary {
  display: flex;
  background: #1e3a2f;
  border-radius: 24rpx;
  padding: 18rpx 10rpx;
  margin-bottom: 12rpx;
}

.summary-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.summary-k {
  font-size: 19rpx;
  color: #c9cfc0;
}

.summary-v {
  font-size: 28rpx;
  font-weight: 700;
  color: #f7f4e9;
}

.summary-v.warn {
  color: #f0c88a;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4rpx 6rpx 12rpx;
}

.meta-text {
  font-size: 21rpx;
  color: #6b6653;
}

.meta-channel {
  font-size: 22rpx;
  color: #7a5c28;
  font-weight: 600;
}

.warn-banner {
  background: #fbf1dd;
  border: 1rpx solid #efdcb8;
  border-radius: 16rpx;
  padding: 14rpx 16rpx;
  font-size: 21rpx;
  color: #7a5a20;
  line-height: 1.5;
  margin-bottom: 12rpx;
}

.warn-banner.small {
  font-size: 19rpx;
  margin: 12rpx 0 0;
}

.warn-line {
  display: block;
}

.warn-line + .warn-line {
  margin-top: 6rpx;
}

.ack-row {
  display: flex;
  align-items: flex-start;
  padding: 2rpx 6rpx 14rpx;
}

.ack-box {
  width: 32rpx;
  height: 32rpx;
  flex: 0 0 32rpx;
  border-radius: 8rpx;
  border: 2rpx solid #c9bda0;
  background: #fffdf7;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 2rpx 12rpx 0 0;
}

.ack-box.checked {
  background: #1e3a2f;
  border-color: #1e3a2f;
}

.ack-tick {
  font-size: 20rpx;
  line-height: 1;
  color: #f7f4e9;
}

.ack-text {
  flex: 1;
  font-size: 21rpx;
  line-height: 1.5;
  color: #4a4638;
}

.lines {
  background: #fbfcf7;
  border: 1rpx solid #e2dcc9;
  border-radius: 24rpx;
  padding: 4rpx 20rpx;
}

.line {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #efe9d9;
}

.line:last-child {
  border-bottom: none;
}

.line-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.line-name {
  font-size: 25rpx;
  color: #26261f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-meta {
  font-size: 20rpx;
  color: #6b6653;
}

.edited {
  color: #a8742a;
}

.line-amount {
  font-size: 24rpx;
  color: #26261f;
  min-width: 96rpx;
  text-align: right;
}

.state {
  font-size: 19rpx;
  padding: 4rpx 10rpx;
  border-radius: 8rpx;
  white-space: nowrap;
}

.state.matched {
  background: #e8f0e6;
  color: #2f6b4f;
}

.state.personal {
  background: #f0f0ea;
  color: #7b7663;
}

.state.unmatched {
  background: #f8e9e6;
  color: #b4453a;
}

.state.needs-sku {
  background: #fbf1dd;
  color: #a8742a;
}

.chev {
  color: #b9b2a0;
  font-size: 26rpx;
}

.diff-note {
  margin-top: 14rpx;
  padding: 14rpx 16rpx;
  background: #fbf1dd;
  border: 1rpx solid #efdcb8;
  border-radius: 16rpx;
  font-size: 21rpx;
  color: #7a5a20;
  line-height: 1.5;
}

.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: linear-gradient(to top, #f3eddd 75%, rgba(243, 237, 221, 0));
}

.footer-total {
  display: flex;
  justify-content: space-between;
  font-size: 22rpx;
  color: #6b6653;
  padding: 0 6rpx 10rpx;
}

.footer-amount {
  font-weight: 700;
  color: #26261f;
}

.primary-btn {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 22rpx;
  background: #1e3a2f;
  color: #f7f4e9;
  font-size: 28rpx;
  font-weight: 600;
}

.primary-btn[disabled] {
  background: #d9d4c4;
  color: #8d8877;
}

.discard {
  display: block;
  text-align: center;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #b4453a;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(23, 48, 38, 0.4);
  z-index: 20;
  display: flex;
  align-items: flex-end;
}

.sheet {
  width: 100%;
  background: #f3eddd;
  border-radius: 28rpx 28rpx 0 0;
  padding: 24rpx 24rpx calc(28rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.sheet-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.sheet-sub {
  font-size: 21rpx;
  color: #6b6653;
  line-height: 1.5;
}

.field {
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: #fbfcf7;
  border: 1rpx solid #e2dcc9;
  border-radius: 16rpx;
  padding: 14rpx 18rpx;
}

.field.tap {
  justify-content: space-between;
}

.field-label {
  font-size: 22rpx;
  color: #6b6653;
  white-space: nowrap;
}

.field-label.right {
  margin-left: auto;
}

.field-input {
  flex: 1;
  font-size: 26rpx;
  color: #26261f;
  text-align: right;
}

.field-input.unit {
  flex: 0 0 120rpx;
}

.sync-box {
  margin-top: 20rpx;
  padding: 20rpx;
  border-radius: 12rpx;
  background: #fbf3ef;
  border: 1rpx solid #e6c9c2;
}

.sync-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.sync-title {
  font-size: 24rpx;
  font-weight: 600;
  color: #8a3d33;
}

.sync-diff {
  display: block;
  margin-top: 10rpx;
  font-size: 21rpx;
  color: #6b6653;
  line-height: 1.5;
  word-break: break-all;
}

.sync-tip {
  display: block;
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #8a8574;
  line-height: 1.5;
}

.field-hint {
  font-size: 20rpx;
  color: #8a8574;
}

.field-value {
  font-size: 24rpx;
  color: #1e3a2f;
  font-weight: 600;
}

.field-value.warn {
  color: #b4453a;
}

.sheet-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 6rpx;
}

.ghost-btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 20rpx;
  background: transparent;
  border: 1rpx solid #e2dcc9;
  color: #1e3a2f;
  font-size: 26rpx;
}

.sheet-actions .primary-btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 26rpx;
}

.picker-list {
  max-height: 52vh;
}

.picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 4rpx;
  border-bottom: 1rpx solid #efe9d9;
}

.picker-name {
  display: block;
  font-size: 25rpx;
  color: #26261f;
}

.picker-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 19rpx;
  color: #6b6653;
}

.picker-go {
  font-size: 22rpx;
  color: #7a5c28;
  font-weight: 600;
}
</style>
