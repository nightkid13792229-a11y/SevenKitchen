<template>
  <view class="checkout-page">
    <!-- 确认地址 -->
    <view class="section address-section" @tap="openAddressSelector">
      <view class="section-title">
        <text class="title-text">确认地址</text>
      </view>

      <!-- 有地址 -->
      <view v-if="selectedAddress" class="address-card">
        <view class="address-info">
          <view class="address-header">
            <text class="recipient">{{ selectedAddress.recipientName }} {{ selectedAddress.phone }}</text>
            <text v-if="selectedAddress.isDefault" class="default-badge">默认</text>
          </view>
          <text class="detail">{{ selectedAddress.regionText }} {{ selectedAddress.detailAddress }}</text>
        </view>
        <text class="arrow">›</text>
      </view>

      <!-- 无地址 -->
      <view v-else class="no-address-card">
        <view class="empty-content">
          <text class="empty-text">暂无收货地址</text>
          <button class="btn-add-address" @tap.stop="goToAddAddress">新增地址</button>
        </view>
      </view>

      <!-- 配送说明 -->
      <view class="shipping-note">
        <text class="note-text">默认顺丰特快，1至2日送达</text>
      </view>
    </view>

    <!-- 确认日期 -->
    <view class="section production-date-section">
      <view class="section-title">
        <text class="title-text">确认日期</text>
      </view>

      <!-- 只读模式：点击后才弹出选择器 -->
      <picker
        v-if="showProductionDatePicker"
        mode="date"
        :value="selectedProductionDate"
        :start="minProductionDate"
        @change="onProductionDateChange"
        @cancel="showProductionDatePicker = false"
      >
        <view class="date-picker-button">
          <text class="date-value">{{ formatDisplayDate(selectedProductionDate) }}</text>
          <text class="picker-arrow">▼</text>
        </view>
      </picker>

      <view
        v-else
        class="date-display-button"
        @tap="openProductionDatePicker"
      >
        <text class="date-label">制作日期：</text>
        <text class="date-value">{{ formatDisplayDate(selectedProductionDate) }}</text>
        <text class="auto-tag">预约制作日期</text>
        <text class="picker-arrow">▼</text>
      </view>

      <!-- 提示文字 -->
      <view class="date-tips">
        <text class="tip-text">制作完成后，需要急冻24小时后再发货</text>
      </view>

      <!-- 发货日期和收货日期并排展示 -->
      <view class="date-info-row">
        <view class="date-info-item-left">
          <text class="date-info-label">预计发货日期</text>
          <text class="date-info-value">{{ formatDisplayDate(calculatedShippingDate) }}</text>
        </view>
        <view class="date-info-item-right">
          <text class="date-info-label">预计收货日期</text>
          <text class="date-info-value">{{ estimatedDeliveryDateRange }}</text>
        </view>
      </view>
    </view>

    <!-- 订单信息 -->
    <view class="section config-info-section">
      <view class="section-title">
        <text class="title-text">订单信息</text>
      </view>

      <!-- 食谱（移到顶部，不显示标题） -->
      <view class="info-card recipe-card-top">
        <view class="recipe-content">
          <image
            v-if="orderConfig.recipeCoverImage"
            :src="orderConfig.recipeCoverImage"
            class="recipe-cover-small"
            mode="aspectFill"
          />
          <view v-else class="recipe-cover-placeholder">
            <text>{{ orderConfig.recipeName?.charAt(0) }}</text>
          </view>
          <text class="recipe-name">{{ orderConfig.recipeName }}</text>
        </view>
      </view>

      <!-- 爱犬信息 -->
      <view class="info-card dog-info-card">
        <text class="info-card-title">爱犬信息</text>
        <view class="config-grid">
          <view class="config-item">
            <text class="config-label">名称</text>
            <text class="config-value">{{ orderConfig.dogName }}</text>
          </view>
          <view class="config-item">
            <text class="config-label">品种</text>
            <text class="config-value">{{ orderConfig.breedName || '-' }}</text>
          </view>
          <view class="config-item">
            <text class="config-label">体重</text>
            <text class="config-value">{{ orderConfig.weightKg ? orderConfig.weightKg + 'kg' : '-' }}</text>
          </view>
          <view class="config-item">
            <text class="config-label">每日餐数</text>
            <text class="config-value">{{ orderConfig.mealsPerDay }}餐</text>
          </view>
        </view>
      </view>

      <!-- 订购信息 -->
      <view class="info-card order-info-card">
        <text class="info-card-title">订购信息</text>
        <view class="config-grid">
          <view class="config-item">
            <text class="config-label">订购周期</text>
            <text class="config-value">{{ orderConfig.cycleDays }}天</text>
          </view>
          <view class="config-item">
            <text class="config-label">每餐饭量</text>
            <text class="config-value">{{ orderConfig.perMealG }}g</text>
          </view>
          <view class="config-item">
            <text class="config-label">总餐数</text>
            <text class="config-value">{{ orderConfig.totalPackages }}袋</text>
          </view>
          <view class="config-item">
            <text class="config-label">总净重</text>
            <text class="config-value">{{ orderConfig.totalGrams }}g</text>
          </view>
        </view>
      </view>

      <!-- 制作要求 -->
      <view class="info-card requirement-card">
        <text class="info-card-title">制作要求</text>
        <view class="config-grid">
          <view class="config-item">
            <text class="config-label">加工方式</text>
            <text class="config-value">{{ orderConfig.preparationMethod === 'CHOPPED' ? '打碎' : '切丁' }}</text>
          </view>
          <view class="config-item">
            <text class="config-label">鲜食状态</text>
            <text class="config-value">{{ orderConfig.cookingMethod === 'RAW' ? '生' : '预加热' }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 价格汇总（简化版） -->
    <view class="section price-section">
      <view class="section-title">
        <text class="title-text">订单金额</text>
      </view>

      <view class="price-card-simple">
        <text class="price-label">支付金额</text>
        <text class="price-value-large">¥{{ totalAmount.toFixed(2) }}</text>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="bottom-bar">
      <button
        class="btn-pay-with-amount"
        :disabled="!canSubmitOrder"
        @tap="submitOrder"
      >
        <text class="btn-text">立即支付</text>
        <text class="btn-amount">¥{{ totalAmount.toFixed(2) }}</text>
      </button>
    </view>

    <!-- 地址选择器弹窗 -->
    <view v-if="showAddressSelector" class="address-selector-overlay" @tap="closeAddressSelector">
      <view class="address-selector" @tap.stop>
        <view class="selector-header">
          <text class="selector-title">选择收货地址</text>
          <text class="selector-close" @tap="closeAddressSelector">×</text>
        </view>
        <scroll-view class="address-list" scroll-y>
          <view
            v-for="addr in addressList"
            :key="addr.id"
            class="address-list-item"
            :class="{ selected: selectedAddress?.id === addr.id }"
            @tap="selectAddress(addr)"
          >
            <view class="list-address-info">
              <view class="list-address-header">
                <text class="list-recipient">{{ addr.recipientName }} {{ addr.phone }}</text>
                <text v-if="addr.isDefault" class="default-badge">默认</text>
              </view>
              <text class="list-detail">{{ addr.regionText }} {{ addr.detailAddress }}</text>
            </view>
            <view v-if="selectedAddress?.id === addr.id" class="check-icon">✓</view>
          </view>
        </scroll-view>
        <view class="selector-footer">
          <button class="btn-manage-address" @tap="goToAddressList">管理地址</button>
        </view>
      </view>
    </view>

    <!-- 模拟支付弹窗 -->
    <view v-if="showPaymentModal" class="payment-modal-overlay" @tap="closePaymentModal">
      <view class="payment-modal" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">选择支付方式</text>
          <text class="modal-close" @tap="closePaymentModal">×</text>
        </view>

        <view class="modal-body">
          <!-- 支付金额 -->
          <view class="payment-amount">
            <text class="amount-label">支付金额</text>
            <text class="amount-value">¥{{ totalAmount.toFixed(2) }}</text>
          </view>

          <!-- 支付方式选择 -->
          <view class="payment-methods">
            <view
              v-for="method in paymentMethods"
              :key="method.id"
              class="payment-method-item"
              :class="{ active: selectedPaymentMethod === method.id }"
              @tap="selectPaymentMethod(method.id)"
            >
              <text class="method-icon">{{ method.icon }}</text>
              <view class="method-info">
                <text class="method-name">{{ method.name }}</text>
                <text class="method-desc">{{ method.desc }}</text>
              </view>
              <view class="method-radio" :class="{ checked: selectedPaymentMethod === method.id }">
                <text v-if="selectedPaymentMethod === method.id" class="radio-dot">✓</text>
              </view>
            </view>
          </view>

          <!-- 支付密码输入（仅余额支付显示） -->
          <view v-if="selectedPaymentMethod === 'BALANCE'" class="password-input">
            <text class="password-label">请输入支付密码</text>
            <view class="password-dots">
              <view
                v-for="i in 6"
                :key="i"
                class="dot"
                :class="{ filled: i <= paymentPassword.length }"
              >
                <text v-if="i <= paymentPassword.length">●</text>
              </view>
            </view>
            <input
              class="password-input-hidden"
              type="number"
              maxlength="6"
              v-model="paymentPassword"
            />
          </view>
        </view>

        <view class="modal-footer">
          <button
            class="btn-pay-confirm"
            :disabled="!canConfirmPayment"
            @tap="confirmPayment"
          >
            确认支付
          </button>
        </view>
      </view>
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
  preparationMethod?: string
  cookingMethod?: string
}

