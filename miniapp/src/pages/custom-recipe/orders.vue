<template>
  <view class="orders-page">
    <view class="page-header">
      <text class="page-title">我的定制订单</text>
    </view>

    <scroll-view scroll-y class="orders-list">
      <view v-if="loading && orders.length === 0" class="empty-state">
        <text class="empty-text">加载中...</text>
      </view>

      <view v-else-if="needLogin" class="empty-state">
        <text class="empty-text">登录已过期，请重新登录</text>
        <button class="create-btn" @tap="goToLogin">去登录</button>
      </view>

      <view v-else-if="loadFailed && orders.length === 0" class="empty-state">
        <text class="empty-text">订单加载失败，请检查网络</text>
        <button class="create-btn" @tap="loadOrders">重新加载</button>
      </view>

      <view
        v-for="order in orders"
        :key="order.orderId"
        class="order-card"
        @tap="viewOrderDetail(order.orderId)"
      >
        <view class="order-header">
          <text class="order-id">{{order.orderId}}</text>
          <view class="status-badge" :class="getStatusClass(order.status)">
            {{getStatusText(order.status)}}
          </view>
        </view>

        <view class="order-body">
          <view class="info-row">
            <text class="label">狗狗：</text>
            <text class="value">{{order.dogName}}</text>
          </view>
          <view class="info-row">
            <text class="label">目标：</text>
            <text class="value">{{getGoalText(order.targetGoal)}}</text>
          </view>
          <!-- 口径：顾客不选日期，排期由系统自动定，这里只展示后端排好的预计交付日 -->
          <view class="info-row">
            <text class="label">预计交付：</text>
            <text class="value">{{formatDate(order.estimatedDeliveryDate, '排期中')}}</text>
          </view>
          <view class="info-row" v-if="creditRemainingOf(order) > 0">
            <text class="label">可抵扣：</text>
            <text class="value credit">¥{{creditRemainingOf(order)}}</text>
          </view>
          <!-- 退款进度：顾客自助取消后钱去哪了，必须在这里看得到 -->
          <view class="info-row" v-if="refundTextOf(order)">
            <text class="label">退款：</text>
            <text
              class="value"
              :class="{
                'refund-done': refundToneOf(order) === 'done',
                'refund-failed': refundToneOf(order) === 'failed',
              }"
            >{{ refundTextOf(order) }}</text>
          </view>
        </view>

        <view class="order-footer">
          <button
            v-if="order.status === 'PENDING_PAYMENT'"
            class="action-btn"
            :disabled="payingOrderId === order.orderId"
            @tap.stop="payOrder(order.orderId)"
          >
            {{ payingOrderId === order.orderId ? '支付中...' : '立即付款' }}
          </button>
          <button
            v-else-if="order.status === 'DELIVERED'"
            class="action-btn primary"
            @tap.stop="viewRecipe(order.recipeId)"
          >
            查看定制食谱
          </button>
          <button
            class="action-btn secondary"
            @tap.stop="contactService"
          >
            联系客服
          </button>
        </view>

        <!-- 待付款单的时限提示：这一行直接决定会不会被自动取消 -->
        <text
          v-if="order.status === 'PENDING_PAYMENT' && paymentHintOf(order)"
          class="pay-deadline"
        >{{ paymentHintOf(order) }}</text>
      </view>

      <view v-if="!loading && !loadFailed && orders.length === 0" class="empty-state">
        <text class="empty-text">暂无定制订单</text>
        <button class="create-btn" @tap="createOrder">立即定制</button>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import { getToken, request } from '@/utils/api';
import {
  getCustomerServiceConfig,
  openCustomerServiceChat,
} from '@/utils/customer-service';
import { runCustomRecipePayment } from '@/utils/custom-recipe-payment';
import {
  buildPaymentTimeoutHint,
  customRecipeGoalText,
  customRecipeStatusClass,
  customRecipeStatusText,
  describeCustomRecipeRefund,
  formatDate,
} from '@/utils/custom-recipe-order';

interface CustomRecipeOrderItem {
  orderId: string;
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
  /** 后端新增：支付截止时间 / 退款进度 */
  paymentDeadlineAt?: string | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
  refundedAt?: string | null;
}

