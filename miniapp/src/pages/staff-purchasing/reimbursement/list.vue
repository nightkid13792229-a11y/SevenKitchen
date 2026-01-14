<template>
  <view class="reimbursement-list-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">我的报销申请</text>
      <text class="subtitle">查看报销申请记录和审核状态</text>
    </view>

    <!-- 状态筛选 -->
    <view class="status-tabs">
      <view
        v-for="tab in statusTabs"
        :key="tab.value"
        class="tab-item"
        :class="{ active: currentStatus === tab.value }"
        @tap="onStatusChange(tab.value)"
      >
        <text class="tab-text">{{ tab.label }}</text>
      </view>
    </view>

    <!-- 报销单列表 -->
    <view class="reimbursement-list">
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <view v-else-if="reimbursements.length === 0" class="empty-state">
        <text class="empty-icon">📄</text>
        <text class="empty-text">暂无报销申请</text>
      </view>

      <view v-else class="list-items">
        <view
          v-for="item in reimbursements"
          :key="item.id"
          class="list-item"
          @tap="goToDetail(item.id)"
        >
          <!-- 报销单头部 -->
          <view class="item-header">
            <view class="header-left">
              <text class="claim-number">{{ item.claimNumber }}</text>
              <text class="submit-date">{{ formatDateTime(item.submittedAt) }}</text>
            </view>
            <view class="status-badge" :class="getStatusClass(item.status)">
              <text>{{ getStatusText(item.status) }}</text>
            </view>
          </view>

          <!-- 金额信息 -->
          <view class="item-amount">
            <view class="amount-row">
              <text class="label">预估金额:</text>
              <text class="value estimated">¥{{ item.totalEstimatedCost.toFixed(2) }}</text>
            </view>
            <view class="amount-row">
              <text class="label">实际金额:</text>
              <text class="value actual">¥{{ item.totalActualCost.toFixed(2) }}</text>
            </view>
            <view v-if="getCostDifference(item) !== 0" class="amount-row diff" :class="{ positive: getCostDifference(item) > 0 }">
              <text class="label">差异:</text>
              <text class="value">{{ getCostDifference(item) > 0 ? '+' : '' }}¥{{ Math.abs(getCostDifference(item)).toFixed(2) }}</text>
            </view>
          </view>

          <!-- 采购清单信息 -->
          <view class="item-purchases">
            <text class="purchases-title">包含 {{ item.purchaseLists?.length || 0 }} 个采购清单</text>
            <view class="purchases-list">
              <text
                v-for="(list, index) in item.purchaseLists"
                :key="index"
                class="purchase-tag"
              >
                {{ formatDate(list.targetDate) }}
              </text>
            </view>
          </view>

          <!-- 审核信息 -->
          <view v-if="item.status !== 'PENDING_REVIEW'" class="item-review">
            <text class="review-info">
              审核人: {{ item.reviewedBy?.nickname || '-' }}
            </text>
            <text v-if="item.reviewComment" class="review-comment">
              意见: {{ item.reviewComment }}
            </text>
          </view>
        </view>
      </view>

    <!-- 加载更多 -->
    <view v-if="hasMore && !loading && reimbursements.length > 0" class="load-more" @tap="loadMore">
      <text>加载更多</text>
    </view>
  </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getMyReimbursements } from '@/api/purchasing';

// 状态筛选标签
const statusTabs = [
  { label: '全部', value: '' },
  { label: '待审核', value: 'PENDING_REVIEW' },
  { label: '已批准', value: 'APPROVED' },
  { label: '已驳回', value: 'REJECTED' },
  { label: '需重提', value: 'REQUIRES_RESUBMIT' },
];

