<template>
  <view class="container">
    <view class="order-form">
      <view class="form-section">
        <view class="section-title">订单配置</view>
        
        <view class="form-item">
          <text class="label">食谱ID</text>
          <text class="value">{{ recipeId }}</text>
        </view>

        <view class="form-item">
          <text class="label">狗狗ID</text>
          <text class="value">{{ dogId || '未选择' }}</text>
        </view>

        <view class="form-item">
          <text class="label">每日克数(g) *</text>
          <input class="input" type="digit" placeholder="请输入每日克数" v-model="dailyGrams" />
        </view>

        <view class="form-item">
          <text class="label">订购周期(天) *</text>
          <input class="input" type="number" placeholder="请输入周期天数" v-model="cycleDays" />
        </view>

        <view class="form-item">
          <text class="label">总重量(g)</text>
          <text class="value">{{ totalGrams }}g (只读，由后端计算)</text>
        </view>

        <view class="form-item">
          <text class="label">收货地址</text>
          <view class="address-selector" @tap="selectAddress">
            <text v-if="addressId">已选择地址</text>
            <text v-else class="placeholder">请选择地址</text>
          </view>
        </view>
      </view>

      <!-- Pricing Preview Section -->
      <view class="price-section" v-if="pricingPreview">
        <view class="price-item">
          <text class="price-label">商品金额:</text>
          <text class="price-value">¥{{ formatPrice(pricingPreview.amountProduct) }}</text>
        </view>
        <view class="price-item">
          <text class="price-label">运费:</text>
          <text class="price-value">¥{{ formatPrice(pricingPreview.amountShipping) }}</text>
        </view>
        <view class="price-item total">
          <text class="price-label">合计:</text>
          <text class="price-value">¥{{ formatPrice(pricingPreview.amountTotal) }}</text>
        </view>
      </view>
      
      <!-- Neutral hint when inputs don't meet minimum requirements -->
      <view v-if="pricingHint" class="pricing-hint">
        <text>{{ pricingHint }}</text>
      </view>
      
      <!-- Only show error for unexpected failures, not validation errors -->
      <view v-if="pricingError && !isValidationError" class="pricing-error">
        <text>{{ pricingError }}</text>
      </view>

      <button
        class="btn"
        @tap="createOrder"
        :disabled="orderCreated || isDemo || addressLoading"
      >
        {{ addressLoading ? '地址加载中...' : orderCreated ? '订单已创建' : isDemo ? 'Demo Mode: Order Creation Disabled' : '创建订单 -> 确认 -> 支付（测试）' }}
      </button>
      
      <!-- Demo Mode Modal -->
      <view v-if="showDemoModal" class="modal-overlay" @tap="closeDemoModal">
        <view class="modal-content" @tap.stop>
          <view class="modal-title">Backend has no real recipes yet</view>
          <view class="modal-body">
            <text>Demo mode cannot create a real order. The backend requires a real recipeId.</text>
          </view>
          <view class="modal-actions">
            <button class="modal-btn secondary" @tap="goToNetworkSettings">Go to Network Settings</button>
            <button class="modal-btn primary" @tap="backToRecipes">Back to Recipes</button>
          </view>
        </view>
      </view>

      <view class="result-section" v-if="orderCreated">
        <view class="result-title">订单创建成功</view>
        <view class="result-item">
          <text class="result-label">订单ID:</text>
          <text class="result-value">{{ orderId }}</text>
        </view>
        <view class="result-item">
          <text class="result-label">订单状态:</text>
          <text class="result-value">{{ orderStatus }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { request, normalizeToUuid } from '../../utils/api'

const recipeId = ref('')
const dogId = ref('')
const addressId = ref('')
const dailyGrams = ref('')
const cycleDays = ref('')
const orderId = ref<string | null>(null)
const orderStatus = ref<string | null>(null)
const orderCreated = ref(false)
const isDemo = ref(false)
const showDemoModal = ref(false)
const addressLoading = ref(true) // 新增：地址加载状态
const pricingPreview = ref<{
  amountProduct: number
  amountShipping: number
  amountTotal: number
} | null>(null)
const pricingError = ref<string | null>(null)
const pricingHint = ref<string | null>(null)
const isValidationError = ref(false)
let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Computed total grams (UI display only, backend will recalculate)
const totalGrams = computed(() => {
  const daily = parseFloat(dailyGrams.value) || 0
  const cycle = parseInt(cycleDays.value) || 0
  return Math.round(daily * cycle)
})

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  
  // Normalize recipeId from query params (may be string, array, or object)
  const rawRecipeId = currentPage.options?.recipeId || ''
  try {
    recipeId.value = normalizeToUuid(rawRecipeId, 'recipeId')
  } catch (err: any) {
    console.warn('[OrderConfig] Invalid recipeId from query:', rawRecipeId, err)
    recipeId.value = ''
  }
  
  // Normalize dogId
  const rawDogId = currentPage.options?.dogId || uni.getStorageSync('dogId') || ''
  try {
    dogId.value = normalizeToUuid(rawDogId, 'dogId')
  } catch (err: any) {
    console.warn('[OrderConfig] Invalid dogId:', rawDogId, err)
    dogId.value = ''
  }
  
  const demoParam = currentPage.options?.demo
  
  if (demoParam === '1' || demoParam === 'true') {
    isDemo.value = true
    console.info('[OrderConfig] demo mode -> real order disabled until backend has recipes')
  }
  
  // Load default address
  loadDefaultAddress()
  
  // Listen for address selection
  uni.$on('address-selected', (data: string | { addressId: string; from?: string }) => {
    // Handle both string and object formats for compatibility
    const selectedAddressId = typeof data === 'string' ? data : data?.addressId

    addressId.value = selectedAddressId
    // Reload pricing preview when address changes (debounced)
    if (previewDebounceTimer) {
      clearTimeout(previewDebounceTimer)
      previewDebounceTimer = null
    }
    previewDebounceTimer = setTimeout(() => {
      loadPricingPreview()
    }, 500)
  })
  
  // Initial pricing preview load will be triggered by watch
})

