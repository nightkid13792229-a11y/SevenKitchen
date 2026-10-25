<template>
  <view class="refund-page">
    <view v-if="loading" class="state-card">
      <text class="state-title">正在准备退款信息…</text>
      <text class="state-desc">马上就好</text>
    </view>

    <view v-else-if="needLogin" class="state-card">
      <text class="state-title">登录已过期</text>
      <text class="state-desc">请重新登录后再处理退款</text>
      <button class="state-btn" @tap="goLogin">去登录</button>
    </view>

    <view v-else-if="loadError" class="state-card">
      <text class="state-title">{{ loadError }}</text>
      <text class="state-desc">返回订单后可以再试一次</text>
      <button class="state-btn" @tap="load">重试</button>
      <button class="state-btn state-btn--ghost" @tap="goOrder">返回订单</button>
    </view>

    <template v-else>
      <view class="hero" :class="`hero--${heroTone}`">
        <view class="hero-icon">{{ heroIcon }}</view>
        <view class="hero-main">
          <view class="hero-title-row">
            <text class="hero-title">{{ heroTitle }}</text>
            <text class="hero-badge">{{ heroBadge }}</text>
          </view>
          <text class="hero-desc">{{ heroDesc }}</text>
        </view>
      </view>

      <view class="order-card">
        <view class="dog-avatar">{{ dogInitial }}</view>
        <view class="order-main">
          <text class="order-name">{{ order.dogName || '狗狗' }} · 定制食谱</text>
          <text class="order-meta">订单 {{ order.orderId }}</text>
          <text class="order-meta order-meta--sub">{{ orderDateText }}</text>
        </view>
        <view class="order-amount">
          <text class="order-amount-label">实付</text>
          <text class="order-amount-value">¥{{ formatAmount(order.amount) }}</text>
        </view>
      </view>

      <template v-if="screen === 'BLOCKED'">
        <view class="section">
          <text class="section-title">这张订单现在不能在这里退款</text>
          <text class="blocked-text">{{ blockedText }}</text>
          <button class="btn btn--secondary" @tap="goOrder">返回订单详情</button>
        </view>
      </template>

      <template v-else-if="screen === 'A'">
        <view class="amount-card">
          <view>
            <text class="amount-label">退款金额</text>
            <view class="amount-value"><text class="amount-yen">¥</text>{{ formatAmount(order.amount) }}</view>
          </view>
          <view class="amount-side">
            <text class="amount-side-line">微信原路退回</text>
            <text class="amount-side-line">零钱即时，银行卡 0-3 个工作日</text>
          </view>
        </view>

        <view class="section">
          <view class="section-head">
            <text class="section-title">退款原因</text>
            <text class="section-hint">选填，帮助我们知道哪里可以做得更好</text>
          </view>
          <view v-if="reasonLoading" class="option-state">正在读取原因…</view>
          <view v-else-if="reasonFailed" class="option-state option-state--error">
            <text>退款原因没加载出来</text>
            <text class="option-retry" @tap="retryReasons">重试</text>
          </view>
          <view v-else class="chips">
            <text
              v-for="reason in reasonOptions"
              :key="reason.code"
              class="chip"
              :class="{ 'chip--on': selectedReasonCode === reason.code }"
              @tap="selectedReasonCode = selectedReasonCode === reason.code ? '' : reason.code"
            >{{ reason.label }}</text>
          </view>
        </view>

        <view class="notice">
          退款后这张订单会取消。已上传的检测报告仍会保留在狗狗的健康档案里，下次定制可以继续用。
        </view>

        <view class="bottom-bar">
          <view class="bottom-note">退款后订单会取消，无法撤回</view>
          <button class="btn btn--primary" :loading="submitting" :disabled="submitting" @tap="confirmFullRefund">
            确认退款 ¥{{ formatAmount(order.amount) }}
          </button>
        </view>
      </template>

      <template v-else-if="screen === 'B'">
        <view class="amount-card">
          <view>
            <text class="amount-label">退款金额</text>
            <text class="amount-pending">待Seven爸爸确认</text>
          </view>
          <view class="amount-side">
            <text class="amount-side-line">最终金额以审核为准</text>
            <text class="amount-side-line">审核通过后原路退回</text>
          </view>
        </view>

        <view class="section">
          <view class="section-head">
            <text class="section-title">退款原因</text>
            <text class="section-hint">必选</text>
          </view>
          <view v-if="reasonLoading" class="option-state">正在读取原因…</view>
          <view v-else-if="reasonFailed" class="option-state option-state--error">
            <text>退款原因没加载出来</text>
            <text class="option-retry" @tap="retryReasons">重试</text>
          </view>
          <view v-else-if="!reasonOptions.length" class="option-state">暂无可选原因，请联系Seven爸爸</view>
          <view v-else class="chips">
            <text
              v-for="reason in reasonOptions"
              :key="reason.code"
              class="chip"
              :class="{ 'chip--on': selectedReasonCode === reason.code }"
              @tap="selectedReasonCode = reason.code"
            >{{ reason.label }}</text>
          </view>
        </view>

        <view class="section">
          <view class="section-head">
            <text class="section-title">具体情况</text>
            <text class="section-hint">必填</text>
          </view>
          <textarea
            v-model="description"
            class="field"
            maxlength="200"
            :adjust-position="true"
            placeholder="比如：狗狗吃了两天不太适应，或和沟通的方案不一致……"
          />
          <view class="field-foot">{{ description.length }} / 200</view>
        </view>

        <view class="section">
          <view class="section-head">
            <text class="section-title">上传照片</text>
            <text class="section-hint">选填，最多 6 张</text>
          </view>
          <view class="upload-row">
            <view v-for="(photo, index) in photos" :key="photo" class="photo-wrap">
              <image class="photo" :src="photo" mode="aspectFill" @tap="previewPhoto(photo)" />
              <text class="photo-remove" @tap.stop="removePhoto(index)">×</text>
            </view>
            <view v-if="photos.length < 6" class="upload-tile" @tap="pickPhoto">
              <text class="upload-plus">＋</text>
              <text class="upload-label">添加</text>
            </view>
          </view>
          <text class="upload-hint">食谱、实际喂食情况或狗狗状态的照片，能帮助Seven爸爸更快判断。</text>
        </view>

        <view class="notice">提交后一个工作日内处理。</view>

        <view class="bottom-bar">
          <view class="bottom-bar__row">
            <CustomerServiceInlineButton
              compact
              label="Seven爸爸"
              source-type="ORDER"
              :order-id="orderId"
              :order-no="orderId"
              :title="`定制订单退款 ${orderId}`"
              path="/pages/custom-recipe/order-detail"
            />
            <button class="btn btn--gold bottom-bar__main" :loading="submitting" :disabled="!canSubmitB" @tap="submitRequest">
              提交退款申请
            </button>
          </view>
        </view>
      </template>

      <template v-else>
        <view class="result-card" :class="`result-card--${resultTone}`">
          <view class="result-icon">{{ resultIcon }}</view>
          <text class="result-title">{{ resultTitle }}</text>
          <text class="result-desc">{{ resultDesc }}</text>
          <view class="result-amount">
            <text class="result-amount-label">{{ resultAmountLabel }}</text>
            <text class="result-amount-value">{{ resultAmountText }}</text>
          </view>
        </view>

        <view class="section">
          <view class="timeline">
            <view
              v-for="(step, index) in progressSteps"
              :key="step.title"
              class="t-row"
              :class="{ 't-row--done': step.done, 't-row--active': step.active }"
            >
              <view class="t-rail">
                <view class="t-dot">{{ step.done ? '✓' : '' }}</view>
                <view v-if="index < progressSteps.length - 1" class="t-line" />
              </view>
              <view class="t-body">
                <text class="t-title">{{ step.title }}</text>
                <text class="t-meta">{{ step.meta }}</text>
              </view>
            </view>
          </view>
        </view>

        <view v-if="resultNote" class="notice">{{ resultNote }}</view>
        <text class="refresh-link" @tap="refreshProgress">刷新进度</text>

        <view class="bottom-bar">
          <view class="bottom-bar__row">
            <CustomerServiceInlineButton
              compact
              label="Seven爸爸"
              source-type="ORDER"
              :order-id="orderId"
              :order-no="orderId"
              :title="`定制订单退款 ${orderId}`"
              path="/pages/custom-recipe/order-detail"
            />
            <button class="btn btn--secondary bottom-bar__main" @tap="goOrder">查看订单</button>
          </view>
          <button v-if="canReapply" class="btn btn--ghost" @tap="reapply">重新申请</button>
        </view>
      </template>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import {
  cancelOrder,
  createCustomRecipeRefundRequest,
  fetchCustomRecipeRefundRequest,
  fetchOrderDetail,
  uploadAftersaleAttachment,
  type CustomRecipeOrderDetail,
  type CustomRecipeRefundRequestView,
} from '@/api/custom-recipe';
import { getToken } from '@/utils/api';
import { formatAmount } from '@/utils/custom-recipe-order';
import { useOptionSet } from '@/utils/option-set';
import CustomerServiceInlineButton from '@/components/CustomerServiceInlineButton.vue';

