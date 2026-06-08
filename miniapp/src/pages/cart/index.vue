<template>
  <view class="cart-page">
    <view class="cart-header">
      <view>
        <text class="cart-title"
          >购物车{{
            cartItems.length > 0 ? `（${cartItems.length}）` : ''
          }}</text
        >
        <text class="cart-subtitle">先保存想买的食谱，确认后再配置下单</text>
      </view>
      <button
        v-if="cartItems.length > 0"
        class="clear-btn button-reset"
        @tap="confirmClear"
      >
        清空
      </button>
    </view>

    <view v-if="cartItems.length === 0" class="empty-state">
      <text class="empty-title">购物车还是空的</text>
      <text class="empty-desc">去首页选择食谱，加入购物车后可以集中查看。</text>
      <button class="primary-btn button-reset" @tap="goHome">去选食谱</button>
    </view>

    <view v-else class="cart-list">
      <view
        v-for="item in cartItems"
        :key="item.recipeId"
        class="cart-item"
        @tap="viewRecipe(item.recipeId)"
      >
        <image
          v-if="item.coverImageUrl"
          class="item-cover"
          :src="item.coverImageUrl"
          mode="aspectFill"
        />
        <view v-else class="item-cover placeholder">
          <text>{{ item.name.charAt(0) }}</text>
        </view>

        <view class="item-main">
          <text class="item-name">{{ item.name }}</text>
          <text v-if="item.description" class="item-desc">{{
            item.description
          }}</text>
          <text v-if="item.energyDensityKcalPerKg" class="item-meta">
            能量密度 {{ item.energyDensityKcalPerKg }} kcal/kg
          </text>
        </view>

        <view class="item-actions" @tap.stop>
          <button class="buy-btn button-reset" @tap="buyItem(item.recipeId)">
            去配置
          </button>
          <button
            class="remove-btn button-reset"
            @tap="removeItem(item.recipeId)"
          >
            移除
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  clearCartItems,
  getCartItems,
  removeCartItem,
  type CartItem,
} from '../../utils/cart';
import { ensurePhoneBound } from '../../utils/account';

const cartItems = ref<CartItem[]>([]);

function loadCart() {
  cartItems.value = getCartItems();
}

function goHome() {
  uni.switchTab({
    url: '/pages/home/index',
  });
}

function viewRecipe(recipeId: string) {
  uni.navigateTo({
    url: `/pages/recipe-detail/index?recipeId=${encodeURIComponent(recipeId)}`,
  });
}

async function buyItem(recipeId: string) {
  if (!(await ensurePhoneBound())) {
    return;
  }
  uni.navigateTo({
    url: `/pages/recipe-order/index?recipeId=${encodeURIComponent(recipeId)}`,
  });
}

function removeItem(recipeId: string) {
  cartItems.value = removeCartItem(recipeId);
  uni.showToast({
    title: '已移除',
    icon: 'success',
  });
}

function confirmClear() {
  uni.showModal({
    title: '清空购物车',
    content: '确定要移除购物车里的所有食谱吗？',
    success: (res) => {
      if (!res.confirm) return;
      clearCartItems();
      loadCart();
      uni.showToast({
        title: '已清空',
        icon: 'success',
      });
    },
  });
}

onShow(loadCart);
</script>

<style scoped>
.cart-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f6f7f9;
  box-sizing: border-box;
}

.cart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}

.cart-title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #1f2933;
}

.cart-subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #7b8794;
}

.button-reset {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
  border: none;
  line-height: 1;
}

.button-reset::after {
  border: none;
}

.clear-btn {
  width: 112rpx;
  height: 56rpx;
  border-radius: 28rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #e53e3e;
  background: #fff5f5;
}

.empty-state {
  width: 100%;
  margin-top: 150rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.empty-title {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #1f2933;
  line-height: 1.35;
}

.empty-desc {
  display: block;
  width: 460rpx;
  margin-top: 16rpx;
  font-size: 26rpx;
  line-height: 1.55;
  color: #7b8794;
  word-break: break-all;
}

.primary-btn {
  width: 292rpx;
  height: 76rpx;
  margin-top: 40rpx;
  border-radius: 38rpx;
  background: #07c160;
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}

.cart-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.cart-item {
  display: flex;
  gap: 20rpx;
  padding: 20rpx;
  background: #fff;
  border-radius: 16rpx;
}

.item-cover {
  width: 144rpx;
  height: 144rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
  background: #edf2f7;
}

.item-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  font-weight: 700;
  color: #718096;
}

.item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.item-name {
  font-size: 30rpx;
  font-weight: 700;
  color: #1f2933;
  word-break: break-all;
}

.item-desc {
  font-size: 24rpx;
  color: #7b8794;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-meta {
  font-size: 24rpx;
  color: #4a5568;
}

.item-actions {
  width: 132rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16rpx;
  flex-shrink: 0;
}

.buy-btn,
.remove-btn {
  width: 132rpx;
  height: 56rpx;
  border-radius: 28rpx;
  font-size: 24rpx;
  font-weight: 600;
}

.buy-btn {
  color: #fff;
  background: #1890ff;
}

.remove-btn {
  color: #7b8794;
  background: #f1f5f9;
}
</style>
