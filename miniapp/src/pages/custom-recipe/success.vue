<template>
  <view class="success-page">
    <view class="success-icon">✅</view>
    <text class="success-title">订单提交成功</text>

    <view class="order-info">
      <view class="info-row">
        <text class="label">订单编号</text>
        <text class="value">{{orderId}}</text>
      </view>
      <view class="info-row">
        <text class="label">预约日期</text>
        <text class="value">{{scheduledDate}}</text>
      </view>
      <view class="info-row">
        <text class="label">预计交付</text>
        <text class="value">{{estimatedDeliveryDate}}</text>
      </view>
    </view>

    <view class="payment-info">
      <text class="section-title">💳 付款方式</text>
      <text class="section-desc">请添加微信客服完成付款</text>
      <view class="wechat-card">
        <text class="wechat-label">微信号</text>
        <text class="wechat-id">{{wechatId}}</text>
        <view class="copy-btn" @tap="copyWechatId">
          <text>长按复制微信号</text>
        </view>
      </view>
      <text class="payment-note">付款时请备注订单号：{{orderId}}</text>
      <text class="payment-note">付款后请在微信上告知客服</text>
    </view>

    <view class="button-group">
      <button class="btn secondary" @tap="viewOrders">查看订单详情</button>
      <button class="btn primary" @tap="goHome">返回首页</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const orderId = ref('');
const scheduledDate = ref('');
const estimatedDeliveryDate = ref('');
const wechatId = ref('SevenKitchen');

onLoad((options: any) => {
  orderId.value = options.orderId || '';
  // TODO: 从API获取订单详情
  scheduledDate.value = '2025年1月23日';
  estimatedDeliveryDate.value = '2025年1月28日';
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

const viewOrders = () => {
  uni.navigateTo({
    url: '/pages/custom-recipe/orders',
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
  margin-bottom: 60rpx;
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
