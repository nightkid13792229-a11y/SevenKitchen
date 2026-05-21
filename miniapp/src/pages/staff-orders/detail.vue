<template>
  <view class="order-detail">
    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 订单详情内容 -->
    <view v-else-if="order" class="detail-content">
      <!-- 顶部状态栏 -->
      <view class="status-header" :style="{ background: statusGradient }">
        <view class="status-info">
          <text class="status-text">{{ getStatusText(order.status) }}</text>
          <text class="order-id-text">订单 #{{ orderId.slice(-8) }}</text>
        </view>
      </view>

      <!-- 订单信息 -->
      <view class="section">
        <view class="section-title">📦 订单信息</view>
        <view class="info-list">
          <view class="info-item">
            <text class="info-label">订单号</text>
            <text class="info-value">{{ order.id }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">订单状态</text>
            <text class="info-value" :style="{ color: getStatusColor(order.status) }">
              {{ getStatusText(order.status) }}
            </text>
          </view>
          <view class="info-item">
            <text class="info-label">创建时间</text>
            <text class="info-value">{{ formatDateTime(order.createdAt) }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">支付方式</text>
            <text class="info-value">{{ getPaymentMethod(order.paymentMethod) }}</text>
          </view>
        </view>
      </view>

      <!-- 客户信息 -->
      <view class="section" v-if="order.customerName">
        <view class="section-title">👤 客户信息</view>
        <view class="info-list">
          <view class="info-item">
            <text class="info-label">姓名</text>
            <text class="info-value">{{ order.customerName }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">手机</text>
            <text class="info-value">{{ order.customerPhone }}</text>
            <text class="action-link" @tap="copyPhone">复制</text>
          </view>
        </view>
      </view>

      <!-- 狗狗信息 -->
      <view class="section" v-if="order.firstItem && order.firstItem.dog">
        <view class="section-title">🐕 狗狗信息</view>
        <view class="info-list">
          <view class="info-item">
            <text class="info-label">名称</text>
            <text class="info-value">{{ order.firstItem.dog.name }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">品种</text>
            <text class="info-value">{{ order.firstItem.dog.breedName || '未知' }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">体重</text>
            <text class="info-value">{{ order.firstItem.dog.weightKg }}kg</text>
          </view>
          <view class="info-item">
            <text class="info-label">每日餐数</text>
            <text class="info-value">{{ order.firstItem.dog.mealsPerDay }}餐</text>
          </view>
        </view>
      </view>

      <!-- 商品详情 -->
      <view class="section" v-if="order.firstItem">
        <view class="section-title">🍽️ 商品详情</view>
        <view class="product-card">
          <image
            v-if="order.firstItem.recipeSnapshot && order.firstItem.recipeSnapshot.coverImageUrl"
            class="product-cover"
            :src="order.firstItem.recipeSnapshot.coverImageUrl"
            mode="aspectFill"
          />
          <view class="product-info">
            <text class="product-name">{{ order.firstItem.recipeSnapshot?.name || '自定义食谱' }}</text>
            <view class="product-specs">
              <text class="spec-item">包装规格: {{ order.firstItem.packageSpecG }}g/餐</text>
              <text class="spec-item">数量: {{ order.firstItem.packageCount }}餐</text>
              <text class="spec-item" v-if="order.firstItem.dailyIntakeG">
                每日摄入: {{ order.firstItem.dailyIntakeG }}g
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- 收货地址 -->
      <view class="section">
        <view class="section-title">📍 收货地址</view>
        <view class="address-card">
          <template v-if="order.address">
            <view class="address-header">
              <text class="recipient-name">{{ order.address.recipientName }}</text>
              <text class="recipient-phone">{{ formatPhone(getOrderAddressPhone(order.address)) }}</text>
            </view>
            <text class="address-text"
              >{{ getOrderAddressRegionText(order.address) }} {{ getOrderAddressDetail(order.address) }}</text
            >
          </template>
          <view v-else class="address-empty">
            <text class="address-empty-text">暂未录入收货地址</text>
          </view>
          <view v-if="canEditAddress" class="address-actions">
            <button class="address-action-btn secondary" @tap="openAddressSelect">
              {{ order.address ? '更换地址' : '选择已有地址' }}
            </button>
            <button class="address-action-btn primary" @tap="openCreateAddressForm">录入新地址</button>
            <button v-if="order.address" class="address-action-btn secondary" @tap="openEditAddressForm">
              编辑地址
            </button>
          </view>
          <text v-else class="address-lock-hint">已发货后不可修改</text>
        </view>
      </view>

      <!-- 费用明细 -->
      <view class="section">
        <view class="section-title">💰 费用明细</view>
        <view class="fee-list">
          <view class="fee-item">
            <text class="fee-label">商品费用</text>
            <text class="fee-value">¥{{ formatAmount(order.totalAmount || order.amountTotal) }}</text>
          </view>
          <view class="fee-item">
            <text class="fee-label">运费</text>
            <text class="fee-value">¥0</text>
          </view>
          <view class="fee-item total">
            <text class="fee-label">总计</text>
            <text class="fee-value">¥{{ formatAmount(order.totalAmount || order.amountTotal) }}</text>
          </view>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="action-section">
        <button v-if="canConfirmPayment" class="action-btn primary" @tap="confirmPayment">确认收款</button>
        <button v-if="canStartProduction" class="action-btn orange" @tap="startProduction">开始制作</button>
        <button v-if="canShip" class="action-btn cyan" @tap="shipOrder">发货</button>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-state">
      <text class="error-icon">❌</text>
      <text class="error-text">订单加载失败</text>
      <button class="retry-btn" @tap="loadOrderDetail">重试</button>
    </view>

    <view v-if="addressSelectVisible" class="modal-mask" @tap="closeAddressSelect">
      <view class="modal-panel" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">选择已有地址</text>
          <text class="modal-close" @tap="closeAddressSelect">×</text>
        </view>
        <view v-if="addressLoading" class="modal-loading">加载中...</view>
        <view v-else-if="customerAddresses.length === 0" class="modal-empty">
          <text>该客户暂无地址</text>
          <button class="address-action-btn primary" @tap="openCreateAddressFormFromSelect">录入新地址</button>
        </view>
        <view v-else class="address-select-list">
          <view
            v-for="address in customerAddresses"
            :key="address.id"
            class="address-select-item"
            @tap="selectCustomerAddress(address)"
          >
            <view class="address-header">
              <text class="recipient-name">{{ address.recipientName }}</text>
              <text class="recipient-phone">{{ formatPhone(address.phone) }}</text>
              <text v-if="address.isDefault" class="default-tag">默认</text>
            </view>
            <text class="address-text">{{ formatRegionText(address.region) }} {{ address.detail }}</text>
          </view>
          <button class="address-action-btn primary full" @tap="openCreateAddressFormFromSelect">录入新地址</button>
        </view>
      </view>
    </view>

    <view v-if="addressFormVisible" class="modal-mask" @tap="closeAddressForm">
      <view class="modal-panel address-form-panel" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">{{ addressFormMode === 'edit' ? '编辑地址' : '录入新地址' }}</text>
          <text class="modal-close" @tap="closeAddressForm">×</text>
        </view>
        <view class="form-item">
          <text class="form-label">收货人姓名</text>
          <input class="form-input" v-model="addressForm.recipientName" placeholder="请输入收货人姓名" />
        </view>
        <view class="form-item">
          <text class="form-label">手机号</text>
          <input class="form-input" v-model="addressForm.phone" type="number" placeholder="请输入手机号" />
        </view>
        <view class="form-item">
          <text class="form-label">所在地区</text>
          <picker mode="region" :value="addressRegionValue" @change="onAddressRegionChange">
            <view class="form-picker">
              <text v-if="addressRegionText">{{ addressRegionText }}</text>
              <text v-else class="form-placeholder">请选择省/市/区</text>
              <text class="picker-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="form-item">
          <text class="form-label">详细地址</text>
          <textarea class="form-textarea" v-model="addressForm.detail" placeholder="请输入详细地址" />
        </view>
        <view class="form-switch-row">
          <text class="form-label">设为默认地址</text>
          <switch :checked="addressForm.isDefault" @change="onAddressDefaultChange" />
        </view>
        <button class="address-save-btn" :disabled="savingAddress" @tap="saveAddressForm">
          {{ savingAddress ? '保存中...' : '保存地址' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request } from '../../utils/api'
import {
  bindOrderCustomerAddress as bindExistingOrderAddress,
  confirmOfflinePayment,
  createOrderCustomerAddress,
  listOrderCustomerAddresses,
  updateOrderCustomerAddress,
  type StaffOrderAddress,
} from '../../api/orders'
import { formatShortDateTime } from '../../utils/date'

// 获取页面参数
const orderId = ref('')

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  orderId.value = options.id || ''
  if (orderId.value) {
    loadOrderDetail()
  }
})

interface OrderDetail {
  id: string
  status: string
  totalAmount?: number
  amountTotal?: number
  createdAt?: string
  paymentMethod?: string
  customerName?: string
  customerPhone?: string
  addressId?: string | null
  firstItem?: {
    dog?: {
      name?: string
      breedName?: string
      weightKg?: number
      mealsPerDay?: number
    }
    recipeSnapshot?: {
      id: string
      name: string
      coverImageUrl?: string | null
    }
    packageCount: number
    packageSpecG: number
    dailyIntakeG?: number
  }
  address?: {
    id?: string
    recipientName: string
    phone?: string
    recipientPhone?: string
    region?: {
      province: string
      city: string
      district?: string
    }
    regionText: string
    detail?: string
    detailAddress: string
  }
}

const order = ref<OrderDetail | null>(null)
const loading = ref(false)
const customerAddresses = ref<StaffOrderAddress[]>([])
const addressSelectVisible = ref(false)
const addressFormVisible = ref(false)
const addressLoading = ref(false)
const savingAddress = ref(false)
const addressFormMode = ref<'create' | 'edit'>('create')
const editingAddressId = ref('')
const addressRegionValue = ref<string[]>([])
const addressForm = ref({
  recipientName: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  isDefault: false,
})

// 计算状态渐变色
const statusGradient = computed(() => {
  if (!order.value) return '#999'
  const colorMap: Record<string, string> = {
    PENDING_PAYMENT: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
    PAID: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
    PURCHASING: 'linear-gradient(135deg, #faad14 0%, #d48806 100%)',
    IN_PRODUCTION: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
    FREEZING: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
    SHIPPED: 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)',
    COMPLETED: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
    CANCELLED: 'linear-gradient(135deg, #999 0%, #666 100%)',
    AFTERSALE: 'linear-gradient(135deg, #f5222d 0%, #cf1322 100%)',
  }
  return colorMap[order.value.status] || '#999'
})

// 操作权限判断
const canConfirmPayment = computed(() => {
  return order.value && order.value.status === 'PENDING_PAYMENT'
})

const canStartProduction = computed(() => {
  return order.value && (order.value.status === 'PAID' || order.value.status === 'PURCHASING')
})

const canShip = computed(() => {
  return order.value && order.value.status === 'FREEZING'
})

const canEditAddress = computed(() => {
  if (!order.value) return false
  return !['SHIPPED', 'COMPLETED', 'CANCELLED'].includes(order.value.status)
})

const addressRegionText = computed(() => {
  return [addressForm.value.province, addressForm.value.city, addressForm.value.district].filter(Boolean).join(' ')
})

// 加载订单详情
async function loadOrderDetail() {
  if (!orderId.value) return

  loading.value = true
  uni.showLoading({ title: '加载中...' })

  try {
    const response = await request({
      url: `/admin/orders/${orderId.value}`,
      method: 'GET',
    })

    if (response.code === 0 && response.data) {
      order.value = response.data
    }
  } catch (error: any) {
    console.error('[OrderDetail] Load error:', error)
    uni.showToast({
      title: '加载失败',
      icon: 'none',
    })
  } finally {
    loading.value = false
    uni.hideLoading()
  }
}

// 格式化函数
function formatAmount(amount?: number): string {
  if (!amount) return '0.00'
  return amount.toFixed(2)
}

function shortOrderId(orderId: string): string {
  return orderId ? orderId.slice(-8).toUpperCase() : '-'
}

function getOrderConfirmContent(currentOrder: OrderDetail): string {
  return [
    '确认收到该订单款项？',
    `订单：#${shortOrderId(currentOrder.id)}`,
    `客户：${getOrderCustomerText(currentOrder)}`,
    `商品：${getOrderProductText(currentOrder)}`,
    `金额：¥${formatAmount(currentOrder.totalAmount || currentOrder.amountTotal)}`,
  ].join('\n')
}

function getOrderCustomerText(currentOrder: OrderDetail): string {
  const name = currentOrder.customerName || currentOrder.address?.recipientName || '未记录客户'
  const phone = currentOrder.customerPhone || currentOrder.address?.phone || currentOrder.address?.recipientPhone || ''
  return phone ? `${name} ${formatPhone(phone)}` : name
}

function getOrderProductText(currentOrder: OrderDetail): string {
  const recipeName = currentOrder.firstItem?.recipeSnapshot?.name || '未记录商品'
  const dogName = currentOrder.firstItem?.dog?.name ? `（${currentOrder.firstItem.dog.name}）` : ''
  const packageCount = currentOrder.firstItem?.packageCount
  const packageSpec = currentOrder.firstItem?.packageSpecG
  const spec = packageCount && packageSpec ? ` ${packageCount}餐/${packageSpec}g` : ''
  return `${recipeName}${dogName}${spec}`
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '--'
  return formatShortDateTime(dateStr)
}

function formatPhone(phone: string): string {
  if (phone.length !== 11) return phone
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

function formatRegionText(region?: { province?: string; city?: string; district?: string }): string {
  if (!region) return ''
  return [region.province, region.city, region.district].filter(Boolean).join(' ')
}

function getOrderAddressPhone(address: NonNullable<OrderDetail['address']>): string {
  return address.phone || address.recipientPhone || ''
}

function getOrderAddressRegionText(address: NonNullable<OrderDetail['address']>): string {
  return address.regionText || formatRegionText(address.region)
}

function getOrderAddressDetail(address: NonNullable<OrderDetail['address']>): string {
  return address.detailAddress || address.detail || ''
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    INIT: '待确认',
    PENDING_PAYMENT: '待付款',
    PAID: '已支付',
    PURCHASING: '采购中',
    IN_PRODUCTION: '制作中',
    FREEZING: '急冻中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    AFTERSALE: '售后中',
  }
  return statusMap[status] || status
}

function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    INIT: '#999',
    PENDING_PAYMENT: '#ff9800',
    PAID: '#52c41a',
    PURCHASING: '#faad14',
    IN_PRODUCTION: '#1890ff',
    FREEZING: '#722ed1',
    SHIPPED: '#13c2c2',
    COMPLETED: '#52c41a',
    CANCELLED: '#999',
    AFTERSALE: '#f5222d',
  }
  return colorMap[status] || '#999'
}

function getPaymentMethod(method?: string): string {
  const methodMap: Record<string, string> = {
    WECHAT: '微信支付',
    ALIPAY: '支付宝',
    OFFLINE: '线下支付',
  }
  return method ? methodMap[method] || method : '未支付'
}

// 操作
function copyPhone() {
  if (!order.value || !order.value.customerPhone) return
  uni.setClipboardData({
    data: order.value.customerPhone,
    success: () => {
      uni.showToast({
        title: '已复制',
        icon: 'success',
      })
    },
  })
}

async function confirmPayment() {
  if (!order.value) return

  uni.showModal({
    title: '确认收款',
    content: getOrderConfirmContent(order.value),
    success: async (res) => {
      if (res.confirm) {
        try {
          await confirmOfflinePayment(order.value.id, order.value.totalAmount || order.value.amountTotal || 0)
          uni.showToast({
            title: '收款成功',
            icon: 'success',
          })
          loadOrderDetail()
        } catch (error) {
          console.error('[OrderDetail] Confirm payment error:', error)
        }
      }
    },
  })
}

async function startProduction() {
  if (!order.value) return

  uni.showModal({
    title: '开始制作',
    content: '确认开始制作此订单？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await request({
            url: `/admin/orders/${order.value.id}/start-production`,
            method: 'POST',
          })
          uni.showToast({
            title: '已开始制作',
            icon: 'success',
          })
          loadOrderDetail()
        } catch (error) {
          console.error('[OrderDetail] Start production error:', error)
        }
      }
    },
  })
}