interface Address {
  id: string
  recipientName: string
  phone: string
  regionText: string
  detailAddress: string
  isDefault?: boolean
}

interface OrderConfig {
  dogName: string
  breedName?: string
  weightKg?: number
  mealsPerDay: number
  perMealG: number
  totalPackages: number
  cycleDays: number
  totalGrams: number
  preparationMethod: 'CHOPPED' | 'DICED'
  cookingMethod: 'RAW' | 'COOKED'
  recipeName: string
  recipeCoverImage?: string
}

const cartItems = ref<CartItem[]>([])
const selectedAddress = ref<Address | null>(null)
const pricingSnapshotId = ref<string | null>(null)
const orderConfig = ref<OrderConfig>({
  dogName: '',
  breedName: '',
  weightKg: undefined,
  mealsPerDay: 2,
  perMealG: 0,
  totalPackages: 0,
  cycleDays: 0,
  totalGrams: 0,
  preparationMethod: 'CHOPPED',
  cookingMethod: 'RAW',
  recipeName: '',
  recipeCoverImage: ''
})

// 立即购买模式的价格显示（从URL参数获取，仅用于显示）
const directBuyPrice = ref({
  amountProduct: 0,
  amountShipping: 0,
  amountTotal: 0,
})

// ========== 地址选择器相关 ==========
const showAddressSelector = ref(false)
const addressList = ref<Address[]>([])

