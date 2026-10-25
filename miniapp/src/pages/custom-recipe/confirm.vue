<template>
  <view class="confirm-page">
    <view v-if="loading" class="state-card">
      <text class="state-title">正在准备确认信息…</text>
      <text class="state-desc">马上就好</text>
    </view>

    <view v-else-if="loadError" class="state-card">
      <text class="state-title">{{ loadError }}</text>
      <text class="state-desc">返回定制页修改后再试</text>
      <button class="state-btn" @tap="retryLoad">重试</button>
      <button class="state-btn state-btn--ghost" @tap="backToCustom">返回定制页</button>
    </view>

    <template v-else>
      <template v-if="!createdOrder">
      <view class="section hero-section">
        <view class="section-title">
          <text class="title-text">定制对象</text>
        </view>
        <view class="dog-card">
          <image
            v-if="dogAvatar"
            class="dog-avatar dog-avatar--image"
            :src="dogAvatar"
            mode="aspectFill"
          />
          <view v-else class="dog-avatar">🐕</view>
          <view class="dog-info">
            <text class="dog-name">{{ dogName }}</text>
            <text class="dog-line">{{ dogLine }}</text>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="section-title">
          <text class="title-text">定制信息</text>
        </view>

        <view class="info-row">
          <text class="info-label">体重管理方向</text>
          <text class="info-value">{{ goalText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">过敏情况</text>
          <text class="info-value">{{ allergyDisplay }}</text>
        </view>
        <view v-if="reportAttachments.length" class="preview-block">
          <text class="preview-title">过敏检测报告（只读）</text>
          <view class="preview-grid">
            <view
              v-for="attachment in reportAttachments"
              :key="attachment.url"
              class="preview-item"
            >
              <image
                v-if="isImageAttachment(attachment.url)"
                class="preview-image"
                :src="attachment.url"
                mode="aspectFill"
                @tap="previewConfirmAttachment(attachment.url)"
              />
              <view
                v-else
                class="preview-doc"
                @tap="previewConfirmAttachment(attachment.url)"
              >
                <text class="preview-doc-badge">{{ attachmentFileLabel(attachment.url) }}</text>
                <text class="preview-doc-label">报告</text>
              </view>
            </view>
          </view>
        </view>
        <view class="info-row">
          <text class="info-label">目前主食</text>
          <text class="info-value">{{ currentFoodText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">定制原因</text>
          <text class="info-value">{{ changeReasonText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">最近肠胃表现</text>
          <text class="info-value">{{ stomachText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">备注</text>
          <text class="info-value">{{ notesText }}</text>
        </view>
        <view v-if="noteAttachments.length" class="preview-block">
          <text class="preview-title">附件预览（只读）</text>
          <view class="preview-grid">
            <view
              v-for="url in noteAttachments"
              :key="url"
              class="preview-item"
            >
              <image
                v-if="isImageAttachment(url)"
                class="preview-image"
                :src="url"
                mode="aspectFill"
                @tap="previewConfirmAttachment(url)"
              />
              <view v-else class="preview-doc" @tap="previewConfirmAttachment(url)">
                <text class="preview-doc-badge">{{ attachmentFileLabel(url) }}</text>
                <text class="preview-doc-label">附件</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view v-if="multiRecipeEnabled" class="section multi-section">
        <view class="section-title">
          <text class="title-text">配方份数</text>
          <text class="section-hint">最多 {{ maxRecipeQuantity }} 份</text>
        </view>
        <text class="multi-question">需要几份不同配方的食谱？</text>
        <view class="stepper">
          <view
            class="step-btn"
            :class="{ 'step-btn--disabled': recipeQuantity <= 1 }"
            @tap="changeRecipeQuantity(-1)"
            >−</view
          >
          <text class="step-value">{{ recipeQuantity }}</text>
          <view
            class="step-btn"
            :class="{ 'step-btn--disabled': recipeQuantity >= maxRecipeQuantity }"
            @tap="changeRecipeQuantity(1)"
            >＋</view
          >
          <text class="step-hint">默认 1 份，每份配方独立设计</text>
        </view>

        <view class="protein-block">
          <text class="protein-title">指定主蛋白</text>
          <view class="protein-mode-row">
            <view
              class="protein-mode"
              :class="{ 'protein-mode--on': proteinMode === 'DIETITIAN' }"
              @tap="selectProteinMode('DIETITIAN')"
            >
              <text class="protein-mode-label">营养师配</text>
            </view>
            <view
              class="protein-mode"
              :class="{ 'protein-mode--on': proteinMode === 'SELF' }"
              @tap="selectProteinMode('SELF')"
            >
              <text class="protein-mode-label">自己选</text>
            </view>
          </view>

          <text v-if="proteinMode === 'DIETITIAN'" class="protein-hint">
            由营养师根据狗狗档案，搭配 {{ recipeQuantity }} 种不同主蛋白。
          </text>
          <template v-else>
            <text class="protein-hint">
              请选择 {{ recipeQuantity }} 种不同的肉，已选
              {{ selectedProteinCodes.length }} 种。
            </text>
            <view class="protein-options">
              <view
                v-for="option in proteinOptions"
                :key="option.code"
                class="protein-option"
                :class="{
                  'protein-option--on': selectedProteinCodes.includes(option.code),
                  'protein-option--disabled':
                    proteinSelectionFull &&
                    !selectedProteinCodes.includes(option.code),
                }"
                @tap="toggleProtein(option.code)"
              >
                <text class="protein-option-label">{{ option.label }}</text>
              </view>
            </view>
            <text v-if="proteinSelectionError" class="protein-error">
              {{ proteinSelectionError }}
            </text>
          </template>
        </view>
      </view>

      <view class="section">
        <view class="section-title">
          <text class="title-text">交付</text>
        </view>
        <view class="delivery-card delivery-card--single">
          <text class="delivery-value">{{ deliveryText }}</text>
        </view>
        <text class="delivery-note">
          支付成功后营养师开始设计。交付后可在「我的订单 → 定制订单 → 查看详情」查看电子食谱，也会收到站内消息提醒。
        </text>
      </view>

      <view v-if="multiRecipeEnabled" class="section price-section">
        <view class="section-title">
          <text class="title-text">价格明细</text>
        </view>
        <template v-if="currentQuote">
          <view class="price-row">
            <text class="price-label">原价</text>
            <text class="price-value"
              >¥{{ formatAmount(currentQuote.originalAmount) }}</text
            >
          </view>
          <text class="price-sub">
            ¥{{ formatAmount(currentQuote.unitAmount) }} / 份 ×
            {{ currentQuote.quantity }} 份
          </text>
          <view class="price-row">
            <text class="price-label">多份优惠</text>
            <text class="price-value price-value--discount">{{ discountText }}</text>
          </view>
          <view class="price-row price-row--total">
            <text class="price-label">应付金额</text>
            <text class="price-value price-value--total">¥{{ payableText }}</text>
          </view>
          <view class="price-row">
            <text class="price-label">每份均价</text>
            <text class="price-value">¥{{ perRecipeAverageText }}</text>
          </view>
        </template>
        <view v-else-if="quoteLoading" class="price-state">
          <text class="price-state-text">正在计算价格…</text>
        </view>
        <view v-else class="price-state price-state--error">
          <text class="price-state-text">
            {{ quoteError || '价格读取失败，请重试' }}
          </text>
          <button class="retry-btn" @tap="retryQuote">重试</button>
        </view>
      </view>

      <view v-if="singleFeeMissing" class="fee-missing">
        定制费用没读取出来，请返回重试或联系 Seven爸爸。
      </view>
      <text class="refund-policy">
        支付后未开始制作可全额退款；开始制作后如需退款，请联系 Seven爸爸审核。
      </text>

      <view class="bottom-space" />

      <view class="bottom-bar">
        <view class="bottom-main">
          <view v-if="optionLoadingText" class="option-wait-note">
            <text class="option-wait-text">{{ optionLoadingText }}</text>
            <text
              v-if="optionsFailed"
              class="option-wait-retry"
              @tap="retryOptions"
            >重试</text>
          </view>
          <button
            class="btn-submit"
            :disabled="!canSubmit"
            @tap="submitConfirmedOrder"
          >
            {{ payButtonText }}
          </button>
        </view>
      </view>
      </template>

      <view v-else class="state-card">
        <text class="state-title">正在发起支付…</text>
        <text class="state-desc">订单已创建，马上打开微信支付</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { onBackPress, onLoad } from '@dcloudio/uni-app';
import { dogApi } from '@/api/dogs';
import {
  fetchCustomRecipeQuote,
  fetchNextDeliveryDate,
  fetchPublicConfig,
  submitOrder,
  type CustomRecipeQuote,
} from '@/api/custom-recipe';
import {
  PROTEIN_OPTIONS,
  formatDiscountRate,
  getProteinSelectionError,
  perRecipeAverage,
  resolveMaxRecipeQuantity,
  resolveRequestedProteinCodes,
  toggleProteinCode,
  trimProteinCodesForQuantity,
  type ProteinChoiceMode,
} from '@/utils/custom-recipe-pricing';
import { useOptionSet } from '@/utils/option-set';
import { getStoredUser } from '@/utils/account';
import { resolveDogAvatarSrc } from '@/utils/dog-avatar';
import {
  clearCustomRecipeSubmitKey,
  getOrCreateCustomRecipeSubmitKey,
} from '@/utils/custom-recipe-submit-key';
import {
  isCustomRecipeDraftExpired,
  loadCustomRecipeDraft,
  markCustomRecipeDraftSubmitted,
  retainCustomRecipeChoicesAfterPayment,
  type CustomRecipeDraft,
} from '@/utils/custom-recipe-draft';
import { refreshCustomRecipeDraftMedia } from '@/utils/custom-recipe-media';
import {
  loadCustomRecipeMultiChoice,
  saveCustomRecipeMultiChoice,
} from '@/utils/custom-recipe-multi-choice';
import {
  requestCustomRecipeOrderSubscription,
  runCustomRecipePayment,
  type CustomRecipePayOutcome,
} from '@/utils/custom-recipe-payment';
import { formatAmount } from '@/utils/custom-recipe-order';

const dogId = ref('');
const draft = ref<CustomRecipeDraft | null>(null);
const dog = ref<any>(null);
const config = ref<any>(null);
const delivery = ref<any>(null);
const loading = ref(true);
const loadError = ref('');
const submitting = ref(false);
/** 订单创建后的页面状态：确认页合并支付页，不再跳提交成功页 */
const createdOrder = ref<any>(null);
const postPaying = ref(false);
/** 本次确认页的幂等键：网络超时重试时后端返回同一张订单 */
const clientRequestId = ref('');

/** 多份购买：开关关闭时整块隐藏，份数固定 1，保持原单份流程 */
const multiRecipeEnabled = computed(
  () => config.value?.multiRecipeEnabled === true,
);
const maxRecipeQuantity = ref(5);
const recipeQuantity = ref(1);
const proteinMode = ref<ProteinChoiceMode>('DIETITIAN');
const selectedProteinCodes = ref<string[]>([]);
const proteinOptions = PROTEIN_OPTIONS;
/** 后端权威报价；只展示，不参与金额计算 */
const quote = ref<CustomRecipeQuote | null>(null);
const quoteLoading = ref(false);
const quoteError = ref('');
/** 只接受最后一次请求的结果，避免快速点 ± 时旧报价覆盖新报价 */
let quoteRequestSeq = 0;
/** 交付日期同样只认最后一次请求：份数快速变化时旧响应不能写回 */
const deliveryLoading = ref(false);
const deliveryError = ref('');
let deliveryRequestSeq = 0;

// 不用“解构别名”：ref-scope 守卫对跨行解构别名有误判风险，拆成显式常量
const currentFoodSet = useOptionSet('custom_recipe_current_food');
const { ensure: ensureCurrentFoodOptions, labelOf: currentFoodLabel } =
  currentFoodSet;
const currentFoodOptions = currentFoodSet.items;
const currentFoodLoading = currentFoodSet.loading;
const currentFoodFailed = currentFoodSet.failed;

const changeReasonSet = useOptionSet('custom_recipe_change_reason');
const {
  ensure: ensureChangeReasonOptions,
  labelOf: changeReasonLabel,
} = changeReasonSet;
const changeReasonOptions = changeReasonSet.items;
const changeReasonLoading = changeReasonSet.loading;
const changeReasonFailed = changeReasonSet.failed;

const stomachSet = useOptionSet('custom_recipe_stomach');
const { ensure: ensureStomachOptions, labelOf: stomachLabel } = stomachSet;
const stomachOptions = stomachSet.items;
const stomachLoading = stomachSet.loading;
const stomachFailed = stomachSet.failed;

const goalSet = useOptionSet('custom_recipe_goal');
const { ensure: ensureGoalOptions, labelOf: goalLabel } = goalSet;
const goalOptions = goalSet.items;
const goalLoading = goalSet.loading;
const goalFailed = goalSet.failed;

const form = computed<Record<string, any>>(
  () => (draft.value?.form || {}) as Record<string, any>,
);

function getDraftCustomerId(): string {
  const direct = String(uni.getStorageSync('userId') || '').trim();
  if (direct) return direct;
  const user = getStoredUser();
  return String(user?.id || user?.userId || '').trim();
}

const dogName = computed(() => String(dog.value?.name || '狗狗'));
const dogLine = computed(() => {
  const parts = [
    dog.value?.breedName || dog.value?.breed,
    dog.value?.currentWeightKg
      ? `${dog.value.currentWeightKg}kg`
      : dog.value?.weightKg
        ? `${dog.value.weightKg}kg`
        : '',
  ].filter(Boolean);
  return parts.join(' · ') || '档案信息以定制页为准';
});

const dogAvatar = computed(() =>
  resolveDogAvatarSrc(dog.value?.avatarUrl || dog.value?.avatar),
);

/**
 * 确认页展示的选项字典。支付前必须等它们读到：
 * 否则摘要会出现空白/“、”，顾客在看不到自己选了什么的情况下付钱。
 */
const optionsLoading = computed(
  () =>
    currentFoodLoading.value ||
    changeReasonLoading.value ||
    stomachLoading.value ||
    goalLoading.value,
);
const optionsFailed = computed(
  () =>
    currentFoodFailed.value ||
    changeReasonFailed.value ||
    stomachFailed.value ||
    goalFailed.value,
);
const optionsReady = computed(
  () =>
    !optionsLoading.value &&
    !optionsFailed.value &&
    currentFoodOptions.value.length > 0 &&
    changeReasonOptions.value.length > 0 &&
    goalOptions.value.length > 0,
);

const optionLoadingText = computed(() =>
  optionsFailed.value
    ? '定制选项没加载出来'
    : optionsLoading.value
      ? '正在读取定制选项…'
      : !optionsReady.value
        ? '定制选项暂不可用'
        : '',
);

const goalText = computed(() => {
  const target = String(form.value.targetGoal || '');
  if (!target) return '待确认';
  // 中文只来自后端选项字典，前端不再新增一份「目标 → 中文」映射
  const label = goalLabel(target);
  if (label) return label;
  if (goalLoading.value) return '读取中…';
  if (goalFailed.value) return '读取失败';
  return '待确认';
});

const allergyDisplay = computed(() => {
  if (draft.value?.hasFoodAllergy === false) return '没有过敏';
  if (draft.value?.hasFoodAllergy === true) {
    const text = String(form.value.allergyText || '').trim();
    return text || '有过敏（未填写具体食物）';
  }
  return '未填写';
});

const hasAllergyForDisplay = computed(
  () => draft.value?.hasFoodAllergy === true,
);

const reportAttachments = computed<Array<{ url: string }>>(() => {
  if (!hasAllergyForDisplay.value) return [];
  const drafts = Array.isArray(form.value.reportDrafts)
    ? form.value.reportDrafts
    : [];
  const seen = new Set<string>();
  const result: Array<{ url: string }> = [];
  for (const report of drafts) {
    for (const url of Array.isArray(report?.attachments)
      ? report.attachments
      : []) {
      const value = String(url || '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      result.push({ url: value });
    }
  }
  return result;
});

const noteAttachments = computed<string[]>(() =>
  Array.isArray(form.value.attachmentUrls)
    ? form.value.attachmentUrls.filter(Boolean)
    : [],
);

const currentFoodText = computed(() => {
  const code = String(form.value.currentFoodMain || '');
  if (!code) return '未填写';
  const label = currentFoodLabel(code);
  const other = String(form.value.currentFoodOther || '').trim();
  if (!label) {
    if (currentFoodLoading.value) return '读取中…';
    if (currentFoodFailed.value) return '读取失败';
    return other || '待确认';
  }
  return other ? `${label}（${other}）` : label;
});

const changeReasonText = computed(() => {
  const codes = Array.isArray(form.value.changeReasons)
    ? form.value.changeReasons
    : [];
  const other = String(form.value.changeReasonOther || '').trim();
  if (codes.length === 0 && !other) return '未填写';
  const labels = codes
    .map((code: string) => changeReasonLabel(code))
    .filter(Boolean);
  if (codes.length > 0 && labels.length === 0) {
    if (changeReasonLoading.value) return '读取中…';
    if (changeReasonFailed.value) return '读取失败';
    return other || '待确认';
  }
  return `${labels.join('、')}${other ? `（${other}）` : ''}`;
});

const stomachText = computed(() => {
  const codes = Array.isArray(form.value.stomachConditions)
    ? form.value.stomachConditions
    : [];
  const other = String(form.value.stomachOther || '').trim();
  if (codes.length === 0 && !other) return '未填写';
  const labels = codes.map((code: string) => stomachLabel(code)).filter(Boolean);
  if (codes.length > 0 && labels.length === 0) {
    if (stomachLoading.value) return '读取中…';
    if (stomachFailed.value) return '读取失败';
    return other || '待确认';
  }
  return `${labels.join('、')}${other ? `（${other}）` : ''}`;
});

const notesText = computed(
  () => String(form.value.additionalNotes || '').trim() || '无',
);

function attachmentExtension(url: string): string {
  const raw = String(url || '');
  const extMatch = raw.match(/[?&]ext=([a-z0-9]+)/i);
  if (extMatch) return `.${extMatch[1].toLowerCase()}`;
  const clean = raw.split('?')[0].split('#')[0];
  const index = clean.lastIndexOf('.');
  return index >= 0 ? clean.slice(index).toLowerCase() : '';
}

function isImageAttachment(url: string): boolean {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'].includes(
    attachmentExtension(url),
  );
}

function attachmentFileLabel(url: string): string {
  const ext = attachmentExtension(url);
  if (ext === '.pdf') return 'PDF';
  if (ext === '.doc' || ext === '.docx') return 'Word';
  return '文件';
}

function previewConfirmAttachment(url: string) {
  if (!url) return;
  if (isImageAttachment(url)) {
    uni.previewImage({
      urls: [
        ...reportAttachments.value.map((item) => item.url),
        ...noteAttachments.value,
      ].filter(isImageAttachment),
    });
    return;
  }
  if (!['.pdf', '.doc', '.docx'].includes(attachmentExtension(url))) {
    uni.showToast({ title: '暂不支持预览这种文件', icon: 'none' });
    return;
  }
  uni.showLoading({ title: '打开中…' });
  uni.downloadFile({
    url,
    success: (res) => {
      uni.hideLoading();
      if (res.statusCode !== 200 || !res.tempFilePath) {
        uni.showToast({ title: '文件下载失败', icon: 'none' });
        return;
      }
      uni.openDocument({
        filePath: res.tempFilePath,
        showMenu: true,
        fail: () => uni.showToast({ title: '文件打开失败', icon: 'none' }),
      });
    },
    fail: () => {
      uni.hideLoading();
      uni.showToast({ title: '文件下载失败', icon: 'none' });
    },
  });
}

const feeText = computed(() => formatAmount(config.value?.feeAmount ?? 0));

const currentQuote = computed<CustomRecipeQuote | null>(() => {
  const value = quote.value;
  if (!value) return null;
  // 份数刚变、新报价还没回来时不沿用旧份数的金额
  return Number(value.quantity) === recipeQuantity.value ? value : null;
});

const proteinSelectionFull = computed(
  () => selectedProteinCodes.value.length >= recipeQuantity.value,
);

const proteinSelectionError = computed(() =>
  multiRecipeEnabled.value
    ? getProteinSelectionError(
        proteinMode.value,
        selectedProteinCodes.value,
        recipeQuantity.value,
      )
    : '',
);

const quoteReady = computed(
  () =>
    !multiRecipeEnabled.value ||
    (Boolean(currentQuote.value) && !quoteLoading.value && !quoteError.value),
);

const singleFeeMissing = computed(
  () => !multiRecipeEnabled.value && !(Number(config.value?.feeAmount) > 0),
);

const canSubmit = computed(
  () =>
    !submitting.value &&
    optionsReady.value &&
    quoteReady.value &&
    !singleFeeMissing.value &&
    !proteinSelectionError.value,
);

const payableText = computed(() => {
  if (!multiRecipeEnabled.value) return feeText.value;
  return currentQuote.value
    ? formatAmount(currentQuote.value.payableAmount)
    : '--';
});

const perRecipeAverageText = computed(() =>
  currentQuote.value
    ? formatAmount(perRecipeAverage(currentQuote.value))
    : '--',
);

const discountText = computed(() => {
  const current = currentQuote.value;
  if (!current) return '--';
  if (current.discountAmount <= 0) return '无';
  return `-¥${formatAmount(current.discountAmount)}（${formatDiscountRate(
    current.discountRate,
  )}）`;
});

const payButtonText = computed(() => {
  if (submitting.value) return '提交中…';
  if (singleFeeMissing.value) return '费用读取失败，请返回重试';
  if (!multiRecipeEnabled.value) return `确认并支付 ¥${feeText.value}`;
  if (!currentQuote.value) return '确认并支付';
  return `确认并支付 ¥${formatAmount(currentQuote.value.payableAmount)}`;
});

const deliveryText = computed(() => {
  if (deliveryLoading.value) return '正在按份数计算交付日期…';
  if (deliveryError.value) return '交付日期读取失败，下单后以订单为准';
  const date = delivery.value?.estimatedDeliveryDate;
  if (!date) return '排期中';
  const parts = String(date).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return String(date);
  }
  const [, month, day] = parts;
  return `预计 ${month} 月 ${day} 日（含）之前交付`;
});

/**
 * 取后端报价。
 *
 * 报价失败时**不退回前端数学**：清空 quote、记下错误，由页面显示重试并挡住支付。
 * 用自增序号只认最后一次请求，快速点 ± 时旧响应不会覆盖新份数。
 */
async function loadQuote(quantity: number) {
  const normalized = Math.max(1, Math.floor(Number(quantity) || 1));
  const sequence = ++quoteRequestSeq;
  quoteLoading.value = true;
  quoteError.value = '';
  quote.value = null;
  try {
    const result = await fetchCustomRecipeQuote(normalized);
    if (sequence !== quoteRequestSeq) return;
    if (!result || Number(result.quantity) !== normalized) {
      throw new Error('报价与当前份数不一致，请重试');
    }
    quote.value = result;
  } catch (error: any) {
    if (sequence !== quoteRequestSeq) return;
    quoteError.value = error?.message || '价格读取失败，请重试';
  } finally {
    if (sequence === quoteRequestSeq) {
      quoteLoading.value = false;
    }
  }
}

function retryQuote() {
  void loadQuote(recipeQuantity.value);
}

/**
 * 按份数重取交付日期。
 *
 * 交期和价格一样由后端算：份数一变就要重新问，且**只认最后一次响应** ——
 * 快速从 1 点到 5 时，1 份的旧响应晚到不能把 5 份的日期盖回去。
 */
async function loadDeliveryDate(quantity?: number) {
  const sequence = ++deliveryRequestSeq;
  deliveryLoading.value = true;
  deliveryError.value = '';
  try {
    const result = await fetchNextDeliveryDate(quantity);
    if (sequence !== deliveryRequestSeq) return;
    delivery.value = result;
  } catch (error: any) {
    if (sequence !== deliveryRequestSeq) return;
    // 旧日期的份数已经不对了，宁可显示"以订单为准"也不能留住错日期
    delivery.value = null;
    deliveryError.value = error?.message || '交付日期读取失败';
  } finally {
    if (sequence === deliveryRequestSeq) {
      deliveryLoading.value = false;
    }
  }
}

/**
 * 改份数：先裁掉多出来的肉类，再重新报价，并重新算交期。
 *
 * 只裁「超出新份数」的部分；确实裁掉了才提示，避免顾客以为自己点错了。
 */
function changeRecipeQuantity(delta: number) {
  const next = Math.min(
    maxRecipeQuantity.value,
    Math.max(1, recipeQuantity.value + delta),
  );
  if (next === recipeQuantity.value) return;

  const trimmed = trimProteinCodesForQuantity(
    selectedProteinCodes.value,
    next,
  );
  recipeQuantity.value = next;
  selectedProteinCodes.value = trimmed.codes;
  if (trimmed.dropped > 0) {
    uni.showToast({
      title: `已减少份数，取消 ${trimmed.dropped} 种肉类，请重新选择`,
      icon: 'none',
    });
  } else if (proteinMode.value === 'SELF' && trimmed.codes.length < next) {
    uni.showToast({
      title: `请再选 ${next - trimmed.codes.length} 种主蛋白`,
      icon: 'none',
    });
  }
  void loadQuote(next);
  void loadDeliveryDate(next);
}

/** 份数/蛋白选择变化就记住，供下次进确认页恢复 */
watch(
  [recipeQuantity, proteinMode, selectedProteinCodes],
  () => {
    if (!multiRecipeEnabled.value) return;
    const customerId = getDraftCustomerId();
    if (!customerId || !dogId.value) return;
    saveCustomRecipeMultiChoice(
      customerId,
      dogId.value,
      {
        quantity: recipeQuantity.value,
        proteinMode: proteinMode.value,
        proteinCodes: selectedProteinCodes.value,
      },
      maxRecipeQuantity.value,
    );
  },
  { deep: true },
);

function selectProteinMode(mode: ProteinChoiceMode) {
  if (proteinMode.value === mode) return;
  proteinMode.value = mode;
  // 交给营养师就不再携带任何肉类偏好；切回自己选时重新选
  if (mode === 'DIETITIAN') {
    selectedProteinCodes.value = [];
  }
}

function toggleProtein(code: string) {
  if (proteinMode.value !== 'SELF') return;
  const result = toggleProteinCode(
    selectedProteinCodes.value,
    code,
    recipeQuantity.value,
  );
  if (result.limitReached) {
    uni.showToast({
      title: `最多选择 ${recipeQuantity.value} 种，先取消一种再换`,
      icon: 'none',
    });
    return;
  }
  selectedProteinCodes.value = result.codes;
}

async function loadConfirmData() {
  loading.value = true;
  loadError.value = '';
  const customerId = getDraftCustomerId();
  if (!customerId) {
    loadError.value = '请先登录后再确认订单';
    loading.value = false;
    return;
  }
  const loaded = loadCustomRecipeDraft(customerId, dogId.value);
  if (!loaded) {
    loadError.value = '没有找到这次定制信息';
    loading.value = false;
    return;
  }
  if (isCustomRecipeDraftExpired(loaded)) {
    loadError.value = '这次定制信息已过期';
    loading.value = false;
    return;
  }
  draft.value = loaded;
  clientRequestId.value = getOrCreateCustomRecipeSubmitKey(
    customerId,
    dogId.value,
  );
  // 旧本地草稿里的媒体代理 URL 可能已随后端重启失效，先按 key 刷新
  await refreshCustomRecipeDraftMedia(loaded.form);

  try {
    const [dogRes, configRes, initialDelivery] = await Promise.all([
      dogApi.detail(dogId.value).catch((error) => {
        console.warn('[CustomRecipe] 读取狗狗详情失败:', error);
        return null;
      }) as any,
      fetchPublicConfig(),
      // 交付日期只是参考信息：单独兜底，不能因为它失败把整页挡住
      fetchNextDeliveryDate().catch((error) => {
        console.warn('[CustomRecipe] 读取交付日期失败:', error);
        return null;
      }),
    ]);

    const dogProfile =
      dogRes?.data?.profile || dogRes?.data || dogRes || null;
    if (!dogProfile) {
      // 狗狗是这一单的对象；读不到就不允许在“不知道给谁买”的状态下付款
      loadError.value = '狗狗信息读取失败，请重试';
      return;
    }
    if (!configRes) {
      loadError.value = '读取定制设置失败，请重试';
      return;
    }

    dog.value = dogProfile;
    config.value = configRes;
    delivery.value = initialDelivery;
    deliveryError.value = initialDelivery
      ? ''
      : '交付日期读取失败，下单后以订单为准';

    // 摘要里的中文来自选项字典；必须等它读到（或明确失败）再放开支付
    await Promise.all([
      ensureCurrentFoodOptions(),
      ensureChangeReasonOptions(),
      ensureStomachOptions(),
      ensureGoalOptions(),
    ]);

    /**
     * 多份开关只认 `=== true`：后端默认关闭，关闭时份数固定 1、整块隐藏，
     * 保持原来的单份确认页不动。打开时才初始化步进器并取 1 份报价。
     */
    if (configRes?.multiRecipeEnabled === true) {
      maxRecipeQuantity.value = resolveMaxRecipeQuantity(
        configRes.maxRecipeQuantity,
      );
      const savedChoice = loadCustomRecipeMultiChoice(
        customerId,
        dogId.value,
        maxRecipeQuantity.value,
      );
      if (savedChoice) {
        recipeQuantity.value = savedChoice.quantity;
        proteinMode.value = savedChoice.proteinMode;
        selectedProteinCodes.value = savedChoice.proteinCodes;
      } else {
        recipeQuantity.value = 1;
        proteinMode.value = 'DIETITIAN';
        selectedProteinCodes.value = [];
      }
      void loadQuote(recipeQuantity.value);
      // 恢复的份数 > 1 时，初始交期是按 1 份拿的，要按真实份数重取
      if (recipeQuantity.value > 1) {
        void loadDeliveryDate(recipeQuantity.value);
      }
    } else {
      maxRecipeQuantity.value = 1;
      recipeQuantity.value = 1;
      proteinMode.value = 'DIETITIAN';
      selectedProteinCodes.value = [];
      quote.value = null;
      quoteError.value = '';
      quoteLoading.value = false;
      quoteRequestSeq += 1;
    }
  } catch (error: any) {
    loadError.value = error?.message || '读取确认信息失败，请返回重试';
  } finally {
    loading.value = false;
  }
}

function retryLoad() {
  void loadConfirmData();
}

/** 选项失败时只重试选项，不重新读草稿/狗狗/报价 */
function retryOptions() {
  void Promise.all([
    ensureCurrentFoodOptions(),
    ensureChangeReasonOptions(),
    ensureStomachOptions(),
    ensureGoalOptions(),
  ]);
}

function backToCustom() {
  uni.navigateBack({
    delta: 1,
    fail: () => {
      uni.redirectTo({ url: '/pages/custom-recipe/index' });
    },
  });
}

function validateBeforeSubmit(): string {
  const data = form.value;
  if (!data.dogId || !data.targetGoal) return '定制信息不完整，请返回重新填写';
  if (draft.value?.hasFoodAllergy === null) return '请返回回答过敏问题';
  if (draft.value?.hasFoodAllergy === true && !String(data.allergyText || '').trim()) {
    return '请返回补充过敏食物';
  }
  if (!String(data.currentFoodMain || '').trim()) {
    return '请返回补充现在主要喂什么';
  }
  if (
    data.currentFoodMain === 'OTHER' &&
    !String(data.currentFoodOther || '').trim()
  ) {
    return '请返回补充现在主要喂什么的说明';
  }
  if (!Array.isArray(data.changeReasons) || data.changeReasons.length === 0) {
    return '请返回选择定制原因';
  }
  if (
    data.changeReasons.includes('OTHER') &&
    !String(data.changeReasonOther || '').trim()
  ) {
    return '请返回补充定制原因说明';
  }
  if (
    Array.isArray(data.stomachConditions) &&
    data.stomachConditions.includes('OTHER') &&
    !String(data.stomachOther || '').trim()
  ) {
    return '请返回补充肠胃情况说明';
  }
  return '';
}

async function payCreatedOrder() {
  if (postPaying.value) return;
  const orderId = String(createdOrder.value?.orderId || '').trim();
  if (!orderId) return;

  postPaying.value = true;
  let outcome: CustomRecipePayOutcome = 'FAILED';
  try {
    outcome = await runCustomRecipePayment(orderId);

    if (outcome === 'PAID') {
      // 已付款：报告已进档案；保留上次的选择，但清掉上一单的报告/附件草稿
      retainCustomRecipeChoicesAfterPayment(
        getDraftCustomerId(),
        dogId.value,
      );
      uni.showToast({ title: '支付成功', icon: 'success' });
    }
  } catch (error: any) {
    outcome = 'FAILED';
    console.warn('[CustomRecipe] 支付异常:', error);
  } finally {
    postPaying.value = false;
  }

  if (outcome === 'PAID') {
    redirectToCreatedOrder();
    return;
  }

  /**
   * 订单已经创建，只是支付没完成。跳订单详情前先用弹窗把“订单已创建”
   * 讲清楚，避免顾客以为下单失败又去下一单。
   */
  const content =
    outcome === 'CANCELLED'
      ? '订单已创建，本次支付已取消。可以在订单详情继续支付。'
      : outcome === 'CLOSED'
        ? '订单已关闭，不能再继续支付。可以返回定制页重新下单。'
        : '订单已创建，但微信支付没有完成。可以在订单详情继续支付，或联系 Seven爸爸。';
  await new Promise<void>((resolve) => {
    uni.showModal({
      title: '订单已创建',
      content,
      showCancel: false,
      confirmText: '看订单',
      complete: () => resolve(),
    });
  });
  redirectToCreatedOrder();
}

function redirectToCreatedOrder() {
  const orderId = String(createdOrder.value?.orderId || '').trim();
  if (!orderId) return;
  uni.redirectTo({
    url: `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(orderId)}`,
  });
}

/** 最终选择「没有过敏」：订单创建成功后清理临时报告文件，避免孤儿文件 */
async function cleanupDiscardedAllergyReports(reports: any[]) {
  const keys: string[] = [];
  for (const report of reports || []) {
    for (const key of report?.attachmentKeys || []) {
      const value = String(key || '').trim();
      if (value) keys.push(value);
    }
  }
  for (const key of keys) {
    await dogApi.deleteHealthAttachment('allergy', key).catch((error) => {
      console.warn('[CustomRecipe] 清理被排除的过敏报告失败:', key, error);
    });
  }
}

async function submitConfirmedOrder() {
  if (submitting.value) return;
  const invalid = validateBeforeSubmit();
  if (invalid) {
    uni.showToast({ title: invalid, icon: 'none' });
    return;
  }

  /**
   * 多份：金额必须来自**最新一份**后端报价；报价没回来或失败时挡住提交。
   * 这里宁可让顾客多点一次重试，也不能用前端算出来的金额去支付。
   */
  if (!quoteReady.value) {
    uni.showToast({
      title: quoteError.value || '价格还未确认，请重试',
      icon: 'none',
    });
    return;
  }
  if (proteinSelectionError.value) {
    uni.showToast({ title: proteinSelectionError.value, icon: 'none' });
    return;
  }

  /**
   * 必须在点击事件的同步调用栈里发起订阅授权，不能先 await 网络。
   * 确认页加载时已经缓存了 orderNotifyTemplateId，这里直接传给 helper，
   * helper 会同步调用 uni.requestSubscribeMessage 弹出授权窗。
   */
  // 先把守卫立起来，再发起订阅/网络请求，堵住第二次点击的窗口
  submitting.value = true;
  const subscriptionRequest = requestCustomRecipeOrderSubscription(
    String(config.value?.orderNotifyTemplateId || ''),
  );
  uni.showLoading({ title: '提交中…' });
  try {
    await subscriptionRequest;
    const { reportDrafts, ...orderForm } = form.value;
    const isNoAllergy = draft.value?.hasFoodAllergy === false;
    const submittedAllergies = isNoAllergy
      ? []
      : Array.isArray(orderForm.allergies)
        ? orderForm.allergies
        : [];
    const submittedAllergyText = isNoAllergy
      ? ''
      : String(orderForm.allergyText || '');
    const submittedReportDrafts =
      isNoAllergy || !Array.isArray(reportDrafts) ? [] : reportDrafts;
    const payload = {
      ...orderForm,
      // 最终选择「没有过敏」：无论草稿里还留着什么，都不提交任何过敏数据
      allergies: submittedAllergies,
      allergyText: submittedAllergyText,
      attachmentKeys: Array.isArray(form.value.attachmentKeys)
        ? form.value.attachmentKeys
        : [],
      allergyStatus:
        draft.value?.hasFoodAllergy === true
          ? 'HAS_ALLERGY'
          : draft.value?.hasFoodAllergy === false
            ? 'NO_ALLERGY'
            : 'UNKNOWN',
      clientRequestId: clientRequestId.value,
      allergyReportDrafts: submittedReportDrafts,
      syncToHealthProfile: true,
      needsHealthManagement:
        !isNoAllergy &&
        (submittedAllergies.length > 0 ||
          Boolean(submittedAllergyText.trim())),
      // 多份关闭时强制 1 份；自己选才带肉类，营养师配一律空数组
      recipeQuantity: multiRecipeEnabled.value ? recipeQuantity.value : 1,
      requestedProteinCodes: multiRecipeEnabled.value
        ? resolveRequestedProteinCodes(
            proteinMode.value,
            selectedProteinCodes.value,
            recipeQuantity.value,
          )
        : [],
    };
    const created = await submitOrder(payload);
    const orderId = String(created?.orderId || '').trim();
    if (!orderId) throw new Error('服务端未返回订单号');
    markCustomRecipeDraftSubmitted(
      getDraftCustomerId(),
      dogId.value,
      orderId,
    );
    // 订单已创建：这把幂等键完成使命；下一次新单用新 key。
    // 如果响应丢失/页面刷新，key 还在，重进会复用并拿回同一张订单。
    clearCustomRecipeSubmitKey(
      getDraftCustomerId(),
      dogId.value,
      clientRequestId.value,
    );

    /**
     * 2026-10-21：订单创建成功后**不再立刻清本地草稿**。
     * 顾客可能只是创建了待付款单、最后没付；下次进入定制页应恢复上次填写，
     * 而不是从空白重填。草稿只在支付成功时清（见 payCreatedOrder）。
     */
    if (isNoAllergy && Array.isArray(reportDrafts) && reportDrafts.length) {
      void cleanupDiscardedAllergyReports(reportDrafts);
    }
    createdOrder.value = {
      ...created,
      orderId,
      status: created?.status || 'PENDING_PAYMENT',
    };
    // 先关 loading，再拉起微信支付；否则支付弹窗会被遮罩/loading 干扰。
    uni.hideLoading();
    submitting.value = false;
    await payCreatedOrder();
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '提交失败，请稍后重试',
      icon: 'none',
    });
  } finally {
    submitting.value = false;
    uni.hideLoading();
  }
}

onLoad((options: any) => {
  dogId.value = String(options?.dogId || '').trim();
  // key 在 loadConfirmData 里按“顾客 + 狗”从本地取/建，页面刷新也能复用
  clientRequestId.value = '';
  if (!dogId.value) {
    loadError.value = '缺少狗狗信息';
    loading.value = false;
    return;
  }
  void loadConfirmData();
});

onBackPress(() => {
  if (!submitting.value && !postPaying.value) return false;
  uni.showToast({ title: '订单正在处理，请稍候', icon: 'none' });
  return true;
});

onUnmounted(() => {
  // 页面已离开，晚到的报价/交期响应不再写回
  quoteRequestSeq += 1;
  deliveryRequestSeq += 1;
});
</script>

<style scoped>
.confirm-page {
  min-height: 100vh;
  padding: 24rpx 24rpx 220rpx;
  box-sizing: border-box;
  background: var(--sk-page, #f7f8f2);
}

.state-card {
  margin-top: 160rpx;
  padding: 48rpx 32rpx;
  border-radius: 20rpx;
  background: #ffffff;
  text-align: center;
}

.state-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
}

.state-desc {
  display: block;
  margin-top: 14rpx;
  font-size: 24rpx;
  color: #8a7a63;
}

.state-btn {
  margin-top: 30rpx;
  color: #ffffff;
  background: #1e3a2f;
  border-radius: 999rpx;
  font-size: 26rpx;
}

.state-btn--ghost {
  margin-top: 14rpx;
  color: #1e3a2f;
  background: #ffffff;
  border: 1rpx solid #d9dfcf;
}

.section {
  margin-bottom: 22rpx;
  padding: 26rpx 24rpx;
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid #e6e8db;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.title-text {
  font-size: 30rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.dog-card {
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.dog-avatar {
  width: 76rpx;
  height: 76rpx;
  line-height: 76rpx;
  border-radius: 50%;
  text-align: center;
  font-size: 38rpx;
  background: #f2efe4;
}

.dog-avatar--image {
  display: block;
  flex: none;
}

.dog-name {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
}

.dog-line {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #8a7a63;
}

.info-row {
  display: flex;
  align-items: flex-start;
  gap: 24rpx;
  padding: 14rpx 0;
  border-top: 1rpx solid #f0f1e9;
}

.info-row:first-of-type {
  border-top: none;
}

.info-label {
  flex: 0 0 190rpx;
  font-size: 24rpx;
  color: #8a7a63;
}

.info-value {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 26rpx;
  line-height: 1.55;
  color: #26261f;
  word-break: break-all;
}

.delivery-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 22rpx 20rpx;
  border-radius: 14rpx;
  background: #f7f9f1;
}

.delivery-card--single {
  justify-content: center;
}

.delivery-note {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #8a7a63;
}

.delivery-label {
  font-size: 24rpx;
  color: #8a7a63;
}

.delivery-value {
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

/* ===== 多份：配方份数 / 指定主蛋白 ===== */
.section-hint {
  margin-left: auto;
  font-size: 22rpx;
  color: #8a7a63;
}

.multi-question {
  display: block;
  margin-bottom: 16rpx;
  font-size: 24rpx;
  color: #8a7a63;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.step-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34rpx;
  color: #1e3a2f;
  background: #eef3e8;
}

.step-btn--disabled {
  opacity: 0.35;
}

.step-value {
  min-width: 44rpx;
  text-align: center;
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.step-hint {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 22rpx;
  line-height: 1.5;
  color: #8a7a63;
}

.protein-block {
  margin-top: 24rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid #f0f1e9;
}

.protein-title {
  display: block;
  margin-bottom: 14rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: #26261f;
}

.protein-mode-row {
  display: flex;
  gap: 14rpx;
}

.protein-mode {
  flex: 1;
  padding: 16rpx 0;
  border-radius: 12rpx;
  text-align: center;
  background: #f7f8f2;
  border: 1rpx solid #e3e6d4;
}

.protein-mode--on {
  background: #1e3a2f;
  border-color: #1e3a2f;
}

.protein-mode-label {
  font-size: 25rpx;
  color: #6b6653;
}

.protein-mode--on .protein-mode-label {
  color: #ffffff;
  font-weight: 700;
}

.protein-hint {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #8a7a63;
}

.protein-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.protein-option {
  min-width: 104rpx;
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  text-align: center;
  background: #ffffff;
  border: 1rpx solid #d8d9c9;
  box-sizing: border-box;
}

.protein-option--on {
  background: #1e3a2f;
  border-color: #1e3a2f;
}

.protein-option--disabled {
  opacity: 0.4;
}

.protein-option-label {
  font-size: 25rpx;
  color: #4d4a3d;
}

.protein-option--on .protein-option-label {
  color: #ffffff;
  font-weight: 700;
}

.protein-error {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #b45309;
}

/* ===== 多份：价格明细 ===== */
.price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 12rpx 0;
  border-top: 1rpx solid #f0f1e9;
}

.price-row:first-of-type {
  border-top: none;
}

.price-label {
  font-size: 24rpx;
  color: #8a7a63;
}

.price-value {
  font-size: 26rpx;
  color: #26261f;
}

.price-value--discount {
  color: #a8622a;
}

.price-row--total {
  margin-top: 6rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #e3e6d4;
}

.price-value--total {
  font-size: 32rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.price-sub {
  display: block;
  margin: -4rpx 0 10rpx;
  text-align: right;
  font-size: 21rpx;
  color: #a29a88;
}

.price-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 22rpx 0 8rpx;
}

.price-state-text {
  font-size: 23rpx;
  line-height: 1.6;
  color: #8a7a63;
  text-align: center;
}

.price-state--error .price-state-text {
  color: #b45309;
}

.retry-btn {
  height: 58rpx;
  line-height: 58rpx;
  padding: 0 30rpx;
  border-radius: 999rpx;
  font-size: 23rpx;
  color: #1e3a2f;
  background: #ffffff;
  border: 1rpx solid #cfd8c5;
}

.price-note {
  margin-top: 18rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #8a7a63;
}

.fee-missing {
  margin: 20rpx 0 0;
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  background: #fff7ed;
  color: #b45309;
  font-size: 23rpx;
  line-height: 1.6;
}

.refund-policy {
  display: block;
  margin: 18rpx 2rpx 0;
  font-size: 21rpx;
  line-height: 1.6;
  color: #8a7a63;
}

.bottom-space {
  height: 20rpx;
}

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding: 18rpx 24rpx calc(18rpx + env(safe-area-inset-bottom));
  background: #fbfcf7;
  border-top: 1rpx solid #e3e6d4;
  box-shadow: 0 -2rpx 16rpx rgba(30, 46, 36, 0.06);
}

.bottom-main {
  flex: 1;
  min-width: 0;
}

.option-wait-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding-bottom: 8rpx;
}

.option-wait-text {
  font-size: 22rpx;
  color: #b45309;
}

.option-wait-retry {
  font-size: 22rpx;
  font-weight: 700;
  color: #1e5b35;
}

.bottom-left {
  flex: 0 0 auto;
}

.bottom-price-label {
  display: block;
  font-size: 20rpx;
  color: #8a7a63;
}

.bottom-price {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.bottom-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.btn-back,
.btn-submit {
  height: 78rpx;
  line-height: 78rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
}

.btn-back {
  color: #6b6653;
  background: #ffffff;
  border: 1rpx solid #d8d9c9;
}

.btn-submit {
  flex: 1;
  width: 100%;
  min-width: 0;
  color: #ffffff;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid #d8bc85;
}

.submit-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.btn-later {
  font-size: 20rpx;
  line-height: 1.3;
  color: #8a7a63;
}

/* 确认页合并后的订单已提交/支付状态 */
.submitted-state {
  padding-bottom: 40rpx;
}

.submitted-hero {
  padding: 48rpx 28rpx 36rpx;
  text-align: center;
}

.submitted-icon {
  width: 76rpx;
  height: 76rpx;
  line-height: 76rpx;
  margin: 0 auto 18rpx;
  border-radius: 50%;
  background: #e7f0e9;
  color: #1e3a2f;
  font-size: 38rpx;
  font-weight: 700;
}

.submitted-title {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.submitted-desc {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #8a7a63;
}

.submitted-pay {
  border-color: #d8bc85;
}

.submitted-expired {
  border-color: #e6c9b4;
  background: #fdf7f0;
}

.submitted-pay-head {
  margin-bottom: 18rpx;
}

.submitted-pay-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.submitted-pay-deadline {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #a8622a;
}

.pay-btn {
  width: 100%;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid #d8bc85;
}

.submitted-pay-note {
  display: block;
  margin-top: 14rpx;
  font-size: 21rpx;
  line-height: 1.55;
  color: #8a7a63;
}

.submitted-actions {
  display: flex;
  justify-content: center;
  gap: 18rpx;
  margin-top: 8rpx;
}

.btn-secondary {
  height: 70rpx;
  line-height: 70rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: #1e3a2f;
  background: #ffffff;
  border: 1rpx solid #cfd8c5;
}

.preview-block {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #f0f1e9;
}

.preview-title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 22rpx;
  color: #8a7a63;
}

.preview-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.preview-item {
  width: 120rpx;
  height: 120rpx;
}

.preview-image {
  width: 120rpx;
  height: 120rpx;
  border-radius: 10rpx;
  background: #f2f1ec;
  border: 1rpx solid #e3e6d4;
}

.preview-doc {
  width: 120rpx;
  height: 120rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  border-radius: 10rpx;
  background: #f2f1ec;
  border: 1rpx solid #e3e6d4;
}

.preview-doc-badge {
  font-size: 22rpx;
  font-weight: 700;
  color: #8a6b3f;
}

.preview-doc-label {
  font-size: 18rpx;
  color: #8a7a63;
}

/* ===== 2026-10-23 顾客端统一视觉：温暖私厨 ===== */
.confirm-page {
  background: #f3eee3;
}

.section {
  background: #fffdf7;
  border-color: #e8decd;
  box-shadow: 0 12rpx 34rpx rgba(30, 58, 47, 0.05);
}

.title-text {
  font-family: "Songti SC", "STSong", serif;
  letter-spacing: 2rpx;
  color: #1e3a2f;
}

</style>
