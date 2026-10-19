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
      <view class="section hero-section">
        <view class="section-title">
          <text class="title-text">给谁定制</text>
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
          <text class="info-label">定制方向</text>
          <text class="info-value">{{ goalText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">过敏信息</text>
          <text class="info-value">{{ allergyDisplay }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">现在主要喂什么</text>
          <text class="info-value">{{ currentFoodText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">定制原因</text>
          <text class="info-value">{{ changeReasonText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">最近肠胃</text>
          <text class="info-value">{{ stomachText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">备注</text>
          <text class="info-value">{{ notesText }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">资料</text>
          <text class="info-value">{{ attachmentText }}</text>
        </view>
      </view>

      <view class="section">
        <view class="section-title">
          <text class="title-text">交付与费用</text>
        </view>
        <view class="delivery-card">
          <text class="delivery-label">预计交付</text>
          <text class="delivery-value">{{ deliveryText }}</text>
        </view>
        <view class="price-note">
          定价含营养师一对一设计，不含食材；付完可全额抵扣成品鲜食。
        </view>
      </view>

      <view class="bottom-space" />

      <view class="bottom-bar">
        <view class="bottom-left">
          <text class="bottom-price-label">定制费</text>
          <text class="bottom-price">¥{{ feeText }}</text>
        </view>
        <view class="bottom-actions">
          <button class="btn-back" @tap="backToCustom">返回修改</button>
          <button class="btn-submit" @tap="submitConfirmedOrder">
            {{ submitting ? '提交中…' : '提交订单' }}
          </button>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
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
import { requestCustomRecipeOrderSubscription } from '@/utils/custom-recipe-payment';
import { formatAmount } from '@/utils/custom-recipe-order';

const dogId = ref('');
const draft = ref<CustomRecipeDraft | null>(null);
const dog = ref<any>(null);
const config = ref<any>(null);
const delivery = ref<any>(null);
const loading = ref(true);
const loadError = ref('');
const submitting = ref(false);

const { ensure: ensureCurrentFoodOptions, labelOf: currentFoodLabel } =
  useOptionSet('custom_recipe_current_food');
const { ensure: ensureChangeReasonOptions, labelOf: changeReasonLabel } =
  useOptionSet('custom_recipe_change_reason');
const { ensure: ensureStomachOptions, labelOf: stomachLabel } =
  useOptionSet('custom_recipe_stomach');
const { ensure: ensureGoalOptions, labelOf: goalLabel } =
  useOptionSet('custom_recipe_goal');

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
    dog.value?.breed,
    dog.value?.weightKg ? `${dog.value.weightKg}kg` : '',
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

const reportCount = computed(() =>
  Array.isArray(form.value.reportDrafts) ? form.value.reportDrafts.length : 0,
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

const attachmentText = computed(() => {
  const count = Array.isArray(form.value.attachmentUrls)
    ? form.value.attachmentUrls.length
    : 0;
  const attachments = count > 0 ? `附件 ${count} 个` : '无附件';
  return reportCount.value > 0
    ? `${attachments} · 检测报告 ${reportCount.value} 份`
    : attachments;
});

const feeText = computed(() => formatAmount(config.value?.feeAmount ?? 0));

const deliveryText = computed(() => {
  const date = delivery.value?.estimatedDeliveryDate;
  if (!date) return '以付款页确认时间为准';
  const parts = String(date).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return `预计 ${date} 交付`;
  }
  const [year, month, day] = parts;
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
    new Date(year, month - 1, day).getDay()
  ];
  return `预计 ${month} 月 ${day} 日（${weekday}）交付`;
});

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
  void ensureCurrentFoodOptions();
  void ensureChangeReasonOptions();
  void ensureStomachOptions();
  void ensureGoalOptions();

  try {
    const [dogRes, configRes, deliveryRes] = await Promise.all([
      dogApi.detail(dogId.value).catch(() => null) as any,
      fetchPublicConfig(),
      fetchNextDeliveryDate(),
    ]);
    dog.value = dogRes?.data || dogRes || null;
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
  if (!data.dogId || !data.targetGoal) return '定制信息不完整，请返回修改';
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

async function submitConfirmedOrder() {
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
    const {
      reportDrafts,
      attachmentKeys,
      ...orderForm
    } = form.value;
    const payload = {
      ...orderForm,
      allergyReportDrafts: Array.isArray(reportDrafts) ? reportDrafts : [],
      syncToHealthProfile: true,
      needsHealthManagement:
        (Array.isArray(orderForm.allergies) && orderForm.allergies.length > 0) ||
        Boolean(String(orderForm.allergyText || '').trim()),
    };
    const created = await submitOrder(payload);
    const orderId = String(created?.orderId || '').trim();
    if (!orderId) throw new Error('服务端未返回订单号');

    clearCustomRecipeDraft(getDraftCustomerId(), dogId.value);
    const query = [
      `orderId=${encodeURIComponent(orderId)}`,
      `amount=${encodeURIComponent(String(created.amount ?? ''))}`,
      `creditAmount=${encodeURIComponent(String(created.creditAmount ?? ''))}`,
    ];
    // 确认页已经完成任务，用 reLaunch 清掉定制页/确认页，避免返回后重复下单
    uni.reLaunch({
      url: `/pages/custom-recipe/success?${query.join('&')}`,
    });
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
  if (!dogId.value) {
    loadError.value = '缺少狗狗信息';
    loading.value = false;
    return;
  }
  void loadConfirmData();
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
  justify-content: space-between;
  gap: 20rpx;
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
  min-width: 200rpx;
  color: #ffffff;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid #d8bc85;
}
</style>
