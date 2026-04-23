<template>
  <view class="reimbursement-list-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">我的报销申请</text>
      <text class="subtitle">查看采购报销、行政杂费与工资登记状态</text>
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
            <view class="header-right">
              <view class="status-badge" :class="getStatusClass(item.status)">
                <text>{{ getStatusText(item.status) }}</text>
              </view>
              <!-- 删除按钮（仅可删除状态显示） -->
              <view
                v-if="canDelete(item)"
                class="delete-btn"
                @tap.stop="confirmDelete(item)()"
              >
                <text class="delete-icon">🗑️</text>
              </view>
            </view>
          </view>

          <!-- 金额信息 -->
          <view class="item-amount">
            <view class="amount-row">
              <text class="label">报销金额:</text>
              <text class="value actual">¥{{ item.totalActualCost.toFixed(2) }}</text>
            </view>
          </view>

          <view v-if="getExpenseSummary(item)" class="item-summary">
            <text class="summary-text">费用构成: {{ getExpenseSummary(item) }}</text>
          </view>

          <!-- 报销处理信息 -->
          <view v-if="item.status !== 'PENDING_REVIEW'" class="item-review">
            <text class="review-info">
              报销处理人: {{ item.reviewedBy?.nickname || '-' }}
            </text>
            <text v-if="item.reviewComment" class="review-comment">
              备注: {{ item.reviewComment }}
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

  <!-- 底部申请按钮 -->
  <view class="bottom-action">
    <button class="submit-btn" @tap="goToSubmit">
      <text>申请报销</text>
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getMyReimbursements, deleteReimbursement } from '@/api/purchasing';
import { summarizeReimbursementCustomFees } from '@/constants/reimbursement';

// 状态筛选标签
const statusTabs = [
  { label: '全部', value: '' },
  { label: '待报销', value: 'PENDING_REVIEW' },
  { label: '已报销', value: 'REIMBURSED' },
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
const isMounted = ref(false);
const hasMore = computed(() => reimbursements.value.length < total.value);

// 页面加载
onMounted(() => {
  loadReimbursements();
  isMounted.value = true;
});

onShow(() => {
  if (isMounted.value) {
    loadReimbursements(true);
  }
});

// 加载报销单列表
const loadReimbursements = async (refresh = false) => {
  if (refresh) {
    currentPage.value = 1;
    reimbursements.value = [];
  }

  loading.value = true;

  try {
    const params: any = {
      page: currentPage.value,
      pageSize,
    };

    // 只有在选择了具体状态时才传递 status 参数
    if (currentStatus.value) {
      params.status = currentStatus.value;
    }

    const res: any = await getMyReimbursements(params);

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

// 跳转申请报销页面
const goToSubmit = () => {
  uni.navigateTo({
    url: '/pages/staff-purchasing/reimbursement/submit',
  });
};

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'PENDING_REVIEW': '待报销',
    'REIMBURSED': '已报销',
    'REJECTED': '已驳回',
    'REQUIRES_RESUBMIT': '需重新提交',
  };
  return statusMap[status] || status;
};

// 获取状态样式类
const getStatusClass = (status: string) => {
  const classMap: Record<string, string> = {
    'PENDING_REVIEW': 'pending',
    'REIMBURSED': 'reimbursed',
    'REJECTED': 'rejected',
    'REQUIRES_RESUBMIT': 'resubmit',
  };
  return classMap[status] || '';
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

const getExpenseSummary = (item: any) => {
  const parts: string[] = [];
  const customFeeSummary = summarizeReimbursementCustomFees(item.customFees);

  if (item.purchaseLists?.length) {
    parts.push(`${item.purchaseLists.length}张采购清单`);
  }

  if (customFeeSummary) {
    parts.push(customFeeSummary);
  }

  if (item.platformShippingFee > 0) {
    parts.push('平台运费');
  }

  if (item.platformPackagingFee > 0) {
    parts.push('平台打包费');
  }

  return parts.join('、');
};

// 判断是否可以删除（只有待报销、已驳回、需重新提交状态可以删除）
const canDelete = (item: any) => {
  return ['PENDING_REVIEW', 'REJECTED', 'REQUIRES_RESUBMIT'].includes(item.status);
};

// 删除报销单
const confirmDelete = (item: any) => {
  // 阻止冒泡，避免触发查看详情
  return () => {
    uni.showModal({
      title: '确认删除',
      content: '确认删除该报销单？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const response: any = await deleteReimbursement(item.id);

            if (response.code === 0) {
              uni.showToast({
                title: '删除成功',
                icon: 'success',
              });

              // 刷新列表
              loadReimbursements(true);
            } else {
              uni.showToast({
                title: response.message || '删除失败',
                icon: 'none',
              });
            }
          } catch (error: any) {
            console.error('删除报销单失败', error);
            uni.showToast({
              title: error.message || '删除失败',
              icon: 'none',
            });
          }
        }
      },
    });
  };
};
</script>

<style scoped lang="scss">
.reimbursement-list-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 160rpx; // 为底部按钮留出空间
}

.bottom-action {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 24rpx 32rpx;
  background-color: #fff;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.08);
  z-index: 100;
}

.submit-btn {
  width: 100%;
  height: 96rpx;
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  border-radius: 48rpx;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(253, 203, 110, 0.4);

  text {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
  }

  &:active {
    opacity: 0.8;
    transform: scale(0.98);
  }
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

      &.reimbursed {
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

    .header-right {
      display: flex;
      align-items: center;
      gap: 12rpx;
    }
  }

  .delete-btn {
    padding: 8rpx;
    display: flex;
    align-items: center;
    justify-content: center;

    .delete-icon {
      font-size: 32rpx;
      opacity: 0.6;
    }

    &:active {
      opacity: 1;
      transform: scale(0.9);
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
        color: #ff6b6b;
      }
    }
  }

  .item-summary {
    margin-bottom: 16rpx;
    padding: 14rpx 18rpx;
    background-color: #fff7e6;
    border-radius: 12rpx;

    .summary-text {
      font-size: 24rpx;
      color: #ad6800;
      line-height: 1.5;
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
