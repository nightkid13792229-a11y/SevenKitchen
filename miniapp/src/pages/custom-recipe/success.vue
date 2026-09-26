<template>
  <view class="success-page">
    <view class="success-icon">✅</view>
    <text class="success-title">定制需求已提交</text>
    <text class="success-subtitle">我们收到需求后会尽快与你确认排期</text>

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
.success-page {
  padding: 40rpx;
  min-height: 100vh;
  background: #f5f5f5;
}

.success-icon {
  text-align: center;
  font-size: 120rpx;
  margin: 80rpx 0 40rpx;
}

.success-title {
  display: block;
  text-align: center;
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
}

.success-subtitle {
  display: block;
  text-align: center;
  font-size: 26rpx;
  color: #999;
  margin: 16rpx 0 50rpx;
}

.state-block {
  padding: 60rpx 0;
  text-align: center;
}

.state-text {
  font-size: 28rpx;
  color: #999;
}

.order-info {
  background: #fff;
  border-radius: 16rpx;
  padding: 40rpx;
  margin-bottom: 30rpx;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 25rpx;
  font-size: 30rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  color: #666;
}

.value {
  color: #333;
  font-weight: 500;
  text-align: right;
  flex: 1;
  margin-left: 20rpx;
}

.credit-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(135deg, #1e3a2f 0%, #2b5040 100%);
  border-radius: 16rpx;
  padding: 36rpx 32rpx;
  margin-bottom: 30rpx;
}

.credit-title {
  font-size: 26rpx;
  color: #cfe0d5;
}

.credit-amount {
  font-size: 56rpx;
  font-weight: bold;
  color: #d8bc85;
  margin: 10rpx 0 14rpx;
}

.credit-desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: #cfe0d5;
  text-align: center;
}

.payment-info {
  background: #fff;
  border-radius: 16rpx;
  padding: 40rpx;
  margin-bottom: 30rpx;
}

.section-title {
  display: block;
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 15rpx;
}

.section-desc {
  display: block;
  font-size: 28rpx;
  color: #666;
  margin-bottom: 30rpx;
}

.pay-btn {
  width: 100%;
  height: 92rpx;
  line-height: 92rpx;
  margin-bottom: 24rpx;
  font-size: 32rpx;
  font-weight: bold;
  color: #fff;
  background: linear-gradient(135deg, #07C160 0%, #0aa350 100%);
  border: none;
  border-radius: 46rpx;
}

.pay-btn[disabled] {
  opacity: 0.7;
}

.wechat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx;
  background: #f8f8f8;
  border-radius: 12rpx;
  margin-bottom: 20rpx;
}

.wechat-label {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 10rpx;
}

.wechat-id {
  font-size: 36rpx;
  font-weight: bold;
  color: #FF6B6B;
  margin-bottom: 20rpx;
}

.copy-btn {
  padding: 15rpx 40rpx;
  background: #FF6B6B;
  color: #fff;
  border-radius: 30rpx;
  font-size: 26rpx;
}

.payment-note {
  display: block;
  font-size: 26rpx;
  color: #999;
  text-align: center;
  margin-bottom: 10rpx;
}

.button-group {
  display: flex;
  gap: 20rpx;
}

.btn {
  flex: 1;
  height: 90rpx;
  line-height: 90rpx;
  border-radius: 45rpx;
  font-size: 30rpx;
  font-weight: 500;
  border: none;
}

.btn.secondary {
  background: #fff;
  color: #666;
  border: 2rpx solid #ddd;
}

.btn.primary {
  background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);
  color: #fff;
}
</style>