type Screen = 'A' | 'B' | 'C' | 'BLOCKED';

const orderId = ref('');
const order = ref<CustomRecipeOrderDetail>({});
const refundRequest = ref<CustomRecipeRefundRequestView | null>(null);
const loading = ref(true);
const loadError = ref('');
const needLogin = ref(false);
const screen = ref<Screen>('A');
const submitting = ref(false);
const uploaded = ref(false);

const {
  items: reasonOptions,
  loading: reasonLoading,
  failed: reasonFailed,
  ensure: ensureReasonOptions,
} = useOptionSet('custom_recipe_refund_reason');
const reasonOptionsRef = reasonOptions;
const reasonLoadingRef = reasonLoading;
const reasonFailedRef = reasonFailed;

const selectedReasonCode = ref('');
const description = ref('');
const photos = ref<string[]>([]);

const reasonLabel = computed(
  () =>
    reasonOptionsRef.value.find((item) => item.code === selectedReasonCode.value)
      ?.label || '',
);

const dogInitial = computed(() => {
  const name = String(order.value.dogName || '').trim();
  return name ? [...name][0] : '🐾';
});

const orderDateText = computed(() => {
  const raw = order.value.paymentConfirmedAt || order.value.createdAt;
  if (!raw) return '付款时间以订单为准';
  return `付款 ${formatDateTime(raw)}`;
});

