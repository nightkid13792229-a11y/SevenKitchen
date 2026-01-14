<template>
  <view class="purchase-detail-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">采购清单详情</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 详情内容 -->
    <view v-else-if="purchaseList" class="detail-content">
      <!-- 状态卡片 -->
      <view class="section status-card">
        <view class="card-header">
          <view class="header-left">
            <text class="target-date">{{ formatDate(purchaseList.targetDate) }}</text>
            <text class="create-time">创建于 {{ formatFullDateTime(purchaseList.createdAt) }}</text>
          </view>
          <view class="status-badge" :class="getStatusClass(purchaseList.status)">
            <text>{{ getStatusText(purchaseList.status) }}</text>
          </view>
        </view>

        <!-- 完成时间 -->
        <view v-if="purchaseList.completedAt" class="complete-time">
          <text class="label">完成时间:</text>
          <text class="value">{{ formatFullDateTime(purchaseList.completedAt) }}</text>
        </view>

        <!-- 创建人 -->
        <view class="creator">
          <text class="label">创建人:</text>
          <text class="value">{{ purchaseList.createdBy?.nickname || '-' }}</text>
        </view>
      </view>

      <!-- 原料明细 -->
      <view class="section">
        <text class="section-title">原料明细 ({{ items.length }})</text>

        <!-- 原料分类标签 -->
        <view class="category-tabs">
          <view
            v-for="cat in categoryTabs"
            :key="cat.value"
            class="tab-item"
            :class="{ active: currentCategory === cat.value }"
            @tap="onCategoryChange(cat.value)"
          >
            <text class="tab-text">{{ cat.label }}</text>
            <text class="tab-count">{{ cat.count }}</text>
          </view>
        </view>

        <!-- 原料列表 -->
        <view v-if="filteredItems.length > 0" class="items-list">
          <view
            v-for="(item, index) in filteredItems"
            :key="index"
            class="item-row"
          >
            <view class="item-info">
              <text class="item-name">{{ item.ingredientName || '未知原料' }}</text>
              <view v-if="item.purchaseChannel || item.productModel" class="item-specs">
                <text v-if="item.purchaseChannel" class="spec">{{ item.purchaseChannel }}</text>
                <text v-if="item.productModel" class="spec">{{ item.productModel }}</text>
              </view>
            </view>
            <view class="item-quantity">
              <text class="quantity-value">{{ formatQuantity(item) }}</text>
              <text class="quantity-unit">{{ getDisplayUnit(item) }}</text>
            </view>
          </view>
        </view>

        <!-- 空状态 -->
        <view v-else class="empty-items">
          <text class="empty-text">该分类暂无原料</text>
        </view>
      </view>

      <!-- 关联订单 -->
      <view v-if="purchaseList.sourceOrderIds && purchaseList.sourceOrderIds.length > 0" class="section">
        <text class="section-title">关联订单 ({{ purchaseList.sourceOrderIds.length }})</text>
        <view class="order-list">
          <view
            v-for="(orderId, index) in purchaseList.sourceOrderIds"
            :key="index"
            class="order-item"
          >
            <text class="order-id">{{ formatOrderId(orderId) }}</text>
            <button class="copy-btn" @tap="copyOrderId(orderId)">
              <text class="copy-btn-text">复制</text>
            </button>
          </view>
        </view>
      </view>

      <!-- 采购记录区域 -->
      <view v-if="purchaseList.startedAt" class="section">
        <text class="section-title">采购记录 ({{ purchaseRecords.length }})</text>

        <!-- 采购记录列表 -->
        <view v-if="purchaseRecords.length > 0" class="records-list">
          <view
            v-for="record in purchaseRecords"
            :key="record.id"
            class="record-item"
          >
            <view class="record-info">
              <text class="record-name">{{ record.ingredientName }}</text>
              <view class="record-details">
                <text class="detail">渠道: {{ record.purchaseChannel }}</text>
                <text class="detail">重量: {{ record.actualQuantity }}g</text>
                <text class="detail">金额: ¥{{ record.actualCost.toFixed(2) }}</text>
                <text v-if="record.productModel" class="detail">型号: {{ record.productModel }}</text>
                <text v-if="record.notes" class="detail">备注: {{ record.notes }}</text>
              </view>
            </view>
            <view class="record-actions" v-if="purchaseList.status === 'PENDING' && !purchaseList.reimbursementId">
              <button class="delete-btn" @tap="deleteRecord(record.id)">删除</button>
            </view>
          </view>

          <!-- 实际采购总额 -->
          <view class="total-cost">
            <text class="total-label">实际采购总额:</text>
            <text class="total-value">¥{{ totalActualCost.toFixed(2) }}</text>
          </view>
        </view>

        <!-- 空状态 -->
        <view v-else class="empty-records">
          <text class="empty-text">暂无采购记录</text>
          <text class="empty-hint">点击"添加采购记录"开始录入</text>
        </view>
      </view>

      <!-- 确认完成按钮 -->
      <view
        v-if="purchaseList.status === 'PENDING'"
        class="bottom-actions"
      >
        <!-- 未开始采购：显示开始采购按钮 -->
        <button
          v-if="!purchaseList.startedAt"
          class="action-btn start"
          @tap="startPurchase"
        >
          开始采购
        </button>
        <!-- 已开始采购：显示添加记录和确认完成按钮 -->
        <template v-else>
          <button class="action-btn add" @tap="addRecord">
            添加采购记录
          </button>
          <button
            class="action-btn complete"
            @tap="completePurchase"
            :loading="completing"
          >
            <text v-if="!completing">确认采购完成</text>
            <text v-else>提交中...</text>
          </button>
        </template>
      </view>

      <!-- 已完成提示 -->
      <view
        v-if="purchaseList.status === 'COMPLETED'"
        class="bottom-actions completed"
      >
        <text class="completed-text">✓ 采购已完成</text>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败</text>
      <button class="retry-btn" @tap="loadDetail">重试</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  getPurchaseListDetail,
  completePurchase as completePurchaseApi,
  startPurchase as startPurchaseApi,
  getPurchaseRecords,
  deletePurchaseRecord as deletePurchaseRecordApi,
} from '@/api/purchasing';