// ========== 制作日期相关 ==========
const showProductionDatePicker = ref(false)

// 判断当前时间是否在6点前
const isBefore6AM = computed(() => {
  const now = new Date()
  const hour = now.getHours()
  return hour < 6
})

// 计算最小可选制作日期
const minProductionDate = computed(() => {
  const now = new Date()
  if (isBefore6AM.value) {
    return formatDateToString(now)
  } else {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return formatDateToString(tomorrow)
  }
})

// 默认制作日期：明天
const defaultProductionDate = computed(() => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return formatDateToString(tomorrow)
})

// 选中的制作日期
const selectedProductionDate = ref(defaultProductionDate.value)

// 计算发货日期（制作日期 + 1天）
const calculatedShippingDate = computed(() => {
  if (!selectedProductionDate.value) return ''
  const productionDate = new Date(selectedProductionDate.value)
  const shippingDate = new Date(productionDate)
  shippingDate.setDate(shippingDate.getDate() + 1)
  return formatDateToString(shippingDate)
})

// 计算预计收货日期范围（发货日期 + 1~2天）
const estimatedDeliveryDateRange = computed(() => {
  if (!calculatedShippingDate.value) return ''
  const shipping = new Date(calculatedShippingDate.value)
  const start = new Date(shipping)
  start.setDate(start.getDate() + 1)
  const end = new Date(shipping)
  end.setDate(end.getDate() + 2)
  return `${formatDisplayDate(formatDateToString(start))}-${formatDisplayDate(formatDateToString(end))}`
})

