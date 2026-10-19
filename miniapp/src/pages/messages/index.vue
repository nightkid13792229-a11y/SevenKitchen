<template>
  <view class="messages-page">
    <!-- 未登录：说清楚为什么看不到，而不是空白 -->
    <view v-if="!hasToken" class="state-block">
      <text class="state-title">登录后可以看消息</text>
      <text class="state-text">交付通知、售后进度、物流更新都在这里</text>
      <button class="state-btn" @tap="goLogin">去登录</button>
    </view>

    <template v-else>
      <view v-if="unreadCount > 0" class="read-all-bar">
        <text class="read-all-text">{{ unreadCount }} 条未读</text>
        <text class="read-all-action" @tap="handleReadAll">全部已读</text>
      </view>

      <view v-if="loading" class="state-block">
        <text class="state-text">加载中...</text>
      </view>

      <view v-else-if="!messages.length" class="state-block">
        <text class="state-title">还没有消息</text>
        <text class="state-text">交付、售后、物流有进展时会在这里通知你</text>
      </view>

      <view v-else class="message-list">
        <view
          v-for="item in messages"
          :key="item.id"
          class="message-item"
          :class="{ 'message-item--unread': !item.read }"
          @tap="openMessage(item)"
        >
          <view class="message-icon" :class="`message-icon--${iconKey(item.category)}`">
            <text class="message-icon-text">{{ iconText(item.category) }}</text>
          </view>
          <view class="message-body">
            <view class="message-title-row">
              <text v-if="!item.read" class="message-dot" />
              <text class="message-title">{{ item.title }}</text>
            </view>
            <text class="message-text">{{ item.body }}</text>
            <text class="message-time">{{ formatTime(item.createdAt) }}</text>
          </view>
        </view>

        <view v-if="hasMore" class="load-more" @tap="loadMore">
          <text class="load-more-text">加载更多</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import {
  fetchMessages,
  fetchUnreadMessageCount,
  markAllMessagesRead,
  markMessageRead,
  type CustomerMessage,
} from '@/api/messages';
import { storeUnreadMessageCount } from '@/utils/unread-message-badge';

/**
 * 消息中心（2026-10-18 新建）
 *
 * ## 为什么要有它
 *
 * 微信订阅消息**顾客没点"允许"就发不出去**，而且失败不报错 ——
 * 也就是说有一部分顾客永远收不到交付通知，我们还不知道是谁。
 * 站内消息是唯一"一定送得到"的渠道。
 *
 * ## 点消息去哪儿
 *
 * 由后端给的 `linkType` 决定，前端**不猜**：
 *   DELIVERY  → 交付第 1 页
 *   AFTERSALE → 售后页
 *   ORDER     → 定制订单详情
 *   SHIPPING  → 物流信息页
 * 未知类型：只标已读，不跳转（宁可不动，也不要跳到错误页面）。
 */

const PAGE_SIZE = 20;

const hasToken = ref(false);
const loading = ref(true);
const messages = ref<CustomerMessage[]>([]);
const unreadCount = ref(0);
const offset = ref(0);
const hasMore = ref(false);

const canLoad = computed(() => hasToken.value);

function iconKey(category: string): string {
  switch (category) {
    case 'DELIVERY':
      return 'delivery';
    case 'AFTERSALE':
      return 'aftersale';
    case 'SHIPPING':
      return 'shipping';
    default:
      return 'system';
  }
}

function iconText(category: string): string {
  switch (category) {
    case 'DELIVERY':
      return '🍲';
    case 'AFTERSALE':
      return '🔧';
    case 'SHIPPING':
      return '📦';
    default:
      return '🔔';
  }
}

/** 时间显示：今天只给时刻，今年只给月日，跨年才给年份 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}-${pad(d.getDate())} ${hm}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function refreshUnread() {
  if (!hasToken.value) return;
  unreadCount.value = storeUnreadMessageCount(
    await fetchUnreadMessageCount(),
  );
}

async function loadFirstPage() {
  if (!canLoad.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const result = await fetchMessages({
      limit: PAGE_SIZE,
      offset: 0,
    });
    messages.value = result.items;
    hasMore.value = result.hasMore;
    offset.value = result.items.length;
    await refreshUnread();
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!hasMore.value) return;
  const result = await fetchMessages({
    limit: PAGE_SIZE,
    offset: offset.value,
  });
  messages.value = [...messages.value, ...result.items];
  hasMore.value = result.hasMore;
  offset.value = messages.value.length;
}

/**
 * 点一条消息：先标已读（不等结果），再按 linkType 跳。
 *
 * 先跳后标会让红点"晚一拍"消失，顾客会以为没点中。
 */