const blockedText = computed(() => {
  if (order.value.status === 'PENDING_PAYMENT') {
    return '这张订单还没付款。请先在订单详情付款，或取消订单；待付款订单不涉及退款。';
  }
  return '当前订单状态没有可处理的退款。返回订单详情看看最新状态。';
});

const heroTone = computed(() => {
  if (screen.value === 'B') return 'warm';
  if (screen.value === 'C') return 'result';
  return 'green';
});
const heroIcon = computed(() => {
  if (screen.value === 'A') return '¥';
  if (screen.value === 'B') return '!';
  if (screen.value === 'C') return resultTone.value === 'success' ? '✓' : '…';
  return '—';
});
const heroTitle = computed(() => {
  if (screen.value === 'A') return '可全额退款';
  if (screen.value === 'B') {
    return order.value.status === 'IN_PROGRESS' ? '制作中，需要审核' : '已交付，需要审核';
  }
  if (screen.value === 'C') return resultTitle.value;
  return '暂不能退款';
});
const heroBadge = computed(() => {
  if (screen.value === 'A') return '未开始制作';
  if (screen.value === 'B') return order.value.status === 'IN_PROGRESS' ? '制作中' : '已交付';
  if (screen.value === 'C') return '退款进度';
  return '—';
});
const heroDesc = computed(() => {
  if (screen.value === 'A') {
    return 'Seven爸爸还没开始设计这份食谱，定制费将原路退回微信。';
  }
  if (screen.value === 'B') {
    return '食谱已经进入制作或交付。退款会根据实际情况和你的说明审核，不是一键全额。';
  }
  if (screen.value === 'C') return resultDesc.value;
  return blockedText.value;
});

const canSubmitB = computed(
  () =>
    !submitting.value &&
    !reasonLoadingRef.value &&
    !reasonFailedRef.value &&
    Boolean(selectedReasonCode.value) &&
    Boolean(description.value.trim()) &&
    !uploaded.value,
);

const refundStatus = computed(() =>
  String(order.value.refundStatus || '').toUpperCase(),
);
const isCancelledWithRefund = computed(
  () =>
    ['CANCELLED', 'CLOSED'].includes(String(order.value.status)) &&
    Boolean(refundStatus.value || order.value.paymentConfirmedAt),
);
const activeRequest = computed(() => refundRequest.value);