// ========== 模拟支付相关 ==========
const showPaymentModal = ref(false)
const selectedPaymentMethod = ref('WECHAT')
const paymentPassword = ref('')

const paymentMethods = [
  { id: 'WECHAT', name: '微信支付', icon: '💚', desc: '推荐使用' },
  { id: 'BALANCE', name: '余额支付', icon: '💰', desc: '账户余额' }
]

const canConfirmPayment = computed(() => {
  if (selectedPaymentMethod.value === 'BALANCE') {
    return paymentPassword.value.length === 6
  }
  return true
})

// ========== 计算属性 ==========
const totalAmount = computed(() => {
  return directBuyPrice.value.amountTotal
})

const canSubmitOrder = computed(() => {
  return selectedAddress.value && pricingSnapshotId.value && selectedProductionDate.value
})

// ========== 工具函数 ==========
function formatDateToString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '请选择日期'
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}

// ========== 地址选择器相关 ==========
async function openAddressSelector() {
  if (!selectedAddress.value) {
    goToAddressList()
    return
  }

  try {
    const res = await request({
      url: '/addresses',
      method: 'GET'
    })

    if (res.code === 0 && res.data && res.data.length > 0) {
      addressList.value = res.data.map((addr: any) => ({
        id: addr.id,
        recipientName: addr.recipientName,
        phone: addr.phone,
        regionText: formatRegionText(addr.region),
        detailAddress: addr.detailAddress,
        isDefault: addr.isDefault
      }))
      showAddressSelector.value = true
    }
  } catch (error) {
    console.error('Load address list error:', error)
  }
}

function closeAddressSelector() {
  showAddressSelector.value = false
}

function selectAddress(addr: Address) {
  selectedAddress.value = addr
  showAddressSelector.value = false
  uni.showToast({
    title: '已切换地址',
    icon: 'success'
  })
}

// ========== 制作日期相关 ==========
function openProductionDatePicker() {
  showProductionDatePicker.value = true
}

function onProductionDateChange(e: any) {
  selectedProductionDate.value = e.detail.value
  showProductionDatePicker.value = false
  console.log('[Checkout] Production date changed:', {
    productionDate: selectedProductionDate.value,
    shippingDate: calculatedShippingDate.value
  })
}

// ========== 支付方式选择 ==========
function selectPaymentMethod(methodId: string) {
  selectedPaymentMethod.value = methodId
  paymentPassword.value = ''
}

function openPaymentModal() {
  showPaymentModal.value = true
  selectedPaymentMethod.value = 'WECHAT'
  paymentPassword.value = ''
}

function closePaymentModal() {
  showPaymentModal.value = false
  paymentPassword.value = ''
}

// ========== 数据加载 ==========
onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  console.log('[Checkout] URL options:', options)

  loadDirectBuyItem(options)
  loadDefaultAddress()
  selectedProductionDate.value = defaultProductionDate.value
})