const orders = ref<CustomRecipeOrderItem[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const payingOrderId = ref('');

/**
 * 登录已过期标记。
 *
 * 401 不是"网络错误"：报网络错误会让顾客去查自己的 WiFi，排查方向完全错了。
 * 这里单独给一个状态位与"去登录"入口。
 */
const needLogin = ref(false);

/** 支付超时分钟数（0 = 不自动关单），来自后台公开配置 */
const paymentTimeoutMinutes = ref(0);

onLoad(() => {
  void loadOrders();
  void loadPaymentTimeoutConfig();
});

// 从详情/提交成功页返回时刷新，避免状态停留在旧值（例如刚付完款仍显示"待付款"）
onShow(() => {
  if (orders.value.length) {
    void loadOrders();
  }
});

onPullDownRefresh(() => {
  void loadOrders().finally(() => {
    uni.stopPullDownRefresh();
  });
});

/**
 * 读支付超时配置。
 *
 * 列表接口可能还没下发 paymentDeadlineAt，此时用"下单时间 + 超时分钟数"估算，
 * 让顾客至少知道"还剩多久"。读不到就不显示时限，不猜一个数字。
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

const loadOrders = async () => {
  // 未登录时不发这次请求：必然 401，报"网络错误"是错的
  if (!getToken()) {
    needLogin.value = true;
    orders.value = [];
    return;
  }

  loading.value = true;
  loadFailed.value = false;
  try {
    // 统一走 request()：只认全站统一的 {code,message,data} 结构。
    // 原来按 HTTP 风格的 2xx 判断成功，而后端约定的成功码是 0，列表因此永远为空。
    const res: any = await request({
      url: '/custom-recipe/my-orders',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    });

    if (res.code === 0 && res.data) {
      needLogin.value = false;
      orders.value = Array.isArray(res.data.orders) ? res.data.orders : [];
    } else {
      loadFailed.value = true;
    }
  } catch (error) {
    console.error('[CustomRecipe] 加载定制订单失败:', error);
    // 401 单独处理：request() 已清掉本地 token，这里切到"请重新登录"
    if (isAuthError(error)) {
      needLogin.value = true;
      orders.value = [];
      uni.showToast({
        title: '登录已过期，请重新登录',
        icon: 'none',
        duration: 2000,
      });
      return;
    }
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
  const redirect = '/pages/custom-recipe/orders';
  uni.navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}`,
  });
};

const viewOrderDetail = (orderId: string) => {
  uni.navigateTo({
    url: `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(orderId)}`,
  });
};

/**
 * 待付款订单的付款入口：列表里直接调起微信支付，少一跳。
 * 支付通道不可用时（MANUAL）再去提交成功页看客服收款方式。
 */
const payOrder = async (orderId: string) => {
  if (payingOrderId.value) return;

  payingOrderId.value = orderId;
  try {
    const outcome = await runCustomRecipePayment(orderId);

    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' });
      await loadOrders();
      return;
    }

    if (outcome === 'CANCELLED') {
      uni.showToast({ title: '已取消支付，可稍后再付', icon: 'none' });
      return;
    }

    if (outcome === 'CLOSED') {
      uni.showToast({ title: '订单已关闭，请重新提交定制', icon: 'none' });
      await loadOrders();
      return;
    }

    if (outcome === 'MANUAL') {
      uni.navigateTo({
        url: `/pages/custom-recipe/success?orderId=${encodeURIComponent(orderId)}`,
      });
      return;
    }

    uni.showToast({ title: '支付未完成，可稍后重试', icon: 'none' });
  } finally {
    payingOrderId.value = '';
  }
};

const viewRecipe = (recipeId: string | null | undefined) => {
  if (!recipeId) return;
  uni.navigateTo({
    url: `/pages/recipe-detail/index?id=${encodeURIComponent(recipeId)}`,
  });
};

/**
 * 联系客服。
 *
 * 2026-09-28：小程序已接入**企业微信客服**（后台 corp_id / open_kfid 已配置），
 * 全站其它入口走的是 wx.openCustomerServiceChat。这里原先弹一个微信号让顾客去加，
 * 既和别处不一致，也会把"人工收款"这条兜底路径变成手动流程。
 */
const contactService = async () => {
  const config = await getCustomerServiceConfig();

  openCustomerServiceChat(config, {
    sourceType: 'ORDER',
  });
};

const createOrder = () => {
  uni.navigateTo({
    url: '/pages/custom-recipe/index',
  });
};

/**
 * 以下状态/目标/日期文案统一走 @/utils/custom-recipe-order。
 *
 * 这些函数原先在本页、success.vue、order-detail.vue 各有一份拷贝，
 * 后端新增 CANCELLED 时三份里漏了两份 —— 列表把英文枚举名直接显示给顾客。
 */
const getStatusClass = (status?: string | null) => customRecipeStatusClass(status);

const getStatusText = (status?: string | null) => customRecipeStatusText(status);

const getGoalText = (goal?: string | null) => customRecipeGoalText(goal, '');

/** 退款进度文案；没有退款状态时返回空串（不显示这一行） */
const refundTextOf = (order: CustomRecipeOrderItem): string =>
  describeCustomRecipeRefund(order)?.text || '';

