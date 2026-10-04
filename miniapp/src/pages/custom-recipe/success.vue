<template>
  <view class="success-page">
    <view class="success-hero">
      <view class="success-icon">✓</view>
      <text class="success-title">定制需求已提交</text>
      <!-- 提交≠付款：这一步必须说清，否则顾客以为钱已经付掉了 -->
      <text class="success-subtitle">还差最后一步：完成支付，我们才会开始排期设计</text>
    </view>

    <view v-if="loading" class="state-block">
      <text class="state-text">加载订单信息...</text>
    </view>

    <template v-else>
      <!-- 交付日期放在最前面。
           口径（2026-10-04 拍板）：顾客**不选日期**，由系统自动排"最近可接单的
           工作日"（当天约满或遇节假日顺延），日期只认后端返回的 estimatedDeliveryDate。
           原先这里那一栏写的是顾客自己挑的日子，看起来像他选过日期。 -->
      <view class="delivery-card">
        <text class="delivery-card__label">预计交付</text>
        <text class="delivery-card__value">{{ deliveryDateText || '排期中' }}</text>
        <text class="delivery-card__note">
          {{ deliveryDateText
            ? '已按系统排期排好（最近可接单的工作日），遇节假日或当天约满会顺延'
            : '排期确认中，确定后可在"我的定制订单"里看到' }}
        </text>
      </view>

      <view class="order-info">
        <view class="info-row">
          <text class="label">订单编号</text>
          <text class="value">{{orderInfo.orderId || orderId}}</text>
        </view>
        <view class="info-row" v-if="orderInfo.dogName">
          <text class="label">定制对象</text>
          <text class="value">{{orderInfo.dogName}}</text>
        </view>
        <view class="info-row">
          <text class="label">定制费</text>
          <text class="value">{{amountLabel}}</text>
        </view>
        <view class="info-row" v-if="statusText">
          <text class="label">当前状态</text>
          <text class="value">{{statusText}}</text>
        </view>
      </view>

      <!-- 抵扣额度：后台把可抵扣金额设为 0 时整块不出现 -->
      <view v-if="creditAmountText" class="credit-card">
        <text class="credit-title">成品抵扣额度</text>
        <text class="credit-amount">{{creditAmountText}}</text>
        <text class="credit-desc">从这道定制食谱下成品单时可抵扣货款，没用完的额度可以下次继续用</text>
      </view>

      <view class="payment-info">
        <!-- 标题按订单状态变：待付款才说"下一步：支付"，金额仍来自后台配置；
             已付款/已取消还说"下一步：支付"会让顾客以为要再付一次 -->
        <text class="section-title">{{ paymentSectionTitle }}</text>
        <!-- 支付时限：有 paymentDeadlineAt 用真实截止时间，没有才用配置的超时估算；
             两者都没有就整段不显示，不猜 -->
        <text v-if="paymentHint" class="payment-deadline">{{ paymentHint }}</text>

        <!-- 在线支付是主路径；人工收款是兜底（支付通道未配置/缺少微信身份时） -->
        <button
          v-if="canPayOnline"
          class="pay-btn"
          :loading="paying"
          :disabled="paying"
          @tap="handlePay"
        >
          立即微信支付 {{ amountLabel }}
        </button>

        <text class="section-desc">
          {{ paymentSectionDesc }}
        </text>

        <!-- 2026-09-28：小程序已接入**企业微信客服**（corpId + openKfid 已配置），
             这里原先却在让顾客"长按复制微信号"去加个人微信 ——
             既把兜底值 SevenKitchen 当成了真号，也和全站其它入口不一致。
             改用同一个企微客服通道。 -->
        <CustomerServiceInlineButton
          source-type="ORDER"
          :order-id="orderId"
          :order-no="orderInfo.orderId || orderId"
          :title="`定制订单 ${orderInfo.orderId || orderId}`"
          path="/pages/custom-recipe/index"
        />

        <text class="payment-note">找客服时请报订单号：{{orderInfo.orderId || orderId}}</text>
        <text class="payment-note">客服会协助你完成付款，之后我们会尽快排期</text>
      </view>

      <view class="button-group">
        <button class="btn secondary" @tap="viewOrderDetail">查看订单详情</button>
        <button class="btn primary" @tap="goHome">返回首页</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { request } from '@/utils/api';
