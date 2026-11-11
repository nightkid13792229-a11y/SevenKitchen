<template>
  <view class="ship-recipient">
    <view class="ship-recipient-row">
      <text class="ship-recipient-label">顾客</text>
      <text class="ship-recipient-value">
        {{ customerName || '未记录顾客' }}
        <text v-if="customerPhone" class="ship-recipient-sub">{{ customerPhone }}</text>
      </text>
    </view>
    <view class="ship-recipient-row">
      <text class="ship-recipient-label">狗狗</text>
      <text class="ship-recipient-value" :class="{ 'ship-recipient-missing': !dogSummary }">
        {{ dogSummary || '未绑定狗狗' }}
      </text>
    </view>
    <view class="ship-recipient-row">
      <text class="ship-recipient-label">收货</text>
      <view class="ship-recipient-address">
        <block v-if="address">
          <text class="ship-recipient-value">
            {{ address.recipientName }}
            <text class="ship-recipient-sub">{{ addressPhone }}</text>
          </text>
          <text class="ship-recipient-detail">{{ addressLine }}</text>
        </block>
        <text v-else class="ship-recipient-value ship-recipient-missing">未录入收货地址</text>
      </view>
      <text v-if="address" class="ship-copy-pill" @tap.stop="copyAddress">复制地址</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 发货前要看清的三行：顾客 / 狗狗 / 收货地址（2026-11-11 抽成组件）。
 *
 * 原来只在鲜食发货抽屉里；合并/拆包页同样要在打包台前确认「寄给谁」，
 * 所以抽出来两边共用一份，地址复制的格式也只维护一处。
 */
import { computed } from 'vue';
import {
  buildOrderAddressCopyText,
  getOrderAddressDetail,
  getOrderAddressPhone,
  getOrderAddressRegionText,
  type OrderAddressLike,
} from '../../utils/order-address';

const props = withDefaults(
  defineProps<{
    customerName?: string | null;
    customerPhone?: string | null;
    /** 已经拼好的「名字 · 品种 · 体重」 */
    dogSummary?: string | null;
    address?: OrderAddressLike | null;
  }>(),
  {
    customerName: '',
    customerPhone: '',
    dogSummary: '',
    address: null,
  },
);

const addressPhone = computed(() => getOrderAddressPhone(props.address));
const addressLine = computed(
  () =>
    `${getOrderAddressRegionText(props.address)} ${getOrderAddressDetail(props.address)}`.trim(),
);

function copyAddress() {
  const content = buildOrderAddressCopyText(props.address);
  if (!content) return;
  uni.setClipboardData({
    data: content,
    success: () => {
      uni.showToast({ title: '地址已复制', icon: 'success' });
    },
  });
}
</script>

<style scoped lang="scss">
.ship-recipient {
  margin-bottom: 24rpx;
  padding: 20rpx 22rpx;
  border-radius: 14rpx;
  border: 2rpx solid #e6ecd8;
  background-color: #f2f5ea;
}

.ship-recipient-row {
  display: flex;
  align-items: flex-start;

  & + .ship-recipient-row {
    margin-top: 12rpx;
  }
}

.ship-recipient-label {
  flex: 0 0 68rpx;
  font-size: 24rpx;
  line-height: 38rpx;
  color: #6b6653;
}

.ship-recipient-value {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  line-height: 38rpx;
  color: #26261f;
  word-break: break-all;
}

.ship-recipient-sub {
  margin-left: 10rpx;
  font-size: 24rpx;
  color: #6b6653;
}

.ship-recipient-address {
  flex: 1;
  min-width: 0;
}

.ship-recipient-detail {
  display: block;
  margin-top: 2rpx;
  font-size: 25rpx;
  line-height: 36rpx;
  color: #464b3c;
  word-break: break-all;
}

.ship-recipient-missing {
  color: #b0b4bb;
}

.ship-copy-pill {
  flex: none;
  margin-left: 16rpx;
  padding: 4rpx 18rpx;
  border: 2rpx solid #1e3a2f;
  border-radius: 999rpx;
  background-color: #ffffff;
  font-size: 22rpx;
  line-height: 34rpx;
  color: #1e3a2f;
}
</style>
