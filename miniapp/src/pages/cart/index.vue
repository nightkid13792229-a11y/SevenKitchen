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
              <text>{{ item.cycleDays }}天 × {{ Math.round(item.dailyIntakeG) }}g/天 = {{ Math.round(item.totalGrams) }}g</text>
            </view>

            <!-- 分装方案（重点展示）-->
            <view v-if="item.isValid" class="package-info highlight">
              <text class="package-text">{{ item.packageCount }}包 × {{ Math.round(item.packageSpecG) }}g/包</text>
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

      <!-- 收货地址 -->
      <view class="address-section" @tap="goToAddressList">
        <view class="section-title">📍 收货地址</view>
        <view v-if="selectedAddress" class="address-card">
          <view class="address-info">
            <text class="recipient">{{ selectedAddress.recipientName }} {{ selectedAddress.phone }}</text>
            <text class="detail">{{ selectedAddress.regionText }} {{ selectedAddress.detailAddress }}</text>
          </view>
          <text class="arrow">→</text>
        </view>
        <view v-else class="no-address">
          <text>请选择收货地址</text>
          <text class="arrow">→</text>
        </view>
      </view>

      <!-- 价格汇总 -->
      <view class="price-summary">
        <view class="summary-row total">
          <text class="label">商品金额（{{ validItemsCount }}件）:</text>
          <text class="value highlight">¥{{ Math.round(totalProductAmount) }}</text>
        </view>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view v-if="cartItems.length > 0" class="bottom-bar">
      <button class="btn-continue" @tap="goShopping">继续购物</button>
      <button
        class="btn-checkout"
        :disabled="!selectedAddress || validItemsCount === 0"
        @tap="goToCheckout"
      >
        去结算({{ validItemsCount }})
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
}

interface Address {
  id: string
  recipientName: string
  phone: string
  regionText: string
  detailAddress: string
}

const cartItems = ref<CartItem[]>([])
const selectedAddress = ref<Address | null>(null)

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

const estimatedShippingFee = computed(() => {
  // 调用运费计算API（简化为固定值）
  return 33.00
})

const totalAmount = computed(() => {
  return totalProductAmount.value + estimatedShippingFee.value
})

// 有效商品数量
const validItemsCount = computed(() => {
  return cartItems.value.filter(item => item.isValid).length
})

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
  loadDefaultAddress()
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
      cartItems.value = res.data.items || []
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

async function loadDefaultAddress() {
  try {
    const res = await request({
      url: '/addresses',
      method: 'GET'
    })

    if (res.code === 0 && res.data && res.data.length > 0) {
      const defaultAddr = res.data.find((addr: any) => addr.isDefault) || res.data[0]
      if (defaultAddr) {
        selectedAddress.value = {
          id: defaultAddr.id,
          recipientName: defaultAddr.recipientName,
          phone: defaultAddr.phone,
          regionText: formatRegionText(defaultAddr.region),
          detailAddress: defaultAddr.detailAddress
        }
      }
    }
  } catch (error) {
    console.error('Load address error:', error)
  }
}

function formatRegionText(region: any): string {
  if (!region) return ''
  if (typeof region === 'string') return region

  const parts = [region.province, region.city, region.district].filter(Boolean)
  return parts.join('')
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
  if (!selectedAddress.value) {
    uni.showToast({
      title: '请先选择收货地址',
      icon: 'none'
    })
    return
  }

  uni.navigateTo({
    url: '/pages/checkout/index'
  })
}

function goToAddressList() {
  uni.navigateTo({
    url: '/pages/address-list/index?mode=select'
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

.package-info {
  padding: 8rpx 12rpx;
  background-color: #f0f9ff;
  border-radius: 6rpx;
  border-left: 3rpx solid #1890ff;
}

.package-info.highlight {
  border-left-color: #ff9800;
  background-color: #fff7e6;
}

.package-text {
  font-size: 24rpx;
  color: #1890ff;
}

.package-info.highlight .package-text {
  color: #ff9800;
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

/* 收货地址 */
.address-section {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.address-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.address-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.recipient {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.detail {
  font-size: 26rpx;
  color: #666;
}

.no-address {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 28rpx;
  color: #999;
}

.arrow {
  font-size: 32rpx;
  color: #999;
  margin-left: 20rpx;
}

/* 价格汇总 */
.price-summary {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16rpx;
  font-size: 28rpx;
}

.summary-row:last-child {
  margin-bottom: 0;
}

.summary-row.total {
  padding-top: 16rpx;
  font-size: 32rpx;
  font-weight: bold;
  border-top: 1rpx solid #f0f0f0;
}

.label {
  color: #666;
}

.value {
  color: #333;
}

.value.highlight {
  color: #ff4d4f;
  font-size: 36rpx;
}

/* 底部操作栏 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 16rpx;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
}

.btn-continue,
.btn-checkout {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
  text-align: center;
}

.btn-continue {
  background-color: #f5f5f5;
  color: #333;
}

.btn-checkout {
  background-color: #1890ff;
  color: #fff;
}

.btn-checkout[disabled] {
  background-color: #ccc;
  color: #999;
}
</style>
