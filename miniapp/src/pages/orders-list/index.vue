<template>
  <view class="container">
    <!-- 状态筛选Tab -->
    <view class="status-tabs">
      <view
        v-for="tab in statusTabs"
        :key="tab.value"
        class="tab-item"
        :class="{ active: selectedStatus === tab.value }"
        @tap="selectStatus(tab.value)"
      >
        <text class="tab-text">{{ tab.label }}</text>
        <text v-if="tab.count > 0" class="tab-count">({{ tab.count }})</text>
      </view>
    </view>

    <view class="order-list">
      <view
        v-for="order in orders"
        :key="order.id"
        class="order-item"
        @tap="viewOrder(order.id)"
      >
        <!-- 订单时间和状态 -->
        <view class="order-header">
          <text class="order-time">{{
            formatShortDateTime(order.createdAt)
          }}</text>
          <text
            class="order-status"
            :style="{ color: getStatusColor(order) }"
          >
            {{ getStatusText(order) }}
          </text>
        </view>

        <!-- 商品数量 -->
        <view class="order-summary">
          <text class="summary-text">{{ order.itemCount || 0 }}件商品</text>
        </view>

        <!-- 如果有详细商品信息，显示更多信息 -->
        <template v-if="order.firstItem">
          <!-- 狗狗信息 -->
          <view class="order-dogs">
            <text class="dogs-text">{{ formatDogInfo(order) }}</text>
          </view>

          <!-- 商品信息：食谱名称、总餐数、每餐重量 -->
          <view class="order-items">
            <view class="recipe-header">
              <image
                v-if="getRecipeCoverImage(order)"
                class="recipe-cover"
                :src="getRecipeCoverImage(order)"
                mode="aspectFill"
              />
              <text class="recipe-name">{{ getRecipeName(order) }}</text>
            </view>
            <view class="meal-info">
              <text class="meal-text">共{{ getTotalMeals(order) }}餐</text>
              <text class="meal-separator">·</text>
              <text
                v-if="
                  order.firstItem?.packagePlan &&
                  order.firstItem.packagePlan.length > 0
                "
                class="meal-text"
              >
                {{ formatPackagePlan(order.firstItem) }}
              </text>
              <text v-else class="meal-text"
                >每餐{{ getMealWeight(order) }}g</text
              >
            </view>
          </view>

          <!-- 收货地址 -->
          <view class="order-address" v-if="order.address">
            <text class="address-text">{{ formatAddress(order.address) }}</text>
          </view>
        </template>

        <!-- 金额 -->
        <view class="order-amount">
          <text class="amount-label">订单金额:</text>
          <text class="amount-value"
            >¥{{ formatAmount(order.totalAmount) }}</text
          >
        </view>

        <view v-if="hasQuickActions(order)" class="order-actions" @tap.stop>
          <button
            v-if="order.status === 'PENDING_PAYMENT'"
            class="action-btn primary"
            :disabled="payingOrderId === order.id"
            @tap="payOrderFromList(order.id)"
          >
            {{ payingOrderId === order.id ? '调起支付中' : '立即付款' }}
          </button>
          <button
            v-if="order.status === 'SHIPPED'"
            class="action-btn secondary"
            @tap="viewLogistics(order)"
          >
            查看物流
          </button>
          <button
            v-if="canApplyAftersale(order.status)"
            class="action-btn secondary"
            @tap="applyAftersale(order.id)"
          >
            申请售后
          </button>
          <button
            v-if="order.status === 'SHIPPED'"
            class="action-btn primary"
            :disabled="receivingOrderId === order.id"
            @tap="confirmReceivedFromList(order.id)"
          >
            {{ receivingOrderId === order.id ? '确认中' : '确认收货' }}
          </button>
          <button
            v-if="order.status === 'COMPLETED' || order.status === 'CANCELLED'"
            class="action-btn secondary"
            @tap="buyAgain(order)"
          >
            再次购买
          </button>
        </view>
      </view>

      <view v-if="orders.length === 0" class="empty-state">
        <text class="empty-title">{{ emptyTitle }}</text>
        <text class="empty-text">{{ emptyText }}</text>
        <button
          v-if="selectedStatus === 'ALL'"
          class="empty-action"
          @tap="goHome"
        >
          去选食谱
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import { request, getToken } from '../../utils/api';
import {
  createWechatPayment,
  type WechatPaymentResult,
} from '../../api/orders';
import { formatShortDateTime } from '../../utils/date';
import { requestWechatOrderPayment } from '../../utils/wechat-payment';
import { ensurePhoneBound } from '../../utils/account';

