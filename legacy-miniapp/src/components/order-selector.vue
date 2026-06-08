<template>
  <view class="order-selector-modal" @tap="handleClose">
    <view class="modal-content" @tap.stop>
      <view class="modal-header">
        <text class="modal-title">{{ mode === 'add' ? '追加订单' : '剔除订单' }}</text>
        <text class="modal-close" @tap="handleClose">×</text>
      </view>

      <!-- 搜索框 -->
      <view class="search-bar">
        <input
          v-model="searchKeyword"
          class="search-input"
          placeholder="搜索订单号/客户/狗狗"
          placeholder-class="input-placeholder"
          @input="handleSearch"
        />
      </view>

      <!-- 已选数量提示 -->
      <view v-if="selectedOrders.length > 0" class="selected-tip">
        <text class="tip-text">已选择 {{ selectedOrders.length }} 个订单</text>
        <text class="clear-btn" @tap="clearSelection">清空</text>
      </view>

      <!-- 订单列表 -->
      <view class="orders-list">
        <view
          v-for="order in filteredOrders"
          :key="order.id"
          class="order-item"
          :class="{ selected: isOrderSelected(order.id) }"
          @tap="toggleOrder(order)"
        >
          <view class="order-checkbox">
            <view v-if="isOrderSelected(order.id)" class="checkbox-checked">✓</view>
            <view v-else class="checkbox-unchecked"></view>
          </view>

          <view class="order-info">
            <view class="order-header">
              <text class="order-id">{{ formatOrderId(order.id) }}</text>
              <text class="order-date">{{ formatDate(order.targetProductionDate) }}</text>
            </view>
            <view class="order-details">
              <text class="customer-name">{{ order.customer?.nickname || '-' }}</text>
              <text class="separator">·</text>
              <text class="dog-name">{{ order.dog?.name || '-' }}</text>
            </view>
            <view class="order-meals">
              <text class="meals-count">{{ order.meals?.length || 0 }} 份餐食</text>
            </view>
          </view>
        </view>

        <!-- 空状态 -->
        <view v-if="filteredOrders.length === 0" class="empty-state">
          <text class="empty-text">{{ searchKeyword ? '未找到匹配的订单' : '暂无可选订单' }}</text>
        </view>
      </view>

      <!-- 底部操作按钮 -->
      <view class="modal-footer">
        <button class="modal-btn cancel" @tap="handleClose">取消</button>
        <button
          class="modal-btn confirm"
          @tap="handleConfirm"
          :disabled="selectedOrders.length === 0"
        >
          确定{{ mode === 'add' ? '追加' : '剔除' }} ({{ selectedOrders.length }})
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface Order {
  id: string;
  targetProductionDate: string;
  customer?: {
    nickname?: string;
  };
  dog?: {
    name?: string;
  };
  meals?: any[];
}

// Props
const props = defineProps<{
  mode: 'add' | 'remove'; // 追加模式 or 剔除模式
  availableOrders: Order[]; // 可选订单列表
  initiallySelected?: string[]; // 初始已选订单ID
}>();

// Emits
const emit = defineEmits<{
  (e: 'confirm', orderIds: string[]): void;
  (e: 'close'): void;
}>();

// 搜索关键词
const searchKeyword = ref('');
const selectedOrders = ref<string[]>([...(props.initiallySelected || [])]);

// 过滤后的订单列表
const filteredOrders = computed(() => {
  if (!searchKeyword.value) {
    return props.availableOrders;
  }

  const keyword = searchKeyword.value.toLowerCase();
  return props.availableOrders.filter(order => {
    const orderId = order.id.toLowerCase();
    const customerName = (order.customer?.nickname || '').toLowerCase();
    const dogName = (order.dog?.name || '').toLowerCase();

    return (
      orderId.includes(keyword) ||
      customerName.includes(keyword) ||
      dogName.includes(keyword)
    );
  });
});

// 搜索处理
const handleSearch = () => {
  // 搜索逻辑由computed自动处理
};

// 判断订单是否已选中
const isOrderSelected = (orderId: string) => {
  return selectedOrders.value.includes(orderId);
};

