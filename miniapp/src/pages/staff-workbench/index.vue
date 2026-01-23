<template>
  <view class="staff-workbench">
    <!-- 权限检查 -->
    <view v-if="!isStaff" class="no-permission">
      <text class="icon">🔒</text>
      <text class="message">仅员工可访问此页面</text>
      <text class="hint">即将返回首页...</text>
    </view>

    <!-- 员工工作台 -->
    <view v-else class="workbench-container">
      <!-- 顶部信息 -->
      <view class="header">
        <text class="title">员工工作台</text>
        <text class="welcome">欢迎，{{ user?.nickname || '员工' }}</text>
        <view class="role-badge">{{ roleText }}</view>
      </view>

      <!-- 功能模块（仅展示采购、生产、发货） -->
      <view class="modules">
        <!-- 采购管理 -->
        <view class="module" @tap="goToPurchasing">
          <view class="module-icon purchasing">🛒</view>
          <view class="module-content">
            <text class="module-title">采购管理</text>
            <text class="module-desc">查看采购清单与原料需求</text>
          </view>
          <text class="module-arrow">›</text>
        </view>

        <!-- 生产管理 -->
        <view class="module" @tap="goToProduction">
          <view class="module-icon production">👨‍🍳</view>
          <view class="module-content">
            <text class="module-title">生产管理</text>
            <text class="module-desc">查看生产任务与分锅清单</text>
          </view>
          <text class="module-arrow">›</text>
        </view>

        <!-- 发货管理 -->
        <view class="module" @tap="goToShipping">
          <view class="module-icon shipping">🚚</view>
          <view class="module-content">
            <text class="module-title">发货管理</text>
            <text class="module-desc">查看待发货订单与物流</text>
          </view>
          <text class="module-arrow">›</text>
        </view>
      </view>

      <!-- 快捷统计（UI框架，待对接API） -->
      <view class="stats-section">
        <text class="section-title">今日概览</text>
        <view class="stats">
          <view class="stat-item">
            <text class="stat-value">{{ todayOrders }}</text>
            <text class="stat-label">今日订单</text>
          </view>
          <view class="stat-item">
            <text class="stat-value">{{ pendingTasks }}</text>
            <text class="stat-label">待处理</text>
          </view>
          <view class="stat-item">
            <text class="stat-value">{{ shippingCount }}</text>
            <text class="stat-label">待发货</text>
          </view>
        </view>
      </view>

      <!-- 快捷操作 -->
      <view class="quick-actions">
        <button class="action-btn primary" @tap="viewTodayOrders">
          查看今日订单
        </button>
        <button class="action-btn secondary" @tap="viewPendingTasks">
          查看待处理任务
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';

const user = ref<any>(null);
const isStaff = ref(false);

// UI 框架数据（待对接后端 API）
const todayOrders = ref(0);
const pendingTasks = ref(0);
const shippingCount = ref(0);

const roleText = computed(() => {
  if (!user.value) return '';
  return user.value.role === 'ADMIN' ? '管理员' : '员工';
});

onMounted(() => {
  checkPermission();
  // TODO: 后续对接后端 API
  // loadStats();
});

onShow(() => {
  // 更新自定义 tabBar（刷新权限检查）
  if (typeof wx.getTabBar === 'function' && wx.getTabBar()) {
    wx.getTabBar().refresh();
  }
});

const checkPermission = () => {
  const storedUser = uni.getStorageSync('user');

  if (!storedUser || (storedUser.role !== 'STAFF' && storedUser.role !== 'ADMIN')) {
    isStaff.value = false;
    uni.showToast({
      title: '权限不足',
      icon: 'none'
    });
    setTimeout(() => {
      uni.switchTab({ url: '/pages/home/index' });
    }, 1500);
    return;
  }

  user.value = storedUser;
  isStaff.value = true;
};

const loadStats = async () => {
  try {
    // TODO: 调用后端 API 获取统计数据
    // const response = await request({ url: '/staff/stats' });
    // todayOrders.value = response.data.todayOrders;
    // pendingTasks.value = response.data.pendingTasks;
    // shippingCount.value = response.data.shippingCount;
  } catch (error) {
    console.error('[StaffWorkbench] Failed to load stats:', error);
  }
};

const goToPurchasing = () => {
  uni.navigateTo({ url: '/pages/staff-purchasing/index' });
};

const goToProduction = () => {
  uni.navigateTo({ url: '/pages/staff-production/index' });
};

const goToShipping = () => {
  uni.navigateTo({ url: '/pages/staff-shipping/index' });
};

const viewTodayOrders = () => {
  uni.navigateTo({ url: '/pages/orders-list/index' });
};

const viewPendingTasks = () => {
  uni.showToast({ title: '功能开发中', icon: 'none' });
};
</script>

<style scoped lang="scss">
.staff-workbench {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx; // 为自定义 tabBar 留出空间
}

.no-permission {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 32rpx;

  .icon {
    font-size: 120rpx;
    margin-bottom: 32rpx;
  }

  .message {
    font-size: 32rpx;
    color: #333;
    margin-bottom: 16rpx;
  }

  .hint {
    font-size: 24rpx;
    color: #999;
  }
}

.workbench-container {
  padding: 24rpx 32rpx;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40rpx 32rpx;
  border-radius: 16rpx;
  margin-bottom: 32rpx;
  box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.3);

  .title {
    display: block;
    font-size: 44rpx;
    font-weight: bold;
    color: #fff;
    margin-bottom: 16rpx;
  }

  .welcome {
    display: block;
    font-size: 28rpx;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 16rpx;
  }

  .role-badge {
    display: inline-block;
    padding: 8rpx 24rpx;
    background-color: rgba(255, 255, 255, 0.25);
    border: 1rpx solid rgba(255, 255, 255, 0.4);
    border-radius: 24rpx;
    font-size: 24rpx;
    color: #fff;
    backdrop-filter: blur(10rpx);
  }
}

.modules {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  margin-bottom: 32rpx;
}

.module {
  background-color: #fff;
  padding: 32rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  transition: all 0.3s;

  &:active {
    transform: scale(0.98);
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.08);
  }
}

.module-icon {
  width: 96rpx;
  height: 96rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;

  &.purchasing {
    background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  }

  &.production {
    background: linear-gradient(135deg, #a8e6cf 0%, #56ab91 100%);
  }

  &.shipping {
    background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
  }
}

.module-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.module-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  display: block;
}

.module-desc {
  font-size: 24rpx;
  color: #999;
  display: block;
}

.module-arrow {
  font-size: 48rpx;
  color: #ccc;
  font-weight: 300;
}

.stats-section {
  margin-bottom: 32rpx;
}

.section-title {
  display: block;
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 16rpx;
  padding-left: 8rpx;
}

.stats {
  display: flex;
  gap: 16rpx;
}

.stat-item {
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
    color: #1890ff;
    margin-bottom: 12rpx;
  }

  .stat-label {
    font-size: 24rpx;
    color: #666;
  }
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.action-btn {
  width: 100%;
  height: 96rpx;
  border-radius: 48rpx;
  font-size: 32rpx;
  font-weight: 500;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;

  &.primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
    box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.3);
  }

  &.secondary {
    background-color: #fff;
    color: #667eea;
    border: 2rpx solid #667eea;
  }

  &:active {
    opacity: 0.8;
  }
}
</style>