function loadDirectBuyItem(options: any) {
  pricingSnapshotId.value = options.snapshotId || null
  console.log('[Checkout] Pricing Snapshot ID:', pricingSnapshotId.value)

  directBuyPrice.value = {
    amountProduct: parseFloat(options.amountProduct || '0'),
    amountShipping: parseFloat(options.amountShipping || '0'),
    amountTotal: parseFloat(options.amountTotal || '0')
  }

  loadOrderConfigFromURL(options)

  const item: CartItem = {
    id: 'direct-buy-temp',
    dogId: '',
    dogName: orderConfig.value.dogName,
    dogBreedName: orderConfig.value.breedName,
    dogWeightKg: 0,
    recipeId: '',
    recipeName: orderConfig.value.recipeName,
    recipeCoverImage: orderConfig.value.recipeCoverImage,
    cycleDays: orderConfig.value.cycleDays,
    dailyIntakeG: orderConfig.value.perMealG * orderConfig.value.mealsPerDay,
    totalGrams: orderConfig.value.totalGrams,
    packageCount: orderConfig.value.totalPackages,
    packageSpecG: orderConfig.value.perMealG,
    unitPrice: 0,
    totalPrice: directBuyPrice.value.amountProduct,
    preparationMethod: orderConfig.value.preparationMethod,
    cookingMethod: orderConfig.value.cookingMethod
  }

  cartItems.value = [item]
  console.log('[Checkout] Price display:', {
    amountProduct: directBuyPrice.value.amountProduct,
    amountShipping: directBuyPrice.value.amountShipping,
    amountTotal: directBuyPrice.value.amountTotal
  })
}