// Watch for changes to trigger pricing preview reload (debounced)
watch([dailyGrams, cycleDays, dogId, addressId, recipeId], () => {
  // Clear existing debounce timer
  if (previewDebounceTimer) {
    clearTimeout(previewDebounceTimer)
    previewDebounceTimer = null
  }
  
  // Debounce preview calls (500ms delay)
  previewDebounceTimer = setTimeout(() => {
    loadPricingPreview()
  }, 500)
})

function loadDefaultAddress() {
  addressLoading.value = true
  request({
    url: '/addresses',
    method: 'GET'
  }).then((res: any) => {
    if (res.code === 0 && res.data && res.data.length > 0) {
      const defaultAddr = res.data.find((addr: any) => addr.isDefault) || res.data[0]
      if (defaultAddr) {
        addressId.value = defaultAddr.id
        console.log('[OrderConfig] Default address loaded:', defaultAddr.id)
      } else {
        console.warn('[OrderConfig] No address found')
      }
    } else {
      console.warn('[OrderConfig] No addresses in response')
    }
  }).catch((err: any) => {
    console.error('[OrderConfig] Load address error:', err)
    uni.showToast({
      title: '地址加载失败',
      icon: 'none'
    })
  }).finally(() => {
    addressLoading.value = false
  })
}

function selectAddress() {
  uni.navigateTo({
    url: '/pages/address-list/index?mode=select'
  })
}

function formatPrice(price: number): string {
  return price.toFixed(2)
}