async function shipOrder() {
  uni.showToast({
    title: '请在电脑端操作发货',
    icon: 'none',
  })
}

async function loadCustomerAddresses() {
  if (!orderId.value) return
  addressLoading.value = true
  try {
    const response = await listOrderCustomerAddresses(orderId.value)
    customerAddresses.value = response.data || []
  } catch (error) {
    console.error('[OrderDetail] Load customer addresses error:', error)
    uni.showToast({
      title: '地址加载失败',
      icon: 'none',
    })
  } finally {
    addressLoading.value = false
  }
}

async function openAddressSelect() {
  if (!canEditAddress.value) return
  addressSelectVisible.value = true
  await loadCustomerAddresses()
}

function closeAddressSelect() {
  addressSelectVisible.value = false
}

async function selectCustomerAddress(address: StaffOrderAddress) {
  if (!orderId.value || savingAddress.value) return
  savingAddress.value = true
  try {
    await bindExistingOrderAddress(orderId.value, address.id)
    uni.showToast({
      title: '地址已绑定',
      icon: 'success',
    })
    addressSelectVisible.value = false
    await loadOrderDetail()
  } catch (error) {
    console.error('[OrderDetail] Bind address error:', error)
  } finally {
    savingAddress.value = false
  }
}

function resetAddressForm() {
  addressForm.value = {
    recipientName: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    isDefault: false,
  }
  addressRegionValue.value = []
  editingAddressId.value = ''
}

