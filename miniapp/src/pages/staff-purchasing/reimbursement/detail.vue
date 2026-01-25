<template>
  <view class="reimbursement-detail-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">报销单详情</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 详情内容 -->
    <view v-else-if="reimbursement" class="detail-content">
      <!-- 状态卡片 -->
      <view class="section status-card">
        <view class="card-header">
          <text class="claim-number">{{ reimbursement.claimNumber }}</text>
          <view class="status-badge" :class="getStatusClass(reimbursement.status)">
            <text>{{ getStatusText(reimbursement.status) }}</text>
          </view>
        </view>
        <view class="card-body">
          <view class="info-row">
            <text class="label">提交时间:</text>
            <text class="value">{{ formatFullDateTime(reimbursement.submittedAt) }}</text>
          </view>
          <view class="info-row">
            <text class="label">提交人:</text>
            <text class="value">{{ reimbursement.submittedBy?.nickname || '-' }}</text>
          </view>
        </view>
      </view>

      <!-- 费用汇总卡片 -->
      <view class="section cost-summary-card">
        <text class="section-title">费用明细</text>

        <!-- 采购清单金额 -->
        <view class="cost-row">
          <text class="label">采购清单金额</text>
          <text class="value">¥{{ purchaseListsTotal }}</text>
        </view>

        <!-- 平台运费 -->
        <view v-if="reimbursement.platformShippingFee > 0" class="cost-row">
          <text class="label">平台运费</text>
          <text class="value">¥{{ reimbursement.platformShippingFee.toFixed(2) }}</text>
        </view>

        <!-- 平台打包费 -->
        <view v-if="reimbursement.platformPackagingFee > 0" class="cost-row">
          <text class="label">平台打包费</text>
          <text class="value">¥{{ reimbursement.platformPackagingFee.toFixed(2) }}</text>
        </view>

        <!-- 自定义费用明细 -->
        <view v-if="hasCustomFees" class="custom-fees-section">
          <text class="custom-fees-title">其它费用</text>
          <view
            v-for="(fee, index) in reimbursement.customFees"
            :key="index"
            class="custom-fee-row"
          >
            <text class="fee-desc">{{ fee.description }}</text>
            <text class="fee-amount">¥{{ fee.amount.toFixed(2) }}</text>
          </view>
        </view>

        <!-- 计算公式 -->
        <view v-if="showFormula" class="formula-row">
          <text class="formula-text">{{ costFormula }}</text>
        </view>

        <!-- 总金额 -->
        <view class="total-row">
          <text class="total-label">报销总额</text>
          <text class="total-value">¥{{ reimbursement.totalActualCost.toFixed(2) }}</text>
        </view>
      </view>

      <!-- 金额信息 -->
      <view class="section">
        <text class="section-title">金额信息</text>
        <view class="amount-list">
          <view class="amount-item">
            <text class="label">预估总额</text>
            <text class="value estimated">¥{{ reimbursement.totalEstimatedCost.toFixed(2) }}</text>
          </view>
          <view class="amount-item">
            <text class="label">实际总额</text>
            <text class="value actual">¥{{ reimbursement.totalActualCost.toFixed(2) }}</text>
          </view>
          <view class="amount-item diff" :class="{ positive: costDiff > 0, negative: costDiff < 0 }">
            <text class="label">成本差异</text>
            <text class="value">{{ costDiff > 0 ? '+' : '' }}¥{{ Math.abs(costDiff).toFixed(2) }}</text>
          </view>
          <view class="amount-item diff-percentage" :class="{ positive: costDiffPercentage > 0, negative: costDiffPercentage < 0 }">
            <text class="label">差异率</text>
            <text class="value">{{ costDiffPercentage > 0 ? '+' : '' }}{{ Math.abs(costDiffPercentage).toFixed(1) }}%</text>
          </view>
        </view>
      </view>

      <!-- 采购清单 -->
      <view class="section">
        <text class="section-title">包含采购清单 ({{ reimbursement.purchaseLists?.length || 0 }})</text>
        <view class="purchase-lists">
          <view
            v-for="(list, index) in reimbursement.purchaseLists"
            :key="index"
            class="purchase-card"
          >
            <view class="card-header">
              <text class="date">{{ formatDate(list.targetDate) }}</text>
              <text class="status">{{ getListStatusText(list.status) }}</text>
            </view>
            <view class="card-body">
              <view class="info-row">
                <text class="label">原料种类:</text>
                <text class="value">{{ list.itemCount }} 种</text>
              </view>
              <view class="info-row">
                <text class="label">预估成本:</text>
                <text class="value">¥{{ list.totalEstimatedCost.toFixed(2) }}</text>
              </view>
              <view class="info-row">
                <text class="label">订单数量:</text>
                <text class="value">{{ list.sourceOrderIds?.length || 0 }} 个</text>
              </view>
            </view>
            <!-- 展开查看原料明细 -->
            <view class="items-expand" @tap="toggleItems(index)">
              <text class="expand-text">{{ expandedItems[index] ? '收起' : '展开' }}原料明细</text>
              <text class="expand-icon">{{ expandedItems[index] ? '▲' : '▼' }}</text>
            </view>
            <view v-if="expandedItems[index]" class="items-list">
              <view
                v-for="(item, idx) in list.items"
                :key="idx"
                class="item-row"
              >
                <text class="item-name">{{ item.ingredientName }}</text>
                <text class="item-quantity">{{ item.quantityNeeded }}{{ item.quantityUnit }}</text>
                <text class="item-cost">¥{{ item.estimatedCost.toFixed(2) }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 发票照片 -->
      <view v-if="reimbursement.receiptUrls && reimbursement.receiptUrls.length > 0" class="section">
        <text class="section-title">发票照片</text>
        <view class="photos-grid">
          <view
            v-for="(url, index) in reimbursement.receiptUrls"
            :key="index"
            class="photo-item"
            @tap="previewPhoto(url)"
          >
            <image :src="url" mode="aspectFill" />
          </view>
        </view>
      </view>

      <!-- 审核信息 -->
      <view v-if="reimbursement.status !== 'PENDING_REVIEW'" class="section review-section">
        <text class="section-title">审核信息</text>
        <view class="review-info">
          <view class="info-row">
            <text class="label">审核人:</text>
            <text class="value">{{ reimbursement.reviewedBy?.nickname || '-' }}</text>
          </view>
          <view class="info-row">
            <text class="label">审核时间:</text>
            <text class="value">{{ formatFullDateTime(reimbursement.reviewedAt) }}</text>
          </view>
          <view v-if="reimbursement.reviewComment" class="info-row comment">
            <text class="label">审核意见:</text>
            <text class="value">{{ reimbursement.reviewComment }}</text>
          </view>
        </view>
      </view>

      <!-- 重新提交按钮 -->
      <view
        v-if="reimbursement.status === 'REJECTED' || reimbursement.status === 'REQUIRES_RESUBMIT'"
        class="bottom-actions"
      >
        <button
          class="action-btn resubmit"
          @tap="resubmit"
          :loading="resubmitting"
        >
          <text v-if="!resubmitting">重新提交</text>
          <text v-else>提交中...</text>
        </button>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getReimbursementDetail, resubmitReimbursement } from '@/api/purchasing';

