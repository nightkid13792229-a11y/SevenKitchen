<template>
  <view class="review-page">
    <view v-if="loading" class="loading">加载中...</view>

    <template v-else-if="loaded && imports.length === 0">
      <view class="empty">
        <text class="empty-title">还没有识别记录</text>
        <text class="empty-desc">{{ orderShotHint }}</text>
        <button class="primary-btn empty-btn" :loading="importing" @tap="pickMore">
          选择订单截图
        </button>
        <text class="retry-link" @tap="load">重新加载</text>
      </view>
    </template>

    <template v-else>
      <view class="tabs-row">
        <scroll-view scroll-x class="tabs" :show-scrollbar="false">
          <view
            v-for="(item, index) in imports"
            :key="item.id"
            class="tab"
            :class="{ active: index === activeIndex }"
            @tap="selectOrder(index)"
          >
            <view class="tab-main">
              <text class="tab-channel" :class="{ missing: !item.channel }">
                {{ item.channel || '渠道待确认' }} · {{ formatShortDate(item.orderTime) }}
              </text>
              <text class="tab-amount">¥{{ money(item.paid ?? item.subtotal) }}</text>
              <text class="tab-state">{{ tabState(item) }}</text>
            </view>
            <image
              v-if="item.imageUrls && item.imageUrls.length > 0"
              class="tab-thumb"
              :src="item.imageUrls[0]"
              mode="aspectFill"
              @tap.stop="previewOriginal(item)"
            />
          </view>
        </scroll-view>

        <!-- 再传一笔：钉在订单卡片这一行的最右边，卡片横向滚动时它不动 -->
        <view
          class="side-add"
          :class="{ busy: importing }"
          hover-class="side-add-hover"
          :hover-stay-time="80"
          @tap="pickMore"
        >
          <text class="side-add-plus">{{ importing ? '…' : '＋' }}</text>
        </view>
      </view>

      <view v-if="activeImport" class="summary">
        <view class="summary-cell">
          <text class="summary-k">凭证金额</text>
          <text class="summary-v" :class="{ warn: activeImport.paid === null }">{{ activeImport.paid === null ? '未读到' : money(activeImport.paid) }}</text>
        </view>
        <view class="summary-cell">
          <text class="summary-k">核对金额</text>
          <text class="summary-v">{{ money(reconcileAmount) }}</text>
        </view>
        <view class="summary-cell">
          <text class="summary-k">个人采购</text>
          <text class="summary-v">{{ money(activeSummary.personalAmount) }}</text>
        </view>
        <view class="summary-cell">
          <text class="summary-k">待处理</text>
          <text v-if="activeImport && !activeImport.channel" class="summary-v warn">先定渠道</text>
          <text v-else class="summary-v warn">{{ activeSummary.unmatched + activeSummary.needsSku }} 行</text>
        </view>
        <view class="summary-cell">
          <text class="summary-k">差额</text>
          <text class="summary-v" :class="{ warn: feeGapWarn }">{{ feeGapText }}</text>
        </view>
      </view>

      <view v-if="activeImport" class="meta-row">
        <text class="meta-text">共 {{ activeImport.lines.length }} 行 · {{ amountStateText }}</text>
        <text class="meta-channel" :class="{ missing: !activeImport.channel }" @tap="changeChannel">
          {{ activeImport.channel ? '渠道 ' + activeImport.channel : '渠道待确认' }} ›
        </text>
      </view>

      <!--
        渠道是商品匹配的门禁：渠道没确认之前，先别让员工一行行去选商品。
        2026-11-05：AI 认不出渠道时不再落「其他」，而是留空并在这里先问一句。
      -->
      <view v-if="activeImport && !activeImport.channel" class="channel-gate">
        <text class="channel-gate-title">这笔订单还没确认渠道</text>
        <text class="channel-gate-desc">
          商品是按渠道匹配的。先选一下在哪买的，系统会把还没动过的行自动重新匹配一遍。
        </text>
        <button class="channel-gate-btn" @tap="changeChannel">选在哪买的</button>
        <text v-if="activeImport.aiChannelGuess" class="channel-gate-hint">
          模型看截图写的是「{{ activeImport.aiChannelGuess }}」，但渠道清单里没有这一项。
        </text>
        <text class="channel-gate-hint">清单里没有你要的渠道？让管理员在后台「平台选项 → 采购渠道」里加。</text>
      </view>

      <view v-if="activeImport && activeIncompleteNotice" class="warn-banner">
        <text class="warn-line">{{ activeIncompleteNotice }}</text>
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
            <text v-if="lineSpecNotice(line)" class="line-spec-warn">
              {{ lineSpecNotice(line) }}
            </text>
          </view>
          <text class="line-amount">¥{{ money(line.lineTotal) }}</text>
          <text class="state" :class="stateClass(line)">{{ stateText(line) }}</text>
          <text class="chev">›</text>
        </view>
      </view>

      <!-- 费用：商品小计 + 运费 + 包装费 = 实付（运费/包装费可人工修正） -->
      <view v-if="feeSummary" class="fees">
        <view class="fees-head">
          <text class="fees-title">费用</text>
          <text class="fees-action" @tap="openFeeEdit">
            {{ feesEdited ? '已修改 · 再改 ›' : '改运费 / 包装费 ›' }}
          </text>
        </view>
        <view class="fee-row">
          <text class="fee-k">商品小计（{{ activeImport?.lines.length ?? 0 }} 行）</text>
          <text class="fee-v">¥{{ money(feeSummary.lineSum) }}</text>
        </view>
        <view class="fee-row tap" @tap="openFeeEdit">
          <text class="fee-k">运费</text>
          <text v-if="feeSummary.shipping === null" class="fee-v missing">未读到 · 补填 ›</text>
          <text v-else class="fee-v">¥{{ money(feeSummary.shipping) }}</text>
        </view>
        <view class="fee-row tap" @tap="openFeeEdit">
          <text class="fee-k">包装费</text>
          <text v-if="feeSummary.packaging === null" class="fee-v missing">未读到 · 补填 ›</text>
          <text v-else class="fee-v">¥{{ money(feeSummary.packaging) }}</text>
        </view>
        <view class="fee-row total">
          <text class="fee-k">{{ activeImport?.paid === null ? '实付（未读到）' : '实付' }}</text>
          <text v-if="activeImport?.paid === null || activeImport?.paid === undefined" class="fee-v missing">
            未读到
          </text>
          <text v-else class="fee-v">¥{{ money(activeImport.paid) }}</text>
        </view>
        <text v-if="feesEdited" class="fee-origin">{{ feeOriginText }}</text>
        <!-- 只有要员工动手时才出现（缺运费/包装费、实付没读到、对不上）；对得上就不占地方 -->
        <view v-if="feeCheckWarn" class="fee-check">
          <text>{{ feeCheckText }}</text>
        </view>
      </view>

      <view class="footer">
        <view class="footer-total">
          <text class="footer-label">{{ footerLabel }}</text>
          <text class="footer-amount">¥{{ money(matchedAmount) }}</text>
        </view>
        <button class="primary-btn" :disabled="!canConfirm || submitting" :loading="submitting" @tap="submit">
          {{ blockReason || '生成采购记录' }}
        </button>
        <view class="footer-links">
          <text class="discard" @tap="discardActive">放弃这笔识别</text>
        </view>
      </view>
    </template>

    <!-- 修改一行（2026-11-05 改版：名字可改、数量单价并排、小计只核对） -->
    <view v-if="editing" class="sheet-mask" @tap="closeEdit()">
      <scroll-view scroll-y class="sheet-scroll" @tap.stop>
        <view class="sheet sheet-inner">
          <view class="sheet-grab"></view>

          <view class="sheet-head">
            <view class="name-wrap">
              <input
                v-model="editing.rawName"
                class="name-input"
                maxlength="80"
                placeholder="商品名"
                confirm-type="done"
              />
              <text class="name-pen">✎</text>
            </view>
            <view class="personal-box">
              <text class="personal-label">个人采购</text>
              <switch
                class="personal-switch"
                :checked="editing.isPersonal"
                color="#2f6b4f"
                @change="onPersonalChange"
              />
            </view>
          </view>

          <view class="field tap sku-row" @tap="openSkuPicker">
            <text class="field-label">匹配商品</text>
            <text class="field-value" :class="{ warn: !editing.skuName }">
              {{ editing.skuName || (editing.isPersonal ? '个人采购不用匹配' : '还没有匹配') }}
              <text v-if="editing.skuModel" class="field-sub"> · {{ editing.skuModel }}</text>
            </text>
            <text v-if="!editing.isPersonal" class="chev">›</text>
          </view>

          <view v-if="editingSpecWarning" class="spec-warn-box">
            <text class="spec-warn-text">{{ editingSpecWarning }}</text>
            <text class="spec-warn-action" @tap="goNewSku">新建这个规格 ›</text>
          </view>
          <text v-if="renameHint" class="rename-hint">{{ renameHint }}</text>

          <view class="amount-card">
            <view class="amount-grid">
              <view class="amount-cell">
                <text class="amount-label">数量</text>
                <view class="stepper">
                  <view class="step-btn" hover-class="step-btn-hover" @tap="stepQty(-1)">−</view>
                  <input
                    v-model="editing.qtyText"
                    type="digit"
                    class="step-input"
                    placeholder="1"
                  />
                  <view class="step-btn" hover-class="step-btn-hover" @tap="stepQty(1)">+</view>
                  <text class="unit-chip" @tap="pickUnit">{{ editing.unitText || '件' }} ▾</text>
                </view>
              </view>
              <view class="amount-cell">
                <text class="amount-label">单价</text>
                <view class="price-line">
                  <text class="price-symbol">¥</text>
                  <input
                    v-model="editing.priceText"
                    type="digit"
                    class="price-input"
                    placeholder="0.00"
                  />
                </view>
              </view>
            </view>
            <view class="check-line" :class="{ bad: totalMismatch }">
              <text class="check-text">{{ checkText }}</text>
              <text v-if="totalMismatch" class="check-fix" @tap="alignToReceipt">按截图反算 ›</text>
              <text v-else-if="gramsText" class="check-grams">{{ gramsText }}</text>
            </view>
          </view>

          <view class="sheet-actions">
            <button class="ghost-btn" @tap="closeEdit()">取消</button>
            <button class="primary-btn" :loading="saving" @tap="saveEdit">保存</button>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 改运费 / 包装费 -->
    <view v-if="feeEditing" class="sheet-mask" @tap="closeFeeEdit">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">运费 / 包装费</text>
        <text class="sheet-sub">{{ feeOriginText }}。读错了可以直接改，留空按没读到处理。</text>

        <view class="field">
          <text class="field-label">运费</text>
          <input
            v-model="feeEditing.shippingText"
            type="digit"
            class="field-input"
            placeholder="0.00"
          />
        </view>
        <view class="field">
          <text class="field-label">包装费</text>
          <input
            v-model="feeEditing.packagingText"
            type="digit"
            class="field-input"
            placeholder="0.00"
          />
        </view>

        <text class="fee-gap-line">{{ feeEditPreview }}</text>

        <view class="warn-banner small">
          <text>这两项按整笔订单算，不摊到商品行，也不和个人采购分摊；全额算进这次采购。</text>
        </view>

        <view class="sheet-actions">
          <button class="ghost-btn" @tap="closeFeeEdit">取消</button>
          <button class="primary-btn" :loading="feeSaving" @tap="saveFeeEdit">保存</button>
        </view>
      </view>
    </view>

    <!-- 选渠道（唯一来源：平台选项字典 purchase_channel） -->
    <view v-if="channelPicking" class="sheet-mask" @tap="closeChannelPicker">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">这笔是在哪买的？</text>
        <text class="sheet-sub">渠道决定自动匹配哪一家的采购商品；清单由管理员在后台维护。</text>
        <scroll-view scroll-y class="picker-list">
          <view
            v-for="channel in channelOptions"
            :key="channel"
            class="picker-row"
            @tap="chooseChannel(channel)"
          >
            <text class="picker-name">{{ channel }}</text>
            <text v-if="activeImport && activeImport.channel === channel" class="picker-go">当前</text>
          </view>
          <view v-if="channelOptions.length === 0" class="picker-row">
            <text class="picker-sub">渠道清单没加载出来，请检查网络后重试</text>
          </view>
        </scroll-view>
        <text v-if="channelOptions.length > 0" class="channel-tip">
          清单里没有？让管理员在后台「平台选项 → 采购渠道」里加一项。
        </text>
      </view>
    </view>

    <!-- 选商品：一次到位（商品 + 规格 + 属于哪个原料都在这行里） -->
    <view v-if="pickerMode !== 'none'" class="sheet-mask" @tap="closePicker">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">选择采购商品</text>
        <text class="sheet-sub">只列本次清单里的商品，不允许跨原料替代。</text>

        <scroll-view scroll-y class="picker-list">
          <view
            v-for="option in skuPickerOptions"
            :key="option.id"
            class="picker-row"
            @tap="chooseSku(option)"
          >
            <view class="picker-main">
              <text class="picker-name">
                {{ option.name }}
                <text v-if="option.productModel" class="picker-model"> {{ option.productModel }}</text>
              </text>
              <text class="picker-sub">
                {{ option.ingredientName }}<text v-if="option.purchaseChannel"> · {{ option.purchaseChannel }}</text>
              </text>
            </view>
            <text v-if="option.id === editing?.procurementSkuId" class="picker-current">当前</text>
            <text v-else class="picker-go">选择</text>
          </view>
          <view v-if="skuPickerOptions.length === 0" class="picker-row">
            <text class="picker-sub">本次清单里还没有可用的采购商品</text>
          </view>
          <view v-if="editing?.ingredientId" class="picker-create" @tap="goNewSku">
            <view class="picker-create-main">
              <text class="picker-create-plus">+</text>
              <text class="picker-create-name">新建采购商品</text>
            </view>
            <text class="picker-create-go">去新建 ›</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import {
  confirmOrderImports,
  discardOrderImport,
  extractProcurementSkuOptions,
  getOrderImports,
  getPurchaseChannels,
  getPurchaseListDetail,
  updateOrderImport,
  updateOrderImportLine,
} from '../api/purchasing';
import type { OrderImportLineView, OrderImportView } from '../api/purchasing';
import {
  ORDER_SHOT_HINT,
  chooseOrderShots,
  importOrderShots,
} from './import-flow';
import { orderImportIncompleteNotice } from '../../../utils/order-import-check';
import { sortPurchaseItemsForDisplay } from '../food-category-order';
import { firstBlockedImport } from '../../../utils/order-import-block';
import { isSpecMismatch, specWarningText } from '../../../utils/order-import-spec';
import {
  IMPORT_FEE_TOLERANCE,
  feeStatusText,
  isFeeGapOff,
  summarizeOrderImportFees,
} from '../../../utils/order-import-fees';

