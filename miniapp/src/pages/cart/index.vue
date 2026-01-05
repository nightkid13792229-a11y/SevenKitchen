<template>
  <view class="cart-page">
    <!-- 空购物车 -->
    <view v-if="cartItems.length === 0" class="empty-cart">
      <text class="empty-icon">🛒</text>
      <text class="empty-text">购物车是空的</text>
      <text class="empty-desc">快去给毛孩子选点美味鲜食吧~</text>
      <button class="btn-go-shopping" @tap="goShopping">去逛逛</button>
    </view>

    <!-- 购物车列表 -->
    <view v-else class="cart-content">
      <!-- 按狗狗分组 -->
      <view
        v-for="group in groupedItems"
        :key="group.dogId"
        class="dog-group"
      >
        <view class="dog-header">
          <text class="dog-icon">🐶</text>
          <text class="dog-name">{{ group.dogName }}</text>
          <text class="dog-detail">{{ group.dogBreedName }} | {{ group.dogWeightKg }}kg</text>
        </view>

        <!-- 该狗狗的商品列表 -->
        <view
          v-for="item in group.items"
          :key="item.id"
          class="cart-item"
          :class="{ 'invalid-item': !item.isValid }"
        >
          <!-- 勾选框 -->
          <view class="checkbox-wrapper" v-if="item.isValid">
            <checkbox
              :checked="item.selected"
              @tap="toggleSelect(item.id)"
              color="#1890ff"
            />
          </view>

          <image
            v-if="item.recipeCoverImage"
            :src="item.recipeCoverImage"
            class="recipe-cover"
            mode="aspectFill"
          />
          <view v-else class="recipe-cover-placeholder">
            <text class="placeholder-text">{{ item.recipeName?.charAt(0) }}</text>
          </view>

          <view class="item-info">
            <text class="recipe-name">{{ item.recipeName }}</text>

            <!-- 失效标记 -->
            <view v-if="!item.isValid" class="invalid-badge">
              <text>⚠️ {{ getInvalidReasonText(item.invalidReason) }}</text>
            </view>

            <!-- 规格说明 -->
            <view v-if="item.isValid" class="item-spec">
              <text>{{ item.packageCount }}餐 × {{ Math.round(item.packageSpecG) }}g/餐</text>
            </view>

            <!-- 小计 -->
            <view v-if="item.isValid" class="item-price">
              <text class="price-label">小计:</text>
              <text class="price-value">¥{{ Math.round(item.totalPrice) }}</text>
            </view>
          </view>

          <!-- 删除按钮 -->
          <view class="item-actions">
            <button class="btn-delete" @tap="deleteItem(item.id)">✕</button>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view v-if="cartItems.length > 0" class="bottom-bar">
      <view class="total-info">
        <text class="total-label">总计:</text>
        <text class="total-value">¥{{ Math.round(selectedTotalAmount) }}</text>
      </view>
      <button
        class="btn-checkout"
        :disabled="selectedValidItemsCount === 0"
        @tap="goToCheckout"
      >
        去结算({{ selectedValidItemsCount }})
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'

interface CartItem {
  id: string
  dogId: string
  dogName: string
  dogBreedName?: string
  dogWeightKg?: number
  recipeId: string
  recipeName: string
  recipeCoverImage?: string
  cycleDays: number
  dailyIntakeG: number
  totalGrams: number
  packageCount: number
  packageSpecG: number
  unitPrice: number
  totalPrice: number
  isValid: boolean  // 商品是否有效
  invalidReason?: string  // 失效原因
  selected: boolean // 是否勾选
}

const cartItems = ref<CartItem[]>([])

// 按狗狗分组
const groupedItems = computed(() => {
  const groups = new Map()

  cartItems.value.forEach(item => {
    if (!groups.has(item.dogId)) {
      groups.set(item.dogId, {
        dogId: item.dogId,
        dogName: item.dogName,
        dogBreedName: item.dogBreedName,
        dogWeightKg: item.dogWeightKg,
        items: []
      })
    }
    groups.get(item.dogId).items.push(item)
  })

  return Array.from(groups.values())
})

// 汇总金额（只计算有效商品）
const totalProductAmount = computed(() => {
  return cartItems.value
    .filter(item => item.isValid)
    .reduce((sum, item) => sum + item.totalPrice, 0)
})

// 有效商品数量
const validItemsCount = computed(() => {
  return cartItems.value.filter(item => item.isValid).length
})

// 已勾选的有效商品数量
const selectedValidItemsCount = computed(() => {
  return cartItems.value.filter(item => item.isValid && item.selected).length
})

// 已勾选商品的总金额
const selectedTotalAmount = computed(() => {
  return cartItems.value
    .filter(item => item.isValid && item.selected)
    .reduce((sum, item) => sum + item.totalPrice, 0)
})

// 切换商品的勾选状态
function toggleSelect(itemId: string) {
  const item = cartItems.value.find(i => i.id === itemId)
  if (item) {
    item.selected = !item.selected
  }
}