function openCreateAddressForm() {
  if (!canEditAddress.value) return
  addressFormMode.value = 'create'
  resetAddressForm()
  addressFormVisible.value = true
}

function openCreateAddressFormFromSelect() {
  closeAddressSelect()
  openCreateAddressForm()
}

function openEditAddressForm() {
  if (!canEditAddress.value || !order.value?.address) return
  const address = order.value.address
  addressFormMode.value = 'edit'
  editingAddressId.value = address.id || order.value.addressId || ''
  addressForm.value = {
    recipientName: address.recipientName || '',
    phone: getOrderAddressPhone(address),
    province: address.region?.province || '',
    city: address.region?.city || '',
    district: address.region?.district || '',
    detail: getOrderAddressDetail(address),
    isDefault: false,
  }
  addressRegionValue.value = [addressForm.value.province, addressForm.value.city, addressForm.value.district].filter(
    Boolean,
  )
  addressFormVisible.value = true
}

function closeAddressForm() {
  if (savingAddress.value) return
  addressFormVisible.value = false
}

function onAddressRegionChange(event: any) {
  const value = event.detail.value || []
  addressRegionValue.value = value
  addressForm.value.province = value[0] || ''
  addressForm.value.city = value[1] || ''
  addressForm.value.district = value[2] || ''
}

