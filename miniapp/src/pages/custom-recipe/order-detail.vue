<template>
  <view class="detail-page">
    <view v-if="loading" class="state-block">
      <text class="state-text">加载中...</text>
    </view>

    <view v-else-if="needLogin" class="state-block">
      <text class="state-title">登录已过期</text>
      <text class="state-text">请重新登录后再查看这张定制订单</text>
      <button class="retry-btn" @tap="goToLogin">去登录</button>
    </view>

    <view v-else-if="loadFailed" class="state-block">
      <text class="state-title">订单加载失败</text>
      <text class="state-text">请检查网络后重试</text>
      <button class="retry-btn" @tap="loadOrderDetail">重新加载</button>
    </view>

    <template v-else>
      <view class="status-card">
        <text class="status-text">{{ statusText }}</text>
        <text class="status-order-id">订单号 {{ order.orderId }}</text>
        <!-- 待付款时限：直接决定这单会不会被自动取消 -->
        <text v-if="paymentHint" class="status-deadline">{{ paymentHint }}</text>
      </view>

      <!-- 退款进度：顾客自助取消后钱去哪了，不能让他自己去猜 -->
      <view v-if="refund" class="refund-card" :class="`refund-card--${refund.tone}`">
        <text class="refund-card__title">退款</text>
        <text class="refund-card__text">{{ refund.text }}</text>
        <text v-if="refund.tone === 'processing'" class="refund-card__note">
          退款由微信原路退回，到账时间以微信为准，通常 1-3 个工作日。
        </text>
        <text v-if="refund.tone === 'failed'" class="refund-card__note">
          这笔钱还没有退回。请联系客服，我们会人工处理。
        </text>
      </view>

      <view class="section" v-if="creditRemaining > 0 || creditTotal > 0">
        <view class="section-title">成品抵扣额度</view>
        <view class="info-row">
          <text class="label">额度总额</text>
          <text class="value">¥{{ formatAmount(creditTotal) }}</text>
        </view>
        <view class="info-row">
          <text class="label">已抵扣</text>
          <text class="value">¥{{ formatAmount(creditUsed) }}</text>
        </view>
        <view class="info-row">
          <text class="label">剩余可用</text>
          <text class="value highlight">¥{{ formatAmount(creditRemaining) }}</text>
        </view>
        <text class="section-note">从这道定制食谱下成品单时可抵扣货款，没用完的额度可以下次继续用</text>
      </view>

      <view class="section">
        <view class="section-title">定制信息</view>
        <view class="info-row">
          <text class="label">定制对象</text>
          <text class="value">{{ order.dogName || '—' }}</text>
        </view>
        <view class="info-row">
          <text class="label">定制目标</text>
          <text class="value">{{ goalText }}</text>
        </view>
        <view class="info-row">
          <text class="label">定制费</text>
          <text class="value">¥{{ formatAmount(order.amount) }}</text>
        </view>
        <!-- 排期由系统自动定（顾客不选日期），这里只展示后端排好的结果 -->
        <view class="info-row">
          <text class="label">预计交付</text>
          <text class="value">{{ formatDate(order.estimatedDeliveryDate, '排期中') }}</text>
        </view>
        <view class="info-row">
          <text class="label">提交时间</text>
          <text class="value">{{ formatDate(order.createdAt, '—') }}</text>
        </view>
      </view>

      <view class="section" v-if="hasRequirements">
        <view class="section-title">你的需求</view>
        <view class="tag-group" v-if="(order.medicalConditions || []).length">
          <text class="tag-label">疾病史</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.medicalConditions" :key="`c-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="tag-group" v-if="(order.allergies || []).length">
          <text class="tag-label">过敏信息</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.allergies" :key="`a-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="tag-group" v-if="(order.preferredIngredients || []).length">
          <text class="tag-label">喜欢的食材</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.preferredIngredients" :key="`p-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="tag-group" v-if="(order.dislikedIngredients || []).length">
          <text class="tag-label">不吃的食材</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.dislikedIngredients" :key="`d-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="notes-block" v-if="order.additionalNotes">
          <text class="tag-label">其它需求</text>
          <text class="notes-text">{{ order.additionalNotes }}</text>
        </view>
      </view>

      <view class="section" v-if="order.recipeId">
        <view class="section-title">定制食谱</view>
        <text class="recipe-name">{{ order.recipeName || '已交付的定制食谱' }}</text>
        <button class="recipe-btn" @tap="viewRecipe">查看定制食谱</button>
      </view>

      <view class="action-bar">
        <button
          v-if="order.status === 'PENDING_PAYMENT'"
          class="btn primary"
          :loading="paying"
          :disabled="paying"
          @tap="goPay"
        >
          立即付款
        </button>
        <!-- 自助取消（决策 12）：还没开始制作就能取消；
             已付款的会**全额原路退回微信**，不需要等客服。 -->
        <button
          v-if="canSelfCancel"
          class="btn secondary"
          :loading="cancelling"
          :disabled="cancelling || paying"
          @tap="cancelOrder"
        >
          {{ order.status === 'PENDING_PAYMENT' ? '取消订单' : '取消并退款' }}
        </button>
        <button class="btn secondary" @tap="goOrders">返回定制订单</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { getToken, request } from '@/utils/api';