// 切换订单选择状态
const toggleOrder = (order: Order) => {
  const index = selectedOrders.value.indexOf(order.id);

  if (index > -1) {
    // 已选中，取消选中
    selectedOrders.value.splice(index, 1);
  } else {
    // 未选中，添加选中
    selectedOrders.value.push(order.id);
  }
};

// 清空选择
const clearSelection = () => {
  selectedOrders.value = [];
};

// 确认操作
const handleConfirm = () => {
  if (selectedOrders.value.length === 0) {
    uni.showToast({
      title: props.mode === 'add' ? '请至少选择一个订单' : '请至少选择一个订单',
      icon: 'none',
    });
    return;
  }

  emit('confirm', selectedOrders.value);
};

// 关闭弹窗
const handleClose = () => {
  emit('close');
};

// 格式化订单ID（简化显示）
const formatOrderId = (orderId: string) => {
  if (orderId.length > 12) {
    return orderId.substring(0, 8) + '...';
  }
  return orderId;
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
</script>

<style scoped lang="scss">
.order-selector-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.modal-content {
  width: 100%;
  height: 80vh;
  background-color: #fff;
  border-radius: 32rpx 32rpx 0 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;

  .modal-title {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
  }

  .modal-close {
    font-size: 48rpx;
    color: #999;
    line-height: 1;
    padding: 0 16rpx;
  }
}

.search-bar {
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
  flex-shrink: 0;

  .search-input {
    width: 100%;
    height: 72rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    color: #333;
    background-color: #f5f5f5;
    border-radius: 36rpx;
    box-sizing: border-box;
  }
}

.input-placeholder {
  color: #999;
}

.selected-tip {
  padding: 16rpx 32rpx;
  background-color: #e6f7ff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;

  .tip-text {
    font-size: 24rpx;
    color: #1890ff;
  }

  .clear-btn {
    font-size: 24rpx;
    color: #1890ff;
    padding: 8rpx 16rpx;
    background-color: rgba(24, 144, 255, 0.1);
    border-radius: 4rpx;

    &:active {
      opacity: 0.8;
    }
  }
}

.orders-list {
  flex: 1;
  overflow-y: auto;
  padding: 16rpx 32rpx;
}

.order-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
  border: 2rpx solid transparent;
  transition: all 0.3s;

  &.selected {
    background-color: #e6f7ff;
    border-color: #1890ff;
  }

  &:active {
    opacity: 0.8;
  }

  .order-checkbox {
    flex-shrink: 0;

    .checkbox-checked {
      width: 40rpx;
      height: 40rpx;
      background-color: #1890ff;
      border-radius: 8rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 24rpx;
      font-weight: bold;
    }

    .checkbox-unchecked {
      width: 40rpx;
      height: 40rpx;
      background-color: #fff;
      border: 2rpx solid #d9d9d9;
      border-radius: 8rpx;
    }
  }

  .order-info {
    flex: 1;
    min-width: 0;

    .order-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8rpx;

      .order-id {
        font-size: 26rpx;
        color: #1890ff;
        font-family: monospace;
        font-weight: 500;
      }

      .order-date {
        font-size: 22rpx;
        color: #666;
      }
    }

    .order-details {
      display: flex;
      align-items: center;
      gap: 8rpx;
      margin-bottom: 8rpx;

      .customer-name,
      .dog-name {
        font-size: 24rpx;
        color: #333;
      }

      .separator {
        font-size: 20rpx;
        color: #999;
      }
    }

    .order-meals {
      .meals-count {
        font-size: 22rpx;
        color: #999;
      }
    }
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 32rpx;

  .empty-text {
    font-size: 28rpx;
    color: #999;
  }
}

.modal-footer {
  padding: 24rpx 32rpx;
  border-top: 1rpx solid #f0f0f0;
  display: flex;
  gap: 24rpx;
  flex-shrink: 0;

  .modal-btn {
    flex: 1;
    height: 88rpx;
    border-radius: 12rpx;
    font-size: 32rpx;
    font-weight: 500;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;

    &.cancel {
      background-color: #f5f5f5;
      color: #666;
    }

    &.confirm {
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      color: #fff;

      &[disabled] {
        opacity: 0.5;
      }
    }

    &:active {
      opacity: 0.8;
    }
  }
}
</style>
