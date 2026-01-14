<template>
  <view class="submit-reimbursement-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">提交报销申请</text>
      <text class="subtitle">选择已完成的采购清单并上传发票</text>
    </view>

    <!-- 已完成的采购清单 -->
    <view class="section">
      <text class="section-title">选择采购清单（已完成）</text>
      <view v-if="completedPurchaseLists.length === 0" class="empty-state">
        <text class="empty-text">暂无已完成的采购清单</text>
        <text class="empty-hint">请先完成采购后再提交报销</text>
      </view>
      <view v-else class="purchase-lists">
        <view
          v-for="list in completedPurchaseLists"
          :key="list.id"
          class="list-item"
          :class="{ selected: selectedListIds.includes(list.id) }"
          @tap="togglePurchaseList(list.id)"
        >
          <view class="checkbox">
            <text v-if="selectedListIds.includes(list.id)" class="check-icon">✓</text>
            <text v-else class="uncheck-icon">⬜</text>
          </view>
          <view class="list-info">
            <text class="list-date">{{ formatDate(list.targetDate) }}</text>
            <text class="list-count">{{ list.itemCount }} 种原料</text>
            <text class="list-cost">预估: ¥{{ list.totalEstimatedCost.toFixed(2) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 发票照片上传 -->
    <view class="section">
      <text class="section-title">上传发票照片（最多3张）</text>
      <view class="photo-upload">
        <view v-for="(url, index) in receiptUrls" :key="index" class="photo-item">
          <image :src="url" mode="aspectFill" @tap="previewPhoto(index)" />
          <view class="delete-btn" @tap.stop="deletePhoto(index)">
            <text>×</text>
          </view>
        </view>
        <view
          v-if="receiptUrls.length < 3"
          class="upload-btn"
          @tap="uploadPhoto"
        >
          <text class="icon">+</text>
          <text class="text">添加照片</text>
        </view>
      </view>
    </view>

    <!-- 实际采购金额 -->
    <view class="section">
      <text class="section-title">实际采购金额</text>
      <view class="cost-input-wrapper">
        <text class="currency">¥</text>
        <input
          class="cost-input"
          type="digit"
          v-model="totalActualCost"
          placeholder="请输入实际采购总额"
        />
      </view>
      <view class="cost-info">
        <text class="label">预估总额:</text>
        <text class="estimated">¥{{ estimatedTotal }}</text>
      </view>
      <view v-if="costDifference !== 0" class="cost-diff" :class="{ positive: costDifference > 0, negative: costDifference < 0 }">
        <text class="label">差异:</text>
        <text class="diff">{{ costDifference > 0 ? '+' : '' }}¥{{ Math.abs(costDifference).toFixed(2) }}</text>
      </view>
    </view>

    <!-- 已选择的清单汇总 -->
    <view v-if="selectedListIds.length > 0" class="section summary">
      <text class="section-title">已选择 {{ selectedListIds.length }} 个采购清单</text>
      <view class="summary-items">
        <view v-for="id in selectedListIds" :key="id" class="summary-item">
          <text class="item-date">{{ formatDate(getListById(id).targetDate) }}</text>
          <text class="item-cost">¥{{ getListById(id).totalEstimatedCost.toFixed(2) }}</text>
        </view>
      </view>
    </view>

    <!-- 提交按钮 -->
    <view class="bottom-actions">
      <button
        class="submit-btn"
        @tap="submitReimbursement"
        :loading="submitting"
        :disabled="!canSubmit"
      >
        <text v-if="!submitting">提交报销申请</text>
        <text v-else>提交中...</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getPurchaseLists, submitReimbursement } from '@/api/purchasing';

// 状态管理
const completedPurchaseLists = ref<any[]>([]);
const selectedListIds = ref<string[]>([]);
const receiptUrls = ref<string[]>([]);
const totalActualCost = ref('');
const submitting = ref(false);

// 计算属性
const estimatedTotal = computed(() => {
  return completedPurchaseLists.value
    .filter(list => selectedListIds.value.includes(list.id))
    .reduce((sum, list) => sum + list.totalEstimatedCost, 0)
    .toFixed(2);
});

const costDifference = computed(() => {
  const actual = parseFloat(totalActualCost.value) || 0;
  return actual - parseFloat(estimatedTotal.value);
});

const canSubmit = computed(() => {
  return (
    selectedListIds.value.length > 0 &&
    receiptUrls.value.length > 0 &&
    totalActualCost.value &&
    parseFloat(totalActualCost.value) > 0 &&
    !submitting.value
  );
});

// 页面加载
onMounted(() => {
  loadCompletedPurchaseLists();
});

// 加载已完成的采购清单
const loadCompletedPurchaseLists = async () => {
  try {
    const res: any = await getPurchaseLists({ status: 'COMPLETED', pageSize: 100 });
    if (res.code === 0) {
      completedPurchaseLists.value = res.data.list;
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载采购清单失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  }
};

// 切换采购清单选择
const togglePurchaseList = (id: string) => {
  const index = selectedListIds.value.indexOf(id);
  if (index > -1) {
    selectedListIds.value.splice(index, 1);
  } else {
    selectedListIds.value.push(id);
  }
};

// 根据ID获取采购清单
const getListById = (id: string) => {
  return completedPurchaseLists.value.find(list => list.id === id);
};

// 上传照片
const uploadPhoto = () => {
  uni.chooseImage({
    count: 3 - receiptUrls.value.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      // TODO: 实际上传到服务器
      // 这里先使用临时路径
      const tempFilePaths = res.tempFilePaths;

      // 显示loading
      uni.showLoading({ title: '上传中...' });

      // 模拟上传（实际应该调用上传API）
      setTimeout(() => {
        receiptUrls.value.push(...tempFilePaths);
        uni.hideLoading();
        uni.showToast({ title: '上传成功', icon: 'success' });
      }, 1000);
    },
  });
};

// 删除照片
const deletePhoto = (index: number) => {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这张照片吗？',
    success: (res) => {
      if (res.confirm) {
        receiptUrls.value.splice(index, 1);
      }
    },
  });
};

