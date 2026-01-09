<template>
  <view class="shipping-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">发货管理</text>
      <text class="subtitle">查看待发货订单与物流信息</text>
    </view>

    <!-- 统计卡片 -->
    <view class="stats-section">
      <view class="stat-card">
        <text class="stat-value">{{ pendingShipment }}</text>
        <text class="stat-label">待发货</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ shippedToday }}</text>
        <text class="stat-label">今日已发</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ inTransit }}</text>
        <text class="stat-label">运输中</text>
      </view>
    </view>

    <!-- 订单筛选 -->
    <view class="tabs">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-item"
        :class="{ active: activeTab === tab.value }"
        @tap="switchTab(tab.value)"
      >
        <text>{{ tab.label }}</text>
      </view>
    </view>

    <!-- 订单列表 -->
    <view class="order-list">
      <!-- 空状态 -->
      <view v-if="orderList.length === 0" class="empty-state">
        <text class="empty-icon">🚚</text>
        <text class="empty-text">暂无订单</text>
      </view>

      <!-- 订单项 -->
      <view v-else>
        <view v-for="(order, index) in orderList" :key="index" class="order-card" @tap="viewOrderDetail(order)">
          <view class="order-header">
            <text class="order-id">订单号：{{ order.orderId }}</text>
            <view class="order-status" :class="order.status">
              <text>{{ order.statusText }}</text>
            </view>
          </view>

          <view class="order-content">
            <!-- 收货信息 -->
            <view class="section">
              <view class="section-title">
                <text class="icon">📍</text>
                <text>收货信息</text>
              </view>
              <view class="info-row">
                <text class="label">收货人：</text>
                <text class="value">{{ order.recipient }}</text>
              </view>
              <view class="info-row">
                <text class="label">联系电话：</text>
                <text class="value">{{ order.phone }}</text>
              </view>
              <view class="info-row">
                <text class="label">收货地址：</text>
                <text class="value">{{ order.address }}</text>
              </view>
            </view>

            <!-- 物流信息 -->
            <view class="section" v-if="order.trackingNumber">
              <view class="section-title">
                <text class="icon">📦</text>
                <text>物流信息</text>
              </view>
              <view class="info-row">
                <text class="label">物流公司：</text>
                <text class="value">{{ order.logisticsCompany }}</text>
              </view>
              <view class="info-row">
                <text class="label">运单号：</text>
                <text class="value highlight">{{ order.trackingNumber }}</text>
              </view>
            </view>
          </view>

          <view class="order-actions">
            <button
              v-if="!order.trackingNumber"
              class="action-btn primary"
              @tap.stop="inputTrackingNumber(order)"
            >
              填写物流单号
            </button>
            <button
              v-if="order.trackingNumber"
              class="action-btn outline"
              @tap.stop="copyTrackingNumber(order)"
            >
              复制运单号
            </button>
          </view>
        </view>
      </view>
    </view>

    <!-- 填写物流单号弹窗 -->
    <view v-if="showTrackingModal" class="modal-overlay" @tap="closeModal">
      <view class="modal-content" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">填写物流单号</text>
          <text class="modal-close" @tap="closeModal">×</text>
        </view>
        <view class="modal-body">
          <view class="form-item">
            <text class="form-label">物流公司</text>
            <picker :value="logisticsIndex" :range="logisticsCompanies" @change="onLogisticsChange">
              <view class="picker-value">
                {{ logisticsCompanies[logisticsIndex] }}
                <text class="arrow">›</text>
              </view>
            </picker>
          </view>
          <view class="form-item">
            <text class="form-label">运单号</text>
            <input
              class="form-input"
              v-model="trackingNumber"
              placeholder="请输入运单号"
            />
          </view>
        </view>
        <view class="modal-footer">
          <button class="modal-btn cancel" @tap="closeModal">取消</button>
          <button class="modal-btn confirm" @tap="confirmTrackingNumber">确认</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

// UI 框架数据（待对接后端 API）
const pendingShipment = ref(0);
const shippedToday = ref(0);
const inTransit = ref(0);

const tabs = [
  { label: '待发货', value: 'pending' },
  { label: '已发货', value: 'shipped' },
  { label: '全部', value: 'all' }
];

const activeTab = ref('pending');
const orderList = ref<any[]>([]);

// 物流单号弹窗
const showTrackingModal = ref(false);
const currentOrder = ref<any>(null);
const logisticsIndex = ref(0);
const logisticsCompanies = ['顺丰速运', '京东物流', '中通快递', '圆通速递', '韵达速递'];
const trackingNumber = ref('');

onMounted(() => {
  // TODO: 加载订单数据
  // loadOrders();
});

const switchTab = (tab: string) => {
  activeTab.value = tab;
  // TODO: 根据筛选条件加载订单
  // loadOrders(tab);
};

const viewOrderDetail = (order: any) => {
  uni.navigateTo({
    url: `/pages/order-detail/index?id=${order.id}`
  });
};

