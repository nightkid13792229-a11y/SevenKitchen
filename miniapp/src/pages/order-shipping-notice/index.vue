<template>
  <view class="shipping-notice-page">
    <view v-if="loading" class="state-card">加载中...</view>
    <view v-else-if="notice" class="notice-content">
      <image
        v-if="notice.imageUrl"
        class="notice-image"
        :src="notice.imageUrl"
        mode="aspectFill"
      />
      <view class="section">
        <text class="section-title">物流信息</text>
        <view class="info-row">
          <text class="info-label">快递公司</text>
          <text class="info-value">{{ notice.carrierName }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">运单号</text>
          <text class="info-value tracking">{{ notice.trackingNumber }}</text>
          <button class="copy-btn" @tap="copyTrackingNumber">复制</button>
        </view>
      </view>
      <view class="section">
        <text class="section-title">烹饪注意事项</text>
        <text class="paragraph">{{ notice.cookingTips }}</text>
      </view>
      <view class="section">
        <text class="section-title">保存方式和保质期</text>
        <text class="paragraph">{{ notice.storageTips }}</text>
      </view>
      <view class="section">
        <text class="section-title">货损提醒</text>
        <text class="paragraph">{{ notice.damageReminder }}</text>
      </view>
    </view>
    <view v-else class="state-card">
      <text>{{ errorText || '暂时无法查看物流提醒' }}</text>
      <button class="retry-btn" @tap="loadNotice">重试</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  getCustomerShippingNotice,
  type CustomerShippingNotice,
} from '../../api/orders';

const orderId = ref('');
const loading = ref(false);
const errorText = ref('');
const notice = ref<CustomerShippingNotice | null>(null);

onMounted(() => {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1] as any;
  orderId.value = currentPage?.options?.orderId || '';
  loadNotice();
});

async function loadNotice() {
  if (!orderId.value) {
    errorText.value = '缺少订单号';
    return;
  }

  loading.value = true;
  errorText.value = '';
  try {
    const response = await getCustomerShippingNotice(orderId.value);
    if (response.code !== 0 || !response.data) {
      throw new Error(response.message || '加载失败');
    }
    notice.value = response.data;
  } catch (error: any) {
    errorText.value = error?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

function copyTrackingNumber() {
  if (!notice.value?.trackingNumber) return;
  uni.setClipboardData({
    data: notice.value.trackingNumber,
    success: () => {
      uni.showToast({ title: '运单号已复制', icon: 'success' });
    },
  });
}
</script>

<style scoped>
.shipping-notice-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f5f6f8;
  box-sizing: border-box;
}

.notice-content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.notice-image {
  width: 100%;
  height: 360rpx;
  border-radius: 16rpx;
  background: #e5e7eb;
}

.section,
.state-card {
  padding: 28rpx;
  border-radius: 16rpx;
  background: #ffffff;
  box-shadow: 0 4rpx 16rpx rgba(15, 23, 42, 0.06);
}

.section-title {
  display: block;
  margin-bottom: 18rpx;
  color: #1f2933;
  font-size: 30rpx;
  font-weight: 700;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-height: 56rpx;
}

.info-label {
  width: 132rpx;
  color: #6b7280;
  font-size: 26rpx;
}

.info-value {
  flex: 1;
  color: #1f2933;
  font-size: 28rpx;
}

.tracking {
  font-weight: 700;
}

.copy-btn,
.retry-btn {
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 22rpx;
  border-radius: 28rpx;
  background: #07c160;
  color: #ffffff;
  font-size: 24rpx;
}

.copy-btn::after,
.retry-btn::after {
  border: none;
}

.paragraph {
  display: block;
  color: #374151;
  font-size: 27rpx;
  line-height: 1.7;
  white-space: pre-line;
}
</style>