interface IngredientOption {
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  skus: Array<{
    id: string;
    name: string;
    productModel?: string | null;
    purchaseChannel?: string | null;
    purchaseToBaseRatio?: number | null;
  }>;
}

const listId = ref('');
const loading = ref(true);
const loaded = ref(false);
const submitted = ref(false);
const list = ref<any>(null);
const imports = ref<OrderImportView[]>([]);
const activeIndex = ref(0);
const editing = ref<any>(null);
const pickerMode = ref<'none' | 'sku'>('none');
/** 渠道清单：唯一来源是后台字典 purchase_channel，页面不写死 */
const channelOptions = ref<string[]>([]);
const channelPicking = ref(false);
const saving = ref(false);
const submitting = ref(false);
const feeEditing = ref<{ shippingText: string; packagingText: string } | null>(null);
const feeSaving = ref(false);
const importing = ref(false);
const orderShotHint = ORDER_SHOT_HINT;
let loadedOnce = false;
/** 从详情页刚识别完进来时，直接落到最新那笔 */
let focusLastOnce = false;

const activeImport = computed(() => imports.value[activeIndex.value] || null);
const activeSummary = computed(() => activeImport.value?.summary ?? emptySummary());
/** 只有模型说「可能没读全」才单独提示 */
const activeIncompleteNotice = computed(() =>
  activeImport.value
    ? orderImportIncompleteNotice({
        incomplete: activeImport.value.incomplete,
        incompleteReason: activeImport.value.incompleteReason ?? null,
      })
    : null,
);