// DEBUG flag for development logging
const DEBUG = true;

interface Order {
  id: string;
  status: string;
  cancellationReason?: string | null;
  aftersaleType?: string | null;
  totalAmount?: number;
  itemCount?: number;
  createdAt?: string;
  trackingNumber?: string;
  carrierCode?: string;
  firstItem?: {
    dogId?: string;
    dog?: {
      name?: string;
      breedName?: string;
      weightKg?: number;
      mealsPerDay?: number;
    };
    recipeSnapshot?: {
      id: string;
      name: string;
      coverImageUrl?: string | null;
    };
    packageCount: number;
    packageSpecG: number;
    packagePlan?: Array<{ packageSpecG: number; packageCount: number }>;
    ingredientSourcePlan?: string | null;
    dailyIntakeG?: number;
  };
  address?: {
    recipientName: string;
    regionText: string;
    detailAddress: string;
  };
}

// 状态筛选Tab
const selectedStatus = ref<string>('ALL');

const statusTabs = ref<Array<{ label: string; value: string; count: number }>>([
  { label: '全部', value: 'ALL', count: 0 },
  { label: '待付款', value: 'PENDING_PAYMENT', count: 0 },
  { label: '制作中', value: 'IN_PROGRESS', count: 0 },
  { label: '待收货', value: 'WAIT_RECEIVE', count: 0 },
  { label: '已收货', value: 'RECEIVED', count: 0 },
  { label: '售后中', value: 'AFTERSALE', count: 0 },
  { label: '已取消/退款', value: 'CANCELLED', count: 0 },
]);

const allOrders = ref<Order[]>([]);
const orders = ref<Order[]>([]);
const viewAllOrders = ref(false); // 是否查看所有订单（从工作台进入时为true）
const payingOrderId = ref('');
const receivingOrderId = ref('');

const emptyTitle = computed(() => {
  if (selectedStatus.value === 'ALL') {
    return '还没有订单';
  }
  const tab = statusTabs.value.find(
    (item) => item.value === selectedStatus.value,
  );
  return `暂无${tab?.label || '相关'}订单`;
});

const emptyText = computed(() => {
  const copyMap: Record<string, string> = {
    ALL: '去首页选择食谱，下单后订单会出现在这里。',
    PENDING_PAYMENT: '没有需要付款的订单。',
    IN_PROGRESS: '没有正在制作的订单。',
    WAIT_RECEIVE: '没有等待收货的订单。',
    RECEIVED: '没有已收货订单。',
    AFTERSALE: '没有售后中的订单。',
    CANCELLED: '没有已取消订单。',
  };
  return copyMap[selectedStatus.value] || '这里暂时没有订单。';
});

onMounted(async () => {
  if (!(await ensurePhoneBound())) {
    return;
  }
  loadOrders();
});

onLoad((options: any) => {
  // 获取页面参数，判断是否查看所有订单
  // 如果URL参数中有viewAll=true，则查看所有订单（管理员模式）
  if (options && options.viewAll === 'true') {
    viewAllOrders.value = true;
  }
  if (options && typeof options.status === 'string') {
    const matchedTab = statusTabs.value.find(
      (tab) => tab.value === options.status,
    );
    if (matchedTab) {
      selectedStatus.value = matchedTab.value;
    }
  }
});

onShow(async () => {
  if (!(await ensurePhoneBound())) {
    return;
  }
  // Refresh orders when page becomes visible (e.g., after creating new order)
  loadOrders();
});

function loadOrders() {
  if (DEBUG) {
    const token = getToken();
    console.log('[OrdersList] Loading orders', {
      token: token ? token.substring(0, 20) + '...' : 'none',
      viewAllOrders: viewAllOrders.value,
    });
  }

  uni.showLoading({ title: '加载中...' });

  // 根据页面参数决定调用哪个API
  // viewAll=true 时调用管理员API查看所有订单，否则调用普通API只看自己的订单
  const apiUrl = viewAllOrders.value ? '/admin/orders' : '/orders';

  request({
    url: apiUrl,
    method: 'GET',
  })
    .then((res: any) => {
      if (DEBUG) {
        console.log('[OrdersList] Response:', {
          code: res.code,
          orderCount: res.data?.length || 0,
          viewAllOrders: viewAllOrders.value,
        });
        console.log(
          '[OrdersList] Orders Data:',
          JSON.stringify(res.data, null, 2),
        );
        if (res.data && res.data.length > 0) {
          console.log(
            '[OrdersList] First Order:',
            JSON.stringify(res.data[0], null, 2),
          );
          console.log('[OrdersList] First Order Items:', res.data[0].items);
        }
      }
      if (res.code === 0 && res.data) {
        // 管理员API返回的是 { list, total } 结构，普通用户API返回的是数组
        const orders = Array.isArray(res.data) ? res.data : res.data.list || [];
        allOrders.value = orders;
        updateStatusCounts();
        filterOrders();
      }
    })
    .catch((err: any) => {
      console.error('Load orders error:', err);
    })
    .finally(() => {
      uni.hideLoading();
    });
}