function loadPricingPreview() {
  // Clear previous state
  pricingError.value = null
  pricingHint.value = null
  isValidationError.value = false
  pricingPreview.value = null

  // Pre-flight guard: Check required fields
  if (!dogId.value || !recipeId.value || !dailyGrams.value || !cycleDays.value) {
    return
  }

  const totalGramsValue = totalGrams.value
  
  // Pre-flight guard: quantityG must be >= 1000
  if (totalGramsValue < 1000) {
    pricingHint.value = '未满足起订量，暂不显示价格预览'
    return
  }

  // Calculate package count and spec
  const packageSpecG = 100 // Default package spec
  
  // Pre-flight guard: packageSpecG must be > 0
  if (packageSpecG <= 0) {
    pricingHint.value = '未满足起订量，暂不显示价格预览'
    return
  }

  const packageCount = Math.ceil(totalGramsValue / packageSpecG)
  
  // Pre-flight guard: packageCount must be >= 1
  if (packageCount < 1) {
    pricingHint.value = '未满足起订量，暂不显示价格预览'
    return
  }

  const payload = {
    dogId: dogId.value,
    type: 'FRESH_FOOD',
    items: [{
      recipeId: recipeId.value,
      quantityG: totalGramsValue,
      packageCount: packageCount,
      packageSpecG: packageSpecG
    }],
    ...(addressId.value && { addressId: addressId.value })
  }

  request({
    url: '/orders/pricing/preview',
    method: 'POST',
    data: payload
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      pricingPreview.value = {
        amountProduct: res.data.amountProduct || 0,
        amountShipping: res.data.amountShipping || 0,
        amountTotal: res.data.amountTotal || 0
      }
    } else {
      // Non-zero code indicates validation or business logic error
      // Treat as expected user-input state, not system error
      isValidationError.value = true
      pricingPreview.value = null
      // Don't show error message for validation failures - just hide preview
    }
  }).catch((err: any) => {
    // Handle HTTP 400 (validation errors) gracefully
    const statusCode = err?.statusCode || err?.status || err?.response?.status
    if (statusCode === 400) {
      // Validation error - treat as expected user-input state
      isValidationError.value = true
      pricingPreview.value = null
      // No console.error for validation errors - they're expected
    } else {
      // Only log unexpected errors (5xx, network errors, etc.)
      console.warn('[OrderConfig] Pricing preview unexpected error:', {
        statusCode,
        message: err?.message || String(err)
      })
      pricingError.value = '获取价格失败，请稍后重试'
      pricingPreview.value = null
    }
  })
}

function createOrder() {
  // Block order creation in demo mode
  if (isDemo.value) {
    showDemoModal.value = true
    return
  }

  // 等待地址加载完成
  if (addressLoading.value) {
    uni.showToast({
      title: '地址加载中，请稍候...',
      icon: 'none'
    })
    return
  }

  if (!dogId.value) {
    uni.showModal({
      title: '提示',
      content: '请先创建狗狗档案',
      success: (res) => {
        if (res.confirm) {
          uni.navigateTo({
            url: `/pages/dog-create/index?redirect=order&recipeId=${recipeId.value}`
          })
        }
      }
    })
    return
  }

  if (!addressId.value) {
    uni.showModal({
      title: '提示',
      content: '请先添加收货地址',
      success: (res) => {
        if (res.confirm) {
          uni.navigateTo({
            url: '/pages/address-edit/index'
          })
        }
      }
    })
    return
  }

  if (!dailyGrams.value || !cycleDays.value) {
    uni.showToast({
      title: '请填写完整信息',
      icon: 'none'
    })
    return
  }

  // Normalize and validate UUID fields before sending
  let normalizedRecipeId: string
  let normalizedDogId: string
  let normalizedAddressId: string | undefined

  try {
    normalizedRecipeId = normalizeToUuid(recipeId.value, 'recipeId')
  } catch (err: any) {
    uni.showModal({
      title: '错误',
      content: 'Invalid recipeId. Please re-enter the flow from Recipe Detail.',
      showCancel: false
    })
    return
  }

  try {
    normalizedDogId = normalizeToUuid(dogId.value, 'dogId')
  } catch (err: any) {
    uni.showModal({
      title: '错误',
      content: 'Invalid dogId. Please create a dog profile first.',
      showCancel: false
    })
    return
  }

  if (addressId.value) {
    try {
      normalizedAddressId = normalizeToUuid(addressId.value, 'addressId')
    } catch (err: any) {
      console.warn('[OrderConfig] Invalid addressId, proceeding without it:', err)
      normalizedAddressId = undefined
    }
  }

  // Calculate package count and spec (simplified for MVP)
  // In production, this would come from backend or user selection
  const totalGramsValue = totalGrams.value
  const packageSpecG = 100 // Default package spec
  const packageCount = Math.ceil(totalGramsValue / packageSpecG)

  uni.showLoading({ title: '创建订单中...' })

  const payload = {
    dogId: normalizedDogId,
    type: 'FRESH_FOOD',
    items: [{
      recipeId: normalizedRecipeId,
      quantityG: totalGramsValue,
      packageCount: packageCount,
      packageSpecG: packageSpecG
    }],
    ...(normalizedAddressId && { addressId: normalizedAddressId })
  } as any

  // Log payload before sending
  console.log('[OrderCreate] payload =', JSON.stringify(payload, null, 2))

  // Create order draft
  request({
    url: '/orders',
    method: 'POST',
    data: payload
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      orderId.value = res.data.id

      // Confirm order
      return request({
        url: `/orders/${orderId.value}/confirm`,
        method: 'POST'
      })
    } else {
      throw new Error(res.message || '创建订单失败')
    }
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      // Pay order (mock)
      return request({
        url: `/orders/${orderId.value}/pay`,
        method: 'POST'
      })
    }
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      orderStatus.value = res.data.status
      orderCreated.value = true
      uni.showToast({
        title: '订单创建成功',
        icon: 'success',
        duration: 2000
      })
      
      // Navigate to orders list after a short delay
      setTimeout(() => {
        uni.navigateTo({
          url: '/pages/orders-list/index'
        })
      }, 2000)
    }
  }).catch((err: any) => {
    console.error('Create order error:', err)
    const errorMsg = err?.message || String(err) || '订单创建失败'
    uni.showToast({
      title: errorMsg,
      icon: 'none',
      duration: 3000
    })
  }).finally(() => {
    uni.hideLoading()
  })
}