const resultTone = computed(() => {
  if (refundRequest.value) {
    if (refundRequest.value.status === 'REFUNDED') return 'success';
    if (refundRequest.value.status === 'REJECTED') return 'rejected';
    if (refundRequest.value.status === 'FAILED') return 'failed';
    return 'processing';
  }
  if (refundStatus.value === 'SUCCESS') return 'success';
  if (refundStatus.value === 'FAILED') return 'failed';
  return 'processing';
});
const resultIcon = computed(() =>
  resultTone.value === 'success' ? '✓' : resultTone.value === 'rejected' ? '!' : '…',
);
const resultTitle = computed(() => {
  if (isCancelledWithRefund.value) {
    if (refundStatus.value === 'SUCCESS') return '退款成功';
    if (refundStatus.value === 'FAILED') return '退款失败';
    return '退款处理中';
  }
  const status = activeRequest.value?.status;
  if (status === 'REFUNDED') return '退款成功';
  if (status === 'REJECTED') return '退款未通过';
  if (status === 'FAILED') return '退款失败';
  if (status === 'PROCESSING') return '退款处理中';
  return '退款申请审核中';
});
const resultDesc = computed(() => {
  if (isCancelledWithRefund.value) {
    if (refundStatus.value === 'SUCCESS') return '退款已原路退回，到账时间以微信为准。';
    if (refundStatus.value === 'FAILED') return '退款没有成功，请联系Seven爸爸处理。';
    return '退款已发起，正在原路退回你的微信支付账户。';
  }
  const status = activeRequest.value?.status;
  if (status === 'REFUNDED') return '退款已完成，到账时间以微信为准。';
  if (status === 'REJECTED') return '这次申请没有通过。可以看看审核说明，或联系Seven爸爸。';
  if (status === 'FAILED') return '退款没有成功，请联系Seven爸爸，我们会帮你查这笔退款。';
  if (status === 'PROCESSING') return '审核已通过，退款正在处理中。';
  return '已收到申请，Seven爸爸会在一个工作日内处理。';
});
const resultAmountLabel = computed(() => {
  if (isCancelledWithRefund.value) return '退款金额';
  return activeRequest.value?.status === 'PENDING' ? '退款金额待确认' : '退款金额';
});
const resultAmountText = computed(() => {
  if (isCancelledWithRefund.value) {
    return `¥${formatAmount(order.value.refundAmount ?? order.value.amount)}`;
  }
  const request = activeRequest.value;
  if (!request) return '—';
  if (request.status === 'PENDING') return '待确认';
  return `¥${formatAmount(request.amount)}`;
});
const resultNote = computed(() => {
  if (isCancelledWithRefund.value) {
    return '到账时间以微信为准：零钱即时，银行卡 0-3 个工作日。';
  }
  const request = activeRequest.value;
  if (!request) return '';
  if (request.status === 'REJECTED' || request.status === 'FAILED') {
    return request.adminNote || '';
  }
  if (request.status === 'REFUNDED' || request.status === 'PROCESSING') {
    return '到账时间以微信为准：零钱即时，银行卡 0-3 个工作日。';
  }
  return '审核通过后才会发起退款；未通过会说明原因。';
});
const canReapply = computed(
  () =>
    Boolean(activeRequest.value) &&
    ['REJECTED', 'FAILED'].includes(String(activeRequest.value?.status)),
);