async function openMessage(item: CustomerMessage) {
  if (!item.read) {
    item.read = true;
    unreadCount.value = storeUnreadMessageCount(
      Math.max(0, unreadCount.value - 1),
    );
    void markMessageRead(item.id).catch(() => false);
  }

  const id = item.linkId ? encodeURIComponent(item.linkId) : '';
  switch (item.linkType) {
    case 'DELIVERY':
      if (id) {
        uni.navigateTo({
          url: `/pages/custom-recipe/delivery?orderId=${id}`,
        });
      }
      return;
    case 'AFTERSALE':
      if (id) {
        uni.navigateTo({
          url: `/pages/custom-recipe/aftersale?orderId=${id}`,
        });
      }
      return;
    case 'ORDER':
      if (id) {
        uni.navigateTo({
          url: `/pages/custom-recipe/order-detail?orderId=${id}`,
        });
      }
      return;
    case 'SHIPPING':
      uni.navigateTo({ url: '/pages/order-shipping-notice/index' });
      return;
    default:
      // 未知类型：只标已读，不跳 —— 宁可不动，也不要跳到错误页面
      return;
  }
}

async function handleReadAll() {
  const changed = await markAllMessagesRead().catch(() => 0);
  if (changed >= 0) {
    messages.value = messages.value.map((item) => ({ ...item, read: true }));
    unreadCount.value = storeUnreadMessageCount(0);
  }
}

const goLogin = () => {
  uni.navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent('/pages/messages/index')}`,
  });
};

onLoad(() => {
  hasToken.value = Boolean(uni.getStorageSync('token'));
  void loadFirstPage();
});

// 从别的页面返回时刷新未读（比如刚在详情页提了售后）
onShow(() => {
  const token = Boolean(uni.getStorageSync('token'));
  if (token !== hasToken.value) {
    hasToken.value = token;
    void loadFirstPage();
    return;
  }
  void refreshUnread();
});

onPullDownRefresh(async () => {
  await loadFirstPage();
  uni.stopPullDownRefresh();
});
</script>

<style scoped lang="scss">
.messages-page {
  min-height: 100vh;
  background: #faf7f2;
  padding-bottom: 40rpx;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 40rpx;
}

.state-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #3f3222;
}

.state-text {
  font-size: 24rpx;
  color: #9c8b76;
  margin-top: 12rpx;
  text-align: center;
  line-height: 1.6;
}

.state-btn {
  margin-top: 32rpx;
  background: #b45309;
  color: #fff;
  font-size: 26rpx;
  border-radius: 16rpx;
  padding: 0 60rpx;
  line-height: 72rpx;
}

.read-all-bar {
  display: flex;
  align-items: center;
  padding: 0 28rpx 12rpx;
}

.read-all-text {
  flex: 1;
  font-size: 22rpx;
  color: #9c8b76;
}

.read-all-action {
  font-size: 22rpx;
  font-weight: 700;
  color: #b45309;
}

.message-list {
  padding: 0 24rpx;
}

.message-item {
  display: flex;
  background: #fff;
  border: 1rpx solid #ede0d0;
  border-radius: 22rpx;
  padding: 20rpx 22rpx;
  margin-bottom: 14rpx;
}

/* 未读：底色偏暖，与已读拉开差距 */
.message-item--unread {
  background: #fffcf7;
  border-color: #f0dfc4;
}

.message-icon {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16rpx;
  flex: 0 0 56rpx;
}

.message-icon--delivery {
  background: #fff1e3;
}

.message-icon--aftersale {
  background: #fceae5;
}

.message-icon--shipping {
  background: #e8eefb;
}

.message-icon--system {
  background: #f0eae3;
}

.message-icon-text {
  font-size: 26rpx;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-title-row {
  display: flex;
  align-items: center;
}

/* 未读红点：跟标题同一行，扫视时第一眼就能看出哪条没看 */
.message-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #d93f3f;
  margin-right: 10rpx;
  flex: 0 0 12rpx;
}

.message-title {
  font-size: 26rpx;
  font-weight: 700;
  color: #3f3222;
  flex: 1;
}

.message-text {
  display: block;
  font-size: 23rpx;
  color: #8a7a66;
  margin-top: 8rpx;
  line-height: 1.6;
}

.message-time {
  display: block;
  font-size: 20rpx;
  color: #b3a492;
  margin-top: 10rpx;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 24rpx 0;
}

.load-more-text {
  font-size: 23rpx;
  color: #b45309;
  font-weight: 700;
}
</style>