import { runCustomRecipePayment } from '@/utils/custom-recipe-payment';
import {
  buildPaymentTimeoutHint,
  customRecipeStatusText,
  formatAmount,
  formatDate,
} from '@/utils/custom-recipe-order';
import CustomerServiceInlineButton from '@/components/CustomerServiceInlineButton.vue';

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
  createdAt?: string | null;
  /** 后端新增：支付截止时间（ISO，可能为 null） */
  paymentDeadlineAt?: string | null;
}

const orderId = ref('');
const loading = ref(true);
const orderInfo = ref<CustomRecipeOrderDetail>({});

// 提交页带过来的金额，作为详情接口返回前的兜底展示
const initialAmount = ref<number | null>(null);
const initialCreditAmount = ref<number | null>(null);

/**
 * 支付超时分钟数（0 = 不自动关单）。
 *
 * 优先用订单上的 paymentDeadlineAt；没有它才用这个配置值估算。
 * 接口还没下发这个字段时保持 0 —— 页面就不显示时限文案，绝不自己编一个默认超时。
 */
const paymentTimeoutMinutes = ref(0);

onLoad((options: any) => {
  orderId.value = options.orderId || '';
  if (options.amount !== undefined && options.amount !== '') {
    const parsed = Number(options.amount);
    if (Number.isFinite(parsed)) initialAmount.value = parsed;
  }
  if (options.creditAmount !== undefined && options.creditAmount !== '') {
    const parsed = Number(options.creditAmount);
    if (Number.isFinite(parsed)) initialCreditAmount.value = parsed;
  }

  void loadOrderDetail();
  void loadPaymentTimeoutConfig();
});

/**
 * 读后台配置里的支付超时。
 *
 * 独立于订单详情：订单接口万一还没下发 paymentDeadlineAt，
 * 只要有配置就能给出"请在 X 分钟内完成支付"这条顾客最需要知道的信息。
 * 读不到就当没配置，不影响页面其它内容。
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

/**
 * 读真实订单信息。
 *
 * 改造点：原实现里的预约/交付日期是**写死的假日期**，与真实排期无关。
 * 现在全部以订单接口为准。
 */
const loadOrderDetail = async () => {
  if (!orderId.value) {
    loading.value = false;
    return;
  }

  try {
    const res: any = await request({
      url: `/custom-recipe/orders/${encodeURIComponent(orderId.value)}`,
      method: 'GET',
      quiet: true,
    });
    if (res.code === 0 && res.data) {
      orderInfo.value = res.data || {};
    }
  } catch (error) {
    // 详情失败不影响主流程：订单已提交成功，页面用提交时带回的数据兜底
    console.warn('[CustomRecipe] 读取订单详情失败:', error);
  } finally {
    loading.value = false;
  }
};

const amountLabel = computed(() => {
  const amount = orderInfo.value.amount ?? initialAmount.value;
  return amount === null || amount === undefined ? '以订单为准' : `¥${formatAmount(Number(amount))}`;
});

/** 预计交付日：只用后端返回的值，前端不再自己算日期 */
const deliveryDateText = computed(() =>
  formatDate(orderInfo.value.estimatedDeliveryDate, ''),
);

/** 状态文案走公共模块：这里原来单独抄了一份，后端加 CANCELLED 时就没跟上 */
const statusText = computed(() =>
  orderInfo.value.status ? customRecipeStatusText(orderInfo.value.status) : '',
);

/** 支付时限：有截止时间用截止时间，没有就用配置估算，都没有则不显示 */
const paymentHint = computed(() =>
  buildPaymentTimeoutHint({
    paymentDeadlineAt: orderInfo.value.paymentDeadlineAt ?? null,
    createdAt: orderInfo.value.createdAt ?? null,
    paymentTimeoutMinutes: paymentTimeoutMinutes.value,
  }),
);