/**
 * 费用区：商品小计 + 运费 + 包装费 = 实付。
 * 运费/包装费是订单级的，不摊到商品行、不和个人采购分摊（业务规则 R6/R10）。
 * 只有读到了「实付」才算差额；没读到就不猜，交给员工对照原图。
 */
const feeSummary = computed(() => {
  const item = activeImport.value;
  if (!item) return null;
  return summarizeOrderImportFees({
    lineTotals: item.lines.map((line) => line.lineTotal ?? null),
    shippingFee: item.shippingFee ?? null,
    packagingFee: item.packagingFee ?? null,
    paid: item.paid ?? null,
  });
});

/**
 * 顶部「核对金额」：商品行合计 + 运费 + 包装费（费用卡的合计），
 * 只用来和「凭证金额」对账。它包含个人采购——个人采购单独提示不报销。
 * 采购记录金额不含运费/包装，在底部单独展示，两个口径不要混。
 */
const reconcileAmount = computed(() => feeSummary.value?.expected ?? 0);

/** 运费/包装费被员工改过：和模型当初读到的不一样 */
const feesEdited = computed(() => {
  const item = activeImport.value;
  if (!item) return false;
  return (
    !sameAmount(item.shippingFee, item.aiShippingFee) ||
    !sameAmount(item.packagingFee, item.aiPackagingFee)
  );
});

const feeGapWarn = computed(() => isFeeGapOff(feeSummary.value?.gap ?? null));

const feeGapText = computed(() => {
  const gap = feeSummary.value?.gap;
  if (typeof gap !== 'number') return '—';
  if (Math.abs(gap) <= IMPORT_FEE_TOLERANCE) return '0.00';
  return `${gap > 0 ? '+' : '-'}${Math.abs(gap).toFixed(2)}`;
});

/** 「模型读到：运费 ¥2.00、包装费 未读到」——改过之后也要能看到原值 */
const feeOriginText = computed(() => {
  const item = activeImport.value;
  if (!item) return '';
  const shipping =
    item.aiShippingFee === null || item.aiShippingFee === undefined
      ? '未读到'
      : `¥${money(item.aiShippingFee)}`;
  const packaging =
    item.aiPackagingFee === null || item.aiPackagingFee === undefined
      ? '未读到'
      : `¥${money(item.aiPackagingFee)}`;
  return `模型读到：运费 ${shipping}、包装费 ${packaging}`;
});

/**
 * 费用区那句「合计说明」要不要出现（2026-11-05 改）。
 *
 * 只在**需要员工动手**时出现：运费/包装费没读到、实付没读到、或者合计和实付对不上。
 * 对得上的时候一个字都不说——顶部「差额 0.00」已经把话说完了，
 * 再挂一行绿底「和实付对得上」只是占地方。
 */
const feeCheckWarn = computed(() => {
  const summary = feeSummary.value;
  if (!summary) return false;
  if (summary.hasMissingFee) return true;
  if (typeof summary.gap !== 'number') return true;
  return Math.abs(summary.gap) > IMPORT_FEE_TOLERANCE;
});

const feeCheckText = computed(() => {
  const item = activeImport.value;
  const summary = feeSummary.value;
  if (!item || !summary) return '';
  if (!feeCheckWarn.value) return '';
  const hasMissing = summary.hasMissingFee;
  const equation =
    `商品 ¥${money(summary.lineSum)} + 运费 ¥${money(summary.shipping)} + ` +
    `包装费 ¥${money(summary.packaging)} = ¥${money(summary.expected)}`;

  if (summary.gap === null) {
    return hasMissing
      ? `运费或包装费还没填（先按 0 算），实付也没读到，请对照原图补全。`
      : `${equation}；这笔的实付没读到，暂时只能按商品金额核对。`;
  }
  const diff = Math.abs(summary.gap).toFixed(2);
  if (hasMissing) {
    if (summary.gap === 0) {
      return `运费或包装费还没填（先按 0 算）：${equation}，实付刚好等于这个数；确认一下是不是本来就没有。`;
    }
    return summary.gap > 0
      ? `运费或包装费还没填（先按 0 算）：${equation}，实付还多 ¥${diff}，点上面两行补一下就平了。`
      : `运费或包装费还没填（先按 0 算）：${equation}，实付比它还少 ¥${diff}，请对照原图核对。`;
  }
  return summary.gap > 0
    ? `${equation}，实付 ¥${money(item.paid)} 比它多 ¥${diff}；可能有服务费或没读到的费用，请对照原图确认。`
    : `${equation}，实付 ¥${money(item.paid)} 比它少 ¥${diff}，请对照原图核对。`;
});