function closeDemoModal() {
  showDemoModal.value = false
}

function goToNetworkSettings() {
  showDemoModal.value = false
  uni.navigateTo({
    url: '/pages/network-settings/index'
  })
}

function backToRecipes() {
  showDemoModal.value = false
  uni.navigateBack()
}
</script>

<style scoped>
.container {
  padding: 20rpx;
}

.order-form {
  background-color: #fff;
  padding: 30rpx;
  border-radius: 8rpx;
}

.form-section {
  margin-bottom: 30rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  margin-bottom: 20rpx;
  color: #333;
}

.form-item {
  margin-bottom: 25rpx;
}

.label {
  display: block;
  font-size: 28rpx;
  margin-bottom: 10rpx;
  color: #666;
}

.value {
  font-size: 28rpx;
  color: #333;
}

.input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.address-selector {
  height: 80rpx;
  line-height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
}

.placeholder {
  color: #999;
}

.api-gap-notice {
  background-color: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-bottom: 30rpx;
}

.notice-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #fa8c16;
  margin-bottom: 10rpx;
}

.notice-content {
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
}

.notice-content text {
  display: block;
  margin-bottom: 10rpx;
}

.pricing-hint {
  background-color: #f0f0f0;
  border: 1px solid #d9d9d9;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-bottom: 30rpx;
  color: #666;
  font-size: 28rpx;
  text-align: center;
}

.pricing-error {
  background-color: #fff1f0;
  border: 1px solid #ffccc7;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-bottom: 30rpx;
  color: #ff4d4f;
  font-size: 28rpx;
}

.price-section {
  margin-bottom: 30rpx;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
}

.price-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15rpx;
  font-size: 28rpx;
}

.price-item.total {
  font-weight: bold;
  font-size: 32rpx;
  padding-top: 15rpx;
  border-top: 1px solid #ddd;
}

.price-label {
  color: #666;
}

.price-value {
  color: #333;
  font-weight: bold;
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-top: 20rpx;
}

.btn[disabled] {
  background-color: #ccc;
  color: #999;
}

.result-section {
  margin-top: 30rpx;
  padding: 20rpx;
  background-color: #f0f9ff;
  border-radius: 8rpx;
}

.result-title {
  font-size: 32rpx;
  font-weight: bold;
  margin-bottom: 20rpx;
  color: #07c160;
}

.result-item {
  margin-bottom: 15rpx;
}

.result-label {
  font-size: 28rpx;
  color: #666;
  margin-right: 20rpx;
}

.result-value {
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 40rpx;
  margin: 40rpx;
  max-width: 600rpx;
  width: 100%;
}

.modal-title {
  font-size: 36rpx;
  font-weight: bold;
  margin-bottom: 20rpx;
  color: #333;
}

.modal-body {
  font-size: 28rpx;
  line-height: 1.6;
  color: #666;
  margin-bottom: 40rpx;
}

.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.modal-btn {
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 8rpx;
  font-size: 32rpx;
  border: none;
}

.modal-btn.primary {
  background-color: #07c160;
  color: #fff;
}

.modal-btn.secondary {
  background-color: #f0f0f0;
  color: #333;
}
</style>


