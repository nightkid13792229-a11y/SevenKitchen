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
        <text class="read-all-action" @tap="handleReadAll">
          {{ readingAll ? '处理中...' : '全部已读' }}
        </text>
      </view>

      <view v-if="loading && !messages.length" class="state-block">
        <text class="state-text">加载中...</text>
      </view>

      <view v-else-if="loadError && !messages.length" class="state-block">
        <text class="state-title">消息加载失败</text>
        <text class="state-text">请检查网络后重试</text>
        <button class="state-btn" @tap="loadFirstPage">重新加载</button>
      </view>

      <view v-else-if="!messages.length" class="state-block">
        <text class="state-title">还没有消息</text>
        <text class="state-text">交付、售后、物流有进展时会在这里通知你</text>
      </view>

      <template v-else>
        <view v-if="loadError" class="load-error-bar" @tap="loadFirstPage">
          <text class="load-error-text">{{ loadError }}，点击重试</text>
        </view>

        <view class="message-list">
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
            <text class="load-more-text">
              {{ loadingMore ? '加载中...' : loadMoreError ? '加载失败，点击重试' : '加载更多' }}
            </text>
          </view>
        </view>
      </template>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import {
  fetchMessages,
  fetchUnreadMessageCountStrict,
  markAllMessagesRead,
  markMessageRead,
  type CustomerMessage,
} from '@/api/messages';
import { AUTH_EXPIRED_EVENT } from '@/utils/api';
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
 *   SUPPLEMENT_ORDER → 补剂订单详情
 * 未知类型：只标已读，不跳转（宁可不动，也不要跳到错误页面）。
 */

const PAGE_SIZE = 20;

const hasToken = ref(false);
const loading = ref(true);
const messages = ref<CustomerMessage[]>([]);
const unreadCount = ref(0);
const offset = ref(0);
const hasMore = ref(false);
const loadingMore = ref(false);
const loadError = ref('');
const loadMoreError = ref('');
const readingAll = ref(false);
let hasShownOnce = false;

const canLoad = computed(() => hasToken.value);

function isAuthError(error: any): boolean {
  const message = String(error?.message || error || '');
  return message.includes('Authentication required') || message.includes('401');
}

function handleAuthExpired() {
  hasToken.value = false;
  messages.value = [];
  hasMore.value = false;
  offset.value = 0;
  loadError.value = '';
  loadMoreError.value = '';
  loading.value = false;
  loadingMore.value = false;
  readingAll.value = false;
  unreadCount.value = storeUnreadMessageCount(0);
}

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
  if (!hasToken.value) {
    unreadCount.value = storeUnreadMessageCount(0);
    return;
  }
  try {
    unreadCount.value = storeUnreadMessageCount(
      await fetchUnreadMessageCountStrict(),
    );
  } catch (error) {
    // 未读数失败时保留旧值，不能把“读取失败”当成 0 条未读
    console.warn('[Messages] 刷新未读数失败:', error);
  }
}