// 状态管理
const reimbursementId = ref('');
const reimbursement = ref<any>(null);
const loading = ref(true);
const resubmitting = ref(false);
const expandedItems = ref<Record<number, boolean>>({});

// 计算属性
const costDiff = computed(() => {
  if (!reimbursement.value) return 0;
  return reimbursement.value.totalActualCost - reimbursement.value.totalEstimatedCost;
});

const costDiffPercentage = computed(() => {
  if (!reimbursement.value) return 0;
  const diff = costDiff.value;
  const estimated = reimbursement.value.totalEstimatedCost;
  return estimated > 0 ? (diff / estimated) * 100 : 0;
});

// 采购清单总金额
const purchaseListsTotal = computed(() => {
  if (!reimbursement.value) return '0.00';
  const total = reimbursement.value.purchaseLists?.reduce(
    (sum: number, list: any) => sum + (list.totalActualCost || list.totalEstimatedCost || 0),
    0
  ) || 0;
  return total.toFixed(2);
});

// 是否有自定义费用
const hasCustomFees = computed(() => {
  if (!reimbursement.value?.customFees) return false;
  return reimbursement.value.customFees.length > 0;
});

// 自定义费用总金额
const customFeesTotal = computed(() => {
  if (!reimbursement.value?.customFees) return 0;
  return reimbursement.value.customFees.reduce(
    (sum: number, fee: any) => sum + (fee.amount || 0),
    0
  );
});