function onAddressDefaultChange(event: any) {
  addressForm.value.isDefault = !!event.detail.value
}

function validateAddressForm(): boolean {
  const form = addressForm.value
  if (!form.recipientName || !form.phone || !form.province || !form.city || !form.district || !form.detail) {
    uni.showToast({
      title: '请填写完整收货地址',
      icon: 'none',
    })
    return false
  }
  return true
}

async function saveAddressForm() {
  if (!orderId.value || savingAddress.value || !validateAddressForm()) return

  const form = addressForm.value
  const payload = {
    recipientName: form.recipientName,
    phone: form.phone,
    region: {
      province: form.province,
      city: form.city,
      district: form.district,
    },
    detail: form.detail,
    isDefault: form.isDefault,
  }

  savingAddress.value = true
  try {
    if (addressFormMode.value === 'edit' && editingAddressId.value) {
      await updateOrderCustomerAddress(orderId.value, editingAddressId.value, payload)
    } else {
      await createOrderCustomerAddress(orderId.value, payload)
    }
    uni.showToast({
      title: '地址已保存',
      icon: 'success',
    })
    addressFormVisible.value = false
    await loadOrderDetail()
  } catch (error) {
    console.error('[OrderDetail] Save address error:', error)
  } finally {
    savingAddress.value = false
  }
}
</script>