const progressSteps = computed(() => {
  if (isCancelledWithRefund.value) {
    const sent = ['PROCESSING', 'SUCCESS'].includes(refundStatus.value);
    const done = refundStatus.value === 'SUCCESS';
    return [
      { title: '订单已取消', meta: '退款金额已确认', done: true, active: false },
      { title: '退款已发起', meta: sent ? '等待微信处理' : '正在发起退款', done: sent, active: !done },
      {
        title: '原路退回',
        meta: done ? '退款已完成' : '零钱即时，银行卡 0-3 个工作日',
        done,
        active: false,
      },
    ];
  }

  const status = activeRequest.value?.status;
  if (status === 'REFUNDED') {
    return [
      { title: '申请已提交', meta: '已收到退款申请', done: true, active: false },
      { title: 'Seven爸爸审核通过', meta: '审核已完成', done: true, active: false },
      { title: '退款已发起', meta: '微信原路退回中', done: true, active: false },
      { title: '退款到账', meta: '零钱即时，银行卡 0-3 个工作日', done: true, active: false },
    ];
  }
  if (status === 'PROCESSING') {
    return [
      { title: '申请已提交', meta: '已收到退款申请', done: true, active: false },
      { title: 'Seven爸爸审核通过', meta: '审核已完成', done: true, active: false },
      { title: '退款已发起', meta: '等待微信处理', done: false, active: true },
      { title: '退款到账', meta: '零钱即时，银行卡 0-3 个工作日', done: false, active: false },
    ];
  }
  if (status === 'REJECTED' || status === 'FAILED') {
    return [
      { title: '申请已提交', meta: '已收到退款申请', done: true, active: false },
      {
        title: status === 'REJECTED' ? '审核未通过' : '退款失败',
        meta: activeRequest.value?.adminNote || '请联系Seven爸爸',
        done: false,
        active: true,
      },
    ];
  }
  return [
    { title: '申请已提交', meta: '已收到退款申请', done: true, active: false },
    { title: 'Seven爸爸审核中', meta: '一个工作日内处理', done: false, active: true },
    { title: '审核通过后退款', meta: '审核通过后原路发起', done: false, active: false },
    { title: '微信退款到账', meta: '零钱即时，银行卡 0-3 个工作日', done: false, active: false },
  ];
});

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function resolveScreen() {
  const status = String(order.value.status || '');
  if (status === 'PAID') {
    screen.value = 'A';
    return;
  }
  if (['IN_PROGRESS', 'DELIVERED', 'COMPLETED'].includes(status)) {
    screen.value = refundRequest.value ? 'C' : 'B';
    return;
  }
  if (
    ['CANCELLED', 'CLOSED'].includes(status) &&
    (refundStatus.value || order.value.paymentConfirmedAt)
  ) {
    screen.value = 'C';
    return;
  }
  screen.value = 'BLOCKED';
}

async function load() {
  loading.value = true;
  loadError.value = '';
  needLogin.value = false;
  try {
    if (!getToken()) {
      needLogin.value = true;
      return;
    }
    const detail = await fetchOrderDetail(orderId.value);
    if (!detail) {
      loadError.value = '订单信息读取失败，请重试';
      return;
    }
    order.value = detail;
    const embedded = detail.refundRequest ?? null;
    refundRequest.value =
      embedded ||
      (await fetchCustomRecipeRefundRequest(orderId.value).catch(() => null));
    resolveScreen();
    void ensureReasonOptions();
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes('Authentication required') || message.includes('401')) {
      needLogin.value = true;
      return;
    }
    loadError.value = message || '订单信息读取失败，请重试';
  } finally {
    loading.value = false;
  }
}

function retryReasons() {
  void ensureReasonOptions();
}

async function confirmFullRefund() {
  if (submitting.value) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '确认退款？',
      content: `退款 ¥${formatAmount(order.value.amount)}，订单会取消，无法撤回。`,
      confirmText: '确认退款',
      cancelText: '再想想',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  submitting.value = true;
  uni.showLoading({ title: '退款中…' });
  try {
    const reason = reasonLabel.value || undefined;
    const result = await cancelOrder(orderId.value, reason);
    if (!result.ok) throw new Error(result.message || '退款失败');
    uni.showToast({ title: '退款已发起', icon: 'none' });
    await load();
  } catch (error: any) {
    uni.showToast({ title: error?.message || '退款失败，请稍后重试', icon: 'none' });
  } finally {
    submitting.value = false;
    uni.hideLoading();
  }
}

async function pickPhoto() {
  if (uploaded.value || photos.value.length >= 6) return;
  let filePath = '';
  try {
    const chosen: any = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album'],
        success: resolve,
        fail: reject,
      });
    });
    filePath = chosen?.tempFilePaths?.[0] || '';
  } catch {
    return;
  }
  if (!filePath) return;

  uploaded.value = true;
  uni.showLoading({ title: '上传中…' });
  try {
    const { url } = await uploadAftersaleAttachment(orderId.value, filePath);
    photos.value = [...photos.value, url];
  } catch (error: any) {
    uni.showToast({ title: error?.message || '上传失败，请重试', icon: 'none' });
  } finally {
    uploaded.value = false;
    uni.hideLoading();
  }
}

function removePhoto(index: number) {
  photos.value = photos.value.filter((_, i) => i !== index);
}

function previewPhoto(url: string) {
  uni.previewImage({ urls: photos.value, current: url });
}

