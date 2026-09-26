<template>
  <view class="success-page">
    <view class="success-hero">
      <view class="success-icon">✓</view>
      <text class="success-title">定制需求已提交</text>
      <text class="success-subtitle">我们收到需求后会尽快与你确认排期</text>
    </view>

    <view v-if="loading" class="state-block">
      <text class="state-text">加载订单信息...</text>
    </view>

    <template v-else>
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
        <view class="info-row" v-if="scheduledDateText">
          <text class="label">预约日期</text>
          <text class="value">{{scheduledDateText}}</text>
        </view>
        <view class="info-row" v-if="deliveryDateText">
          <text class="label">预计交付</text>
          <text class="value">{{deliveryDateText}}</text>
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
        <text class="section-title">💳 付款方式</text>

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
          {{ canPayOnline ? '支付遇到问题？也可以加微信客服人工付款' : '请添加微信客服完成付款' }}
        </text>
        <view class="wechat-card">
          <text class="wechat-label">微信号</text>
          <text class="wechat-id">{{wechatId}}</text>
          <view class="copy-btn" @tap="copyWechatId">
            <text>长按复制微信号</text>
          </view>
        </view>
        <text class="payment-note">付款时请备注订单号：{{orderInfo.orderId || orderId}}</text>
        <text class="payment-note">付款后请在微信上告知客服，我们会尽快为你排期</text>
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
}

const orderId = ref('');
const wechatId = ref('SevenKitchen');
const loading = ref(true);
const orderInfo = ref<CustomRecipeOrderDetail>({});

// 提交页带过来的金额，作为详情接口返回前的兜底展示
const initialAmount = ref<number | null>(null);
const initialCreditAmount = ref<number | null>(null);

onLoad((options: any) => {
  orderId.value = options.orderId || '';
  if (options.wechatId) wechatId.value = String(options.wechatId);
  if (options.amount !== undefined && options.amount !== '') {
    const parsed = Number(options.amount);
    if (Number.isFinite(parsed)) initialAmount.value = parsed;
  }
  if (options.creditAmount !== undefined && options.creditAmount !== '') {
    const parsed = Number(options.creditAmount);
    if (Number.isFinite(parsed)) initialCreditAmount.value = parsed;
  }

  void loadOrderDetail();
});

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
      if (res.data.wechatId) wechatId.value = String(res.data.wechatId);
    }
  } catch (error) {
    // 详情失败不影响主流程：订单已提交成功，页面用提交时带回的数据兜底
    console.warn('[CustomRecipe] 读取订单详情失败:', error);
  } finally {
    loading.value = false;
  }
};

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const amountLabel = computed(() => {
  const amount = orderInfo.value.amount ?? initialAmount.value;
  return amount === null || amount === undefined ? '以订单为准' : `¥${formatAmount(Number(amount))}`;
});

const scheduledDateText = computed(() =>
  formatDate(orderInfo.value.scheduledDate),
);

const deliveryDateText = computed(() =>
  formatDate(orderInfo.value.estimatedDeliveryDate),
);

const statusText = computed(() => {
  const map: Record<string, string> = {
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    IN_PROGRESS: '制作中',
    DELIVERED: '已交付',
  };
  return map[orderInfo.value.status || ''] || '';
});

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

const copyWechatId = () => {
  uni.setClipboardData({
    data: wechatId.value,
    success: () => {
      uni.showToast({
        title: '已复制',
        icon: 'success',
      });
    },
  });
};

// ==================== 支付 ====================

const paying = ref(false);

/** 只有"待付款"才展示在线支付按钮 */
const canPayOnline = computed(() => {
  const status = orderInfo.value.status;
  return !status || status === 'PENDING_PAYMENT';
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
