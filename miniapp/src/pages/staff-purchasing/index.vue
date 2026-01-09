<template>
  <view class="purchasing-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">采购管理</text>
      <text class="subtitle">查看采购清单与原料需求</text>
    </view>

    <!-- 筛选器 -->
    <view class="filters">
      <view class="filter-item">
        <text class="filter-label">日期范围</text>
        <picker mode="date" :value="dateRange" @change="onDateChange">
          <view class="picker-value">
            {{ dateRange || '请选择日期' }}
            <text class="arrow">›</text>
          </view>
        </picker>
      </view>
    </view>

    <!-- 采购清单（UI框架，待对接API） -->
    <view class="purchase-list">
      <view class="list-header">
        <text class="header-title">采购清单</text>
        <view class="header-actions">
          <button class="action-btn" @tap="exportList">导出</button>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-if="purchaseList.length === 0" class="empty-state">
        <text class="empty-icon">📋</text>
        <text class="empty-text">暂无采购清单</text>
        <text class="empty-hint">选择日期后查看采购需求</text>
      </view>

      <!-- 采购项列表 -->
      <view v-else class="list-items">
        <view v-for="(item, index) in purchaseList" :key="index" class="list-item">
          <view class="item-info">
            <text class="item-name">{{ item.name }}</text>
            <text class="item-spec">{{ item.spec }}</text>
          </view>
          <view class="item-quantity">
            <text class="quantity-value">{{ item.quantity }}</text>
            <text class="quantity-unit">{{ item.unit }}</text>
          </view>
          <view class="item-status" :class="item.status">
            <text>{{ item.statusText }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 统计信息 -->
    <view class="stats-card">
      <view class="stat-row">
        <text class="stat-label">原料种类</text>
        <text class="stat-value">{{ totalIngredients }} 种</text>
      </view>
      <view class="stat-row">
        <text class="stat-label">预估采购总额</text>
        <text class="stat-value highlight">¥{{ estimatedCost }}</text>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="bottom-actions">
      <button class="action-btn primary" @tap="confirmPurchase">确认采购</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const dateRange = ref('');
const purchaseList = ref<any[]>([]);
const totalIngredients = ref(0);
const estimatedCost = ref('0.00');

onMounted(() => {
  // TODO: 加载采购清单数据
  // loadPurchaseList();
});

const onDateChange = (e: any) => {
  dateRange.value = e.detail.value;
  // TODO: 根据日期加载采购清单
  // loadPurchaseList();
};

const exportList = () => {
  uni.showToast({ title: '导出功能开发中', icon: 'none' });
};

const confirmPurchase = () => {
  uni.showToast({ title: '确认采购功能开发中', icon: 'none' });
};
</script>

<style scoped lang="scss">
.purchasing-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx;
}

.header {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
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

.filters {
  background-color: #fff;
  padding: 24rpx 32rpx;
  margin-bottom: 24rpx;
}

.filter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filter-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.picker-value {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 28rpx;
  color: #666;

  .arrow {
    font-size: 32rpx;
    color: #999;
  }
}

.purchase-list {
  background-color: #fff;
  margin-bottom: 24rpx;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;

  .header-title {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
  }

  .action-btn {
    padding: 12rpx 24rpx;
    background-color: #1890ff;
    color: #fff;
    border-radius: 8rpx;
    font-size: 24rpx;
    border: none;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 32rpx;

  .empty-icon {
    font-size: 120rpx;
    margin-bottom: 24rpx;
  }

  .empty-text {
    font-size: 28rpx;
    color: #666;
    margin-bottom: 12rpx;
  }

  .empty-hint {
    font-size: 24rpx;
    color: #999;
  }
}

.list-items {
  padding: 0 32rpx;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 32rpx 0;
  border-bottom: 1rpx solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.item-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
  display: block;
}

.item-spec {
  font-size: 24rpx;
  color: #999;
  display: block;
}

.item-quantity {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;

  .quantity-value {
    font-size: 32rpx;
    font-weight: bold;
    color: #1890ff;
  }

  .quantity-unit {
    font-size: 22rpx;
    color: #999;
  }
}

.item-status {
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  font-size: 22rpx;

  &.pending {
    background-color: #fff7e6;
    color: #fa8c16;
  }

  &.completed {
    background-color: #f6ffed;
    color: #52c41a;
  }
}

.stats-card {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  padding: 32rpx;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 0;

  &:not(:last-child) {
    border-bottom: 1rpx solid #f0f0f0;
  }
}

.stat-label {
  font-size: 28rpx;
  color: #666;
}

.stat-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;

  &.highlight {
    color: #1890ff;
  }
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 24rpx 32rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
}

.action-btn {
  width: 100%;
  height: 96rpx;
  border-radius: 48rpx;
  font-size: 32rpx;
  font-weight: 500;
  border: none;

  &.primary {
    background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
    color: #333;
  }

  &:active {
    opacity: 0.8;
  }
}
</style>