<style scoped lang="scss">
.order-detail {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 40rpx;
}

// 加载和错误状态
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}

.loading-text,
.error-text {
  font-size: 28rpx;
  color: #999;
  margin-top: 24rpx;
}

.error-icon {
  font-size: 120rpx;
}

.retry-btn {
  margin-top: 32rpx;
  padding: 16rpx 48rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 8rpx;
  font-size: 28rpx;
}

// 详情内容
.detail-content {
  padding-bottom: 40rpx;
}

// 状态头部
.status-header {
  padding: 48rpx 32rpx;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.status-text {
  font-size: 48rpx;
  font-weight: bold;
  color: #fff;
}

.order-id-text {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.9);
}

// 通用区块
.section {
  background-color: #fff;
  margin: 24rpx 32rpx;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 24rpx;
}

// 信息列表
.info-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: 28rpx;
  color: #666;
}

.info-value {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.action-link {
  margin-left: 16rpx;
  font-size: 24rpx;
  color: #1890ff;
}

// 商品卡片
.product-card {
  display: flex;
  gap: 24rpx;
}

.product-cover {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
}

.product-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.product-name {
  font-size: 30rpx;
  font-weight: 500;
  color: #333;
}

.product-specs {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.spec-item {
  font-size: 26rpx;
  color: #666;
}

// 地址卡片
.address-card {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.address-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.recipient-name {
  font-size: 30rpx;
  font-weight: 500;
  color: #333;
}

.recipient-phone {
  font-size: 26rpx;
  color: #666;
}

.address-text {
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
}

.address-empty {
  padding: 8rpx 0;
}

.address-empty-text,
.address-lock-hint {
  font-size: 26rpx;
  color: #999;
}

.address-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 20rpx;
}

.address-action-btn {
  min-width: 180rpx;
  height: 64rpx;
  padding: 0 24rpx;
  border-radius: 10rpx;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;

  &.primary {
    background-color: #1890ff;
    color: #fff;
  }

  &.secondary {
    background-color: #fff;
    color: #1890ff;
    border: 2rpx solid #d6e8ff;
  }

  &.full {
    width: 100%;
    margin-top: 20rpx;
  }

  &::after {
    border: none;
  }
}

.default-tag {
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  background-color: #e6f7ff;
  color: #1890ff;
  font-size: 22rpx;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 99;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
}

.modal-panel {
  width: 100%;
  max-height: 82vh;
  overflow-y: auto;
  background-color: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: 32rpx;
  box-sizing: border-box;
}

.address-form-panel {
  padding-bottom: 48rpx;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28rpx;
}

.modal-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.modal-close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  color: #999;
}

.modal-loading,
.modal-empty {
  min-height: 180rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
  color: #999;
  font-size: 28rpx;
}

.address-select-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.address-select-item {
  padding: 24rpx;
  border-radius: 12rpx;
  border: 2rpx solid #f0f0f0;
}

.form-item {
  margin-bottom: 24rpx;
}

.form-label {
  display: block;
  margin-bottom: 12rpx;
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
}

.form-input,
.form-picker,
.form-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 2rpx solid #eee;
  border-radius: 10rpx;
  background-color: #fafafa;
  font-size: 28rpx;
  color: #333;
}