import { runCustomRecipePayment } from '@/utils/custom-recipe-payment';
import {
  buildPaymentTimeoutHint,
  customRecipeGoalText,
  customRecipeStatusText,
  describeCustomRecipeRefund,
  formatAmount,
  formatDate,
} from '@/utils/custom-recipe-order';

interface CustomRecipeOrderDetail {
  orderId?: string;
  dogName?: string;
  targetGoal?: string;
  scheduledDate?: string | null;
  estimatedDeliveryDate?: string | null;
  status?: string;
  amount?: number;
  creditAmount?: number;
  creditUsed?: number;
  creditRemaining?: number;
  recipeId?: string | null;
  recipeName?: string | null;
  allergies?: string[];
  medicalConditions?: string[];
  preferredIngredients?: string[];
  dislikedIngredients?: string[];
  additionalNotes?: string | null;
  createdAt?: string | null;
  /** 后端新增：支付截止时间与退款进度 */
  paymentDeadlineAt?: string | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
  refundedAt?: string | null;
}

const orderId = ref('');
const loading = ref(true);
const loadFailed = ref(false);
const paying = ref(false);
const order = ref<CustomRecipeOrderDetail>({});

/** 登录已过期（401）：与"网络错误"分开表达，并给一个去登录的入口 */
const needLogin = ref(false);

/** 支付超时分钟数（0 = 不自动关单），来自后台公开配置 */
const paymentTimeoutMinutes = ref(0);

onLoad((options: any) => {
  orderId.value = options.orderId || '';
  void loadOrderDetail();
  void loadPaymentTimeoutConfig();
});

onPullDownRefresh(() => {
  void loadOrderDetail().finally(() => uni.stopPullDownRefresh());
});

/**
 * 读支付超时配置。
 *
 * 订单接口若还没下发 paymentDeadlineAt，就用它 + createdAt 估算剩余时间；
 * 读不到就不显示时限文案（不猜）。
 */
const loadPaymentTimeoutConfig = async () => {
  try {
    const res: any = await request({
      url: '/custom-recipe-config',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    });
    if (res?.code === 0 && res.data) {
      paymentTimeoutMinutes.value = Number(res.data.paymentTimeoutMinutes) || 0;
    }
  } catch (error) {
    console.warn('[CustomRecipe] 读取支付超时配置失败:', error);
  }
};

