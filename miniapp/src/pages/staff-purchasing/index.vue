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
        <text class="filter-label">状态筛选</text>
        <picker mode="selector" :range="statusOptions" range-key="label" :value="statusIndex" @change="onStatusChange">
          <view class="picker-value">
            {{ statusOptions[statusIndex].label }}
            <text class="arrow">›</text>
          </view>
        </picker>
      </view>
    </view>

    <!-- 采购清单列表 -->
    <view class="purchase-lists">
      <!-- 加载状态 -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <!-- 空状态 -->
      <view v-else-if="purchaseLists.length === 0" class="empty-state">
        <text class="empty-icon">📋</text>
        <text class="empty-text">暂无采购清单</text>
        <text class="empty-hint">点击下方按钮生成采购清单</text>
      </view>

      <!-- 采购清单列表 -->
      <view v-else class="list-items">
        <view
          v-for="list in purchaseLists"
          :key="list.id"
          class="list-item"
          @tap="goToDetail(list.id)"
        >
          <!-- 清单头部 -->
          <view class="item-header">
            <view class="header-left">
              <text class="target-date">{{ formatDate(list.targetDate) }}（制作日期）</text>
              <text class="create-time">创建于 {{ formatDateTime(list.createdAt) }}</text>
            </view>
            <view class="status-badge" :class="getStatusClass(list.status)">
              <text>{{ getStatusText(list.status) }}</text>
            </view>
          </view>

          <!-- 清单信息 -->
          <view class="item-body">
            <view class="info-row">
              <text class="label">原料种类:</text>
              <text class="value">{{ list.itemCount }} 种</text>
            </view>
            <view class="info-row" v-if="list.recordsCount !== undefined">
              <text class="label">采购记录:</text>
              <text class="value">{{ list.recordsCount }} 条</text>
            </view>
            <view class="info-row" v-if="list.totalActualCost !== undefined && list.totalActualCost > 0">
              <text class="label">实际总额:</text>
              <text class="value cost">¥{{ list.totalActualCost.toFixed(2) }}</text>
            </view>
            <view class="info-row" v-if="list.sourceOrderIds && list.sourceOrderIds.length > 0">
              <text class="label">关联订单:</text>
              <text class="value">{{ list.sourceOrderIds.length }} 个</text>
            </view>
            <view class="info-row" v-if="list.completedAt">
              <text class="label">完成时间:</text>
              <text class="value">{{ formatDate(list.completedAt) }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 加载更多 -->
      <view v-if="hasMore && !loading && purchaseLists.length > 0" class="load-more" @tap="loadMore">
        <text>加载更多</text>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="bottom-actions">
      <button class="action-btn primary" @tap="generateList" :loading="generating">
        <text v-if="!generating">生成采购清单</text>
        <text v-else>生成中...</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  getPurchaseLists,
  generatePurchaseList,
  completePurchase as completePurchaseApi,
  startPurchase as startPurchaseApi,
} from '@/api/purchasing';

// 状态筛选选项
const statusOptions = [
  { label: '全部', value: '' },
  { label: '待采购', value: 'PENDING' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '已取消', value: 'CANCELLED' },
];
const statusIndex = ref(0);

// 状态管理
const purchaseLists = ref<any[]>([]);
const loading = ref(false);
const generating = ref(false);
const currentPage = ref(1);
const pageSize = 20;
const total = ref(0);
const hasMore = computed(() => purchaseLists.value.length < total.value);
const isMounted = ref(false);

// 页面加载
onMounted(() => {
  loadPurchaseLists();
  isMounted.value = true;
});

// 页面显示时刷新数据（从详情页返回时）
onShow(() => {
  // 只有在页面已经mounted后才刷新，避免首次加载时重复调用
  if (isMounted.value) {
    loadPurchaseLists(true);
  }
});