// 状态管理
const currentStatus = ref('');
const reimbursements = ref<any[]>([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = 20;
const total = ref(0);
const hasMore = computed(() => reimbursements.value.length < total.value);

// 页面加载
onMounted(() => {
  loadReimbursements();
});

// 加载报销单列表
const loadReimbursements = async (refresh = false) => {
  if (refresh) {
    currentPage.value = 1;
    reimbursements.value = [];
  }

  loading.value = true;

  try {
    const res: any = await getMyReimbursements({
      status: currentStatus.value || undefined,
      page: currentPage.value,
      pageSize,
    });

    if (res.code === 0) {
      if (refresh) {
        reimbursements.value = res.data.list;
      } else {
        reimbursements.value.push(...res.data.list);
      }
      total.value = res.data.total;
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载报销单失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

// 加载更多
const loadMore = () => {
  if (!loading.value && hasMore.value) {
    currentPage.value++;
    loadReimbursements();
  }
};

// 状态变更
const onStatusChange = (status: string) => {
  currentStatus.value = status;
  loadReimbursements(true);
};

// 跳转详情
const goToDetail = (id: string) => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/reimbursement/detail?id=${id}`,
  });
};

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'PENDING_REVIEW': '待审核',
    'APPROVED': '已批准',
    'REJECTED': '已驳回',
    'REQUIRES_RESUBMIT': '需重新提交',
  };
  return statusMap[status] || status;
};

// 获取状态样式类
const getStatusClass = (status: string) => {
  const classMap: Record<string, string> = {
    'PENDING_REVIEW': 'pending',
    'APPROVED': 'approved',
    'REJECTED': 'rejected',
    'REQUIRES_RESUBMIT': 'resubmit',
  };
  return classMap[status] || '';
};

// 计算成本差异
const getCostDifference = (item: any) => {
  return item.totalActualCost - item.totalEstimatedCost;
};

// 格式化日期时间
const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};
</script>

<style scoped lang="scss">
.reimbursement-list-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 40rpx;
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

.status-tabs {
  display: flex;
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  border-radius: 16rpx;
  overflow: hidden;
  padding: 8rpx;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;

  .tab-text {
    font-size: 26rpx;
    color: #666;
  }

  &.active {
    .tab-text {
      color: #1890ff;
      font-weight: bold;
    }
  }
}

.reimbursement-list {
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
    margin-bottom: 16rpx;
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

      .claim-number {
        font-size: 28rpx;
        font-weight: bold;
        color: #333;
      }

      .submit-date {
        font-size: 22rpx;
        color: #999;
      }
    }

    .status-badge {
      padding: 8rpx 16rpx;
      border-radius: 8rpx;
      font-size: 22rpx;

      &.pending {
        background-color: #fff7e6;
        color: #fa8c16;
      }

      &.approved {
        background-color: #e8f5e9;
        color: #37b24d;
      }

      &.rejected {
        background-color: #ffebee;
        color: #f44336;
      }

      &.resubmit {
        background-color: #fff3e0;
        color: #f57c00;
      }
    }
  }

  .item-amount {
    margin-bottom: 16rpx;

    .amount-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8rpx;

      &:last-child {
        margin-bottom: 0;
      }

      .label {
        font-size: 24rpx;
        color: #999;
      }

      .value {
        font-size: 26rpx;
        font-weight: bold;
        color: #333;

        &.estimated {
          color: #666;
        }

        &.actual {
          color: #ff6b6b;
        }
      }

      &.diff {
        font-size: 24rpx;

        &.positive {
          color: #ff6b6b;
        }

        &:not(.positive) {
          color: #51cf66;
        }
      }
    }
  }

  .item-purchases {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    margin-bottom: 16rpx;
    padding: 16rpx;
    background-color: #f9f9f9;
    border-radius: 12rpx;

    .purchases-title {
      font-size: 24rpx;
      color: #666;
      margin-bottom: 8rpx;
    }

    .purchases-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8rpx;

      .purchase-tag {
        padding: 6rpx 12rpx;
        background-color: #fff;
        border-radius: 6rpx;
        font-size: 22rpx;
        color: #1890ff;
      }
    }
  }

  .item-review {
    padding-top: 16rpx;
    border-top: 1rpx solid #f5f5f5;

    .review-info {
      display: block;
      font-size: 24rpx;
      color: #666;
      margin-bottom: 8rpx;
    }

    .review-comment {
      display: block;
      font-size: 24rpx;
      color: #999;
    }
  }
}

.load-more {
  text-align: center;
  padding: 32rpx;
  margin: 0 32rpx;

  text {
    font-size: 26rpx;
    color: #1890ff;
  }
}
</style>