/** 改费用时的实时预览：一眼看到改完还差多少 */
const feeEditPreview = computed(() => {
  const summary = feeSummary.value;
  const form = feeEditing.value;
  const item = activeImport.value;
  if (!summary || !form || !item) return '';
  const shipping = parseNumber(form.shippingText);
  const packaging = parseNumber(form.packagingText);
  const expected = round2(summary.lineSum + (shipping ?? 0) + (packaging ?? 0));
  if (item.paid === null) {
    return `合计 ¥${money(expected)}（实付没读到，先按这个数核对）`;
  }
  const gap = round2(item.paid - expected);
  if (Math.abs(gap) <= IMPORT_FEE_TOLERANCE) {
    return `合计 ¥${money(expected)}，和实付 ¥${money(item.paid)} 一致`;
  }
  return `合计 ¥${money(expected)}，和实付 ¥${money(item.paid)} 差 ¥${Math.abs(gap).toFixed(2)}`;
});
const ingredientOptions = computed<IngredientOption[]>(() => {
  // 「匹配原料」抽屉列的是本次清单里的原料，顺序跟采购详情页一致：
  // 食材（按 CFCT 分类）→ 补剂 → 包装材料（2026-11-05 定）
  const items = sortPurchaseItemsForDisplay(list.value?.items || []);
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
        purchaseToBaseRatio:
          typeof sku.purchaseToBaseRatio === 'number' ? sku.purchaseToBaseRatio : null,
      })),
    });
  }
  return result;
});
/**
 * 选商品：一次到位（2026-11-05）。
 * 以前是「先选原料、再选商品」两层，两个抽屉点下来还常看到「菠菜 / 菠菜」两行；
 * 现在直接把清单里的商品平铺出来，一行里带齐 商品名 + 规格 + 属于哪个原料。
 */
const skuPickerOptions = computed(() =>
  ingredientOptions.value.flatMap((ingredient) =>
    ingredient.skus.map((sku) => ({
      ...sku,
      ingredientId: ingredient.ingredientId,
      ingredientName: ingredient.ingredientName,
      baseUnit: ingredient.baseUnit,
    })),
  ),
);


/** 截图上的小计（模型当时读到的；员工改数量单价不会动它） */
const receiptTotal = computed<number | null>(() => {
  const value = editing.value?._origTotal;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
});

/** 数量 × 单价：保存时用的就是它，不再让人手填小计 */
const editingTotal = computed<number | null>(() => {
  const qty = parseNumber(editing.value?.qtyText);
  const price = parseNumber(editing.value?.priceText);
  if (qty === null || price === null) return null;
  return Math.round(qty * price * 100) / 100;
});

const totalMismatch = computed(() => {
  const total = editingTotal.value;
  const receipt = receiptTotal.value;
  if (total === null || receipt === null) return false;
  return Math.abs(total - receipt) > IMPORT_FEE_TOLERANCE;
});

/**
 * 卡片底下那一行对账（2026-11-05 老板要求写清楚「比的是小计」）：
 *   一致 → 「小计 ¥99.80 · 与截图小计一致」
 *   不一致 → 「小计 ¥94.80 · 截图 ¥99.80，差 ¥5.00」
 */
const checkText = computed(() => {
  const total = editingTotal.value;
  if (total === null) return '填上数量和单价，这里自动核对小计';
  const receipt = receiptTotal.value;
  if (receipt === null) return `小计 ¥${money(total)}`;
  if (!totalMismatch.value) return `✓ 小计 ¥${money(total)} · 与截图小计一致`;
  const gap = Math.abs(round2(total - receipt));
  return `小计 ¥${money(total)} · 截图 ¥${money(receipt)}，差 ¥${money(gap)}`;
});

/** 「约 900g · 折合 ¥110.89/kg」：规格那一行删掉以后，靠它看克数有没有算错 */
const gramsText = computed(() => {
  const current = editing.value;
  if (!current || current.isPersonal) return '';
  const qty = parseNumber(current.qtyText);
  const ratio = Number(current.skuRatio);
  if (qty === null || !Number.isFinite(ratio) || ratio <= 0) return '';
  const base = round2(qty * ratio);
  const unit = String(current.baseUnit || 'G').toUpperCase() === 'ML' ? 'ml' : 'g';
  const total = editingTotal.value;
  if (total === null) return `≈ ${base}${unit}`;
  const per = round2(total / (base / 1000));
  return `≈ ${base}${unit} · 折合 ¥${money(per)}/${unit === 'ml' ? 'L' : 'kg'}`;
});

/**
 * 名字对不上时提前说清楚会发生什么（2026-11-05）：
 * 只有「认出来的」行才会在生成时同步商品名，靠原料推的行不动。
 * 这里的判断和后端一致（HIGH / 人工选过）；重名保护在生成时才查。
 */
const renameHint = computed(() => {
  const current = editing.value;
  if (!current || current.isPersonal) return '';
  if (!current.procurementSkuId || !current.skuName) return '';
  const name = String(current.rawName || '').trim();
  if (!name || name === current.skuName) return '';
  const trusted =
    current.confidence === 'HIGH' || current.matchSource === 'MANUAL';
  if (!trusted) return '';
  return `生成时商品名更新为「${name}」`;
});

/** 有没有改过什么（关弹窗时用来提醒一下，别让员工白改一遍） */
const editDirty = computed(() => {
  const current = editing.value;
  if (!current) return false;
  return (
    String(current.rawName ?? '').trim() !== String(current.rawNameOrig ?? '').trim() ||
    String(current.qtyText ?? '') !== String(current._origQtyText ?? '') ||
    String(current.priceText ?? '') !== String(current._origPriceText ?? '') ||
    String(current.unitText ?? '') !== String(current.unitOrig ?? '') ||
    Boolean(current.isPersonal) !== Boolean(current.isPersonalOrig) ||
    String(current.procurementSkuId ?? '') !== String(current._origSkuId ?? '')
  );
});

/** 当前编辑行的商品规格（截图规格对不上时用来提示，不拦人） */
const editingSpecWarning = computed(() => {
  const current = editing.value;
  if (!current || current.isPersonal || !current.procurementSkuId) return null;
  return specWarningText(current.spec, current.skuModel);
});