// 预览照片
const previewPhoto = (index: number) => {
  uni.previewImage({
    urls: receiptUrls.value,
    current: receiptUrls.value[index],
  });
};

// 提交报销申请
const submitReimbursement = async () => {
  if (!canSubmit.value) {
    return;
  }

  if (selectedListIds.value.length === 0) {
    uni.showToast({ title: '请选择采购清单', icon: 'none' });
    return;
  }

  if (receiptUrls.value.length === 0) {
    uni.showToast({ title: '请上传发票照片', icon: 'none' });
    return;
  }

  const actualCost = parseFloat(totalActualCost.value);
  if (!actualCost || actualCost <= 0) {
    uni.showToast({ title: '请输入有效的采购金额', icon: 'none' });
    return;
  }

  submitting.value = true;

  try {
    const res: any = await submitReimbursement({
      purchaseListIds: selectedListIds.value,
      receiptUrls: receiptUrls.value,
      totalActualCost: actualCost,
    });

    if (res.code === 0) {
      uni.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
    } else {
      uni.showToast({ title: res.message || '提交失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('提交报销申请失败', error);
    uni.showToast({ title: error.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
};
</script>

<style scoped lang="scss">
.submit-reimbursement-page {
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

.section {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  padding: 32rpx;
  border-radius: 16rpx;

  .section-title {
    display: block;
    font-size: 30rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 24rpx;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 32rpx;

  .empty-text {
    font-size: 28rpx;
    color: #999;
    margin-bottom: 8rpx;
  }

  .empty-hint {
    font-size: 24rpx;
    color: #ccc;
  }
}

.purchase-lists {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  border: 2rpx solid transparent;
  transition: all 0.3s;

  &.selected {
    background-color: #e8f5e9;
    border-color: #51cf66;
  }

  .checkbox {
    margin-right: 16rpx;

    .check-icon {
      font-size: 36rpx;
      color: #51cf66;
    }

    .uncheck-icon {
      font-size: 36rpx;
      color: #ddd;
    }
  }

  .list-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6rpx;

    .list-date {
      font-size: 28rpx;
      color: #333;
      font-weight: 500;
    }

    .list-count {
      font-size: 24rpx;
      color: #666;
    }

    .list-cost {
      font-size: 28rpx;
      font-weight: bold;
      color: #ff6b6b;
    }
  }
}

.photo-upload {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.photo-item {
  position: relative;
  width: 200rpx;
  height: 200rpx;

  image {
    width: 100%;
    height: 100%;
    border-radius: 12rpx;
  }

  .delete-btn {
    position: absolute;
    top: -10rpx;
    right: -10rpx;
    width: 44rpx;
    height: 44rpx;
    background-color: #ff6b6b;
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32rpx;
    box-shadow: 0 4rpx 12rpx rgba(255, 107, 107, 0.4);
  }
}

.upload-btn {
  width: 200rpx;
  height: 200rpx;
  border: 2rpx dashed #ddd;
  border-radius: 12rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  background-color: #fafafa;

  .icon {
    font-size: 48rpx;
    color: #999;
  }

  .text {
    font-size: 24rpx;
    color: #999;
  }
}

.cost-input-wrapper {
  display: flex;
  align-items: center;
  background-color: #f5f5f5;
  border-radius: 12rpx;
  padding: 0 24rpx;
  margin-bottom: 16rpx;

  .currency {
    font-size: 32rpx;
    color: #333;
    margin-right: 8rpx;
  }

  .cost-input {
    flex: 1;
    height: 88rpx;
    font-size: 32rpx;
    color: #333;
  }
}

.cost-info, .cost-diff {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 0;

  .label {
    font-size: 24rpx;
    color: #999;
  }

  .estimated, .diff {
    font-size: 28rpx;
    font-weight: bold;
    color: #333;
  }
}

.cost-diff {
  &.positive .diff {
    color: #ff6b6b;
  }

  &.negative .diff {
    color: #51cf66;
  }
}

.summary {
  .summary-items {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  .summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16rpx;
    background-color: #f9f9f9;
    border-radius: 8rpx;

    .item-date {
      font-size: 26rpx;
      color: #666;
    }

    .item-cost {
      font-size: 28rpx;
      font-weight: bold;
      color: #333;
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

  .submit-btn {
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

    &:active {
      opacity: 0.8;
    }

    &[disabled] {
      background: #ddd;
      box-shadow: none;
    }
  }
}
</style>
