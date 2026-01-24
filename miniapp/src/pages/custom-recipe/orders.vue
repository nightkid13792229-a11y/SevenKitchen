<template>
  <view class="orders-page">
    <view class="page-header">
      <text class="page-title">我的定制订单</text>
    </view>

    <scroll-view scroll-y class="orders-list">
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
            <text class="value">{{order.scheduledDate}}</text>
          </view>
          <view class="info-row" v-if="order.status === 'DELIVERED'">
            <text class="label">交付：</text>
            <text class="value">{{order.estimatedDeliveryDate}}</text>
          </view>
        </view>

        <view class="order-footer">
          <button
            v-if="order.status === 'PENDING_PAYMENT'"
            class="action-btn"
            @tap.stop="payOrder(order.orderId)"
          >
            立即付款
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

      <view v-if="orders.length === 0" class="empty-state">
        <text class="empty-text">暂无定制订单</text>
        <button class="create-btn" @tap="createOrder">立即定制</button>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { getBaseUrl } from '@/utils/config';

const orders = ref<any[]>([]);

onLoad(() => {
  loadOrders();
});

onPullDownRefresh(() => {
  loadOrders().then(() => {
    uni.stopPullDownRefresh();
  });
});

const loadOrders = async () => {
  try {
    const res = await uni.request({
      url: `${getBaseUrl()}/custom-recipe/my-orders`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${uni.getStorageSync('token')}`,
      },
    });

    if (res.data.code === 200) {
      orders.value = res.data.data.orders;
    }
  } catch (error) {
    uni.showToast({
      title: '加载失败',
      icon: 'none',
    });
  }
};

const viewOrderDetail = (orderId: string) => {
  uni.navigateTo({
    url: `/pages/custom-recipe/order-detail?orderId=${orderId}`,
  });
};

const payOrder = (orderId: string) => {
  uni.navigateTo({
    url: `/pages/custom-recipe/success?orderId=${orderId}`,
  });
};

const viewRecipe = (recipeId: string) => {
  uni.navigateTo({
    url: `/pages/recipe-detail/index?id=${recipeId}`,
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
