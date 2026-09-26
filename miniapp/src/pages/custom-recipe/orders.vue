<template>
  <view class="orders-page">
    <view class="page-header">
      <text class="page-title">我的定制订单</text>
    </view>

    <scroll-view scroll-y class="orders-list">
      <view v-if="loading && orders.length === 0" class="empty-state">
        <text class="empty-text">加载中...</text>
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
          <view class="info-row">
            <text class="label">预约：</text>
            <text class="value">{{formatDate(order.scheduledDate)}}</text>
          </view>
          <view class="info-row" v-if="order.status === 'DELIVERED'">
            <text class="label">交付：</text>
            <text class="value">{{formatDate(order.estimatedDeliveryDate)}}</text>
          </view>
          <view class="info-row" v-if="creditRemainingOf(order) > 0">
            <text class="label">可抵扣：</text>
            <text class="value credit">¥{{creditRemainingOf(order)}}</text>
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
import { request } from '@/utils/api';
import { runCustomRecipePayment } from '@/utils/custom-recipe-payment';

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
}

const orders = ref<CustomRecipeOrderItem[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const payingOrderId = ref('');

onLoad(() => {
  void loadOrders();
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

const loadOrders = async () => {
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
      orders.value = Array.isArray(res.data.orders) ? res.data.orders : [];
    } else {
      loadFailed.value = true;
    }
  } catch (error) {
    console.error('[CustomRecipe] 加载定制订单失败:', error);
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
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

const contactService = () => {
  uni.showModal({
    title: '联系客服',
    content: '微信号：SevenKitchen',
    showCancel: false,
  });
};

const createOrder = () => {
  uni.navigateTo({
    url: '/pages/custom-recipe/index',
  });
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function creditRemainingOf(order: CustomRecipeOrderItem): number {
  if (order.creditRemaining !== undefined) return Number(order.creditRemaining);
  return Math.max(
    0,
    Number(order.creditAmount || 0) - Number(order.creditUsed || 0),
  );
}

const getStatusClass = (status: string) => {
  const classMap: Record<string, string> = {
    PENDING_PAYMENT: 'pending',
    PAID: 'paid',
    IN_PROGRESS: 'progress',
    DELIVERED: 'delivered',
  };
  return classMap[status] || '';
};

const getStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    IN_PROGRESS: '制作中',
    DELIVERED: '已交付',
  };
  return textMap[status] || status;
};

const getGoalText = (goal: string) => {
  const textMap: Record<string, string> = {
    MAINTAIN: '维持体重',
    GAIN_WEIGHT: '增重',
    LOSE_WEIGHT: '减重',
    HEALTH_SUPPORT: '健康管理',
  };
  return textMap[goal] || goal;
};
</script>

<style scoped>
.orders-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.page-header {
  background: #fff;
  padding: 30rpx;
  text-align: center;
  border-bottom: 2rpx solid #eee;
}

.page-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}

.orders-list {
  padding: 20rpx;
  height: calc(100vh - 120rpx);
}

.order-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
  padding-bottom: 20rpx;
  border-bottom: 2rpx solid #f0f0f0;
}

.order-id {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.status-badge {
  padding: 8rpx 20rpx;
  border-radius: 20rpx;
  font-size: 24rpx;
}

.status-badge.pending {
  background: #fff3cd;
  color: #856404;
}

.status-badge.paid {
  background: #d1ecf1;
  color: #0c5460;
}

.status-badge.progress {
  background: #cce5ff;
  color: #004085;
}

.status-badge.delivered {
  background: #d4edda;
  color: #155724;
}

.order-body {
  margin-bottom: 20rpx;
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
  color: #999;
  width: 120rpx;
}

.value {
  color: #333;
  flex: 1;
}

.value.credit {
  color: #b08d4f;
  font-weight: 700;
}

.order-footer {
  display: flex;
  gap: 15rpx;
}

.action-btn {
  flex: 1;
  height: 70rpx;
  line-height: 70rpx;
  text-align: center;
  background: #fff;
  border: 2rpx solid #ddd;
  border-radius: 35rpx;
  font-size: 26rpx;
  color: #666;
}

.action-btn.primary {
  background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);
  border: none;
  color: #fff;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100rpx 0;
}

.empty-text {
  font-size: 28rpx;
  color: #999;
  margin-bottom: 40rpx;
}

.create-btn {
  width: 300rpx;
  height: 80rpx;
  line-height: 80rpx;
  background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);
  color: #fff;
  font-size: 30rpx;
  border-radius: 40rpx;
  border: none;
}
</style>