// 获取失效原因的文本
function getInvalidReasonText(reason?: string): string {
  const reasonMap: Record<string, string> = {
    'recipe_deleted': '该食谱已下架',
    'dog_deleted': '该狗狗档案已删除',
    'data_incomplete': '商品数据不完整'
  }
  return reasonMap[reason || ''] || '该商品已失效'
}

onMounted(() => {
  loadCart()
})

onShow(() => {
  // 每次页面显示时刷新购物车数据
  loadCart()
})

async function loadCart() {
  try {
    uni.showLoading({ title: '加载中...' })

    const res = await request({
      url: '/cart',
      method: 'GET'
    })

    console.log('[Cart] API Response:', res)
    console.log('[Cart] Items:', res.data?.items)

    if (res.code === 0 && res.data) {
      // 为所有有效商品设置默认勾选状态
      const items = res.data.items || []
      cartItems.value = items.map(item => ({
        ...item,
        selected: item.isValid // 有效商品默认勾选
      }))
      console.log('[Cart] Loaded cart items count:', cartItems.value.length)
      console.log('[Cart] Cart items:', cartItems.value)
    } else {
      console.error('[Cart] API returned error:', res)
    }
  } catch (error) {
    console.error('Load cart error:', error)
    // 暂时使用本地数据模拟
    cartItems.value = []
  } finally {
    uni.hideLoading()
  }
}

async function deleteItem(itemId: string) {
  const confirmed = await showConfirmDialog({
    title: '确认删除',
    content: '确定要删除这个商品吗？'
  })

  if (!confirmed) return

  try {
    uni.showLoading({ title: '删除中...' })

    await request({
      url: `/cart/items/${itemId}`,
      method: 'DELETE'
    })

    uni.showToast({
      title: '已删除',
      icon: 'success'
    })

    loadCart()
  } catch (error) {
    uni.showToast({
      title: '删除失败',
      icon: 'none'
    })
  } finally {
    uni.hideLoading()
  }
}

function showConfirmDialog(options: { title: string; content: string }): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: options.title,
      content: options.content,
      success: (res) => {
        resolve(res.confirm)
      },
      fail: () => {
        resolve(false)
      }
    })
  })
}

function goToCheckout() {
  uni.navigateTo({
    url: '/pages/checkout/index'
  })
}

function goShopping() {
  uni.switchTab({
    url: '/pages/home/index'
  })
}
</script>

<style scoped>
.cart-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 240rpx; /* 增加底部padding以适配tabBar (140 + 100) */
}

/* 空购物车 */
.empty-cart {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 200rpx;
}

.empty-icon {
  font-size: 160rpx;
  margin-bottom: 40rpx;
}

.empty-text {
  font-size: 32rpx;
  color: #333;
  margin-bottom: 16rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 60rpx;
}

.btn-go-shopping {
  width: 240rpx;
  height: 70rpx;
  line-height: 70rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 35rpx;
  font-size: 28rpx;
  border: none;
}

/* 购物车内容 */
.cart-content {
  padding: 20rpx;
}

/* 狗狗分组 */
.dog-group {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.dog-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.dog-icon {
  font-size: 32rpx;
}

.dog-name {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.dog-detail {
  font-size: 24rpx;
  color: #999;
}

/* 购物车项 */
.cart-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.cart-item:last-child {
  border-bottom: none;
}

/* 勾选框 */
.checkbox-wrapper {
  flex-shrink: 0;
  padding-right: 10rpx;
}

/* 失效商品样式 */
.cart-item.invalid-item {
  opacity: 0.6;
  background-color: #fafafa;
}

.invalid-badge {
  display: inline-block;
  padding: 4rpx 12rpx;
  background-color: #fff3cd;
  border-radius: 4rpx;
  margin-top: 8rpx;
}

.invalid-badge text {
  font-size: 22rpx;
  color: #856404;
}

.recipe-cover {
  width: 140rpx;
  height: 140rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
}

.recipe-cover-placeholder {
  width: 140rpx;
  height: 140rpx;
  border-radius: 12rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.placeholder-text {
  font-size: 60rpx;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.recipe-name {
  font-size: 30rpx;
  font-weight: 500;
  color: #333;
}

.item-spec {
  font-size: 24rpx;
  color: #999;
}

.item-price {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8rpx;
}

.price-label {
  font-size: 26rpx;
  color: #666;
}

.price-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.item-actions {
  flex-shrink: 0;
}

.btn-delete {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  border-radius: 50%;
  font-size: 32rpx;
  color: #999;
  border: none;
}

/* 底部操作栏 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
  z-index: 100;
}

.total-info {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 1;
}

.total-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.total-value {
  font-size: 40rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.btn-checkout {
  min-width: 200rpx;
  height: 88rpx;
  line-height: 88rpx;
  padding: 0 40rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 44rpx;
  font-size: 28rpx;
  font-weight: bold;
  border: none;
  text-align: center;
}

.btn-checkout[disabled] {
  background-color: #ccc;
  color: #999;
}
</style>