// 是否显示计算公式
const showFormula = computed(() => {
  if (!reimbursement.value) return false;
  return (
    reimbursement.value.platformShippingFee > 0 ||
    reimbursement.value.platformPackagingFee > 0 ||
    hasCustomFees.value
  );
});

// 费用计算公式
const costFormula = computed(() => {
  if (!reimbursement.value) return '';

  const parts: string[] = [];

  // 采购清单金额
  parts.push(`采购清单(¥${purchaseListsTotal.value})`);

  // 平台运费
  if (reimbursement.value.platformShippingFee > 0) {
    parts.push(`运费(¥${reimbursement.value.platformShippingFee.toFixed(2)})`);
  }

  // 平台打包费
  if (reimbursement.value.platformPackagingFee > 0) {
    parts.push(`打包费(¥${reimbursement.value.platformPackagingFee.toFixed(2)})`);
  }

  // 其它费用
  if (customFeesTotal.value > 0) {
    parts.push(`其它费用(¥${customFeesTotal.value.toFixed(2)})`);
  }

  return parts.join(' + ') + ` = ¥${reimbursement.value.totalActualCost.toFixed(2)}`;
});

// 页面加载
onLoad((options: any) => {
  reimbursementId.value = options.id;
  loadDetail();
});

// 加载详情
const loadDetail = async () => {
  loading.value = true;

  try {
    const res: any = await getReimbursementDetail(reimbursementId.value);

    if (res.code === 0) {
      reimbursement.value = res.data;
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载报销单详情失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

// 展开/收起原料明细
const toggleItems = (index: number) => {
  expandedItems.value[index] = !expandedItems.value[index];
};

// 预览照片
const previewPhoto = (currentUrl: string) => {
  if (reimbursement.value && reimbursement.value.receiptUrls) {
    uni.previewImage({
      urls: reimbursement.value.receiptUrls,
      current: currentUrl,
    });
  }
};

// 重新提交
const resubmit = () => {
  uni.showModal({
    title: '重新提交',
    content: '重新提交需要选择采购清单和上传发票照片',
    confirmText: '继续',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        uni.navigateTo({
          url: `/pages/staff-purchasing/reimbursement/submit?resubmitId=${reimbursementId.value}`,
        });
      }
    },
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

// 获取清单状态文本
const getListStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'DRAFT': '草稿',
    'PENDING': '待采购',
    'COMPLETED': '已完成',
    'CANCELLED': '已取消',
  };
  return statusMap[status] || status;
};

// 格式化完整日期时间
const formatFullDateTime = (dateStr?: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};
</script>

<style scoped lang="scss">
.reimbursement-detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx;
}

.header {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;

  .title {
    font-size: 44rpx;
    font-weight: bold;
    color: #333;
  }
}

.loading-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 32rpx;

  text {
    font-size: 28rpx;
    color: #999;
  }

  .error-icon {
    font-size: 120rpx;
    margin-bottom: 16rpx;
  }
}

.detail-content {
  padding: 0 32rpx;
}

.section {
  background-color: #fff;
  margin-bottom: 24rpx;
  border-radius: 16rpx;
  padding: 32rpx;

  .section-title {
    display: block;
    font-size: 30rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 24rpx;
  }
}

.status-card {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;

    .claim-number {
      font-size: 32rpx;
      font-weight: bold;
      color: #333;
    }

    .status-badge {
      padding: 12rpx 24rpx;
      border-radius: 8rpx;
      font-size: 24rpx;
      font-weight: bold;

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

  .card-body {
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12rpx;

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
      }
    }
  }
}

.amount-list {
  .amount-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16rpx 0;
    border-bottom: 1rpx solid #f5f5f5;

    &:last-child {
      border-bottom: none;
    }

    .label {
      font-size: 28rpx;
      color: #666;
    }

    .value {
      font-size: 32rpx;
      font-weight: bold;

      &.estimated {
        color: #666;
      }

      &.actual {
        color: #ff6b6b;
      }
    }

    &.diff {
      .value {
        font-size: 28rpx;
      }

      &.positive .value {
        color: #ff6b6b;
      }

      &.negative .value {
        color: #51cf66;
      }
    }

    &.diff-percentage {
      border-bottom: none;
      padding-top: 8rpx;

      .label {
        font-size: 24rpx;
        color: #999;
      }

      .value {
        font-size: 26rpx;
      }

      &.positive .value {
        color: #ff6b6b;
      }

      &.negative .value {
        color: #51cf66;
      }
    }
  }
}