// 加载采购清单列表
const loadPurchaseLists = async (refresh = false) => {
  if (refresh) {
    currentPage.value = 1;
    purchaseLists.value = [];
  }

  loading.value = true;

  try {
    const statusValue = statusOptions[statusIndex.value].value;
    const params: any = {
      page: currentPage.value,
      pageSize,
    };

    // 只有当status不为空时才添加status参数
    if (statusValue) {
      params.status = statusValue;
    }

    const res: any = await getPurchaseLists(params);

    if (res.code === 0) {
      if (refresh) {
        purchaseLists.value = res.data.list;
      } else {
        purchaseLists.value.push(...res.data.list);
      }
      total.value = res.data.total;
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载采购清单失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

// 加载更多
const loadMore = () => {
  if (!loading.value && hasMore.value) {
    currentPage.value++;
    loadPurchaseLists();
  }
};

// 状态变更
const onStatusChange = (e: any) => {
  statusIndex.value = e.detail.value;
  loadPurchaseLists(true);
};

// 生成采购清单
const generateList = () => {
  uni.showModal({
    title: '生成采购清单',
    content: '将根据当前待生产的订单生成采购清单，确认继续？',
    success: async (res) => {
      if (res.confirm) {
        generating.value = true;

        try {
          // 获取本地日期（避免UTC时区问题）
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const today = `${year}-${month}-${day}`;

          const response: any = await generatePurchaseList({
            startDate: today,
          });

          if (response.code === 0) {
            uni.showToast({ title: '生成成功', icon: 'success' });
            // 刷新列表
            loadPurchaseLists(true);
          } else {
            // 后端返回中文错误信息，直接显示
            uni.showToast({ title: response.message || '生成失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('生成采购清单失败', error);
          // 显示后端返回的错误信息
          uni.showToast({ title: error.message || '生成失败', icon: 'none' });
        } finally {
          generating.value = false;
        }
      }
    },
  });
};

// 确认采购完成
const completePurchase = (id: string) => {
  uni.showModal({
    title: '确认采购完成',
    content: '确认该采购清单的所有原料已采购完成？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await completePurchaseApi(id);

          if (response.code === 0) {
            uni.showToast({ title: '操作成功', icon: 'success' });
            // 刷新列表
            loadPurchaseLists(true);
          } else {
            // 显示后端返回的错误信息
            uni.showToast({ title: response.message || '操作失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('确认采购完成失败', error);
          // 显示后端返回的错误信息
          uni.showToast({ title: error.message || '操作失败', icon: 'none' });
        }
      }
    },
  });
};

// 开始采购
const startPurchase = (id: string) => {
  uni.showModal({
    title: '开始采购',
    content: '开始采购后可以录入采购记录，确认继续？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await startPurchaseApi(id);

          if (response.code === 0) {
            uni.showToast({ title: '操作成功', icon: 'success' });
            // 刷新列表
            loadPurchaseLists(true);
          } else {
            uni.showToast({ title: response.message || '操作失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('开始采购失败', error);
          uni.showToast({ title: error.message || '操作失败', icon: 'none' });
        }
      }
    },
  });
};

// 跳转报销申请
const goToReimbursement = (purchaseListId: string) => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/reimbursement/apply?purchaseListId=${purchaseListId}`,
  });
};

// 跳转详情
const goToDetail = (id: string) => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/detail?id=${id}`,
  });
};

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'PENDING': '待采购',
    'COMPLETED': '已完成',
    'CANCELLED': '已取消',
  };
  return statusMap[status] || status;
};

// 获取状态样式类
const getStatusClass = (status: string) => {
  const classMap: Record<string, string> = {
    'DRAFT': 'draft',
    'PENDING': 'pending',
    'COMPLETED': 'completed',
    'CANCELLED': 'cancelled',
  };
  return classMap[status] || '';
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
};

// 格式化日期时间
const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};
</script>

<style scoped lang="scss">
.purchasing-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
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

.purchase-lists {
  padding: 0 32rpx;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 32rpx;

  text {
    font-size: 28rpx;
    color: #999;
  }

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
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.list-item {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;
    padding-bottom: 16rpx;
    border-bottom: 1rpx solid #f5f5f5;

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 8rpx;

      .target-date {
        font-size: 30rpx;
        font-weight: bold;
        color: #333;
      }

      .create-time {
        font-size: 22rpx;
        color: #999;
      }
    }

    .status-badge {
      padding: 8rpx 16rpx;
      border-radius: 8rpx;
      font-size: 22rpx;
      font-weight: bold;

      &.draft {
        background-color: #f0f0f0;
        color: #666;
      }

      &.pending {
        background-color: #fff7e6;
        color: #fa8c16;
      }

      &.completed {
        background-color: #f6ffed;
        color: #52c41a;
      }

      &.cancelled {
        background-color: #ffebee;
        color: #f44336;
      }
    }
  }

  .item-body {
    margin-bottom: 16rpx;

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8rpx;

      &:last-child {
        margin-bottom: 0;
      }

      .label {
        font-size: 26rpx;
        color: #666;
      }

      .value {
        font-size: 26rpx;
        color: #333;
        font-weight: 500;

        &.cost {
          color: #ff6b6b;
          font-weight: bold;
        }
      }
    }
  }

  .item-actions {
    padding-top: 16rpx;
    border-top: 1rpx solid #f5f5f5;
    display: flex;
    gap: 12rpx;

    .action-btn {
      flex: 1;
      height: 72rpx;
      line-height: 72rpx;
      border-radius: 8rpx;
      font-size: 26rpx;
      border: none;

      &.start {
        background-color: #52c41a;
        color: #fff;
      }

      &.complete {
        background-color: #1890ff;
        color: #fff;
      }

      &.reimbursement {
        background-color: #fa8c16;
        color: #fff;
      }

      &:active {
        opacity: 0.8;
      }
    }
  }
}

.load-more {
  text-align: center;
  padding: 32rpx;

  text {
    font-size: 26rpx;
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
