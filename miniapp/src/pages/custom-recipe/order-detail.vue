<template>
  <view class="detail-page">
    <view v-if="loading" class="state-block">
      <text class="state-text">加载中...</text>
    </view>

    <view v-else-if="loadFailed" class="state-block">
      <text class="state-title">订单加载失败</text>
      <text class="state-text">请检查网络后重试</text>
      <button class="retry-btn" @tap="loadOrderDetail">重新加载</button>
    </view>

    <template v-else>
      <view class="status-card">
        <text class="status-text">{{ statusText }}</text>
        <text class="status-order-id">订单号 {{ order.orderId }}</text>
      </view>

      <view class="section" v-if="creditRemaining > 0 || creditTotal > 0">
        <view class="section-title">成品抵扣额度</view>
        <view class="info-row">
          <text class="label">额度总额</text>
          <text class="value">¥{{ formatAmount(creditTotal) }}</text>
        </view>
        <view class="info-row">
          <text class="label">已抵扣</text>
          <text class="value">¥{{ formatAmount(creditUsed) }}</text>
        </view>
        <view class="info-row">
          <text class="label">剩余可用</text>
          <text class="value highlight">¥{{ formatAmount(creditRemaining) }}</text>
        </view>
        <text class="section-note">从这道定制食谱下成品单时可抵扣货款，没用完的额度可以下次继续用</text>
      </view>

      <view class="section">
        <view class="section-title">定制信息</view>
        <view class="info-row">
          <text class="label">定制对象</text>
          <text class="value">{{ order.dogName || '—' }}</text>
        </view>
        <view class="info-row">
          <text class="label">定制目标</text>
          <text class="value">{{ goalText }}</text>
        </view>
        <view class="info-row">
          <text class="label">定制费</text>
          <text class="value">¥{{ formatAmount(order.amount) }}</text>
        </view>
        <view class="info-row">
          <text class="label">预约日期</text>
          <text class="value">{{ formatDate(order.scheduledDate) || '—' }}</text>
        </view>
        <view class="info-row">
          <text class="label">预计交付</text>
          <text class="value">{{ formatDate(order.estimatedDeliveryDate) || '—' }}</text>
        </view>
        <view class="info-row">
          <text class="label">提交时间</text>
          <text class="value">{{ formatDate(order.createdAt) || '—' }}</text>
        </view>
      </view>

      <view class="section" v-if="hasRequirements">
        <view class="section-title">你的需求</view>
        <view class="tag-group" v-if="(order.medicalConditions || []).length">
          <text class="tag-label">疾病史</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.medicalConditions" :key="`c-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="tag-group" v-if="(order.allergies || []).length">
          <text class="tag-label">过敏信息</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.allergies" :key="`a-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="tag-group" v-if="(order.preferredIngredients || []).length">
          <text class="tag-label">喜欢的食材</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.preferredIngredients" :key="`p-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="tag-group" v-if="(order.dislikedIngredients || []).length">
          <text class="tag-label">不吃的食材</text>
          <view class="tag-list">
            <text v-for="(item, index) in order.dislikedIngredients" :key="`d-${index}`" class="tag">{{ item }}</text>
          </view>
        </view>
        <view class="notes-block" v-if="order.additionalNotes">
          <text class="tag-label">其它需求</text>
          <text class="notes-text">{{ order.additionalNotes }}</text>
        </view>
      </view>

      <view class="section" v-if="order.recipeId">
        <view class="section-title">定制食谱</view>
        <text class="recipe-name">{{ order.recipeName || '已交付的定制食谱' }}</text>
        <button class="recipe-btn" @tap="viewRecipe">查看定制食谱</button>
      </view>

      <view class="action-bar">
        <button
          v-if="order.status === 'PENDING_PAYMENT'"
          class="btn primary"
          :loading="paying"
          :disabled="paying"
          @tap="goPay"
        >
          立即付款
        </button>
        <button class="btn secondary" @tap="goOrders">返回定制订单</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
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
  recipeName?: string | null;
  allergies?: string[];
  medicalConditions?: string[];
  preferredIngredients?: string[];
  dislikedIngredients?: string[];
  additionalNotes?: string | null;
  createdAt?: string | null;
}

const ORDER_STATUS_TEXT: Record<string, string> = {
  PENDING_PAYMENT: '待付款',
  PAID: '已付款 · 等待制作',
  IN_PROGRESS: '制作中',
  DELIVERED: '已交付',
};

const GOAL_TEXT: Record<string, string> = {
  MAINTAIN: '维持体重',
  GAIN_WEIGHT: '增重',
  LOSE_WEIGHT: '减重',
  HEALTH_SUPPORT: '健康管理',
};

const orderId = ref('');
const loading = ref(true);
const loadFailed = ref(false);
const paying = ref(false);
const order = ref<CustomRecipeOrderDetail>({});

onLoad((options: any) => {
  orderId.value = options.orderId || '';
  void loadOrderDetail();
});

onPullDownRefresh(() => {
  void loadOrderDetail().finally(() => uni.stopPullDownRefresh());
});

const loadOrderDetail = async () => {
  if (!orderId.value) {
    loading.value = false;
    loadFailed.value = true;
    return;
  }

  loading.value = true;
  loadFailed.value = false;
  try {
    const res: any = await request({
      url: `/custom-recipe/orders/${encodeURIComponent(orderId.value)}`,
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    });
    if (res.code === 0 && res.data) {
      order.value = res.data;
    } else {
      loadFailed.value = true;
    }
  } catch (error) {
    console.error('[CustomRecipe] 读取订单详情失败:', error);
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
};

const statusText = computed(
  () => ORDER_STATUS_TEXT[order.value.status || ''] || '定制订单',
);

const goalText = computed(
  () => GOAL_TEXT[order.value.targetGoal || ''] || '—',
);

const creditTotal = computed(() => Number(order.value.creditAmount || 0));
const creditUsed = computed(() => Number(order.value.creditUsed || 0));
const creditRemaining = computed(() => {
  if (order.value.creditRemaining !== undefined) {
    return Number(order.value.creditRemaining);
  }
  return Math.max(0, creditTotal.value - creditUsed.value);
});

const hasRequirements = computed(() => {
  const value = order.value;
  return Boolean(
    (value.medicalConditions || []).length ||
      (value.allergies || []).length ||
      (value.preferredIngredients || []).length ||
      (value.dislikedIngredients || []).length ||
      value.additionalNotes,
  );
});

function formatAmount(value?: number): string {
  const amount = Number(value || 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const viewRecipe = () => {
  if (!order.value.recipeId) return;
  uni.navigateTo({
    url: `/pages/recipe-detail/index?id=${encodeURIComponent(order.value.recipeId)}`,
  });
};

/**
 * 付款入口：优先走小程序内微信支付；
 * 支付通道不可用（返回 MANUAL）时，跳到提交成功页看客服收款方式，
 * 保证订单在任何情况下都能被付掉。
 */
const goPay = async () => {
  if (paying.value) return;

  const targetOrderId = order.value.orderId || orderId.value;
  if (!targetOrderId) return;

  paying.value = true;
  try {
    const outcome = await runCustomRecipePayment(targetOrderId);

    if (outcome === 'PAID') {
      uni.showToast({ title: '支付成功', icon: 'success' });
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
      uni.navigateTo({
        url: `/pages/custom-recipe/success?orderId=${encodeURIComponent(targetOrderId)}`,
      });
      return;
    }

    uni.showToast({ title: '支付未完成，可稍后重试', icon: 'none' });
  } finally {
    paying.value = false;
  }
};

const goOrders = () => {
  uni.redirectTo({ url: '/pages/custom-recipe/orders' });
};
</script>

<style scoped>
.detail-page {
  min-height: 100vh;
  padding: 24rpx 24rpx 200rpx;
  background: #f5f5f5;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 160rpx 40rpx;
}

.state-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
}

.state-text {
  font-size: 26rpx;
  color: #999;
}

.retry-btn {
  margin-top: 12rpx;
  padding: 0 48rpx;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 28rpx;
  color: #fff;
  background: #1e3a2f;
  border-radius: 999rpx;
}

.retry-btn::after {
  border: none;
}

.status-card {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;
  background: linear-gradient(135deg, #1e3a2f 0%, #2b5040 100%);
  border-radius: 20rpx;
}

.status-text {
  font-size: 38rpx;
  font-weight: 700;
  color: #f6efe0;
}

.status-order-id {
  font-size: 24rpx;
  color: #cfe0d5;
}

.section {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
  margin-bottom: 24rpx;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20rpx;
  font-size: 28rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  color: #888;
  flex-shrink: 0;
}

.value {
  color: #333;
  text-align: right;
  flex: 1;
  margin-left: 20rpx;
}

.value.highlight {
  color: #b08d4f;
  font-weight: 700;
}

.section-note {
  display: block;
  margin-top: 20rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #999;
}

.tag-group {
  margin-bottom: 24rpx;
}

.tag-group:last-child {
  margin-bottom: 0;
}

.tag-label {
  display: block;
  font-size: 26rpx;
  color: #888;
  margin-bottom: 12rpx;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag {
  padding: 8rpx 20rpx;
  font-size: 24rpx;
  color: #1e3a2f;
  background: #eef3ea;
  border-radius: 999rpx;
}

.notes-block {
  margin-top: 8rpx;
}

.notes-text {
  display: block;
  font-size: 26rpx;
  line-height: 1.6;
  color: #333;
}

.recipe-name {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #26261f;
  margin-bottom: 24rpx;
}

.recipe-btn {
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  color: #1e3a2f;
  background: #f3eddd;
  border: 1rpx solid #d8bc85;
  border-radius: 999rpx;
}

.recipe-btn::after {
  border: none;
}

.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 20rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 16rpx rgba(0, 0, 0, 0.06);
}

.btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
  border-radius: 999rpx;
}

.btn.primary {
  background: linear-gradient(135deg, #1e3a2f 0%, #2b5040 100%);
  color: #f6efe0;
}

.btn.secondary {
  background: #fff;
  color: #666;
  border: 2rpx solid #ddd;
}
</style>