function skuModelFor(line: OrderImportLineView): string | null {
  const ingredient = ingredientOptions.value.find(
    (item) => item.ingredientId === line.ingredientId,
  );
  const sku = ingredient?.skus.find((item) => item.id === line.procurementSkuId);
  return sku?.productModel || '';
}

/** 行上直接标出来：不用逐行点开才发现规格不符 */
function lineSpecNotice(line: OrderImportLineView): string {
  if (!line.procurementSkuId) return '';
  const skuModel = skuModelFor(line);
  if (!isSpecMismatch(line.spec, skuModel)) return '';
  return `规格不符：商品 ${skuModel} ≠ 截图 ${line.spec}`;
}

/** 本次要生成的所有行里，有多少行商品规格与截图对不上 */
const specMismatchCount = computed(
  () =>
    imports.value.reduce(
      (sum, item) =>
        sum +
        item.lines.filter(
          (line) =>
            line.procurementSkuId &&
            !line.isPersonal &&
            isSpecMismatch(line.spec, skuModelFor(line)),
        ).length,
      0,
    ),
);

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
  // 先报当前这一单，再报别的单：否则站在盒马这页，按钮却写着「山姆：1 行待处理」
  const blocking = firstBlockedImport(
    activeImport.value,
    imports.value,
    (item) => importIssue(item) !== null,
  );
  if (blocking) {
    const who = blocking.channel || '这笔订单';
    const label = `${who}${blocking.orderTime ? ' ' + formatShortDate(blocking.orderTime) : ''}`;
    return `${label}：${importIssue(blocking)}`;
  }
  if (matchedLineCount.value === 0) return '还没有可生成的采购记录';
  return '';
});

/**
 * 顶部那一行只报一件事：这道账合不合得上（商品 + 运费 + 包装 = 实付）。
 * 不再拿「模型抄的商品小计」比「商品行合计」——那是两个口径，必然打架。
 */
const amountStateText = computed(() =>
  feeSummary.value ? feeStatusText(feeSummary.value) : '',
);

/** 底部合计：一笔就直说，多笔要讲清是「几笔订单」的总数 */
const footerLabel = computed(() => {
  const count = imports.value.length;
  if (count <= 1) return `将生成 ${matchedLineCount.value} 条采购记录`;
  return `${count} 笔订单 · 共 ${matchedLineCount.value} 条采购记录`;
});