async function loadFirstPage() {
  if (!canLoad.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = '';
  loadMoreError.value = '';
  try {
    const result = await fetchMessages({
      limit: PAGE_SIZE,
      offset: 0,
    });
    messages.value = result.items;
    hasMore.value = result.hasMore;
    offset.value = result.items.length;
    await refreshUnread();
  } catch (error) {
    if (isAuthError(error)) {
      handleAuthExpired();
    } else {
      console.warn('[Messages] 加载消息失败:', error);
      loadError.value = '消息加载失败';
    }
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  loadMoreError.value = '';
  try {
    const result = await fetchMessages({
      limit: PAGE_SIZE,
      offset: offset.value,
    });
    const existing = new Set(messages.value.map((item) => item.id));
    messages.value = [
      ...messages.value,
      ...result.items.filter((item) => !existing.has(item.id)),
    ];
    // offset 按服务端返回条数推进，不能按去重后的列表长度，否则会回退
    offset.value += result.items.length;
    hasMore.value = result.hasMore;
  } catch (error) {
    if (isAuthError(error)) {
      handleAuthExpired();
    } else {
      console.warn('[Messages] 加载更多失败:', error);
      loadMoreError.value = '加载更多失败，点击重试';
    }
  } finally {
    loadingMore.value = false;
  }
}

/**
 * 点一条消息：先标已读（不等结果），再按 linkType 跳。
 *
 * 先跳后标会让红点"晚一拍"消失，顾客会以为没点中。
 */
async function openMessage(item: CustomerMessage) {
  const wasUnread = !item.read;
  const previousUnread = unreadCount.value;
  if (wasUnread) {
    item.read = true;
    unreadCount.value = storeUnreadMessageCount(
      Math.max(0, previousUnread - 1),
    );
    // 网络失败回滚本地已读，避免“页面已读、服务端未读”
    void markMessageRead(item.id).catch(() => {
      if (!wasUnread) return;
      item.read = false;
      unreadCount.value = storeUnreadMessageCount(previousUnread);
      uni.showToast({ title: '已读状态未保存', icon: 'none' });
    });
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
      if (id) {
        uni.navigateTo({
          url: `/pages/order-shipping-notice/index?orderId=${id}`,
        });
      } else {
        uni.showToast({ title: '物流信息暂不可用', icon: 'none' });
      }
      return;
    case 'SUPPLEMENT_ORDER':
      if (id) {
        uni.navigateTo({
          url: `/pages/supplement-order-detail/index?orderId=${id}`,
        });
      }
      return;
    default:
      // 未知类型：只标已读，不跳 —— 宁可不动，也不要跳到错误页面
      return;
  }
}

async function handleReadAll() {
  if (readingAll.value) return;
  readingAll.value = true;
  try {
    await markAllMessagesRead();
    messages.value = messages.value.map((item) => ({ ...item, read: true }));
    unreadCount.value = storeUnreadMessageCount(0);
  } catch (error) {
    console.warn('[Messages] 全部已读失败:', error);
    uni.showToast({ title: '全部已读失败，请重试', icon: 'none' });
  } finally {
    readingAll.value = false;
  }
}

const goLogin = () => {
  uni.navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent('/pages/messages/index')}`,
  });
};

onLoad(() => {
  hasToken.value = Boolean(uni.getStorageSync('token'));
  if (!hasToken.value) {
    loading.value = false;
    return;
  }
  void loadFirstPage();
});

/**
 * 从消息指向的页面/订单页返回时，必须重拉第一页：
 * 只刷新未读数会出现“上面写 1 条未读、下面没有这条消息”。
 */
onShow(() => {
  const token = Boolean(uni.getStorageSync('token'));
  if (!token) {
    if (hasToken.value) {
      handleAuthExpired();
    } else {
      loading.value = false;
    }
    return;
  }

  const tokenChanged = token !== hasToken.value;
  hasToken.value = token;

  if (tokenChanged) {
    hasShownOnce = true;
    void loadFirstPage();
    return;
  }

  if (!hasShownOnce) {
    // onLoad 已经拉过第一页，首次 onShow 只补未读数，避免双请求
    hasShownOnce = true;
    void refreshUnread();
    return;
  }

  void loadFirstPage();
});

onMounted(() => {
  uni.$on(AUTH_EXPIRED_EVENT, handleAuthExpired);
});

onUnmounted(() => {
  uni.$off(AUTH_EXPIRED_EVENT, handleAuthExpired);
});

onPullDownRefresh(async () => {
  try {
    await loadFirstPage();
  } finally {
    uni.stopPullDownRefresh();
  }
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

.load-error-bar {
  margin: 0 24rpx 12rpx;
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  background: #fff7ed;
  border: 1rpx solid #f1dcc2;
}

.load-error-text {
  font-size: 22rpx;
  line-height: 1.5;
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