function loadOrderConfigFromURL(options: any) {
  orderConfig.value = {
    dogName: decodeURIComponent(options.dogName || ''),
    breedName: decodeURIComponent(options.breedName || ''),
    weightKg: options.weightKg ? parseFloat(options.weightKg) : undefined,
    mealsPerDay: parseInt(options.mealsPerDay || '2'),
    perMealG: parseFloat(options.perMealG || '0'),
    totalPackages: parseInt(options.totalPackages || '0'),
    cycleDays: parseInt(options.cycleDays || '0'),
    totalGrams: parseFloat(options.totalGrams || '0'),
    preparationMethod: (options.preparationMethod || 'CHOPPED') as 'CHOPPED' | 'DICED',
    cookingMethod: (options.cookingMethod || 'RAW') as 'RAW' | 'COOKED',
    recipeName: decodeURIComponent(options.recipeName || ''),
    recipeCoverImage: decodeURIComponent(options.recipeCoverImage || '')
  }

  console.log('[Checkout] Order config loaded:', orderConfig.value)
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
          detailAddress: defaultAddr.detailAddress,
          isDefault: defaultAddr.isDefault
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

// ========== 订单提交和支付 ==========
async function submitOrder() {
  if (!canSubmitOrder.value) return

  if (!selectedAddress.value) {
    uni.showToast({
      title: '请先选择收货地址',
      icon: 'none'
    })
    return
  }

  if (!pricingSnapshotId.value) {
    uni.showToast({
      title: '价格快照已失效',
      icon: 'none'
    })
    return
  }

  openPaymentModal()
}

async function confirmPayment() {
  if (!canConfirmPayment.value) {
    uni.showToast({
      title: '请输入6位支付密码',
      icon: 'none'
    })
    return
  }

  try {
    uni.showLoading({ title: '支付中...' })

    const createRes = await request({
      url: '/orders',
      method: 'POST',
      data: {
        type: 'FRESH_FOOD',
        addressId: selectedAddress.value!.id,
        snapshotId: pricingSnapshotId.value,
        targetProductionDate: selectedProductionDate.value
      }
    })

    if (createRes.code !== 0) {
      throw new Error(createRes.message || '创建订单失败')
    }

    const orderId = createRes.data.id

    const confirmRes = await request({
      url: `/orders/${orderId}/confirm`,
      method: 'POST'
    })

    if (confirmRes.code !== 0) {
      throw new Error(confirmRes.message || '确认订单失败')
    }

    const payRes = await request({
      url: `/orders/${orderId}/pay`,
      method: 'POST',
      data: {
        paymentMethod: selectedPaymentMethod.value === 'WECHAT' ? 'WECHAT' : 'BALANCE'
      }
    })

    if (payRes.code === 0) {
      uni.showToast({
        title: '支付成功',
        icon: 'success'
      })

      closePaymentModal()

      setTimeout(() => {
        uni.redirectTo({
          url: `/pages/order-detail/index?orderId=${orderId}`
        })
      }, 1500)
    } else {
      throw new Error(payRes.message || '支付失败')
    }
  } catch (error: any) {
    console.error('Payment error:', error)
    uni.showToast({
      title: error.message || '支付失败',
      icon: 'none'
    })
  } finally {
    uni.hideLoading()
  }
}

// ========== 页面跳转 ==========
function goToAddressList() {
  uni.navigateTo({
    url: '/pages/address-list/index?mode=select'
  })
}

function goToAddAddress() {
  uni.navigateTo({
    url: '/pages/address-create/index'
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
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.title-text {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

/* 收货地址 */
.address-section {
  position: relative;
}

.address-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  transition: background-color 0.2s;
}

.address-card:active {
  background-color: #f0f0f0;
}

.address-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.address-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.recipient {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.default-badge {
  padding: 4rpx 12rpx;
  background-color: #ff4d4f;
  color: #fff;
  font-size: 20rpx;
  border-radius: 4rpx;
}

.detail {
  font-size: 26rpx;
  color: #666;
}

.no-address-card {
  padding: 60rpx 20rpx;
  text-align: center;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.empty-text {
  font-size: 28rpx;
  color: #999;
}

.btn-add-address {
  padding: 12rpx 32rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 24rpx;
  font-size: 26rpx;
  border: none;
}

.shipping-note {
  margin-top: 16rpx;
  padding: 12rpx 16rpx;
  background-color: #f0f9ff;
  border-radius: 8rpx;
}

.note-text {
  font-size: 24rpx;
  color: #0050b3;
}

.arrow {
  font-size: 32rpx;
  color: #999;
  margin-left: 20rpx;
}

/* 地址选择器 */
.address-selector-overlay {
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

.address-selector {
  width: 100%;
  max-height: 70vh;
  background-color: #fff;
  border-radius: 24rpx 24rpx 0 0;
  display: flex;
  flex-direction: column;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.selector-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.selector-close {
  font-size: 48rpx;
  color: #999;
  line-height: 1;
}

.address-list {
  flex: 1;
  overflow-y: auto;
}

.address-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f5f5f5;
}

.address-list-item.selected {
  background-color: #f0f9ff;
}

.list-address-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.list-address-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.list-recipient {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.list-detail {
  font-size: 26rpx;
  color: #666;
}

.check-icon {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background-color: #1890ff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
}

.selector-footer {
  padding: 24rpx 32rpx;
  border-top: 1rpx solid #f0f0f0;
}

.btn-manage-address {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #fff;
  color: #1890ff;
  border: 2rpx solid #1890ff;
  border-radius: 44rpx;
  font-size: 28rpx;
  font-weight: bold;
  text-align: center;
}

/* 制作日期选择 */
.production-date-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.date-display-button {
  display: flex;
  align-items: center;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  border: 1rpx solid #e8e8e8;
}

.date-display-button:active {
  background-color: #f0f0f0;
}

.date-label {
  font-size: 28rpx;
  color: #666;
}

.date-value {
  flex: 1;
  font-size: 32rpx;
  color: #333;
  font-weight: bold;
  margin-left: 16rpx;
}

.auto-tag {
  font-size: 24rpx;
  color: #999;
  margin-left: 8rpx;
}

.picker-arrow {
  font-size: 24rpx;
  color: #999;
  margin-left: 16rpx;
}

.date-picker-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  border: 2rpx solid #1890ff;
}

.date-tips {
  margin-top: 16rpx;
  padding: 16rpx;
  background-color: #fff7e6;
  border-radius: 8rpx;
}

.tip-text {
  font-size: 24rpx;
  color: #ff9800;
  line-height: 1.5;
}

.date-info-row {
  margin-top: 16rpx;
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
}

.date-info-item-left,
.date-info-item-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16rpx;
  background-color: #f0f9ff;
  border-radius: 8rpx;
}

.date-info-label {
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
}

.date-info-value {
  font-size: 28rpx;
  color: #52c41a;
  font-weight: bold;
}

/* 配置信息板块 */
.config-info-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.info-card {
  padding: 20rpx;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}

.info-card:last-child {
  margin-bottom: 0;
}

.dog-info-card {
  background-color: #e6f7ff;
  border-left: 4rpx solid #1890ff;
}

.order-info-card {
  background-color: #f6ffed;
  border-left: 4rpx solid #52c41a;
}

.requirement-card {
  background-color: #fff9f0;
  border-left: 4rpx solid #fa8c16;
}

.recipe-card {
  background-color: #f9f9f9;
  border-left: 4rpx solid #722ed1;
}

.recipe-card-top {
  background-color: #f9f9f9;
  border-left: 4rpx solid #722ed1;
  margin-bottom: 16rpx;
}

.info-card-title {
  display: block;
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 16rpx;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12rpx 24rpx;
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 0;
}

.config-label {
  font-size: 26rpx;
  color: #666;
}

.config-value {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.recipe-content {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.recipe-cover-small {
  width: 80rpx;
  height: 80rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}

.recipe-cover-placeholder {
  width: 80rpx;
  height: 80rpx;
  border-radius: 8rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.recipe-cover-placeholder text {
  font-size: 32rpx;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
}

.recipe-name {
  flex: 1;
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

/* 简化价格展示 */
.price-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.price-card-simple {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.price-label {
  font-size: 28rpx;
  color: #666;
}

.price-value-large {
  font-size: 48rpx;
  font-weight: bold;
  color: #ff4d4f;
}

/* 底部操作栏 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
  z-index: 100;
}

.btn-pay-with-amount {
  width: 100%;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 48rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  box-shadow: 0 4rpx 12rpx rgba(24, 144, 255, 0.3);
}

.btn-pay-with-amount[disabled] {
  background-color: #ccc;
  color: #999;
  box-shadow: none;
}

.btn-text {
  font-size: 32rpx;
}

.btn-amount {
  font-size: 36rpx;
}

/* 模拟支付弹窗 */
.payment-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.payment-modal {
  width: 640rpx;
  background-color: #fff;
  border-radius: 24rpx;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.modal-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.modal-close {
  font-size: 48rpx;
  color: #999;
  line-height: 1;
}

.modal-body {
  padding: 32rpx;
}

.payment-amount {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.amount-label {
  font-size: 28rpx;
  color: #666;
}

.amount-value {
  font-size: 40rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.payment-methods {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.payment-method-item {
  display: flex;
  align-items: center;
  padding: 24rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
  gap: 16rpx;
}

.payment-method-item.active {
  border-color: #1890ff;
  background-color: #f0f9ff;
}

.method-icon {
  font-size: 48rpx;
  flex-shrink: 0;
}

.method-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.method-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.method-desc {
  font-size: 24rpx;
  color: #999;
}

.method-radio {
  width: 40rpx;
  height: 40rpx;
  border: 2rpx solid #d9d9d9;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.method-radio.checked {
  border-color: #1890ff;
  background-color: #1890ff;
}

.radio-dot {
  font-size: 24rpx;
  color: #fff;
}

.password-input {
  margin-top: 24rpx;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.password-label {
  display: block;
  font-size: 26rpx;
  color: #666;
  margin-bottom: 16rpx;
  text-align: center;
}

.password-dots {
  display: flex;
  justify-content: center;
  gap: 16rpx;
}

.dot {
  width: 48rpx;
  height: 48rpx;
  border: 2rpx solid #d9d9d9;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dot.filled {
  border-color: #1890ff;
  background-color: #f0f9ff;
}

.dot text {
  font-size: 32rpx;
  color: #1890ff;
}

.password-input-hidden {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.modal-footer {
  padding: 24rpx 32rpx 32rpx;
}

.btn-pay-confirm {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  text-align: center;
}

.btn-pay-confirm[disabled] {
  background-color: #ccc;
  color: #999;
}
</style>
