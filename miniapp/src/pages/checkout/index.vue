<template>
  <view class="checkout-page">
    <!-- 收货地址 -->
    <view class="section address-section" @tap="goToAddressList">
      <view class="section-title">
        <text class="title-icon">📍</text>
        <text class="title-text">收货地址</text>
      </view>

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

    <!-- 商品明细 -->
    <view class="section items-section">
      <view class="section-title">
        <text class="title-icon">📦</text>
        <text class="title-text">商品明细</text>
      </view>

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

        <view
          v-for="item in group.items"
          :key="item.id"
          class="checkout-item"
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

            <!-- 规格说明 -->
            <view class="item-spec">
              <text>{{ item.cycleDays }}天 × {{ item.dailyIntakeG }}g/天 = {{ item.totalGrams }}g</text>
            </view>

            <!-- 分装方案 -->
            <view class="package-info">
              <text class="package-text">{{ item.packageCount }}包 × {{ item.packageSpecG }}g @ ¥{{ item.unitPrice.toFixed(2) }}/包</text>
            </view>

            <!-- 小计 -->
            <view class="item-price">
              <text>小计: ¥{{ item.totalPrice.toFixed(2) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 价格汇总 -->
    <view class="section price-section">
      <view class="section-title">
        <text class="title-icon">💰</text>
        <text class="title-text">价格汇总</text>
      </view>

      <view class="price-summary">
        <view class="summary-row">
          <text class="label">商品金额（{{ cartItems.length }}件）:</text>
          <text class="value">¥{{ totalProductAmount.toFixed(2) }}</text>
        </view>
        <view class="summary-row">
          <text class="label">运费:</text>
          <text class="value">¥{{ estimatedShippingFee.toFixed(2) }}</text>
        </view>
        <view class="summary-row total">
          <text class="label">合计:</text>
          <text class="value highlight">¥{{ totalAmount.toFixed(2) }}</text>
        </view>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="bottom-bar">
      <view class="total-info">
        <text class="total-label">合计:</text>
        <text class="total-value">¥{{ totalAmount.toFixed(2) }}</text>
      </view>
      <button
        class="btn-submit"
        :disabled="!selectedAddress"
        @tap="submitOrder"
      >
        提交订单
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

// 汇总金额
const totalProductAmount = computed(() => {
  return cartItems.value.reduce((sum, item) => sum + item.totalPrice, 0)
})

const estimatedShippingFee = computed(() => {
  return 33.00
})

const totalAmount = computed(() => {
  return totalProductAmount.value + estimatedShippingFee.value
})

onMounted(() => {
  loadCart()
  loadDefaultAddress()
})

async function loadCart() {
  try {
    const res = await request({
      url: '/cart',
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      cartItems.value = res.data.items || []
    }
  } catch (error) {
    console.error('Load cart error:', error)
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

async function submitOrder() {
  if (!selectedAddress.value) {
    uni.showToast({
      title: '请先选择收货地址',
      icon: 'none'
    })
    return
  }

  if (cartItems.value.length === 0) {
    uni.showToast({
      title: '购物车为空',
      icon: 'none'
    })
    return
  }

  try {
    uni.showLoading({ title: '提交订单...' })

    const res = await request({
      url: '/orders',
      method: 'POST',
      data: {
        type: 'FRESH_FOOD',
        addressId: selectedAddress.value.id,
        cartItemIds: cartItems.value.map(item => item.id)
      }
    })

    if (res.code === 0 && res.data) {
      uni.showToast({
        title: '订单创建成功',
        icon: 'success'
      })

      // 跳转到订单详情
      setTimeout(() => {
        uni.redirectTo({
          url: `/pages/order-detail/index?orderId=${res.data.id}`
        })
      }, 1500)
    }
  } catch (error) {
    uni.showToast({
      title: '提交失败',
      icon: 'none'
    })
  } finally {
    uni.hideLoading()
  }
}

function goToAddressList() {
  uni.navigateTo({
    url: '/pages/address-list/index?mode=select'
  })
}
</script>

<style scoped>
.checkout-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
}

.section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.title-icon {
  font-size: 32rpx;
}

/* 收货地址 */
.address-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
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
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #999;
}

.arrow {
  font-size: 32rpx;
  color: #999;
  margin-left: 20rpx;
}

/* 商品明细 */
.dog-group {
  margin-bottom: 24rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.dog-group:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.dog-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.dog-icon {
  font-size: 28rpx;
}

.dog-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.dog-detail {
  font-size: 24rpx;
  color: #999;
}

.checkout-item {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  padding: 16rpx 0;
}

.recipe-cover {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
}

.recipe-cover-placeholder {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.placeholder-text {
  font-size: 48rpx;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.recipe-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
}

.item-spec {
  font-size: 24rpx;
  color: #999;
}

.package-info {
  padding: 6rpx 10rpx;
  background-color: #fff7e6;
  border-radius: 4rpx;
  border-left: 2rpx solid #ff9800;
}

.package-text {
  font-size: 22rpx;
  color: #ff9800;
}

.item-price {
  font-size: 24rpx;
  color: #ff4d4f;
  font-weight: 500;
}

/* 价格汇总 */
.price-summary {
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
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
  border-top: 1rpx solid #e8e8e8;
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
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
}

.total-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.total-label {
  font-size: 24rpx;
  color: #666;
}

.total-value {
  font-size: 36rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.btn-submit {
  width: 300rpx;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  border: none;
  text-align: center;
}

.btn-submit[disabled] {
  background-color: #ccc;
  color: #999;
}
</style>
