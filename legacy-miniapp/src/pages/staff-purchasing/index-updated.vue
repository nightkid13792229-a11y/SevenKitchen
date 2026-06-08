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
        <text class="filter-label">目标日期</text>
        <picker mode="date" :value="targetDate" @change="onDateChange">
          <view class="picker-value">
            {{ targetDate || '请选择日期' }}
            <text class="arrow">›</text>
          </view>
        </picker>
      </view>
      <view class="filter-item">
        <text class="filter-label">清单状态</text>
        <picker mode="selector" :range="statusOptions" @change="onStatusChange">
          <view class="picker-value">
            {{ statusText }}
            <text class="arrow">›</text>
          </view>
        </picker>
      </view>
    </view>

    <!-- 生成按钮 -->
    <view v-if="!currentPurchaseList" class="generate-section">
      <button class="generate-btn" @tap="generatePurchaseList" :loading="generating">
        <text v-if="!generating">生成采购清单</text>
        <text v-else>生成中...</text>
      </button>
    </view>

    <!-- 采购清单 -->
    <view v-if="currentPurchaseList" class="purchase-list">
      <view class="list-header">
        <text class="header-title">采购清单</text>
        <view class="header-info">
          <text class="info-text">共 {{ purchaseItems.length }} 种原料</text>
          <text class="info-text">¥{{ totalCost }}</text>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-if="purchaseItems.length === 0" class="empty-state">
        <text class="empty-icon">📋</text>
        <text class="empty-text">暂无采购需求</text>
        <text class="empty-hint">该日期暂无待生产订单</text>
      </view>

      <!-- 采购项列表 -->
      <view v-else class="list-items">
        <view v-for="(item, index) in purchaseItems" :key="index" class="list-item">
          <view class="item-info">
            <text class="item-name">{{ item.ingredientName }}</text>
            <text class="item-spec">{{ item.productModel || '标准规格' }}</text>
            <text class="item-channel" v-if="item.purchaseChannel">
              渠道: {{ item.purchaseChannel }}
            </text>
          </view>
          <view class="item-quantity">
            <text class="quantity-value">{{ item.quantityNeeded }}</text>
            <text class="quantity-unit">{{ item.quantityUnit }}</text>
          </view>
          <view class="item-cost">
            <text class="cost-label">预估:</text>
            <text class="cost-value">¥{{ item.estimatedCost.toFixed(2) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view v-if="currentPurchaseList && purchaseItems.length > 0" class="bottom-actions">
      <button
        v-if="currentPurchaseList.status === 'DRAFT' || currentPurchaseList.status === 'PENDING'"
        class="action-btn primary"
        @tap="confirmPurchase"
        :loading="confirming"
      >
        <text v-if="!confirming">确认采购完成</text>
        <text v-else>提交中...</text>
      </button>
      <view v-else class="status-badge completed">
        <text>✓ 已完成</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { generatePurchaseList, getPurchaseLists, completePurchase } from '@/api/purchasing';

// 状态管理
const targetDate = ref('');
const currentStatus = ref('');
const currentPurchaseList = ref<any>(null);
const purchaseItems = ref<any[]>([]);
const generating = ref(false);
const confirming = ref(false);

// 状态选项
const statusOptions = ['全部', '草稿', '待采购', '已完成'];
const statusMap: Record<string, string> = {
  '': '全部',
  'DRAFT': '草稿',
  'PENDING': '待采购',
  'COMPLETED': '已完成',
  'CANCELLED': '已取消',
};

// 计算属性
const statusText = computed(() => statusMap[currentStatus.value] || '全部');
const totalCost = computed(() => {
  return purchaseItems.value
    .reduce((sum, item) => sum + item.estimatedCost, 0)
    .toFixed(2);
});

onMounted(() => {
  // 设置默认日期为今天
  const today = new Date().toISOString().split('T')[0];
  targetDate.value = today;
  // 加载今天的采购清单
  loadPurchaseList();
});

// 加载采购清单
const loadPurchaseList = async () => {
  if (!targetDate.value) {
    uni.showToast({ title: '请选择日期', icon: 'none' });
    return;
  }

  try {
    const res: any = await getPurchaseLists({
      startDate: targetDate.value,
      endDate: targetDate.value,
      status: currentStatus.value || undefined,
      pageSize: 1,
    });

    if (res.code === 0 && res.data.list.length > 0) {
      currentPurchaseList.value = res.data.list[0];
      purchaseItems.value = currentPurchaseList.value.items || [];
      uni.showToast({ title: '加载成功', icon: 'success' });
    } else {
      currentPurchaseList.value = null;
      purchaseItems.value = [];
    }
  } catch (error: any) {
    console.error('加载采购清单失败', error);
    uni.showToast({ title: error.message || '加载失败', icon: 'none' });
  }
};

// 生成采购清单
const generatePurchaseList = async () => {
  if (!targetDate.value) {
    uni.showToast({ title: '请选择日期', icon: 'none' });
    return;
  }

  generating.value = true;

  try {
    const res: any = await generatePurchaseList({
      startDate: targetDate.value,
    });

    if (res.code === 0) {
      currentPurchaseList.value = res.data;
      purchaseItems.value = res.data.items || [];
      uni.showToast({ title: '生成成功', icon: 'success' });
    } else {
      uni.showToast({ title: res.message || '生成失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('生成采购清单失败', error);
    uni.showToast({ title: error.message || '生成失败', icon: 'none' });
  } finally {
    generating.value = false;
  }
};

// 确认采购完成
const confirmPurchase = async () => {
  if (!currentPurchaseList.value) {
    return;
  }

  confirming.value = true;

  try {
    const res: any = await completePurchase(currentPurchaseList.value.id);

    if (res.code === 0) {
      currentPurchaseList.value = res.data;
      uni.showToast({ title: '确认成功', icon: 'success' });

      // 跳转到报销申请页面
      setTimeout(() => {
        uni.navigateTo({
          url: `/pages/staff-purchasing/reimbursement/submit?purchaseListId=${currentPurchaseList.value.id}`,
        });
      }, 1500);
    } else {
      uni.showToast({ title: res.message || '确认失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('确认采购失败', error);
    uni.showToast({ title: error.message || '确认失败', icon: 'none' });
  } finally {
    confirming.value = false;
  }
};

// 日期变更
const onDateChange = (e: any) => {
  targetDate.value = e.detail.value;
  loadPurchaseList();
};

// 状态变更
const onStatusChange = (e: any) => {
  const index = e.detail.value;
  const value = statusOptions[index];
  currentStatus.value = value === '全部' ? '' : value === '草稿' ? 'DRAFT' : value === '待采购' ? 'PENDING' : 'COMPLETED';
  loadPurchaseList();
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
  border-radius: 16rpx;
  margin: 0 32rpx 24rpx;
}

.filter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;

  &:last-child {
    margin-bottom: 0;
  }
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

.generate-section {
  padding: 0 32rpx 24rpx;

  .generate-btn {
    width: 100%;
    height: 88rpx;
    background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
    color: #fff;
    border-radius: 16rpx;
    font-size: 32rpx;
    font-weight: bold;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8rpx 16rpx rgba(24, 144, 255, 0.3);

    &:active {
      opacity: 0.8;
    }
  }
}

.purchase-list {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  border-radius: 16rpx;
  overflow: hidden;
}

.list-header {
  display: flex;
  flex-direction: column;
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;

  .header-title {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 16rpx;
  }

  .header-info {
    display: flex;
    gap: 24rpx;

    .info-text {
      font-size: 24rpx;
      color: #666;
    }
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
    color: #999;
    margin-bottom: 12rpx;
  }

  .empty-hint {
    font-size: 24rpx;
    color: #ccc;
  }
}

.list-items {
  padding: 0 32rpx 32rpx;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 32rpx 0;
  border-bottom: 1rpx solid #f5f5f5;

  &:last-child {
    border-bottom: none;
  }
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;

  .item-name {
    font-size: 30rpx;
    font-weight: bold;
    color: #333;
  }

  .item-spec {
    font-size: 24rpx;
    color: #999;
  }

  .item-channel {
    font-size: 22rpx;
    color: #1890ff;
  }
}

.item-quantity {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  margin-right: 24rpx;

  .quantity-value {
    font-size: 32rpx;
    font-weight: bold;
    color: #ff6b6b;
  }

  .quantity-unit {
    font-size: 24rpx;
    color: #999;
  }
}

.item-cost {
  display: flex;
  align-items: baseline;
  gap: 4rpx;

  .cost-label {
    font-size: 22rpx;
    color: #999;
  }

  .cost-value {
    font-size: 28rpx;
    font-weight: bold;
    color: #51cf66;
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
    background: linear-gradient(135deg, #51cf66 0%, #37b24d 100%);
    color: #fff;
    border-radius: 16rpx;
    font-size: 32rpx;
    font-weight: bold;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8rpx 16rpx rgba(81, 207, 102, 0.3);

    &.primary:active {
      opacity: 0.8;
    }
  }

  .status-badge {
    width: 100%;
    height: 88rpx;
    background-color: #f5f5f5;
    color: #999;
    border-radius: 16rpx;
    font-size: 28rpx;
    display: flex;
    align-items: center;
    justify-content: center;

    &.completed {
      background-color: #e8f5e9;
      color: #37b24d;
    }
  }
}
</style>