// 状态管理
const purchaseListId = ref('');
const purchaseList = ref<any>(null);
const items = ref<any[]>([]);
const purchaseRecords = ref<any[]>([]);
const loading = ref(true);
const completing = ref(false);
const currentCategory = ref('all');

// 分类标签
const categoryTabs = computed(() => {
  const tabs = [
    { label: '全部', value: 'all', count: items.value.length },
  ];

  // 这里可以根据实际的原料分类进行分组
  // 由于API返回的数据可能没有分类字段，暂时只显示全部
  return tabs;
});

// 筛选后的原料列表
const filteredItems = computed(() => {
  if (currentCategory.value === 'all') {
    return items.value;
  }
  // 如果有分类逻辑，在这里实现
  return items.value;
});

// 页面加载
onLoad((options: any) => {
  purchaseListId.value = options.id;
  loadDetail();
});

// 加载详情
const loadDetail = async () => {
  loading.value = true;

  try {
    const res: any = await getPurchaseListDetail(purchaseListId.value);

    if (res.code === 0) {
      purchaseList.value = res.data;
      items.value = res.data.items || [];
      // 如果已开始采购，加载采购记录
      if (res.data.startedAt) {
        await loadPurchaseRecords();
      }
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载采购清单详情失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

// 加载采购记录
const loadPurchaseRecords = async () => {
  try {
    const res: any = await getPurchaseRecords(purchaseListId.value);
    if (res.code === 0) {
      purchaseRecords.value = res.data || [];
    }
  } catch (error: any) {
    console.error('加载采购记录失败', error);
  }
};

// 分类变更
const onCategoryChange = (category: string) => {
  currentCategory.value = category;
};

// 确认采购完成
const completePurchase = () => {
  uni.showModal({
    title: '确认采购完成',
    content: '确认该采购清单的所有原料已采购完成？',
    success: async (res) => {
      if (res.confirm) {
        completing.value = true;

        try {
          const response: any = await completePurchaseApi(purchaseListId.value);

          if (response.code === 0) {
            uni.showToast({ title: '操作成功', icon: 'success' });
            // 刷新详情
            await loadDetail();
          } else {
            uni.showToast({ title: response.message || '操作失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('确认采购完成失败', error);
          // 显示后端返回的错误信息
          uni.showToast({ title: error.message || '操作失败', icon: 'none' });
        } finally {
          completing.value = false;
        }
      }
    },
  });
};

// 开始采购
const startPurchase = () => {
  uni.showModal({
    title: '开始采购',
    content: '开始采购后可以录入采购记录，确认继续？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await startPurchaseApi(purchaseListId.value);

          if (response.code === 0) {
            uni.showToast({ title: '操作成功', icon: 'success' });
            // 刷新详情
            await loadDetail();
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

// 添加采购记录
const addRecord = () => {
  // 跳转到添加采购记录页面，传递采购清单ID和原料列表
  uni.navigateTo({
    url: `/pages/staff-purchasing/record-form?id=${purchaseListId.value}`,
  });
};

// 删除采购记录
const deleteRecord = (recordId: string) => {
  uni.showModal({
    title: '删除采购记录',
    content: '确认删除该采购记录？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await deletePurchaseRecordApi(recordId);

          if (response.code === 0) {
            uni.showToast({ title: '删除成功', icon: 'success' });
            // 刷新采购记录
            await loadPurchaseRecords();
          } else {
            uni.showToast({ title: response.message || '删除失败', icon: 'none' });
          }
        } catch (error: any) {
          console.error('删除采购记录失败', error);
          uni.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    },
  });
};

// 计算实际采购总额
const totalActualCost = computed(() => {
  return purchaseRecords.value.reduce((sum, record) => sum + record.actualCost, 0);
});

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'DRAFT': '草稿',
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

// 格式化订单ID（简化显示）
const formatOrderId = (orderId: string) => {
  if (orderId.length > 12) {
    return orderId.substring(0, 8) + '...';
  }
  return orderId;
};

// 复制订单ID
const copyOrderId = (orderId: string) => {
  uni.setClipboardData({
    data: orderId,
    success: () => {
      uni.showToast({
        title: '订单ID已复制',
        icon: 'success',
        duration: 2000
      });
    },
    fail: () => {
      uni.showToast({
        title: '复制失败',
        icon: 'none',
        duration: 2000
      });
    }
  });
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
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

// 格式化原料用量（根据原料类型处理）
const formatQuantity = (item: any) => {
  const quantity = Number(item.quantityNeeded);

  // 食材类型：kg转换为g，显示为整数
  if (item.type === 'FOOD' && item.quantityUnit === 'kg') {
    return Math.round(quantity * 1000);
  }

  // 补剂类型和其他：保留两位小数
  return quantity.toFixed(2);
};

// 获取显示单位
const getDisplayUnit = (item: any) => {
  // 食材类型：kg转换为g
  if (item.type === 'FOOD' && item.quantityUnit === 'kg') {
    return 'g';
  }

  // 补剂类型：优先使用displayUnit，回退到quantityUnit
  if (item.type === 'SUPPLEMENT') {
    return item.displayUnit || item.quantityUnit || 'g';
  }

  // 其他类型：使用quantityUnit
  return item.quantityUnit || '';
};
</script>

<style scoped lang="scss">
.purchase-detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
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

  .error-text {
    font-size: 28rpx;
    color: #666;
    margin-bottom: 24rpx;
  }

  .retry-btn {
    padding: 16rpx 48rpx;
    background-color: #1890ff;
    color: #fff;
    border-radius: 8rpx;
    font-size: 28rpx;
    border: none;
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
    align-items: flex-start;
    margin-bottom: 16rpx;

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 8rpx;

      .target-date {
        font-size: 32rpx;
        font-weight: bold;
        color: #333;
      }

      .create-time {
        font-size: 22rpx;
        color: #999;
      }
    }

    .status-badge {
      padding: 12rpx 24rpx;
      border-radius: 8rpx;
      font-size: 24rpx;
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

  .complete-time, .creator {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12rpx;
    padding: 16rpx 0;
    border-top: 1rpx solid #f5f5f5;

    &:last-child {
      margin-bottom: 0;
      border-bottom: none;
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
      color: #ff6b6b;
    }
  }
}

.category-tabs {
  display: flex;
  background-color: #f5f5f5;
  border-radius: 12rpx;
  padding: 8rpx;
  margin-bottom: 24rpx;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16rpx 0;
  border-radius: 8rpx;

  .tab-text {
    font-size: 26rpx;
    color: #666;
    margin-bottom: 4rpx;
  }

  .tab-count {
    font-size: 22rpx;
    color: #999;
  }

  &.active {
    background-color: #fff;
    box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);

    .tab-text {
      color: #1890ff;
      font-weight: bold;
    }

    .tab-count {
      color: #1890ff;
    }
  }
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.item-row {
  display: flex;
  align-items: center;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  gap: 16rpx;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;

  .item-name {
    font-size: 28rpx;
    font-weight: 500;
    color: #333;
  }

  .item-specs {
    display: flex;
    flex-wrap: wrap;
    gap: 8rpx;

    .spec {
      font-size: 22rpx;
      color: #999;
      padding: 4rpx 8rpx;
      background-color: #f0f0f0;
      border-radius: 4rpx;
    }
  }
}

.item-quantity {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
  min-width: 100rpx;

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

.empty-items {
  display: flex;
  justify-content: center;
  padding: 60rpx 32rpx;

  .empty-text {
    font-size: 26rpx;
    color: #999;
  }
}

.order-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.order-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 16rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;

  .order-id {
    font-size: 24rpx;
    color: #1890ff;
    font-family: monospace;
  }

  .copy-btn {
    padding: 4rpx 12rpx;
    background-color: #1890ff;
    color: #fff;
    border-radius: 4rpx;
    font-size: 20rpx;
    border: none;
    line-height: 1.5;

    .copy-btn-text {
      color: #fff;
    }

    &:active {
      opacity: 0.8;
    }
  }
}

// 采购记录样式
.records-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.record-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  gap: 16rpx;
}

.record-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.record-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
}

.record-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;

  .detail {
    font-size: 22rpx;
    color: #666;
    padding: 4rpx 8rpx;
    background-color: #f0f0f0;
    border-radius: 4rpx;
  }
}

.record-actions {
  display: flex;
  flex-direction: column;
  gap: 8rpx;

  .delete-btn {
    padding: 8rpx 16rpx;
    background-color: #ff4d4f;
    color: #fff;
    border-radius: 8rpx;
    font-size: 22rpx;
    border: none;
    line-height: 1.5;

    &:active {
      opacity: 0.8;
    }
  }
}

.total-cost {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  background-color: #fff7e6;
  border-radius: 12rpx;
  margin-top: 16rpx;

  .total-label {
    font-size: 28rpx;
    color: #666;
  }

  .total-value {
    font-size: 36rpx;
    font-weight: bold;
    color: #ff6b6b;
  }
}

.empty-records {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 32rpx;

  .empty-text {
    font-size: 26rpx;
    color: #999;
    margin-bottom: 8rpx;
  }

  .empty-hint {
    font-size: 22rpx;
    color: #ccc;
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
  display: flex;
  gap: 12rpx;

  .action-btn {
    flex: 1;
    height: 88rpx;
    border-radius: 16rpx;
    font-size: 32rpx;
    font-weight: bold;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;

    &.start {
      background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(82, 196, 26, 0.3);
    }

    &.add {
      background: linear-gradient(135deg, #faad14 0%, #d48806 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(250, 173, 20, 0.3);
    }

    &.complete {
      background: linear-gradient(135deg, #51cf66 0%, #37b24d 100%);
      color: #fff;
      box-shadow: 0 8rpx 16rpx rgba(81, 207, 102, 0.3);
    }

    &:active {
      opacity: 0.8;
    }
  }

  &.completed {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 32rpx;

    .completed-text {
      font-size: 32rpx;
      font-weight: bold;
      color: #52c41a;
    }
  }
}
</style>