// 更新各状态订单数量
// Phase 9: Simplified status counts aligned with e-commerce standards
// Phase 9.1: Added PURCHASING, FREEZING and AFTERSALE status counts
function updateStatusCounts() {
  statusTabs.value.forEach((tab) => {
    tab.count = getOrdersByTab(tab.value).length;
  });
}

// 根据选中状态筛选订单
// Phase 9: Simplified filter logic
function filterOrders() {
  orders.value = getOrdersByTab(selectedStatus.value);
}

function getStatusesForTab(status: string): string[] | null {
  const statusGroups: Record<string, string[]> = {
    PENDING_PAYMENT: ['PENDING_PAYMENT'],
    IN_PROGRESS: ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'FREEZING'],
    WAIT_RECEIVE: ['SHIPPED'],
    RECEIVED: ['COMPLETED'],
    AFTERSALE: ['AFTERSALE'],
    CANCELLED: ['CANCELLED'],
  };
  return statusGroups[status] || null;
}

function getOrdersByTab(status: string): Order[] {
  if (status === 'ALL') {
    return allOrders.value;
  }

  const statuses = getStatusesForTab(status);
  if (!statuses) {
    return allOrders.value.filter((order) => order.status === status);
  }

  return allOrders.value.filter((order) => statuses.includes(order.status));
}

// 选择状态
function selectStatus(status: string) {
  selectedStatus.value = status;
  filterOrders();
}

function viewOrder(orderId: string) {
  uni.navigateTo({
    url: `/pages/order-detail/index?id=${orderId}`,
  });
}

function goHome() {
  uni.switchTab({
    url: '/pages/home/index',
  });
}

function hasQuickActions(order: Order): boolean {
  return (
    order.status === 'PENDING_PAYMENT' ||
    order.status === 'SHIPPED' ||
    order.status === 'FREEZING' ||
    order.status === 'COMPLETED' ||
    order.status === 'CANCELLED'
  );
}

function canApplyAftersale(status: string): boolean {
  return ['FREEZING', 'SHIPPED', 'COMPLETED'].includes(status);
}

function requestWechatPayment(payment: WechatPaymentResult): Promise<void> {
  return requestWechatOrderPayment(payment);
}

async function payOrderFromList(orderId: string) {
  if (payingOrderId.value) return;

  try {
    payingOrderId.value = orderId;
    uni.showLoading({ title: '调起支付中...' });

    const res = await createWechatPayment(orderId);
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '支付失败');
    }

    uni.hideLoading();
    await requestWechatPayment(res.data);
    uni.showToast({
      title: '支付处理中',
      icon: 'success',
    });
    loadOrders();
  } catch (error: any) {
    const errorMessage = error?.errMsg?.includes('cancel')
      ? '已取消支付'
      : error instanceof Error
        ? error.message
        : '支付失败，请重试';
    uni.showToast({
      title: errorMessage,
      icon: 'none',
    });
  } finally {
    payingOrderId.value = '';
    uni.hideLoading();
  }
}

function viewLogistics(order: Order) {
  if (!order.trackingNumber) {
    uni.showToast({
      title: '暂无物流信息',
      icon: 'none',
    });
    return;
  }

  uni.showModal({
    title: '物流信息',
    content: `快递公司：${getCarrierName(order.carrierCode)}\n运单号：${order.trackingNumber}`,
    confirmText: '复制单号',
    cancelText: '关闭',
    success: (res) => {
      if (!res.confirm) return;
      uni.setClipboardData({
        data: order.trackingNumber || '',
        success: () => {
          uni.showToast({ title: '已复制', icon: 'success' });
        },
      });
    },
  });
}

