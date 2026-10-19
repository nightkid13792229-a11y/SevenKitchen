<template>
  <view class="confirm-page">
    <view v-if="loading" class="state-card">
      <text class="state-title">正在准备确认信息…</text>
      <text class="state-desc">马上就好</text>
    </view>

    <view v-else-if="loadError" class="state-card">
      <text class="state-title">{{ loadError }}</text>
      <text class="state-desc">返回定制页修改后再试</text>
      <button class="state-btn" @tap="backToCustom">返回定制页</button>
    </view>

    <template v-else>
      <template v-if="!createdOrder">
      <view class="section hero-section">
        <view class="section-title">
          <text class="title-text">定制对象</text>
        </view>
        <view class="dog-card">
          <view class="dog-avatar">🐕</view>
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

      <view class="bottom-space" />

      <view class="bottom-bar">
        <button
          class="btn-submit"
          :disabled="submitting"
          @tap="submitConfirmedOrder(true)"
        >
          {{ submitting ? '提交中…' : `确认并支付 ¥${feeText}` }}
        </button>
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
import { computed, ref, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { dogApi } from '@/api/dogs';
import {
  fetchNextDeliveryDate,
  fetchPublicConfig,
  submitOrder,
} from '@/api/custom-recipe';
import { useOptionSet } from '@/utils/option-set';
import { getStoredUser } from '@/utils/account';
import {
  clearCustomRecipeDraft,
  isCustomRecipeDraftExpired,
  loadCustomRecipeDraft,
  type CustomRecipeDraft,
} from '@/utils/custom-recipe-draft';
import { refreshCustomRecipeDraftMedia } from '@/utils/custom-recipe-media';
import {
  requestCustomRecipeOrderSubscription,
  runCustomRecipePayment,
} from '@/utils/custom-recipe-payment';
import {
  buildPaymentTimeoutHint,
  formatAmount,
  formatDate,
  isPaymentExpired,
  resolvePaymentDeadlineAt,
} from '@/utils/custom-recipe-order';
import { CUSTOM_RECIPE_STATUS_SET } from '@/utils/option-set';

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
const nowTick = ref(Date.now());
let paymentClockTimer: ReturnType<typeof setInterval> | null = null;
/** 本次确认页的幂等键：网络超时重试时后端返回同一张订单 */
const clientRequestId = ref('');

const { ensure: ensureCurrentFoodOptions, labelOf: currentFoodLabel } =
  useOptionSet('custom_recipe_current_food');
const { ensure: ensureChangeReasonOptions, labelOf: changeReasonLabel } =
  useOptionSet('custom_recipe_change_reason');
const { ensure: ensureStomachOptions, labelOf: stomachLabel } =
  useOptionSet('custom_recipe_stomach');
const { ensure: ensureGoalOptions, labelOf: goalLabel } =
  useOptionSet('custom_recipe_goal');
const { ensure: ensureStatusOptions, labelOf: statusLabel } =
  useOptionSet(CUSTOM_RECIPE_STATUS_SET);

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

const goalText = computed(() => {
  const target = String(form.value.targetGoal || '');
  if (!target) return '待确认';
  // 中文只来自后端选项字典，前端不再新增一份「目标 → 中文」映射
  return goalLabel(target);
});

const allergyDisplay = computed(() => {
  if (draft.value?.hasFoodAllergy === false) return '没有过敏';
  if (draft.value?.hasFoodAllergy === true) {
    const text = String(form.value.allergyText || '').trim();
    return text || '有过敏（未填写具体食物）';
  }
  return '未回答';
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
  return other ? `${label}（${other}）` : label;
});

const changeReasonText = computed(() => {
  const codes = Array.isArray(form.value.changeReasons)
    ? form.value.changeReasons
    : [];
  const other = String(form.value.changeReasonOther || '').trim();
  if (codes.length === 0 && !other) return '未填写';
  return `${codes.map((code: string) => changeReasonLabel(code)).join('、')}${
    other ? `（${other}）` : ''
  }`;
});

const stomachText = computed(() => {
  const codes = Array.isArray(form.value.stomachConditions)
    ? form.value.stomachConditions
    : [];
  const other = String(form.value.stomachOther || '').trim();
  if (codes.length === 0 && !other) return '未填写';
  return `${codes.map((code: string) => stomachLabel(code)).join('、')}${
    other ? `（${other}）` : ''
  }`;
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

const deliveryText = computed(() => {
  const date = delivery.value?.estimatedDeliveryDate;
  if (!date) return '排期中';
  const parts = String(date).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return String(date);
  }
  const [, month, day] = parts;
  return `预计 ${month} 月 ${day} 日（含）之前交付`;
});

const postStatus = computed(() =>
  String(createdOrder.value?.status || 'PENDING_PAYMENT'),
);
const postIsPaid = computed(() => postStatus.value === 'PAID');
const postIsClosed = computed(() =>
  ['CANCELLED', 'CLOSED', 'REFUNDED'].includes(postStatus.value),
);
const postDeadline = computed(() =>
  resolvePaymentDeadlineAt({
    paymentDeadlineAt: createdOrder.value?.paymentDeadlineAt ?? null,
    createdAt: createdOrder.value?.createdAt ?? null,
    paymentTimeoutMinutes: Number(config.value?.paymentTimeoutMinutes) || 0,
    now: nowTick.value,
  }),
);
const postPaymentExpired = computed(() =>
  isPaymentExpired(postDeadline.value, nowTick.value),
);
const postTitle = computed(() =>
  !createdOrder.value
    ? '确认订单'
    : postIsPaid.value
      ? '支付成功'
      : postIsClosed.value
        ? '订单已关闭'
        : postPaymentExpired.value
          ? '支付已超时'
          : '订单已提交',
);
const postDesc = computed(() =>
  postIsPaid.value
    ? '我们已收到付款，营养师会按排期开始设计。'
    : postIsClosed.value
      ? '这张订单已经关闭，可以返回定制页重新下单。'
      : postPaymentExpired.value
        ? '支付已超时，订单正在关闭，不能再继续支付。'
        : '订单已创建，完成支付后我们才会开始排期设计。',
);
const postFeeText = computed(() =>
  formatAmount(createdOrder.value?.amount ?? config.value?.feeAmount ?? 0),
);
const postDeliveryText = computed(() =>
  formatDate(createdOrder.value?.estimatedDeliveryDate, '排期中'),
);
const postStatusText = computed(() =>
  postPaymentExpired.value && !postIsPaid.value && !postIsClosed.value
    ? '支付超时'
    : statusLabel(postStatus.value) || postStatus.value,
);
const postPaymentHint = computed(() =>
  buildPaymentTimeoutHint({
    paymentDeadlineAt: createdOrder.value?.paymentDeadlineAt ?? null,
    createdAt: createdOrder.value?.createdAt ?? null,
    paymentTimeoutMinutes: Number(config.value?.paymentTimeoutMinutes) || 0,
    now: nowTick.value,
  }),
);
const postCreditText = computed(() =>
  createdOrder.value?.creditAmount
    ? formatAmount(createdOrder.value.creditAmount)
    : '',
);

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
  // 旧本地草稿里的媒体代理 URL 可能已随后端重启失效，先按 key 刷新
  await refreshCustomRecipeDraftMedia(loaded.form);
  void ensureCurrentFoodOptions();
  void ensureChangeReasonOptions();
  void ensureStomachOptions();
  void ensureGoalOptions();
  void ensureStatusOptions();

  try {
    const [dogRes, configRes, deliveryRes] = await Promise.all([
      dogApi.detail(dogId.value).catch(() => null) as any,
      fetchPublicConfig(),
      fetchNextDeliveryDate(),
    ]);
    dog.value = dogRes?.data?.profile || dogRes?.data || dogRes || null;
    config.value = configRes;
    delivery.value = deliveryRes;
  } catch (error: any) {
    loadError.value = error?.message || '读取确认信息失败，请返回重试';
  } finally {
    loading.value = false;
  }
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
  try {
    const outcome = await runCustomRecipePayment(orderId);

    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' });
    } else if (outcome === 'CLOSED') {
      uni.showToast({ title: '订单已关闭，请重新下单', icon: 'none' });
    } else if (outcome === 'CANCELLED') {
      uni.showToast({ title: '已取消支付，可继续支付', icon: 'none' });
    } else {
      // 不做人工收款兜底；支付通道不可用时让顾客在订单详情稍后重试
      uni.showToast({ title: '微信支付暂不可用，请稍后重试', icon: 'none' });
    }
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '支付失败，请稍后重试',
      icon: 'none',
    });
  } finally {
    postPaying.value = false;
    // 不再保留“订单已提交信息页”：创建订单/支付结束后统一进订单详情
    redirectToCreatedOrder();
  }
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

async function submitConfirmedOrder(payAfterSubmit = true) {
  if (submitting.value) return;
  const invalid = validateBeforeSubmit();
  if (invalid) {
    uni.showToast({ title: invalid, icon: 'none' });
    return;
  }

  submitting.value = true;
  uni.showLoading({ title: '提交中…' });
  try {
    await requestCustomRecipeOrderSubscription();
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
    };
    const created = await submitOrder(payload);
    const orderId = String(created?.orderId || '').trim();
    if (!orderId) throw new Error('服务端未返回订单号');

    clearCustomRecipeDraft(getDraftCustomerId(), dogId.value);
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
    if (payAfterSubmit) {
      await payCreatedOrder();
    }
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
  paymentClockTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 15000);
  dogId.value = String(options?.dogId || '').trim();
  clientRequestId.value = `cr-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
  if (!dogId.value) {
    loadError.value = '缺少狗狗信息';
    loading.value = false;
    return;
  }
  void loadConfirmData();
});

onUnmounted(() => {
  if (paymentClockTimer) {
    clearInterval(paymentClockTimer);
    paymentClockTimer = null;
  }
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

.price-note {
  margin-top: 18rpx;
  font-size: 23rpx;
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
</style>