async function submitRequest() {
  if (!canSubmitB.value) {
    if (!selectedReasonCode.value) {
      uni.showToast({ title: '请选择退款原因', icon: 'none' });
    } else if (!description.value.trim()) {
      uni.showToast({ title: '请说明具体情况', icon: 'none' });
    }
    return;
  }
  submitting.value = true;
  uni.showLoading({ title: '提交中…' });
  try {
    const request = await createCustomRecipeRefundRequest(orderId.value, {
      reasonCode: selectedReasonCode.value,
      reasonLabel: reasonLabel.value,
      description: description.value.trim(),
      photos: photos.value,
    });
    refundRequest.value = request;
    screen.value = 'C';
    uni.showToast({ title: '已提交，等待审核', icon: 'none' });
    uni.pageScrollTo({ scrollTop: 0, duration: 200 });
  } catch (error: any) {
    uni.showToast({ title: error?.message || '提交失败，请稍后重试', icon: 'none' });
  } finally {
    submitting.value = false;
    uni.hideLoading();
  }
}

function reapply() {
  selectedReasonCode.value = '';
  description.value = '';
  photos.value = [];
  refundRequest.value = null;
  screen.value = 'B';
  uni.pageScrollTo({ scrollTop: 0, duration: 200 });
}

function refreshProgress() {
  void load();
}

function goOrder() {
  uni.redirectTo({
    url: `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(orderId.value)}`,
  });
}