const inputTrackingNumber = (order: any) => {
  currentOrder.value = order;
  logisticsIndex.value = 0;
  trackingNumber.value = order.trackingNumber || '';
  showTrackingModal.value = true;
};

const closeModal = () => {
  showTrackingModal.value = false;
  currentOrder.value = null;
  trackingNumber.value = '';
};

const onLogisticsChange = (e: any) => {
  logisticsIndex.value = e.detail.value;
};

const confirmTrackingNumber = () => {
  if (!trackingNumber.value) {
    uni.showToast({
      title: '请输入运单号',
      icon: 'none'
    });
    return;
  }

  // TODO: 调用后端 API 保存物流信息
  uni.showToast({
    title: '保存物流单号功能开发中',
    icon: 'none'
  });

  closeModal();
};

const copyTrackingNumber = (order: any) => {
  uni.setClipboardData({
    data: order.trackingNumber,
    success: () => {
      uni.showToast({
        title: '运单号已复制',
        icon: 'success'
      });
    }
  });
};
</script>

<style scoped lang="scss">
.shipping-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx;
}

.header {
  background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;

  .title {
    display: block;
    font-size: 44rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 8rpx;
  }

  .subtitle {
    display: block;
    font-size: 24rpx;
    color: rgba(51, 51, 51, 0.7);
  }
}

.stats-section {
  display: flex;
  gap: 16rpx;
  padding: 0 32rpx 24rpx;
}

.stat-card {
  flex: 1;
  background-color: #fff;
  padding: 32rpx 24rpx;
  border-radius: 16rpx;
  text-align: center;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);

  .stat-value {
    display: block;
    font-size: 48rpx;
    font-weight: bold;
    color: #fcb69f;
    margin-bottom: 8rpx;
  }

  .stat-label {
    font-size: 24rpx;
    color: #666;
  }
}

.tabs {
  display: flex;
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  border-radius: 16rpx;
  padding: 8rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 16rpx;
  font-size: 28rpx;
  color: #666;
  border-radius: 12rpx;
  transition: all 0.3s;

  &.active {
    background-color: #fcb69f;
    color: #fff;
    font-weight: 500;
  }
}

.order-list {
  padding: 0 32rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 0;

  .empty-icon {
    font-size: 120rpx;
    margin-bottom: 24rpx;
  }

  .empty-text {
    font-size: 28rpx;
    color: #666;
  }
}

.order-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.order-id {
  font-size: 28rpx;
  color: #666;
}

.order-status {
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  font-size: 22rpx;

  &.pending {
    background-color: #fff7e6;
    color: #fa8c16;
  }

  &.shipped {
    background-color: #e6f7ff;
    color: #1890ff;
  }

  &.completed {
    background-color: #f6ffed;
    color: #52c41a;
  }
}

.order-content {
  margin-bottom: 24rpx;
}

.section {
  margin-bottom: 24rpx;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
  margin-bottom: 16rpx;

  .icon {
    font-size: 32rpx;
  }
}

.info-row {
  display: flex;
  padding: 8rpx 0;

  .label {
    font-size: 26rpx;
    color: #666;
    width: 160rpx;
    flex-shrink: 0;
  }

  .value {
    font-size: 26rpx;
    color: #333;
    flex: 1;
    word-break: break-all;

    &.highlight {
      color: #fcb69f;
      font-weight: 500;
    }
  }
}

.order-actions {
  display: flex;
  gap: 16rpx;
}

.action-btn {
  flex: 1;
  height: 72rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  border: none;

  &.primary {
    background-color: #fcb69f;
    color: #fff;
  }

  &.outline {
    background-color: #fff;
    border: 2rpx solid #d9d9d9;
    color: #666;
  }

  &:active {
    opacity: 0.8;
  }
}

// 弹窗样式
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-content {
  width: 640rpx;
  background-color: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.modal-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.modal-close {
  font-size: 48rpx;
  color: #999;
  line-height: 1;
}

.modal-body {
  padding: 32rpx;
}

.form-item {
  margin-bottom: 24rpx;

  &:last-child {
    margin-bottom: 0;
  }
}

.form-label {
  display: block;
  font-size: 28rpx;
  color: #333;
  margin-bottom: 16rpx;
}

.picker-value {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  background-color: #f5f5f5;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;

  .arrow {
    font-size: 32rpx;
    color: #999;
  }
}

.form-input {
  width: 100%;
  padding: 24rpx;
  background-color: #f5f5f5;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
  box-sizing: border-box;
}

.modal-footer {
  display: flex;
  border-top: 1rpx solid #f0f0f0;
}

.modal-btn {
  flex: 1;
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  font-size: 32rpx;
  border: none;
  background: none;

  &.cancel {
    color: #666;
    border-right: 1rpx solid #f0f0f0;
  }

  &.confirm {
    color: #fcb69f;
    font-weight: 500;
  }
}
</style>