async function confirmReceivedFromList(orderId: string) {
  if (receivingOrderId.value) return;

  uni.showModal({
    title: '确认收货',
    content: '确认已经收到商品了吗？',
    success: async (res) => {
      if (!res.confirm) return;

      try {
        receivingOrderId.value = orderId;
        uni.showLoading({ title: '确认中...' });
        const result = await request({
          url: `/orders/${orderId}/complete`,
          method: 'POST',
        });
        if (result.code !== 0) {
          throw new Error(result.message || '确认失败');
        }
        uni.showToast({
          title: '已确认收货',
          icon: 'success',
        });
        loadOrders();
      } catch (error: any) {
        uni.showToast({
          title: error?.message || '确认失败',
          icon: 'none',
        });
      } finally {
        receivingOrderId.value = '';
        uni.hideLoading();
      }
    },
  });
}

function applyAftersale(orderId: string) {
  uni.navigateTo({
    url: `/pages/aftersale-apply/index?orderId=${orderId}&type=REFUND`,
  });
}

function buyAgain(order: Order) {
  const recipeId = order.firstItem?.recipeSnapshot?.id;
  if (!recipeId) {
    uni.showToast({
      title: '食谱信息不完整',
      icon: 'none',
    });
    return;
  }

  const queryPairs = [`recipeId=${encodeURIComponent(recipeId)}`];
  if (order.firstItem?.dogId) {
    queryPairs.push(`dogId=${encodeURIComponent(order.firstItem.dogId)}`);
  }

  uni.navigateTo({
    url: `/pages/recipe-order/index?${queryPairs.join('&')}`,
  });
}

function formatAmount(amount?: number): string {
  if (!amount) return '0.00';
  return amount.toFixed(2);
}

function getStatusText(orderOrStatus: Order | string): string {
  const status = typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus.status
  if (typeof orderOrStatus !== 'string' && isRefundedOrder(orderOrStatus)) {
    return '已退款（钱款原路退回）'
  }
  // Phase 9: Simplified status text aligned with e-commerce standards
  // Phase 9.1: Added PURCHASING, FREEZING and AFTERSALE status text
  const statusMap: Record<string, string> = {
    INIT: '待确认',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    PURCHASING: '采购中',
    IN_PRODUCTION: '生产中',
    FREEZING: '急冻中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    AFTERSALE: '售后中',
  };
  return statusMap[status] || status;
}

function getStatusColor(orderOrStatus: Order | string): string {
  const status = typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus.status
  if (typeof orderOrStatus !== 'string' && isRefundedOrder(orderOrStatus)) {
    return '#16a34a'
  }
  // Phase 9: Simplified status colors aligned with e-commerce standards
  // Phase 9.1: Added PURCHASING, FREEZING and AFTERSALE status colors
  const colorMap: Record<string, string> = {
    INIT: '#999',
    PENDING_PAYMENT: '#ff9800',
    PAID: '#52c41a',
    PURCHASING: '#faad14',
    IN_PRODUCTION: '#1890ff',
    FREEZING: '#722ed1',
    SHIPPED: '#52c41a',
    COMPLETED: '#52c41a',
    CANCELLED: '#999',
    AFTERSALE: '#f5222d',
  };
  return colorMap[status] || '#999';
}

function isRefundedOrder(order: Order): boolean {
  return order.status === 'CANCELLED' && (order.cancellationReason || '').includes('售后退款')
}

function getCarrierName(code?: string): string {
  const carrierMap: Record<string, string> = {
    SF: '顺丰速运',
    STO: '申通快递',
    YTO: '圆通速递',
    ZTO: '中通快递',
    EMS: 'EMS',
  };
  return carrierMap[code || ''] || code || '-';
}

function formatDogInfo(order: Order): string {
  if (!order.firstItem || !order.firstItem.dog) {
    return '';
  }

  const dog = order.firstItem.dog;
  const dogName = dog.name || '';
  const breedName = dog.breedName || '';
  const weightKg = dog.weightKg || 0;

  const parts = [dogName];
  if (breedName) parts.push(breedName);
  if (weightKg > 0) parts.push(`${weightKg}kg`);

  return parts.join(' · ');
}

function getRecipeName(order: Order): string {
  if (!order.firstItem || !order.firstItem.recipeSnapshot) {
    return '';
  }
  return order.firstItem.recipeSnapshot.name || '';
}

function getRecipeCoverImage(order: Order): string {
  if (!order.firstItem || !order.firstItem.recipeSnapshot) {
    return '';
  }
  return order.firstItem.recipeSnapshot.coverImageUrl || '';
}