function goLogin() {
  const redirect = `/pages/custom-recipe/refund?orderId=${encodeURIComponent(orderId.value)}`;
  uni.navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}`,
  });
}

onPullDownRefresh(() => {
  void load().finally(() => uni.stopPullDownRefresh());
});

onLoad((options: any) => {
  orderId.value = String(options?.orderId || '').trim();
  if (!orderId.value) {
    loadError.value = '缺少订单信息';
    loading.value = false;
    return;
  }
  void load();
});

let shown = false;
onShow(() => {
  if (shown && orderId.value && !loading.value) {
    void load();
  }
  shown = true;
});
</script>

<style scoped>
.refund-page {
  min-height: 100vh;
  padding: 24rpx 24rpx 260rpx;
  box-sizing: border-box;
  background: var(--sk-page, #f7f8f2);
}

.state-card {
  margin-top: 180rpx;
  padding: 48rpx 32rpx;
  border-radius: 24rpx;
  background: #fffdf7;
  text-align: center;
}
.state-title { display: block; font-size: 32rpx; font-weight: 700; color: #26261f; }
.state-desc { display: block; margin-top: 14rpx; font-size: 24rpx; color: #8a7a63; }
.state-btn {
  margin-top: 30rpx; color: #fff; background: #1e3a2f;
  border-radius: 999rpx; font-size: 26rpx;
}
.state-btn--ghost { margin-top: 14rpx; color: #1e3a2f; background: #fff; border: 1rpx solid #d9dfcf; }

.hero {
  display: flex; gap: 18rpx; align-items: flex-start;
  padding: 28rpx 24rpx; border-radius: 22rpx;
  background: linear-gradient(135deg, #eef3e8, #f7f9f1);
  border: 1rpx solid #dfe7d4;
}
.hero--warm { background: linear-gradient(135deg, #fbf3e5, #fffaf1); border-color: #eddfc6; }
.hero--result { background: linear-gradient(135deg, #eef3e8, #f8faf2); }
.hero-icon {
  width: 64rpx; height: 64rpx; flex: none; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #1e3a2f; color: #f6efe0; font-size: 30rpx; font-weight: 800;
}
.hero--warm .hero-icon { background: #d8bc85; color: #1e3a2f; }
.hero-main { flex: 1; min-width: 0; }
.hero-title-row { display: flex; align-items: center; gap: 10rpx; flex-wrap: wrap; }
.hero-title { font-size: 32rpx; font-weight: 800; color: #1e3a2f; }
.hero-badge {
  padding: 4rpx 12rpx; border-radius: 999rpx; background: #1e3a2f;
  color: #f6efe0; font-size: 18rpx; font-weight: 700;
}
.hero--warm .hero-badge { background: #f1e5cc; color: #7a5a20; border: 1rpx solid #e6d3ae; }
.hero-desc { display: block; margin-top: 8rpx; font-size: 23rpx; line-height: 1.6; color: #8a7a63; }

.order-card {
  display: flex; align-items: center; gap: 16rpx;
  margin-top: 18rpx; padding: 22rpx 20rpx;
  border-radius: 20rpx; background: #fffdf7; border: 1rpx solid #e8e2d2;
}
.dog-avatar {
  width: 78rpx; height: 78rpx; flex: none; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(145deg, #d9b98a, #b99561);
  color: #fffaf1; font-size: 28rpx; font-weight: 800;
}
.order-main { flex: 1; min-width: 0; }
.order-name { display: block; font-size: 27rpx; font-weight: 800; color: #26261f; }
.order-meta { display: block; margin-top: 4rpx; font-size: 21rpx; color: #8a7a63; }
.order-meta--sub { color: #a79b86; font-size: 19rpx; }
.order-amount { flex: none; text-align: right; }
.order-amount-label { display: block; font-size: 18rpx; color: #a79b86; }
.order-amount-value { display: block; margin-top: 4rpx; font-size: 28rpx; font-weight: 800; color: #26261f; }

.amount-card {
  display: flex; align-items: center; justify-content: space-between; gap: 16rpx;
  margin-top: 18rpx; padding: 24rpx 22rpx;
  border-radius: 20rpx; background: #fffdf7; border: 1rpx solid #e8e2d2;
}
.amount-label { display: block; font-size: 21rpx; color: #8a7a63; }
.amount-value { display: flex; align-items: baseline; margin-top: 4rpx; font-size: 58rpx; font-weight: 800; letter-spacing: -2rpx; color: #26261f; }
.amount-yen { font-size: 28rpx; margin-right: 2rpx; }
.amount-pending { display: block; margin-top: 8rpx; font-size: 30rpx; font-weight: 800; color: #26261f; }
.amount-side { flex: none; text-align: right; max-width: 300rpx; }
.amount-side-line { display: block; font-size: 20rpx; line-height: 1.6; color: #8a7a63; }

.section {
  margin-top: 18rpx; padding: 24rpx 22rpx;
  border-radius: 20rpx; background: #fffdf7; border: 1rpx solid #e8e2d2;
}
.section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12rpx; margin-bottom: 14rpx; }
.section-title { font-size: 26rpx; font-weight: 800; color: #1e3a2f; }
.section-hint { font-size: 20rpx; color: #a79b86; }

.chips { display: flex; flex-wrap: wrap; gap: 12rpx; }
.chip {
  min-height: 52rpx; padding: 0 20rpx; border-radius: 999rpx;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1rpx solid #e8e2d2; background: #fffdf7;
  font-size: 22rpx; color: #8a7a63;
}
.chip--on { background: #1e3a2f; border-color: #1e3a2f; color: #f6efe0; font-weight: 700; }

.option-state {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18rpx 20rpx; border-radius: 12rpx; background: #f7f8f2;
  font-size: 22rpx; color: #8a7a63;
}
.option-state--error { background: #fff7ed; color: #b45309; }
.option-retry { font-weight: 700; color: #1e5b35; }

.field {
  width: 100%; min-height: 140rpx; box-sizing: border-box;
  padding: 18rpx 20rpx; border-radius: 14rpx;
  border: 1rpx solid #e8e2d2; background: #fffefb;
  font-size: 23rpx; line-height: 1.6; color: #26261f;
}
.field-foot { text-align: right; margin-top: 8rpx; font-size: 18rpx; color: #a79b86; }

.upload-row { display: flex; flex-wrap: wrap; gap: 12rpx; align-items: center; }
.photo-wrap { position: relative; width: 128rpx; height: 128rpx; }
.photo { width: 128rpx; height: 128rpx; border-radius: 12rpx; }
.photo-remove {
  position: absolute; top: -8rpx; right: -8rpx;
  width: 34rpx; height: 34rpx; line-height: 30rpx; text-align: center;
  border-radius: 50%; background: rgba(30, 58, 47, 0.82); color: #fff; font-size: 24rpx;
}
.upload-tile {
  width: 128rpx; height: 128rpx; border-radius: 12rpx;
  border: 1rpx dashed #d7c9b0; background: #fffdf8;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2rpx; color: #a79b86;
}
.upload-plus { font-size: 34rpx; line-height: 1; }
.upload-label { font-size: 18rpx; }
.upload-hint { display: block; margin-top: 12rpx; font-size: 19rpx; line-height: 1.6; color: #a79b86; }

.refresh-link {
  display: block; margin-top: 16rpx; text-align: center;
  font-size: 21rpx; color: #1e5b35; font-weight: 700;
}

.notice {
  margin-top: 18rpx; padding: 20rpx 22rpx; border-radius: 16rpx;
  background: #f4f1e7; border: 1rpx solid #ebe4d4;
  font-size: 20rpx; line-height: 1.6; color: #8a7a63;
}
.blocked-text { display: block; margin: 12rpx 0 24rpx; font-size: 23rpx; line-height: 1.7; color: #8a7a63; }

.result-card {
  padding: 32rpx 26rpx; border-radius: 24rpx;
  background: linear-gradient(135deg, #eef3e8, #f8faf2);
  border: 1rpx solid #dfe7d4;
}
.result-card--success { background: linear-gradient(135deg, #eef3e8, #f8faf2); }
.result-card--rejected, .result-card--failed { background: linear-gradient(135deg, #fbf3e5, #fffaf1); border-color: #eddfc6; }
.result-icon {
  width: 70rpx; height: 70rpx; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #1e3a2f; color: #f6efe0; font-size: 32rpx; font-weight: 800;
  margin-bottom: 16rpx;
}
.result-card--rejected .result-icon, .result-card--failed .result-icon { background: #d8bc85; color: #1e3a2f; }
.result-title { display: block; font-size: 34rpx; font-weight: 800; color: #1e3a2f; }
.result-desc { display: block; margin-top: 8rpx; font-size: 22rpx; line-height: 1.6; color: #8a7a63; }
.result-amount { margin-top: 20rpx; display: flex; align-items: baseline; gap: 12rpx; }
.result-amount-label { font-size: 20rpx; color: #8a7a63; }
.result-amount-value { font-size: 34rpx; font-weight: 800; color: #1e3a2f; }

.timeline { padding: 4rpx 0; }
.t-row { display: flex; gap: 16rpx; min-height: 86rpx; }
.t-rail { width: 32rpx; flex: none; display: flex; flex-direction: column; align-items: center; }
.t-dot {
  width: 32rpx; height: 32rpx; border-radius: 50%;
  border: 1rpx solid #d9cfbd; background: #fffdf7;
  display: flex; align-items: center; justify-content: center;
  font-size: 17rpx; color: transparent; z-index: 1;
}
.t-line { width: 2rpx; flex: 1; background: #e5ddcd; margin: 4rpx 0; }
.t-row--done .t-dot { background: #6fb3a0; border-color: #6fb3a0; color: #fff; }
.t-row--active .t-dot { background: #d8bc85; border-color: #d8bc85; color: #1e3a2f; box-shadow: 0 0 0 8rpx rgba(216,188,133,0.18); }
.t-row--done .t-line { background: #b9d7cb; }
.t-body { padding-top: 2rpx; }
.t-title { display: block; font-size: 23rpx; font-weight: 700; color: #1e3a2f; }
.t-meta { display: block; margin-top: 4rpx; font-size: 19rpx; line-height: 1.5; color: #a79b86; }

.bottom-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: rgba(251, 252, 247, 0.97);
  border-top: 1rpx solid #e3e6d4;
  box-shadow: 0 -4rpx 24rpx rgba(30, 46, 36, 0.06);
}
.bottom-note { text-align: center; font-size: 19rpx; color: #a79b86; margin-bottom: 10rpx; }
.btn {
  width: 100%; height: 88rpx; line-height: 88rpx; border: 0; border-radius: 16rpx;
  font-size: 28rpx; font-weight: 800; text-align: center;
}
.btn--primary { background: linear-gradient(135deg, #1e3a2f, #2b5040); color: #f6efe0; }
.btn--gold { background: linear-gradient(135deg, #e7d3a5, #d8bc85); color: #1e3a2f; }
.btn--secondary { margin-top: 20rpx; background: #fffdf7; color: #1e3a2f; border: 1rpx solid #d9cdb8; }
.btn--ghost { margin-top: 10rpx; background: transparent; color: #8a7a63; font-size: 23rpx; height: 64rpx; line-height: 64rpx; }
.btn[disabled] { opacity: 0.55; }
.bottom-bar__row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.bottom-bar__row .btn {
  flex: 1;
  width: auto;
  min-width: 0;
  margin-top: 0;
}

.bottom-bar__main {
  flex: 1;
}
</style>