const creditAmountText = computed(() => {
  const remaining =
    orderInfo.value.creditRemaining ??
    (orderInfo.value.creditAmount !== undefined
      ? Number(orderInfo.value.creditAmount) - Number(orderInfo.value.creditUsed || 0)
      : initialCreditAmount.value);
  if (remaining === null || remaining === undefined) return '';
  const amount = Number(remaining);
  return amount > 0 ? `¥${formatAmount(amount)}` : '';
});

// ==================== 支付 ====================

const paying = ref(false);

/** 只有"待付款"才展示在线支付按钮 */
const canPayOnline = computed(() => {
  const status = orderInfo.value.status;
  return !status || status === 'PENDING_PAYMENT';
});

/**
 * 付款区标题/说明按订单状态说人话。
 *
 * 原来只有"付款方式"一个死标题，改文案时不能顺手把它写成"下一步：支付" ——
 * 已付款甚至已取消的订单还让人"下一步支付"，等于让顾客再付一次钱。
 */
const paymentSectionTitle = computed(() =>
  canPayOnline.value ? `💳 下一步：支付 ${amountLabel.value}` : '💳 付款信息',
);

const paymentSectionDesc = computed(() => {
  if (canPayOnline.value) return '支付遇到问题？也可以直接找客服人工付款';

  const status = String(orderInfo.value.status || '');
  if (status === 'PAID') return '定制费已支付，我们会尽快排期设计';
  if (status === 'CANCELLED') {
    return '订单已取消；如已付款会原路退回，有问题请联系客服';
  }
  return '请联系客服完成付款';
});

const handlePay = async () => {
  if (paying.value) return;

  const targetOrderId = orderInfo.value.orderId || orderId.value;
  if (!targetOrderId) {
    uni.showToast({ title: '缺少订单号，请从订单列表进入', icon: 'none' });
    return;
  }

  paying.value = true;
  try {
    const outcome = await runCustomRecipePayment(targetOrderId);

    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' });
      orderInfo.value.status = 'PAID';
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
      // 支付通道不可用时降级：页面下方就是客服收款方式，提示用户使用即可
      uni.showToast({ title: '当前无法在线支付，请加客服微信付款', icon: 'none' });
      return;
    }

    uni.showToast({ title: '支付未完成，可稍后重试', icon: 'none' });
  } finally {
    paying.value = false;
  }
};

const viewOrderDetail = () => {
  uni.navigateTo({
    url: `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(orderId.value)}`,
  });
};

const goHome = () => {
  uni.switchTab({
    url: '/pages/home/index',
  });
};
</script>

<style scoped>
/* ==========================================================
   食谱定制 · 提交成功
   视觉规范对齐新版设计（深墨绿 + 金 + 米绿底）
   ========================================================== */

.success-page {
  min-height: 100vh;
  padding: 32rpx 24rpx 60rpx;
  background: var(--sk-bg, #f0f3e9);
}

.success-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56rpx 32rpx 44rpx;
  margin-bottom: 24rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 16rpx 44rpx rgba(20, 41, 31, 0.28);
}