const refundToneOf = (order: CustomRecipeOrderItem): string =>
  describeCustomRecipeRefund(order)?.tone || '';

/** 待付款单的支付时限：优先用后端给的截止时间，没有才用配置估算 */
const paymentHintOf = (order: CustomRecipeOrderItem): string =>
  buildPaymentTimeoutHint({
    paymentDeadlineAt: order.paymentDeadlineAt ?? null,
    createdAt: order.createdAt ?? null,
    paymentTimeoutMinutes: paymentTimeoutMinutes.value,
  });

function creditRemainingOf(order: CustomRecipeOrderItem): number {
  if (order.creditRemaining !== undefined) return Number(order.creditRemaining);
  return Math.max(
    0,
    Number(order.creditAmount || 0) - Number(order.creditUsed || 0),
  );
}
</script>

<style scoped>
/* ==========================================================
   食谱定制 · 我的定制订单
   视觉规范对齐新版设计（深墨绿 + 金 + 米绿底）
   ========================================================== */

.orders-page {
  min-height: 100vh;
  background: var(--sk-bg, #f0f3e9);
}

.page-header {
  padding: 32rpx 28rpx 24rpx;
}

.page-title {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
  letter-spacing: 2rpx;
}

.orders-list {
  padding: 0 24rpx 40rpx;
  height: calc(100vh - 130rpx);
  box-sizing: border-box;
}

.order-card {
  padding: 28rpx;
  margin-bottom: 24rpx;
  background: var(--sk-surface, #fbfcf7);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
}

.order-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20rpx;
  margin-bottom: 20rpx;
  border-bottom: 1rpx solid var(--sk-line, #e3e6d4);
}

.order-id {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
  letter-spacing: 1rpx;
}

.status-badge {
  padding: 8rpx 20rpx;
  font-size: 24rpx;
  border-radius: 999rpx;
}

.status-badge.pending {
  color: #8a6d2f;
  background: var(--sk-gold-soft, #f6efe0);
}

.status-badge.paid {
  color: var(--sk-primary, #1e3a2f);
  background: var(--sk-primary-tint, #eef3ea);
}

.status-badge.progress {
  color: var(--sk-gold-soft, #f6efe0);
  background: var(--sk-primary, #1e3a2f);
}

.status-badge.delivered {
  color: var(--sk-ink-2, #6b6653);
  background: #eceae2;
}

/* 已取消：中性灰，与"已交付"区分开（取消不是完成） */
.status-badge.cancelled {
  color: #6b6653;
  background: #e6e3da;
  border: 1rpx solid #d5d1c6;
}

.info-row {
  display: flex;
  margin-bottom: 12rpx;
  font-size: 28rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  width: 130rpx;
  color: var(--sk-ink-2, #6b6653);
}

.value {
  flex: 1;
  color: var(--sk-ink, #26261f);
}

.value.credit {
  font-weight: 700;
  color: var(--sk-gold, #b08d4f);
}

/* 退款到账=好消息用墨绿；退款未成功要显眼到顾客会去找客服 */
.value.refund-done {
  font-weight: 700;
  color: var(--sk-primary, #1e3a2f);
}

.value.refund-failed {
  font-weight: 700;
  color: #b03a2e;
}

/* 待付款时限：这是"会不会被自动取消"的关键信息 */
.pay-deadline {
  display: block;
  margin-top: 16rpx;
  padding: 14rpx 18rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #8a6d2f;
  background: var(--sk-gold-soft, #f6efe0);
  border-radius: var(--sk-radius-badge, 12rpx);
}

.order-footer {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid var(--sk-line, #e3e6d4);
}

.action-btn {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 27rpx;
  font-weight: 600;
  border-radius: 999rpx;
}

/* 主操作：深墨绿 + 金边（与首页主动作一致） */
.action-btn {
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
}

.action-btn::after,
.action-btn.primary::after,
.action-btn.secondary::after {
  border: none;
}

.action-btn.primary {
  color: var(--sk-ink, #26261f);
  background: linear-gradient(135deg, #e7d3a5 0%, #d8bc85 100%);
  border: 1rpx solid var(--sk-gold, #b08d4f);
}

.action-btn.secondary {
  color: var(--sk-ink-2, #6b6653);
  background: transparent;
  border: 1rpx solid var(--sk-line, #e3e6d4);
}

.action-btn[disabled] {
  opacity: 0.6;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  padding: 140rpx 40rpx;
}

.empty-text {
  font-size: 28rpx;
  color: var(--sk-ink-3, #968f6d);
}

.create-btn {
  padding: 0 52rpx;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
  border-radius: 999rpx;
}

.create-btn::after {
  border: none;
}
</style>
