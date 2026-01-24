<template>
  <view class="batch-guide-page">
    <!-- 顶部标题 -->
    <view class="header">
      <view class="back-btn" @tap="goBack">
        <text>←</text>
      </view>
      <text class="title">批量制作单</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 制作单内容 -->
    <view v-else-if="guideData" class="guide-content">
      <!-- 顶部信息 -->
      <view class="guide-header">
        <text class="production-date">生产日期：{{ guideData.productionDate }}</text>
        <text class="total-info">共{{ guideData.totalBatches }}个批次，{{ guideData.recipes.length }}个食谱</text>
      </view>

      <!-- 按食谱分组 -->
      <view v-for="recipe in guideData.recipes" :key="recipe.recipeId" class="recipe-section">
        <view class="recipe-header">
          <text class="recipe-name">{{ recipe.recipeName }} v{{ recipe.recipeVersion }}</text>
          <view class="recipe-stats">
            <text class="stat">{{ recipe.totalPots }}锅</text>
            <text class="stat">{{ formatDecimal(recipe.totalProductionG) }}g</text>
          </view>
        </view>

        <!-- 按锅分组 -->
        <view v-for="unit in recipe.packagingUnits" :key="unit.unitId" class="pot-section">
          <view class="pot-header">
            <text class="pot-title">第{{ unit.potNumber }}锅 / 共{{ unit.totalPots }}锅</text>
            <text class="pot-weight">{{ formatDecimal(unit.totalProductionG) }}g</text>
          </view>

          <!-- 订单列表 -->
          <view class="orders-list">
            <view class="list-title">分装订单（{{ unit.orderItems.length }}个）</view>
            <view v-for="order in unit.orderItems" :key="order.orderItemId" class="order-item">
              <view class="order-row">
                <text class="order-label">狗狗：</text>
                <text class="order-value">{{ order.dogName }}</text>
              </view>
              <view class="order-row">
                <text class="order-label">规格：</text>
                <text class="order-value">{{ order.packageSpecG }}g/袋 × {{ order.packageCount }}袋</text>
              </view>
            </view>
          </view>

          <!-- 原料清单 -->
          <view v-if="unit.ingredientsUsage && unit.ingredientsUsage.length > 0" class="ingredients-section">
            <view class="list-title">原料清单</view>
            <view v-for="(ingredient, index) in unit.ingredientsUsage" :key="index" class="ingredient-item">
              <text class="ingredient-name">{{ ingredient.name }}</text>
              <text class="ingredient-amount">{{ formatDecimal(ingredient.amount) }}{{ ingredient.unit }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作按钮 -->
    <view class="bottom-actions">
      <button class="action-btn primary" @tap="printGuide">打印制作单</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { formatDecimal } from '../../utils/format';

const loading = ref(true);
const guideData = ref<any>(null);

onLoad((options: any) => {
  if (options.data) {
    try {
      guideData.value = JSON.parse(decodeURIComponent(options.data));
      loading.value = false;
    } catch (error) {
      console.error('Failed to parse guide data:', error);
      uni.showToast({
        title: '数据加载失败',
        icon: 'none',
      });
    }
  }
});

const goBack = () => {
  uni.navigateBack();
};

const printGuide = () => {
  // 制作单已经在页面上了，用户可以直接查看
  // 这里可以添加打印功能，但目前先提示用户已显示
  uni.showModal({
    title: '提示',
    content: '制作单已完整显示在当前页面，您可以直接查看所有批次的生产信息。如需打印，请截图保存或连接打印机。',
    showCancel: false,
    confirmText: '知道了',
  });
};
</script>

<style scoped lang="scss">
.batch-guide-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx;
}

.header {
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
  padding: 40rpx 32rpx;
  display: flex;
  align-items: center;
  position: relative;

  .back-btn {
    position: absolute;
    left: 32rpx;
    font-size: 44rpx;
    color: #fff;
    font-weight: bold;
    cursor: pointer;
  }

  .title {
    display: block;
    width: 100%;
    text-align: center;
    font-size: 44rpx;
    font-weight: bold;
    color: #fff;
  }
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 120rpx 0;
  font-size: 32rpx;
  color: #666;
}

.guide-content {
  padding: 32rpx;
}

.guide-header {
  background-color: #fff;
  padding: 32rpx;
  border-radius: 16rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 16rpx;

  .production-date {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
  }

  .total-info {
    font-size: 26rpx;
    color: #666;
  }
}

.recipe-section {
  background-color: #fff;
  border-radius: 16rpx;
  margin-bottom: 24rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.recipe-header {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  padding: 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .recipe-name {
    font-size: 32rpx;
    font-weight: bold;
    color: #1976d2;
  }

  .recipe-stats {
    display: flex;
    gap: 24rpx;

    .stat {
      font-size: 24rpx;
      color: #1976d2;
      background-color: rgba(255, 255, 255, 0.8);
      padding: 8rpx 16rpx;
      border-radius: 12rpx;
    }
  }
}

.pot-section {
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }
}

.pot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;

  .pot-title {
    font-size: 28rpx;
    font-weight: bold;
    color: #333;
  }

  .pot-weight {
    font-size: 26rpx;
    color: #2196f3;
    background-color: #e3f2fd;
    padding: 8rpx 16rpx;
    border-radius: 8rpx;
  }
}

.list-title {
  font-size: 26rpx;
  font-weight: bold;
  color: #666;
  margin-bottom: 16rpx;
}

.orders-list {
  margin-bottom: 24rpx;
}

.order-item {
  background-color: #f9f9f9;
  padding: 24rpx;
  border-radius: 12rpx;
  margin-bottom: 16rpx;

  &:last-child {
    margin-bottom: 0;
  }
}

.order-row {
  display: flex;
  margin-bottom: 12rpx;

  &:last-child {
    margin-bottom: 0;
  }

  .order-label {
    font-size: 26rpx;
    color: #666;
    min-width: 120rpx;
  }

  .order-value {
    font-size: 26rpx;
    color: #333;
    flex: 1;
  }
}

.ingredients-section {
  margin-top: 24rpx;
}

.ingredient-item {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }

  .ingredient-name {
    font-size: 26rpx;
    color: #333;
  }

  .ingredient-amount {
    font-size: 26rpx;
    color: #2196f3;
    font-weight: bold;
  }
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 24rpx 32rpx;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.04);
  display: flex;
  gap: 16rpx;
}

.action-btn {
  flex: 1;
  border: none;
  border-radius: 12rpx;
  padding: 28rpx;
  font-size: 32rpx;
  font-weight: bold;

  &.primary {
    background-color: #2196f3;
    color: #fff;
  }
}
</style>
