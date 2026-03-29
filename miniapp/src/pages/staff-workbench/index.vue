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

      <!-- 功能模块（采购、生产、订单、报销） -->
      <view class="modules">
        <!-- 采购管理 -->
        <view class="module" @tap="goToPurchasing">
          <view class="module-icon purchasing">
            <image class="module-icon-img" src="/static/icons/purchasing.png" mode="aspectFit" />
          </view>
          <view class="module-content">
            <text class="module-title">采购管理</text>
            <text class="module-desc">查看采购清单与原料需求</text>
          </view>
          <text class="module-arrow">›</text>
        </view>

        <!-- 生产管理 -->
        <view class="module" @tap="goToProduction">
          <view class="module-icon production">
            <image class="module-icon-img" src="/static/icons/production.png" mode="aspectFit" />
          </view>
          <view class="module-content">
            <text class="module-title">生产管理</text>
            <text class="module-desc">查看生产任务与分锅清单</text>
          </view>
          <text class="module-arrow">›</text>
        </view>

        <!-- 订单管理 -->
        <view class="module" @tap="viewTodayOrders">
          <view class="module-icon shipping">
            <image class="module-icon-img" src="/static/icons/orders.png" mode="aspectFit" />
          </view>
          <view class="module-content">
            <text class="module-title">订单管理</text>
            <text class="module-desc">查看后台订单与订单状态</text>
          </view>
          <text class="module-arrow">›</text>
        </view>

        <!-- 报销管理 -->
        <view class="module" @tap="goToReimbursement">
          <view class="module-icon reimbursement">
            <image class="module-icon-img" src="/static/icons/reimbursement.png" mode="aspectFit" />
          </view>
          <view class="module-content">
            <text class="module-title">报销管理</text>
            <text class="module-desc">申请报销与查看报销记录</text>
          </view>
          <text class="module-arrow">›</text>
        </view>

        <!-- 食谱管理 -->
        <view class="module" @tap="goToStaffRecipes">
          <view class="module-icon recipes">
            <text style="font-size: 48rpx;">📋</text>
          </view>
          <view class="module-content">
            <text class="module-title">食谱管理</text>
            <text class="module-desc">查看所有食谱与分享</text>
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
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { request } from '../../utils/api';

const user = ref<any>(null);
const isStaff = ref(false);

console.log('[StaffWorkbench] Component initializing...');

// UI 框架数据（待对接后端 API）
const todayOrders = ref(0);
const pendingTasks = ref(0);
const shippingCount = ref(0);

const roleText = computed(() => {
  if (!user.value) return '';
  return user.value.role === 'ADMIN' ? '管理员' : '员工';
});

const isAdmin = computed(() => {
  return user.value?.role === 'ADMIN';
});

onMounted(() => {
  console.log('[StaffWorkbench] onMounted - checking permission...');
  checkPermission();
  // TODO: 后续对接后端 API
  // loadStats();
});

onShow(() => {
  console.log('[StaffWorkbench] onShow - checking permission...');
  // 更新自定义 TabBar 状态
  // 注意：自定义TabBar会在页面切换时自动检测当前页面路径并更新selected状态
  // 不需要页面主动调用更新方法

  checkPermission()
});

const checkPermission = () => {
  console.log('[StaffWorkbench] checkPermission called');

  // 先尝试从storage读取，使用正确的key 'user'
  let storedUser = uni.getStorageSync('user');

  // 如果user为空，尝试userInfo key
  if (!storedUser || storedUser === '{}' || storedUser === '') {
    console.log('[StaffWorkbench] user key empty, trying userInfo key');
    storedUser = uni.getStorageSync('userInfo');
  }

  console.log('[StaffWorkbench] Stored user:', storedUser);

  // 解析用户数据（storage可能返回字符串）
  let userData = storedUser;
  if (typeof storedUser === 'string') {
    try {
      userData = JSON.parse(storedUser);
    } catch (e) {
      console.error('[StaffWorkbench] Failed to parse user data:', e);
      userData = null;
    }
  }

  // 验证用户角色
  if (!userData || !userData.role || (userData.role !== 'STAFF' && userData.role !== 'ADMIN')) {
    console.log('[StaffWorkbench] Permission denied - user:', userData);

    // 如果有token但用户信息无效，尝试从API重新加载
    const token = uni.getStorageSync('token');
    if (token && (!userData || !userData.role)) {
      console.log('[StaffWorkbench] Has token but no user data, fetching from API');
      loadUserInfoFromApi();
      return;
    }

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

  console.log('[StaffWorkbench] Permission granted - user:', userData);
  user.value = userData;
  isStaff.value = true;
};

const loadUserInfoFromApi = async () => {
  try {
    const res = await request({
      url: '/users/me',
      method: 'GET'
    });

    if (res.code === 0 && res.data) {
      console.log('[StaffWorkbench] User info loaded from API:', res.data);
      // 更新storage
      uni.setStorageSync('user', res.data);

      // 重新检查权限
      checkPermission();
    } else {
      throw new Error('Failed to load user info');
    }
  } catch (error) {
    console.error('[StaffWorkbench] Failed to load user info from API:', error);
    uni.showToast({
      title: '加载用户信息失败',
      icon: 'none'
    });
    setTimeout(() => {
      uni.switchTab({ url: '/pages/home/index' });
    }, 1500);
  }
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

const viewTodayOrders = () => {
  uni.navigateTo({ url: '/pages/staff-orders/index' });
};

const goToReimbursement = () => {
  uni.navigateTo({ url: '/pages/staff-purchasing/reimbursement/list' });
};

const goToStaffRecipes = () => {
  uni.navigateTo({ url: '/pages/staff-recipes/index' });
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

  &.reimbursement {
    background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
  }

  &.recipes {
    background: linear-gradient(135deg, #c3cfe2 0%, #f5f7fa 100%);
  }
}

.module-icon-img {
  width: 48rpx;
  height: 48rpx;
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