.purchase-lists {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.purchase-card {
  background-color: #f9f9f9;
  border-radius: 12rpx;
  padding: 24rpx;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;

    .date {
      font-size: 28rpx;
      font-weight: bold;
      color: #333;
    }

    .status {
      font-size: 22rpx;
      color: #51cf66;
      padding: 4rpx 12rpx;
      background-color: #e8f5e9;
      border-radius: 4rpx;
    }
  }

  .card-body {
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8rpx;

      &:last-child {
        margin-bottom: 0;
      }

      .label {
        font-size: 24rpx;
        color: #999;
      }

      .value {
        font-size: 24rpx;
        color: #333;
      }
    }
  }

  .items-expand {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid #e8e8e8;

    .expand-text {
      font-size: 24rpx;
      color: #1890ff;
    }

    .expand-icon {
      font-size: 20rpx;
      color: #1890ff;
    }
  }

  .items-list {
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid #e8e8e8;
  }

  .item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12rpx;

    &:last-child {
      margin-bottom: 0;
    }

    .item-name {
      flex: 1;
      font-size: 24rpx;
      color: #333;
    }

    .item-quantity {
      font-size: 24rpx;
      color: #666;
      margin-right: 16rpx;
    }

    .item-cost {
      font-size: 24rpx;
      font-weight: bold;
      color: #ff6b6b;
    }
  }
}

.photos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.photo-item {
  width: 200rpx;
  height: 200rpx;

  image {
    width: 100%;
    height: 100%;
    border-radius: 12rpx;
  }
}

.review-section {
  .review-info {
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12rpx;

      &:last-child {
        margin-bottom: 0;
      }

      .label {
        font-size: 26rpx;
        color: #666;
      }

      .value {
        flex: 1;
        font-size: 26rpx;
        color: #333;
        text-align: right;
      }

      &.comment {
        .value {
          color: #ff6b6b;
        }
      }
    }
  }
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 24rpx 32rpx;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
  z-index: 100;

  .action-btn {
    width: 100%;
    height: 88rpx;
    border-radius: 16rpx;
    font-size: 32rpx;
    font-weight: bold;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;

    &.resubmit {
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(255, 107, 107, 0.3);

      &:active {
        opacity: 0.8;
      }
    }
  }
}

.cost-summary-card {
  background: linear-gradient(135deg, #fff9e6 0%, #fff3d3 100%);
  border: 2rpx solid #ffd666;

  .section-title {
    color: #d48806;
    border-bottom: 2rpx solid #ffd666;
    padding-bottom: 16rpx;
  }

  .cost-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16rpx 0;
    border-bottom: 1rpx solid rgba(0, 0, 0, 0.05);

    &:last-child {
      border-bottom: none;
    }

    .label {
      font-size: 28rpx;
      color: #666;
    }

    .value {
      font-size: 30rpx;
      font-weight: bold;
      color: #333;
    }
  }

  .custom-fees-section {
    margin: 16rpx 0;
    padding: 16rpx;
    background-color: rgba(255, 255, 255, 0.6);
    border-radius: 12rpx;

    .custom-fees-title {
      display: block;
      font-size: 26rpx;
      color: #d48806;
      margin-bottom: 12rpx;
      font-weight: bold;
    }

    .custom-fee-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8rpx 0;

      .fee-desc {
        font-size: 26rpx;
        color: #666;
      }

      .fee-amount {
        font-size: 26rpx;
        font-weight: bold;
        color: #ff6b6b;
      }
    }
  }

  .formula-row {
    margin: 16rpx 0;
    padding: 16rpx;
    background-color: rgba(0, 0, 0, 0.02);
    border-radius: 8rpx;

    .formula-text {
      font-size: 24rpx;
      color: #999;
      line-height: 1.6;
      word-break: break-all;
    }
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 2rpx solid #ffd666;

    .total-label {
      font-size: 32rpx;
      font-weight: bold;
      color: #d48806;
    }

    .total-value {
      font-size: 40rpx;
      font-weight: bold;
      color: #ff6b6b;
    }
  }
}
</style>