const loadOrderDetail = async () => {
  if (!orderId.value) {
    loading.value = false;
    loadFailed.value = true;
    return;
  }

  // 未登录时直接切到"登录已过期"，不去打一次必然 401 的请求
  if (!getToken()) {
    loading.value = false;
    needLogin.value = true;
    return;
  }

  loading.value = true;
  loadFailed.value = false;
  needLogin.value = false;
  try {
    const res: any = await request({
      url: `/custom-recipe/orders/${encodeURIComponent(orderId.value)}`,
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    });
    if (res.code === 0 && res.data) {
      order.value = res.data;
    } else {
      loadFailed.value = true;
    }
  } catch (error) {
    // 401 不能报成"网络错误"：那会让顾客去查自己的网络，方向完全错了
    if (isAuthError(error)) {
      needLogin.value = true;
      uni.showToast({
        title: '登录已过期，请重新登录',
        icon: 'none',
        duration: 2000,
      });
      return;
    }
    console.error('[CustomRecipe] 读取订单详情失败:', error);
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
};

/**
 * 判断是不是"未登录/登录过期"。
 * request() 对 401 统一 reject 一个 message 为 'Authentication required' 的错误。
 */
const isAuthError = (error: any) => {
  const message = String(error?.message || error || '');
  return message.includes('Authentication required') || message.includes('401');
};

/** 去登录，登录后回到本页（沿用全站统一的 redirect 约定） */
const goToLogin = () => {
  const redirect = `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(orderId.value)}`;
  uni.navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}`,
  });
};

/** 状态文案走公共模块（原来这里单独抄了一份，缺 CANCELLED 就降级成"定制订单"） */
const statusText = computed(() => customRecipeStatusText(order.value.status));

const goalText = computed(() =>
  customRecipeGoalText(order.value.targetGoal, '—'),
);

/** 退款进度：识别不出来就整块不显示（退款不能靠猜） */
const refund = computed(() => describeCustomRecipeRefund(order.value));

/** 支付时限：只在待付款时有意义 */
const paymentHint = computed(() => {
  if (order.value.status !== 'PENDING_PAYMENT') return '';
  return buildPaymentTimeoutHint({
    paymentDeadlineAt: order.value.paymentDeadlineAt ?? null,
    createdAt: order.value.createdAt ?? null,
    paymentTimeoutMinutes: paymentTimeoutMinutes.value,
  });
});

const creditTotal = computed(() => Number(order.value.creditAmount || 0));
const creditUsed = computed(() => Number(order.value.creditUsed || 0));
const creditRemaining = computed(() => {
  if (order.value.creditRemaining !== undefined) {
    return Number(order.value.creditRemaining);
  }
  return Math.max(0, creditTotal.value - creditUsed.value);
});

const hasRequirements = computed(() => {
  const value = order.value;
  return Boolean(
    (value.medicalConditions || []).length ||
      (value.allergies || []).length ||
      (value.preferredIngredients || []).length ||
      (value.dislikedIngredients || []).length ||
      value.additionalNotes,
  );
});

const viewRecipe = () => {
  if (!order.value.recipeId) return;
  uni.navigateTo({
    url: `/pages/recipe-detail/index?id=${encodeURIComponent(order.value.recipeId)}`,
  });
};

/**
 * 付款入口：优先走小程序内微信支付；
 * 支付通道不可用（返回 MANUAL）时，跳到提交成功页看客服收款方式，
 * 保证订单在任何情况下都能被付掉。
 */
const goPay = async () => {
  if (paying.value) return;

  const targetOrderId = order.value.orderId || orderId.value;
  if (!targetOrderId) return;

  paying.value = true;
  try {
    const outcome = await runCustomRecipePayment(targetOrderId);

    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' });
      await loadOrderDetail();
      return;
    }

    if (outcome === 'CANCELLED') {
      uni.showToast({ title: '已取消支付，可稍后再付', icon: 'none' });
      return;
    }

    if (outcome === 'CLOSED') {
      uni.showToast({ title: '订单已关闭，请重新提交定制', icon: 'none' });
      await loadOrderDetail();
      return;
    }

    if (outcome === 'MANUAL') {
      uni.navigateTo({
        url: `/pages/custom-recipe/success?orderId=${encodeURIComponent(targetOrderId)}`,
      });
      return;
    }

    uni.showToast({ title: '支付未完成，可稍后重试', icon: 'none' });
  } finally {
    paying.value = false;
  }
};

/**
 * 能否自助取消（老板拍板的决策 12）。
 *
 * 只要还没开始制作就能取消 —— 待付款和已付款两个状态。
 * 制作中/已交付要联系客服（那时已经投入了人工）。
 */
const canSelfCancel = computed(() => {
  const status = String(order.value.status || '');
  return status === 'PENDING_PAYMENT' || status === 'PAID';
});

const cancelling = ref(false);

/**
 * 顾客自助取消订单。
 *
 * 已付款的走全额原路退款（后端调微信退款）；退款失败**不会**把订单取消掉，
 * 避免出现"取消了钱没退"这种最糟的结果 —— 所以要如实告诉顾客。
 */
const cancelOrder = async () => {
  if (cancelling.value) return;

  const paid = order.value.status === 'PAID';

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: paid ? '取消并退款？' : '取消订单？',
      content: paid
        ? '取消后定制费会全额原路退回微信，到账时间以微信为准。'
        : '取消后这一天的名额会释放，你可以重新下单。',
      confirmText: paid ? '取消并退款' : '确认取消',
      cancelText: '再想想',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });

  if (!confirmed) return;

  cancelling.value = true;
  uni.showLoading({ title: paid ? '退款中...' : '取消中...' });

  try {
    const res: any = await request({
      url: `/custom-recipe/orders/${encodeURIComponent(orderId.value)}/cancel`,
      method: 'POST',
      data: { reason: '顾客取消定制订单' },
    });

    uni.hideLoading();

    /**
     * 退款结果当场就说，不等详情接口。
     *
     * 退款是钱的事：后端在取消响应里已经回了 refundStatus（PROCESSING/FAILED…），
     * 如果只统一提示"退款已发起"，退款失败时顾客会以为钱在路上，
     * 一直到他自己去翻订单才发现 —— 那可能是几天后了。
     */
    const refundOutcome = describeCustomRecipeRefund({
      refundStatus: res?.data?.refundStatus ?? null,
    });

    if (refundOutcome?.tone === 'failed') {
      uni.showToast({
        title: '已取消，但退款未成功，请联系客服',
        icon: 'none',
        duration: 3000,
      });
    } else if (refundOutcome?.tone === 'done') {
      uni.showToast({ title: '已取消，退款已原路退回', icon: 'none' });
    } else {
      uni.showToast({
        title: paid ? '已取消，退款已发起' : '已取消',
        icon: 'none',
      });
    }

    await loadOrderDetail();
  } catch (error: any) {
    uni.hideLoading();
    uni.showToast({
      title: error?.message || '取消失败，请联系客服',
      icon: 'none',
      duration: 3000,
    });
  } finally {
    cancelling.value = false;
  }
};

const goOrders = () => {
  uni.redirectTo({ url: '/pages/custom-recipe/orders' });
};
</script>

<style scoped>
.detail-page {
  min-height: 100vh;
  padding: 24rpx 24rpx 200rpx;
  background: var(--sk-bg, #f0f3e9);
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 160rpx 40rpx;
}

.state-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
}

.state-text {
  font-size: 26rpx;
  color: var(--sk-ink-3, #968f6d);
}

.retry-btn {
  margin-top: 12rpx;
  padding: 0 48rpx;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 28rpx;
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
  border-radius: 999rpx;
}

.retry-btn::after {
  border: none;
}

.status-card {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 16rpx 44rpx rgba(20, 41, 31, 0.28);
}

.status-text {
  font-size: 38rpx;
  font-weight: 700;
  color: var(--sk-gold-soft, #f6efe0);
}

.status-order-id {
  font-size: 24rpx;
  color: #cfe0d5;
}

/* 待付款时限：决定这单会不会被自动取消，放在状态卡里最显眼处 */
.status-deadline {
  margin-top: 6rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #f0d9a8;
}

/* ---------- 退款进度 ---------- */
.refund-card {
  padding: 28rpx 32rpx;
  margin-bottom: 24rpx;
  background: var(--sk-surface, #fbfcf7);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-card, 28rpx);
}

.refund-card__title {
  display: block;
  font-size: 26rpx;
  color: var(--sk-ink-2, #6b6653);
}

.refund-card__text {
  display: block;
  margin-top: 8rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
}

.refund-card__note {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-3, #968f6d);
}

/* 退款到账：墨绿（好消息）；退款中：金色（还在路上） */
.refund-card--done .refund-card__text {
  color: var(--sk-primary, #1e3a2f);
}

.refund-card--processing {
  background: var(--sk-gold-soft, #f6efe0);
  border-color: rgba(176, 141, 79, 0.45);
}

.refund-card--processing .refund-card__text {
  color: var(--sk-gold, #b08d4f);
}

/* 退款未成功：必须一眼看到，并给出"找客服"的下一步 */
.refund-card--failed {
  background: #fdf1ef;
  border-color: rgba(176, 58, 46, 0.4);
}

.refund-card--failed .refund-card__text {
  color: #b03a2e;
}

.section {
  background: var(--sk-surface, #fbfcf7);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
  padding: 32rpx;
  margin-bottom: 24rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
  margin-bottom: 24rpx;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20rpx;
  font-size: 28rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  color: #888;
  flex-shrink: 0;
}

.value {
  color: #333;
  text-align: right;
  flex: 1;
  margin-left: 20rpx;
}

.value.highlight {
  color: #b08d4f;
  font-weight: 700;
}

.section-note {
  display: block;
  margin-top: 20rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-3, #968f6d);
}

.tag-group {
  margin-bottom: 24rpx;
}

.tag-group:last-child {
  margin-bottom: 0;
}

.tag-label {
  display: block;
  font-size: 26rpx;
  color: #888;
  margin-bottom: 12rpx;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag {
  padding: 8rpx 20rpx;
  font-size: 24rpx;
  color: var(--sk-primary, #1e3a2f);
  background: var(--sk-primary-tint, #eef3ea);
  border-radius: 999rpx;
}

.notes-block {
  margin-top: 8rpx;
}

.notes-text {
  display: block;
  font-size: 26rpx;
  line-height: 1.6;
  color: var(--sk-ink, #26261f);
}

.recipe-name {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #26261f;
  margin-bottom: 24rpx;
}

.recipe-btn {
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  color: #1e3a2f;
  background: #f3eddd;
  border: 1rpx solid #d8bc85;
  border-radius: 999rpx;
}

.recipe-btn::after {
  border: none;
}

.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 20rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: var(--sk-surface, #fbfcf7);
  border-top: 1rpx solid var(--sk-line, #e3e6d4);
  box-shadow: 0 -2rpx 16rpx rgba(30, 46, 36, 0.06);
}

.btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
  border-radius: 999rpx;
}

.btn.primary {
  background: linear-gradient(135deg, #1e3a2f 0%, #2b5040 100%);
  color: var(--sk-gold-soft, #f6efe0);
}

.btn.secondary {
  background: transparent;
  color: var(--sk-ink-2, #6b6653);
  border: 1rpx solid var(--sk-line, #e3e6d4);
}
</style>
