<template>
  <view class="submit-reimbursement-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">提交报销申请</text>
      <text class="subtitle">选择采购清单（可选）并上传支付记录</text>
    </view>

    <!-- 已完成的采购清单 -->
    <view class="section">
      <text class="section-title">选择采购清单（可选）</text>
      <view v-if="completedPurchaseLists.length === 0" class="empty-state">
        <text class="empty-text">暂无已完成的采购清单</text>
        <text class="empty-hint">您可以直接提交其它费用的报销申请</text>
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
            <text class="list-cost">采购金额: ¥{{ (list.totalActualCost ?? list.totalEstimatedCost).toFixed(2) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 其它费用 -->
    <view class="section">
      <text class="section-title">其它费用</text>
      <view class="fees-row">
        <view class="fee-item-half">
          <text class="fee-label">平台运费</text>
          <view class="fee-input-wrapper">
            <text class="currency">¥</text>
            <input
              class="fee-input"
              type="digit"
              v-model="platformShippingFee"
              placeholder="0.00"
              @input="calculateTotal"
            />
          </view>
        </view>
        <view class="fee-item-half">
          <text class="fee-label">平台打包费</text>
          <view class="fee-input-wrapper">
            <text class="currency">¥</text>
            <input
              class="fee-input"
              type="digit"
              v-model="platformPackagingFee"
              placeholder="0.00"
              @input="calculateTotal"
            />
          </view>
        </view>
      </view>
      <view class="custom-fees">
        <view class="custom-fee-header">
          <text class="custom-fee-title">添加其它费用</text>
          <view class="add-custom-fee-btn" @tap="addCustomFee">
            <text>+ 添加</text>
          </view>
        </view>
        <view v-if="customFees.length === 0" class="empty-custom-fees">
          <text>暂无其它费用</text>
        </view>
        <view v-else class="custom-fee-list">
          <view
            v-for="(fee, index) in customFees"
            :key="index"
            class="custom-fee-item"
          >
            <view class="custom-fee-content">
              <view class="custom-fee-inputs">
                <input
                  class="custom-fee-desc"
                  v-model="fee.description"
                  placeholder="费用说明"
                />
                <view class="custom-fee-amount-wrapper">
                  <text class="currency">¥</text>
                  <input
                    class="custom-fee-amount"
                    type="digit"
                    v-model="fee.amount"
                    placeholder="0.00"
                    @input="calculateTotal"
                  />
                </view>
              </view>
              <view class="delete-custom-fee-btn" @tap.stop="deleteCustomFee(index)">
                <text>删除</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 支付记录照片上传 -->
    <view class="section">
      <text class="section-title">上传转账或支付记录照片</text>
      <view class="photo-upload">
        <view v-for="(photo, index) in receiptUrls" :key="index" class="photo-item">
          <image :src="photo.url" mode="aspectFill" @tap="previewPhoto(index)" @error="handleImageError(index, photo.url)" />
          <text class="debug-url" v-if="true">{{ photo.url.slice(-30) }}</text>
          <view class="delete-btn" @tap.stop="deletePhoto(index)">
            <text>×</text>
          </view>
        </view>
        <view
          class="upload-btn"
          @tap="uploadPhoto"
        >
          <text class="icon">+</text>
          <text class="text">添加照片</text>
        </view>
      </view>
    </view>

    <!-- 提交按钮和总金额 -->
    <view class="bottom-actions">
      <view class="total-display">
        <text class="total-label">总报销金额:</text>
        <text class="total-amount">¥{{ totalReimbursementAmount }}</text>
      </view>
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
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getPurchaseLists, submitReimbursement as submitReimbursementApi, uploadReceiptPhoto, deleteReceiptPhoto, getReimbursementDetail } from '@/api/purchasing';

// 自定义费用类型
interface CustomFee {
  description: string;
  amount: string;
}

// 照片类型
interface ReceiptPhoto {
  url: string;
  key: string;
}

// 状态管理
const completedPurchaseLists = ref<any[]>([]);
const selectedListIds = ref<string[]>([]);
const receiptUrls = ref<ReceiptPhoto[]>([]);
const platformShippingFee = ref('');
const platformPackagingFee = ref('');
const customFees = ref<CustomFee[]>([]);
const submitting = ref(false);
const totalReimbursementAmount = ref('0.00');

// 计算属性
const canSubmit = computed(() => {
  return (
    receiptUrls.value.length > 0 &&
    !submitting.value
  );
});

// 页面加载
onLoad((options: any) => {
  if (options.resubmitId) {
    // 重新提交模式：加载已有报销单数据
    loadExistingReimbursement(options.resubmitId);
  } else {
    // 新建模式：加载已完成的采购清单
    loadCompletedPurchaseLists();
  }
});

// 计算总报销金额
const calculateTotal = () => {
  // 1. 采购清单金额（优先使用实际采购金额）
  const purchaseListsTotal = completedPurchaseLists.value
    .filter(list => selectedListIds.value.includes(list.id))
    .reduce((sum, list) => sum + (list.totalActualCost ?? list.totalEstimatedCost), 0);

  // 2. 平台运费
  const shippingFee = parseFloat(platformShippingFee.value) || 0;

  // 3. 平台打包费
  const packagingFee = parseFloat(platformPackagingFee.value) || 0;

  // 4. 自定义费用
  const customFeesTotal = customFees.value.reduce((sum, fee) => {
    return sum + (parseFloat(fee.amount) || 0);
  }, 0);

  // 计算总额
  const total = purchaseListsTotal + shippingFee + packagingFee + customFeesTotal;
  totalReimbursementAmount.value = total.toFixed(2);
};

// 加载已完成的采购清单
const loadCompletedPurchaseLists = async () => {
  try {
    const res: any = await getPurchaseLists({ status: 'COMPLETED', excludeReimbursed: true, pageSize: 100 });
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

// 加载已有报销单数据（用于重新提交）
const loadExistingReimbursement = async (id: string) => {
  try {
    uni.showLoading({ title: '加载中...' });

    const res: any = await getReimbursementDetail(id);

    if (res.code === 0) {
      const data = res.data;

      // 填充费用明细
      platformShippingFee.value = data.platformShippingFee?.toString() || '';
      platformPackagingFee.value = data.platformPackagingFee?.toString() || '';
      customFees.value = data.customFees?.map((fee: any) => ({
        description: fee.description,
        amount: fee.amount.toString()
      })) || [];

      // 填充采购清单
      completedPurchaseLists.value = data.purchaseLists || [];
      selectedListIds.value = data.purchaseLists?.map((list: any) => list.id) || [];

      // 填充照片
      receiptUrls.value = data.receiptUrls?.map((url: string, index: number) => ({
        url,
        key: `existing_${index}`
      })) || [];

      // 重新计算总额
      calculateTotal();

      uni.hideLoading();
    } else {
      uni.hideLoading();
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    uni.hideLoading();
    console.error('加载报销单失败', error);
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
  calculateTotal();
};

// 上传照片
const uploadPhoto = () => {
  uni.chooseImage({
    count: 9,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const tempFilePaths = res.tempFilePaths;

      uni.showLoading({ title: '上传中...' });

      try {
        // 上传所有选中的照片
        const uploadPromises = tempFilePaths.map(filePath => uploadReceiptPhoto(filePath));
        const results = await Promise.all(uploadPromises);

        console.log('[Upload] All results:', results);

        // 提取URL和key（响应结构：{code: 0, message: "...", data: {url, key}}）
        const photos = results.map((result: any) => ({
          url: result.data.url,
          key: result.data.key,
        }));

        console.log('[Upload] Parsed photos:', photos);

        receiptUrls.value.push(...photos);

        uni.hideLoading();
        uni.showToast({ title: '上传成功', icon: 'success' });
      } catch (error: any) {
        uni.hideLoading();
        uni.showToast({ title: error.message || '上传失败', icon: 'none' });
      }
    },
  });
};

// 删除照片
const deletePhoto = async (index: number) => {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这张照片吗？',
    success: async (res) => {
      if (res.confirm) {
        const photo = receiptUrls.value[index];

        // 调用后端API删除COS中的文件
        try {
          await deleteReceiptPhoto(photo.key);
          // 从前端数组中移除
          receiptUrls.value.splice(index, 1);
          uni.showToast({ title: '删除成功', icon: 'success' });
        } catch (error: any) {
          console.error('删除照片失败', error);
          uni.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    },
  });
};

// 预览照片
const previewPhoto = (index: number) => {
  const urls = receiptUrls.value.map(photo => photo.url);
  uni.previewImage({
    urls: urls,
    current: urls[index],
  });
};

// 处理图片加载错误
const handleImageError = (index: number, url: string) => {
  console.error(`[Image Error] Failed to load image at index ${index}:`, url);
  console.error('[Image Error] Photo object:', receiptUrls.value[index]);
  uni.showToast({
    title: '图片加载失败',
    icon: 'none',
  });
};

// 添加自定义费用
const addCustomFee = () => {
  customFees.value.push({ description: '', amount: '' });
};

// 删除自定义费用
const deleteCustomFee = (index: number) => {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这项费用吗？',
    success: (res) => {
      if (res.confirm) {
        customFees.value.splice(index, 1);
        calculateTotal();
      }
    },
  });
};

// 提交报销申请
const submitReimbursement = async () => {
  if (!canSubmit.value) {
    return;
  }

  if (receiptUrls.value.length === 0) {
    uni.showToast({ title: '请上传支付记录照片', icon: 'none' });
    return;
  }

  submitting.value = true;

  try {
    const totalAmount = parseFloat(totalReimbursementAmount.value);

    // 将照片对象数组转换为URL数组
    const urls = receiptUrls.value.map(photo => photo.url);

    const res: any = await submitReimbursementApi({
      purchaseListIds: selectedListIds.value,
      receiptUrls: urls,
      totalActualCost: totalAmount,
      // 新增字段
      platformShippingFee: parseFloat(platformShippingFee.value) || 0,
      platformPackagingFee: parseFloat(platformPackagingFee.value) || 0,
      customFees: customFees.value
        .filter(fee => fee.description && fee.amount)
        .map(fee => ({
          description: fee.description,
          amount: parseFloat(fee.amount) || 0
        })),
    });

    if (res.code === 0) {
      uni.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => {
        // 使用 redirectTo 重新加载列表页，确保显示最新数据
        uni.redirectTo({
          url: '/pages/staff-purchasing/reimbursement/list'
        });
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
  padding-bottom: 180rpx;
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

.fee-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;

  .fee-label {
    font-size: 28rpx;
    color: #333;
    width: 180rpx;
  }

  .fee-input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    background-color: #f5f5f5;
    border-radius: 12rpx;
    padding: 0 24rpx;
    height: 80rpx;

    .currency {
      font-size: 28rpx;
      color: #333;
      margin-right: 8rpx;
    }

    .fee-input {
      flex: 1;
      font-size: 28rpx;
      color: #333;
    }
  }
}

.fees-row {
  display: flex;
  gap: 24rpx;
  margin-bottom: 32rpx;
}

.fee-item-half {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;

  .fee-label {
    font-size: 26rpx;
    color: #666;
  }

  .fee-input-wrapper {
    display: flex;
    align-items: center;
    background-color: #f5f5f5;
    border-radius: 12rpx;
    padding: 0 20rpx;
    height: 80rpx;

    .currency {
      font-size: 28rpx;
      color: #333;
      margin-right: 8rpx;
    }

    .fee-input {
      flex: 1;
      font-size: 28rpx;
      color: #333;
    }
  }
}

.custom-fees {
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #f0f0f0;

  .custom-fee-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;

    .custom-fee-title {
      font-size: 28rpx;
      font-weight: bold;
      color: #333;
    }

    .add-custom-fee-btn {
      padding: 8rpx 16rpx;
      background-color: #51cf66;
      color: #fff;
      border-radius: 8rpx;
      font-size: 24rpx;
    }
  }

  .empty-custom-fees {
    padding: 32rpx;
    text-align: center;
    color: #999;
    font-size: 24rpx;
    background-color: #f9f9f9;
    border-radius: 12rpx;
  }

  .custom-fee-list {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }

  .custom-fee-item {
    background-color: #f9f9f9;
    border-radius: 12rpx;
    padding: 16rpx;

    .custom-fee-content {
      display: flex;
      align-items: center;
      gap: 12rpx;

      .custom-fee-inputs {
        flex: 1;
        display: flex;
        gap: 12rpx;

        .custom-fee-desc {
          flex: 1;
          padding: 12rpx 16rpx;
          background-color: #fff;
          border-radius: 8rpx;
          font-size: 26rpx;
        }

        .custom-fee-amount-wrapper {
          display: flex;
          align-items: center;
          background-color: #fff;
          border-radius: 8rpx;
          padding: 0 16rpx;
          width: 180rpx;

          .currency {
            font-size: 24rpx;
            color: #333;
            margin-right: 4rpx;
          }

          .custom-fee-amount {
            flex: 1;
            font-size: 26rpx;
          }
        }
      }

      .delete-custom-fee-btn {
        padding: 12rpx 16rpx;
        background-color: #ff6b6b;
        color: #fff;
        border-radius: 8rpx;
        font-size: 24rpx;
        white-space: nowrap;
      }
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
    background-color: #f5f5f5;
  }

  .debug-url {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 18rpx;
    padding: 8rpx;
    border-radius: 0 0 12rpx 12rpx;
    word-break: break-all;
    text-align: center;
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

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 24rpx 32rpx;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
  z-index: 100;

  .total-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16rpx 0;
    margin-bottom: 16rpx;

    .total-label {
      font-size: 28rpx;
      color: #666;
    }

    .total-amount {
      font-size: 36rpx;
      font-weight: bold;
      color: #ff6b6b;
    }
  }

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