function getTotalMeals(order: Order): number {
  if (!order.firstItem) {
    return 0;
  }
  return order.firstItem.packageCount || 0;
}

function getMealWeight(order: Order): number {
  if (!order.firstItem) {
    return 0;
  }

  const firstItem = order.firstItem;

  // ✅ 修复：直接返回用户配置的包装规格（每袋重量 = 每餐饭量）
  // 这是用户下单时确认并支付的数据，而不是系统推荐值
  return firstItem.packageSpecG || 0;
}

function formatPackagePlan(item: {
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>;
  packageSpecG?: number;
  packageCount?: number;
}): string {
  const packagePlanRows = (item.packagePlan || [])
    .map((row) => {
      const packageSpecG = Number(row?.packageSpecG);
      const packageCount = Number(row?.packageCount);
      if (
        !Number.isFinite(packageSpecG) ||
        !Number.isFinite(packageCount) ||
        packageSpecG <= 0 ||
        packageCount <= 0
      ) {
        return '';
      }
      return `${packageSpecG}g×${packageCount}袋`;
    })
    .filter(Boolean);

  if (packagePlanRows.length > 0) {
    return packagePlanRows.join('，');
  }

  return `${item.packageSpecG || 0}g×${item.packageCount || 0}袋`;
}

function formatAddress(address?: { regionText?: string }): string {
  if (!address || !address.regionText) {
    return '';
  }

  // 只显示第一个地区（市级）
  const regions = address.regionText.split(/\s+/);
  return regions[0] || address.regionText;
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  padding-top: 0;
}

/* 状态筛选Tab */
.status-tabs {
  display: flex;
  background-color: #fff;
  padding: 20rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  overflow-x: auto;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-item {
  flex-shrink: 0;
  padding: 12rpx 24rpx;
  margin-right: 16rpx;
  border-radius: 20rpx;
  background-color: #f5f5f5;
  display: flex;
  align-items: center;
  gap: 4rpx;
  transition: all 0.3s;
}

.tab-item.active {
  background-color: #1890ff;
}

.tab-text {
  font-size: 26rpx;
  color: #666;
}

.tab-item.active .tab-text {
  color: #fff;
  font-weight: bold;
}

.tab-count {
  font-size: 22rpx;
  color: #999;
}

.tab-item.active .tab-count {
  color: rgba(255, 255, 255, 0.9);
}

.order-list {
  padding: 20rpx 0;
}

.order-item {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.order-time {
  font-size: 26rpx;
  color: #999;
}

.order-status {
  font-size: 28rpx;
  font-weight: bold;
}

.order-dogs {
  margin-bottom: 16rpx;
}

.dogs-text {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.order-summary {
  margin-bottom: 16rpx;
  padding: 12rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
}

.summary-text {
  font-size: 26rpx;
  color: #666;
}

.order-items {
  margin-bottom: 16rpx;
  padding-left: 12rpx;
}

.recipe-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 8rpx;
}

.recipe-cover {
  width: 80rpx;
  height: 80rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}

.recipe-name {
  flex: 1;
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  min-width: 0;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.meal-info {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.meal-text {
  font-size: 26rpx;
  color: #666;
  min-width: 0;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.meal-separator {
  font-size: 26rpx;
  color: #ccc;
}

.order-address {
  margin-bottom: 16rpx;
  padding-left: 12rpx;
}

.address-text {
  font-size: 26rpx;
  color: #666;
}

.order-amount {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8rpx;
}

.amount-label {
  font-size: 26rpx;
  color: #666;
}

.amount-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.order-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  flex-wrap: wrap;
  margin-top: 20rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #f0f0f0;
}

.action-btn {
  min-width: 152rpx;
  height: 60rpx;
  line-height: 1;
  padding: 0 22rpx;
  margin: 0;
  border-radius: 30rpx;
  font-size: 24rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.action-btn::after,
.empty-action::after {
  border: none;
}

.action-btn.primary {
  color: #fff;
  background: #1890ff;
}

.action-btn.secondary {
  color: #333;
  background: #f5f7fa;
}

.action-btn[disabled] {
  color: #fff;
  background: #a0cfff;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
  text-align: center;
}

.empty-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
  margin-bottom: 14rpx;
}

.empty-text {
  width: 520rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: #999;
}

.empty-action {
  width: 240rpx;
  height: 72rpx;
  line-height: 1;
  margin-top: 32rpx;
  border-radius: 36rpx;
  background: #07c160;
  color: #fff;
  font-size: 26rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
</style>