function importIssue(item: OrderImportView): string | null {
  // 渠道没确认时，行级的「待处理」都是假象：确认渠道后会自动重匹配。
  if (!item.channel) return '先确认渠道';
  const active = item.lines.filter((line) => !line.isPersonal);
  const pending = item.summary.unmatched + item.summary.needsSku;
  if (pending > 0) return `${pending} 行待处理`;
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
  focusLastOnce = options?.focus === 'last';
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
  if (channelOptions.value.length === 0) void loadChannelOptions();
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
      if (focusLastOnce && imports.value.length > 0) {
        activeIndex.value = imports.value.length - 1;
        focusLastOnce = false;
      }
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

// 核对到一半想补传一笔：不用退回详情页再点一次
async function pickMore() {
  if (importing.value) return;
  const paths = await chooseOrderShots();
  if (paths.length === 0) return;
  const before = imports.value.length;
  importing.value = true;
  uni.showLoading({ title: `上传 1/${paths.length}`, mask: true });
  let loadingShown = true;
  try {
    const result = await importOrderShots(listId.value, paths, (stage) => {
      uni.showLoading({ title: stage, mask: true });
    });
    uni.hideLoading();
    loadingShown = false;
    if (!result.ok) {
      if (result.kind === 'duplicate') {
        await load();
        uni.showToast({ title: '这张图已经传过了', icon: 'none' });
      } else {
        uni.showModal({ title: '没识别成功', content: result.message, showCancel: false });
      }
      return;
    }
    await load();
    activeIndex.value = Math.min(before, Math.max(imports.value.length - 1, 0));
  } catch (error: any) {
    uni.hideLoading();
    loadingShown = false;
    uni.showModal({
      title: '没识别成功',
      content: error?.message || '请稍后重试',
      showCancel: false,
    });
  } finally {
    if (loadingShown) uni.hideLoading();
    importing.value = false;
  }
}

function previewOriginal(item: OrderImportView, current = 0) {
  const urls = item.imageUrls ?? [];
  if (urls.length === 0) return;
  uni.previewImage({ urls, current: urls[current] });
}

function selectOrder(index: number) {
  activeIndex.value = index;
}

/**
 * 行状态。2026-11-05 起「已匹配」只留给认得准的：
 * 靠原料推出来、靠模型语义推出来的标「待确认」——不用逐行核对，
 * 但一眼能看出哪几行是猜的（生成时也只有这些行不会被改名）。
 */
function lineTrusted(line: OrderImportLineView) {
  return line.confidence === 'HIGH' || line.matchSource === 'MANUAL';
}

function stateText(line: OrderImportLineView) {
  if (line.state === 'MATCHED') return lineTrusted(line) ? '已匹配' : '待确认';
  if (line.state === 'PERSONAL') return '个人';
  // 渠道没确认：商品还没开始匹配，别让员工以为要一行行手选
  if (activeImport.value && !activeImport.value.channel) return '等渠道';
  if (line.state === 'NEEDS_SKU') return '选商品';
  return '选原料';
}

function stateClass(line: OrderImportLineView) {
  if (line.state === 'MATCHED' && !lineTrusted(line)) return 'matched-review';
  return line.state.toLowerCase().replace('_', '-');
}

function tabState(item: OrderImportView) {
  const issue = importIssue(item);
  if (issue) return issue;
  return `可生成 ${item.summary.matched} 条`;
}

function openEdit(line: OrderImportLineView) {
  const ingredient = ingredientOptions.value.find(
    (item) => item.ingredientId === line.ingredientId,
  );
  const sku = ingredient?.skus.find((item) => item.id === line.procurementSkuId);
  editing.value = {
    ...line,
    rawNameOrig: line.rawName,
    qtyText: line.qty === null ? '' : String(line.qty),
    unitText: line.unit || '',
    priceText: line.unitPrice === null ? '' : String(line.unitPrice),
    ingredientName: ingredient?.ingredientName || '',
    skuName: sku?.name || '',
    skuModel: sku?.productModel || '',
    skuRatio: sku?.purchaseToBaseRatio ?? null,
    baseUnit: ingredient?.baseUnit || 'G',
    _origSkuId: line.procurementSkuId || '',
    unitOrig: line.unit || '',
    isPersonalOrig: Boolean(line.isPersonal),
    // 截图上的小计：不再让人手改，只拿来对账（2026-11-05）
    _origTotal: line.aiLineTotal ?? line.lineTotal ?? null,
    _origQtyText: line.qty === null ? '' : String(line.qty),
    _origPriceText: line.unitPrice === null ? '' : String(line.unitPrice),
  };
}

/**
 * 关掉弹窗。改过东西又没保存时先问一句（2026-11-05）：
 * 点蒙层就关、改了半天白改，是这类弹窗最容易挨骂的地方。
 */
async function closeEdit(force = false) {
  if (!force && editDirty.value) {
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '还没保存',
        content: '这一行的改动还没保存，确定关掉吗？',
        confirmText: '关掉',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }
  editing.value = null;
  pickerMode.value = 'none';
}

function openFeeEdit() {
  const item = activeImport.value;
  if (!item) return;
  feeEditing.value = {
    shippingText: item.shippingFee === null ? '' : String(item.shippingFee),
    packagingText: item.packagingFee === null ? '' : String(item.packagingFee),
  };
}

function closeFeeEdit() {
  feeEditing.value = null;
}

/**
 * 保存运费/包装费。允许员工随便改（模型读错是常态），
 * 但保留模型原值并标「已改动」，审核时能对照。
 */
async function saveFeeEdit() {
  const form = feeEditing.value;
  const item = activeImport.value;
  if (feeSaving.value || !form || !item) return;

  const shippingResult = parseFeeInput(form.shippingText, '运费');
  if (shippingResult.error) {
    uni.showToast({ title: shippingResult.error, icon: 'none' });
    return;
  }
  const packagingResult = parseFeeInput(form.packagingText, '包装费');
  if (packagingResult.error) {
    uni.showToast({ title: packagingResult.error, icon: 'none' });
    return;
  }

  feeSaving.value = true;
  try {
    const res: any = await updateOrderImport(item.id, {
      shippingFee: shippingResult.value,
      packagingFee: packagingResult.value,
    });
    if (res.code !== 0) throw new Error(res.message || '保存失败');
    closeFeeEdit();
    await load();
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' });
  } finally {
    feeSaving.value = false;
  }
}

function openSkuPicker() {
  pickerMode.value = 'sku';
}

function closePicker() {
  pickerMode.value = 'none';
}

function chooseSku(sku: any) {
  editing.value.procurementSkuId = sku.id;
  editing.value.skuName = sku.name;
  editing.value.skuModel = sku.productModel || '';
  editing.value.skuRatio =
    typeof sku.purchaseToBaseRatio === 'number' ? sku.purchaseToBaseRatio : null;
  editing.value.ingredientId = sku.ingredientId;
  editing.value.ingredientName = sku.ingredientName;
  editing.value.baseUnit = sku.baseUnit || 'G';
  editing.value.isPersonal = false;
  pickerMode.value = 'none';
}

/**
 * 个人采购只切换标记，不动已经选好的商品（2026-11-05）。
 * 以前一打开开关就把原料和商品清空、关掉也回不来，等于点错一下就白选。
 */
function onPersonalChange(event: any) {
  editing.value.isPersonal = Boolean(event?.detail?.value);
}

/** 数量一次 +/-1，省得为改个数字弹一次键盘 */
function stepQty(delta: number) {
  const current = parseNumber(editing.value?.qtyText);
  const next = Math.max(1, Math.round((current ?? 1) + delta));
  editing.value.qtyText = String(next);
}

/** 单位只给常用件数单位：写「斤」这类，生成时会被拦下来白填一遍 */
/**
 * 按截图小计反算单价（2026-11-05）。
 * 有特价/优惠时，数量 × 单价 天然对不上截图：一键把单价改成「截图小计 ÷ 数量」，
 * 这样小计、截图、整单核对三者才是一致的。
 */
function alignToReceipt() {
  const receipt = receiptTotal.value;
  const qty = parseNumber(editing.value?.qtyText);
  if (receipt === null || qty === null || qty <= 0) return;
  editing.value.priceText = String(round2(receipt / qty));
}

function pickUnit() {
  const units = ['袋', '盒', '份', '包', '瓶', '个', '组', '罐'];
  const current = editing.value?.unitText;
  uni.showActionSheet({
    itemList: units,
    success: (res) => {
      editing.value.unitText = units[res.tapIndex];
    },
    fail: () => {
      if (current) editing.value.unitText = current;
    },
  });
}

function goNewSku() {
  const ingredient = ingredientOptions.value.find(
    (item) => item.ingredientId === editing.value?.ingredientId,
  );
  if (!ingredient) {
    uni.showToast({ title: '先在清单里选一个商品', icon: 'none' });
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

  const qty = parseNumber(editing.value.qtyText);
  if (qty === null || qty <= 0) {
    uni.showToast({ title: '请先填数量', icon: 'none' });
    return;
  }
  const price = parseNumber(editing.value.priceText);
  if (price === null || price < 0) {
    uni.showToast({ title: '请先填单价', icon: 'none' });
    return;
  }

  // 规格对不上不硬拦，但必须让员工确认一次：
  // 生成后克数是按商品规格算的，差 300g/500g 会直接抬高折合单价。
  if (editingSpecWarning.value) {
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '规格和截图不一致',
        content: `${editingSpecWarning.value}仍要这样保存吗？`,
        confirmText: '仍然保存',
        confirmColor: '#b4453a',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }

  const nameChanged = String(editing.value.rawName || '').trim() !== String(editing.value.rawNameOrig || '').trim();
  saving.value = true;
  try {
    const res: any = await updateOrderImportLine(
      activeImport.value.id,
      editing.value.id,
      {
        rawName: String(editing.value.rawName || '').trim(),
        qty,
        unit: editing.value.unitText || null,
        unitPrice: price,
        lineTotal: editingTotal.value,
        ingredientId: editing.value.isPersonal ? null : editing.value.ingredientId || null,
        procurementSkuId: editing.value.isPersonal
          ? null
          : editing.value.procurementSkuId || null,
        isPersonal: editing.value.isPersonal,
      },
    );
    if (res.code !== 0) throw new Error(res.message || '保存失败');
    closeEdit(true);
    await load();
    uni.showToast({ title: nameChanged ? '已保存，名字已改' : '已保存', icon: 'none' });
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
}

async function changeChannel() {
  if (!activeImport.value) return;
  if (channelOptions.value.length === 0) await loadChannelOptions();
  channelPicking.value = true;
}

function closeChannelPicker() {
  channelPicking.value = false;
}

/**
 * 选完渠道立刻保存：后端会按新渠道重新匹配还没人工动过的行
 * （2026-11-05；以前只改个名字，行不会重算，改完等于没改）。
 */
async function chooseChannel(channel: string) {
  const current = activeImport.value;
  if (!current) return;
  channelPicking.value = false;
  if (current.channel === channel) return;
  try {
    const res: any = await updateOrderImport(current.id, { channel });
    if (res.code !== 0) throw new Error(res.message || '保存失败');
    await load();
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' });
  }
}

/** 渠道清单只拉一次；后台加了渠道，重进页面即可看到 */
async function loadChannelOptions() {
  try {
    const res: any = await getPurchaseChannels();
    if (res.code === 0 && Array.isArray(res.data)) {
      channelOptions.value = res.data;
    }
  } catch (error) {
    console.error('加载渠道清单失败', error);
  }
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

async function submit() {
  if (!canConfirm.value || submitting.value) return;
  const ids = imports.value.filter((item) => item.status === 'DRAFT').map((item) => item.id);
  if (ids.length === 0) return;

  // 生成前最后确认一次：有行的商品规格和截图对不上，
  // 生成后克数/单价会按商品规格算，不能让员工在不知情的情况下过。
  if (specMismatchCount.value > 0) {
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '有商品规格和截图不一致',
        content: `共 ${specMismatchCount.value} 行：生成后克数和单价会按采购商品的规格算，可能和这单实际付的钱对不上。建议先回详情页新建对应规格的商品。仍要生成吗？`,
        confirmText: '仍然生成',
        confirmColor: '#b4453a',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }

  submitting.value = true;
  try {
    const res: any = await confirmOrderImports(ids);
    if (res.code !== 0) throw new Error(res.message || '生成失败');
    submitted.value = true;
    const renamed = Array.isArray(res.data?.renamed) ? res.data.renamed.length : 0;
    uni.showToast({
      title: renamed
        ? `已生成 ${res.data?.createdCount ?? ''} 条记录，更新 ${renamed} 个商品名`
        : `已生成 ${res.data?.createdCount ?? ''} 条记录`,
      icon: 'success',
    });
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 两个金额是否等价；null 只等于 null */
function sameAmount(
  left: number | null | undefined,
  right: number | null | undefined,
): boolean {
  const a = left === null || left === undefined ? null : Number(left);
  const b = right === null || right === undefined ? null : Number(right);
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= 0.005;
}

/** 费用输入：空 = 没读到（null），最多两位小数 */
function parseFeeInput(
  text: string,
  label: string,
): { value: number | null; error: string | null } {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return { value: null, error: null };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { value: null, error: `${label}最多两位小数，例如 2.00` };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: `${label}请填数字` };
  }
  if (parsed > 5000) {
    return { value: null, error: `${label}超过 5000 元，请核对` };
  }
  return { value: round2(parsed), error: null };
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
  padding: 20rpx 24rpx 300rpx;
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
  line-height: 1.5;
}

.empty-btn {
  width: 420rpx;
  margin: 0 auto;
}


/* 订单卡片一行：卡片横向滚动，「再传一笔」钉在这一行最右边 */
.tabs-row {
  display: flex;
  align-items: stretch;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.tabs {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
}

.tab {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 10rpx;
  width: 280rpx;
  padding: 14rpx 16rpx;
  margin-right: 14rpx;
  border-radius: 20rpx;
  background: #fbfcf7;
  border: 2rpx solid #e2dcc9;
  box-sizing: border-box;
  vertical-align: top;
}

.tab-main {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  flex: 1;
  min-width: 0;
}

/* 每张卡都带缩略图：一眼对上原图，点小图直接看大图 */
.tab-thumb {
  width: 76rpx;
  height: 76rpx;
  flex: 0 0 76rpx;
  border-radius: 12rpx;
  border: 1rpx solid #e2dcc9;
  background: #e7e1cf;
}

/* 再传一笔：竖排小卡，跟订单卡片同一行、固定在这一行最右边 */
.side-add {
  flex: 0 0 64rpx;
  width: 64rpx;
  align-self: stretch;
  padding: 10rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rpx;
  background: #1e3a2f;
  border-radius: 20rpx;
  box-shadow: 0 4rpx 12rpx rgba(30, 58, 47, 0.16);
}

.side-add-hover {
  background: #2f6b4f;
}

.side-add.busy {
  opacity: 0.6;
}

.side-add-plus {
  font-size: 40rpx;
  line-height: 1;
  color: #f4d58d;
}

.tab.active {
  border-color: #1e3a2f;
  box-shadow: inset 0 0 0 2rpx #1e3a2f;
}

.tab-channel {
  font-size: 20rpx;
  color: #6b6653;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-channel.missing {
  color: #b4453a;
  font-weight: 600;
}

.tab-amount {
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.tab-state {
  font-size: 20rpx;
  line-height: 1.4;
  color: #2f6b4f;
  word-break: break-all;
}

.summary {
  display: flex;
  background: #1e3a2f;
  border-radius: 24rpx;
  padding: 16rpx 4rpx;
  margin-bottom: 12rpx;
}

.summary-cell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.summary-k {
  font-size: 18rpx;
  color: #c9cfc0;
  white-space: nowrap;
}

.summary-v {
  font-size: 26rpx;
  font-weight: 700;
  color: #f7f4e9;
  white-space: nowrap;
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

.meta-channel.missing {
  color: #b4453a;
}

/* 渠道确认卡：渠道没定之前，这是页面上第一件要做的事 */
.channel-gate {
  background: #fdf3e3;
  border: 1rpx solid #e8c79a;
  border-radius: 20rpx;
  padding: 20rpx 22rpx;
  margin-bottom: 14rpx;
}

.channel-gate-title {
  display: block;
  font-size: 27rpx;
  font-weight: 700;
  color: #8a4a1d;
}

.channel-gate-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 21rpx;
  color: #7a5a20;
  line-height: 1.55;
}

.channel-gate-btn {
  margin: 16rpx 0 4rpx;
  background: #b4453a;
  color: #fff;
  font-size: 24rpx;
  border-radius: 14rpx;
  line-height: 2.2;
}

.channel-gate-hint {
  display: block;
  margin-top: 8rpx;
  font-size: 19rpx;
  color: #8a7250;
  line-height: 1.5;
}

.channel-tip {
  display: block;
  margin-top: 14rpx;
  font-size: 19rpx;
  color: #8a7250;
  line-height: 1.5;
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

.line-spec-warn {
  font-size: 19rpx;
  color: #b4453a;
  line-height: 1.4;
}

.spec-warn-box {
  margin: 10rpx 0 0;
  padding: 12rpx 14rpx;
  background: #fdf0ee;
  border: 1rpx solid #f0cdc7;
  border-radius: 14rpx;
}

.spec-warn-text {
  display: block;
  font-size: 20rpx;
  color: #8f3128;
  line-height: 1.5;
}

.spec-warn-action {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  color: #b4453a;
  font-weight: 600;
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

/* 靠原料/模型推出来的匹配：不拦人，但让人一眼看出这是猜的（2026-11-05） */
.state.matched-review {
  background: #fbf1dd;
  color: #a8742a;
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
  justify-content: flex-end;
  align-items: baseline;
  gap: 24rpx;
  font-size: 22rpx;
  color: #6b6653;
  padding: 0 6rpx 10rpx;
  text-align: right;
}

/* 统计行和金额同一侧靠右：金额是主角，永远不压缩 */
.footer-label {
  flex: 0 1 auto;
  min-width: 0;
}

.footer-amount {
  flex: none;
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

.footer-links {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 56rpx;
  margin-top: 12rpx;
}


.discard {
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

.field-input {
  flex: 1;
  font-size: 26rpx;
  color: #26261f;
  text-align: right;
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

/* 新建采购商品：不是商品行，用底色卡片 + 圆形加号单独成块 */
.picker-create {
  margin: 22rpx 0 4rpx;
  padding: 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f2e6c6;
  border: 1rpx solid #dcc493;
  border-radius: 18rpx;
}

.picker-create-main {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.picker-create-plus {
  flex: none;
  width: 34rpx;
  height: 34rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #7a5c28;
  color: #f7f4e9;
  font-size: 24rpx;
  font-weight: 700;
}

.picker-create-name {
  font-size: 25rpx;
  font-weight: 600;
  color: #6b4d16;
}

.picker-create-go {
  font-size: 21rpx;
  color: #7a5c28;
  font-weight: 600;
}

/* 费用区：商品小计 + 运费 + 包装费 = 实付 */
.fees {
  margin-top: 14rpx;
  background: #fbfcf7;
  border: 1rpx solid #e2dcc9;
  border-radius: 24rpx;
  padding: 18rpx 20rpx 16rpx;
}

.fees-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4rpx;
}

.fees-title {
  font-size: 23rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.fees-action {
  font-size: 21rpx;
  color: #7a5c28;
  font-weight: 600;
}

.fee-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10rpx 0;
  border-bottom: 1rpx dashed #efe9d9;
}

.fee-row.total {
  border-bottom: none;
  padding-top: 12rpx;
}

.fee-k {
  font-size: 22rpx;
  color: #6b6653;
}

.fee-v {
  font-size: 24rpx;
  color: #26261f;
  font-weight: 600;
}

.fee-row.total .fee-v {
  font-size: 27rpx;
  color: #1e3a2f;
}

.fee-v.missing {
  color: #a8742a;
  font-weight: 600;
}

.fee-origin {
  display: block;
  margin-top: 8rpx;
  font-size: 19rpx;
  color: #a8742a;
  line-height: 1.5;
}

/* 这行只在「要员工动手」时出现，所以直接就是提醒色 */
.fee-check {
  margin-top: 10rpx;
  padding: 12rpx 14rpx;
  border-radius: 12rpx;
  background: #fbf1dd;
  border: 1rpx solid #efdcb8;
  font-size: 20rpx;
  color: #7a5a20;
  line-height: 1.55;
}

.fee-gap-line {
  display: block;
  padding: 2rpx 4rpx;
  font-size: 21rpx;
  color: #6b6653;
  line-height: 1.5;
}

/* ---------- 改一行（2026-11-05 改版） ---------- */
/* 弹窗本体还是 .sheet 那套样式，外面套一层可滚动容器（键盘弹起来够用） */
.sheet-scroll {
  width: 100%;
  max-height: 86vh;
  background: #f3eddd;
  border-radius: 28rpx 28rpx 0 0;
}

.sheet-inner {
  background: transparent;
  border-radius: 0;
}

.sheet-grab {
  width: 68rpx;
  height: 8rpx;
  border-radius: 99rpx;
  background: #d8cfb6;
  margin: -6rpx auto 6rpx;
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  margin-bottom: 2rpx;
}

.name-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.name-input {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
  font-weight: 700;
  color: #1e3a2f;
  border-bottom: 1rpx dashed #cfc5ab;
  padding-bottom: 6rpx;
}

.name-pen {
  font-size: 20rpx;
  color: #a09a86;
}

.personal-box {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 2rpx;
}

.personal-label {
  font-size: 21rpx;
  color: #6b6653;
}

.personal-switch {
  transform: scale(0.72);
  transform-origin: right center;
}

.sku-row .field-value {
  flex: 1;
  text-align: right;
}

.field-sub {
  font-size: 21rpx;
  font-weight: 500;
  color: #8a8574;
}

.rename-hint {
  display: block;
  font-size: 20rpx;
  color: #8a8574;
  line-height: 1.5;
  padding: 0 6rpx;
  margin-top: -6rpx;
}

.amount-card {
  background: #fbfcf7;
  border: 1rpx solid #e2dcc9;
  border-radius: 16rpx;
  overflow: hidden;
}

.amount-grid {
  display: flex;
}

.amount-cell {
  flex: 1;
  min-width: 0;
  padding: 16rpx 18rpx 18rpx;
}

.amount-cell + .amount-cell {
  border-left: 1rpx solid #ece5d2;
}

.amount-label {
  display: block;
  font-size: 21rpx;
  color: #6b6653;
  margin-bottom: 10rpx;
}

.stepper {
  display: flex;
  align-items: center;
}

.step-btn {
  width: 54rpx;
  height: 54rpx;
  border-radius: 12rpx;
  background: #eee7d4;
  color: #4a5b50;
  font-size: 32rpx;
  line-height: 54rpx;
  text-align: center;
}

.step-btn-hover {
  background: #e3dbc4;
}

.step-input {
  width: 76rpx;
  text-align: center;
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
}

.unit-chip {
  font-size: 22rpx;
  color: #6b6653;
  padding: 8rpx 14rpx;
  margin-left: 6rpx;
  border: 1rpx solid #e2dcc9;
  border-radius: 8rpx;
  background: #f6f1e2;
  white-space: nowrap;
}

.price-line {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
}

.price-symbol {
  font-size: 22rpx;
  color: #6b6653;
}

.price-input {
  flex: 1;
  min-width: 0;
  font-size: 34rpx;
  font-weight: 700;
  color: #26261f;
}

.check-line {
  display: flex;
  align-items: center;
  gap: 12rpx;
  border-top: 1rpx solid #ece5d2;
  background: #f7f9f2;
  padding: 12rpx 18rpx;
  font-size: 20rpx;
  color: #4f7a62;
}

.check-line.bad {
  background: #fbf1dd;
  color: #a8742a;
}

.check-text {
  flex: 1;
  min-width: 0;
}

.check-grams {
  flex: none;
  color: #6b6653;
}

.check-fix {
  flex: none;
  color: #a8742a;
  font-weight: 600;
}

.picker-main {
  flex: 1;
  min-width: 0;
}

.picker-model {
  font-size: 20rpx;
  font-weight: 400;
  color: #8a8574;
}

.picker-current {
  font-size: 20rpx;
  color: #2f6b4f;
}
</style>