.form-input,
.form-picker {
  height: 76rpx;
  padding: 0 20rpx;
}

.form-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-textarea {
  min-height: 150rpx;
  padding: 18rpx 20rpx;
}

.form-placeholder,
.picker-arrow {
  color: #999;
}

.form-switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12rpx 0 28rpx;
}

.address-save-btn {
  width: 100%;
  height: 82rpx;
  border-radius: 12rpx;
  background-color: #1890ff;
  color: #fff;
  font-size: 30rpx;

  &::after {
    border: none;
  }
}

// 费用列表
.fee-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.fee-item {
  display: flex;
  justify-content: space-between;
  align-items: center;

  &.total {
    padding-top: 16rpx;
    border-top: 2rpx solid #f0f0f0;
  }
}

.fee-label {
  font-size: 28rpx;
  color: #666;
}

.fee-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;

  .fee-item.total & {
    font-size: 36rpx;
    color: #ff4d4f;
  }
}

// 操作区块
.action-section {
  background-color: #fff;
  margin: 24rpx 32rpx;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.action-btn {
  width: 100%;
  height: 80rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;

  &.primary {
    background-color: #1890ff;
    color: #fff;
  }

  &.orange {
    background-color: #faad14;
    color: #fff;
  }

  &.cyan {
    background-color: #13c2c2;
    color: #fff;
  }

  &.green {
    background-color: #52c41a;
    color: #fff;
  }

  &::after {
    border: none;
  }
}
</style>