.success-icon {
  width: 104rpx;
  height: 104rpx;
  line-height: 104rpx;
  text-align: center;
  font-size: 56rpx;
  background: linear-gradient(135deg, #e7d3a5 0%, #d8bc85 100%);
  border-radius: 999rpx;
  margin-bottom: 24rpx;
}

.success-title {
  font-size: 38rpx;
  font-weight: 700;
  color: var(--sk-gold-soft, #f6efe0);
  letter-spacing: 2rpx;
}

.success-subtitle {
  margin-top: 14rpx;
  font-size: 26rpx;
  color: #cfe0d5;
  text-align: center;
}

.state-block {
  padding: 60rpx 0;
  text-align: center;
}

.state-text {
  font-size: 28rpx;
  color: var(--sk-ink-3, #968f6d);
}

/* ---------- 预计交付 ----------
   顾客提交后最想知道的就是"哪天能拿到"，所以单独做成一张卡放在最上面 */
.delivery-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32rpx;
  margin-bottom: 24rpx;
  background: var(--sk-gold-soft, #f6efe0);
  border: 1rpx solid rgba(176, 141, 79, 0.45);
  border-radius: var(--sk-radius-card, 28rpx);
}

.delivery-card__label {
  font-size: 26rpx;
  color: var(--sk-ink-2, #6b6653);
}

.delivery-card__value {
  margin: 8rpx 0 12rpx;
  font-size: 48rpx;
  font-weight: 700;
  color: var(--sk-gold, #b08d4f);
}

.delivery-card__note {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-2, #6b6653);
  text-align: center;
}

/* ---------- 订单信息 ---------- */
.order-info {
  padding: 32rpx;
  margin-bottom: 24rpx;
  background: var(--sk-surface, #fbfcf7);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
}

.info-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 22rpx;
  font-size: 28rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  flex-shrink: 0;
  color: var(--sk-ink-2, #6b6653);
}

.value {
  flex: 1;
  margin-left: 20rpx;
  text-align: right;
  font-weight: 600;
  color: var(--sk-ink, #26261f);
}

/* ---------- 抵扣额度 ---------- */
.credit-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36rpx 32rpx;
  margin-bottom: 24rpx;
  background: var(--sk-gold-soft, #f6efe0);
  border: 1rpx solid rgba(176, 141, 79, 0.45);
  border-radius: var(--sk-radius-card, 28rpx);
}

.credit-title {
  font-size: 26rpx;
  color: var(--sk-ink-2, #6b6653);
}

.credit-amount {
  margin: 10rpx 0 14rpx;
  font-size: 56rpx;
  font-weight: 700;
  color: var(--sk-gold, #b08d4f);
}

.credit-desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-2, #6b6653);
  text-align: center;
}

/* ---------- 付款 ---------- */
.payment-info {
  padding: 32rpx;
  margin-bottom: 24rpx;
  background: var(--sk-surface, #fbfcf7);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
}

.section-title {
  display: block;
  margin-bottom: 14rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
}

.section-desc {
  display: block;
  margin-bottom: 28rpx;
  font-size: 26rpx;
  color: var(--sk-ink-2, #6b6653);
}

/* 支付时限：这是"会不会被自动取消"的关键信息，用醒目的颜色单独一行 */
.payment-deadline {
  display: block;
  padding: 18rpx 22rpx;
  margin-bottom: 24rpx;
  font-size: 25rpx;
  line-height: 1.6;
  color: #8a6d2f;
  background: var(--sk-gold-soft, #f6efe0);
  border: 1rpx solid rgba(176, 141, 79, 0.45);
  border-radius: var(--sk-radius-badge, 12rpx);
}

.pay-btn {
  width: 100%;
  height: 92rpx;
  line-height: 92rpx;
  margin-bottom: 24rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
  border-radius: 999rpx;
}

.pay-btn[disabled] {
  opacity: 0.72;
}

.wechat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 34rpx;
  margin-bottom: 20rpx;
  background: var(--sk-primary-tint, #eef3ea);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-badge, 12rpx);
}

.wechat-label {
  margin-bottom: 10rpx;
  font-size: 26rpx;
  color: var(--sk-ink-3, #968f6d);
}

.wechat-id {
  margin-bottom: 20rpx;
  font-size: 36rpx;
  font-weight: 700;
  color: var(--sk-primary, #1e3a2f);
  letter-spacing: 1rpx;
}

.copy-btn {
  padding: 14rpx 40rpx;
  font-size: 26rpx;
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
  border-radius: 999rpx;
}

.payment-note {
  display: block;
  margin-bottom: 10rpx;
  font-size: 24rpx;
  color: var(--sk-ink-3, #968f6d);
  text-align: center;
}

/* ---------- 按钮组 ---------- */
.button-group {
  display: flex;
  gap: 20rpx;
}

.btn {
  flex: 1;
  height: 90rpx;
  line-height: 90rpx;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
  border-radius: 999rpx;
}

.btn.secondary {
  color: var(--sk-ink-2, #6b6653);
  background: var(--sk-surface, #fbfcf7);
  border: 1rpx solid var(--sk-line, #e3e6d4);
}

.btn.primary {
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
}
</style>
