<template>
  <view class="staff-orders">
    <!-- 顶部导航栏 -->
    <view class="header">
      <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
      <view class="nav-bar">
        <view class="back-btn" @tap="goBack">
          <text class="back-icon">←</text>
        </view>
        <text class="header-title">后台订单</text>
        <view class="header-actions">
          <view class="search-btn" @tap="showSearchModal">
            <text class="search-icon">🔍</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 占位元素，防止内容被header遮挡 -->
    <view class="header-placeholder" :style="{ height: (statusBarHeight + 88) + 'px' }"></view>

    <!-- 今日统计卡片 -->
    <view class="stats-card">
      <view class="stat-item" @tap="filterByType('today')">
        <text class="stat-value">{{ stats.todayOrders }}</text>
        <text class="stat-label">今日订单</text>
      </view>
      <view class="stat-divider"></view>
      <view class="stat-item" @tap="filterByType('pending')">
        <text class="stat-value">{{ stats.pendingOrders }}</text>
        <text class="stat-label">待处理</text>
      </view>
      <view class="stat-divider"></view>
      <view class="stat-item" @tap="filterByType('revenue')">
        <text class="stat-value">¥{{ stats.todayRevenue }}</text>
        <text class="stat-label">今日收入</text>
      </view>
    </view>

    <!-- 筛选栏 -->
    <view class="filter-bar">
      <view class="filter-item" @tap="showStatusFilter">
        <text class="filter-text">{{ statusFilterText }}</text>
        <text class="filter-arrow">▼</text>
      </view>
      <view class="filter-item" @tap="showDateFilter">
        <text class="filter-text">{{ dateFilterText }}</text>
        <text class="filter-arrow">▼</text>
      </view>
      <view class="filter-item" @tap="showOrderIdFilter">
        <text class="filter-text">{{ orderIdFilterText }}</text>
        <text class="filter-arrow">▼</text>
      </view>
      <view class="filter-reset" @tap="resetFilters" v-if="hasActiveFilters">
        <text class="reset-text">重置</text>
      </view>
    </view>

    <!-- 订单列表 -->
    <view class="order-list">
      <view
        v-for="order in orders"
        :key="order.id"
        class="order-card"
        @tap="viewOrderDetail(order.id)"
      >
        <!-- 订单头部：订单编号 + 状态 -->
        <view class="order-header">
          <text class="order-id">{{ order.id }}</text>
          <text class="order-status" :style="{ color: getStatusColor(order.status) }">
            {{ getStatusText(order.status) }}
          </text>
        </view>

        <!-- 订单时间信息 -->
        <view class="order-times">
          <view class="time-item">
            <text class="time-label">创建时间:</text>
            <text class="time-value">{{ formatFullDateTime(order.createdAt) }}</text>
          </view>
          <view class="time-item" v-if="order.targetProductionDate">
            <text class="time-label">目标制作:</text>
            <text class="time-value">{{ formatDate(order.targetProductionDate) }}</text>
          </view>
        </view>

        <!-- 狗狗和食谱信息 -->
        <template v-if="order.firstItem">
          <!-- 狗狗信息 -->
          <view class="order-dogs" v-if="order.firstItem.dog">
            <text class="dogs-text">{{ formatDogInfo(order) }}</text>
          </view>

          <!-- 食谱信息 -->
          <view class="order-items">
            <view class="recipe-header">
              <image
                v-if="getRecipeCoverImage(order)"
                class="recipe-cover"
                :src="getRecipeCoverImage(order)"
                mode="aspectFill"
              />
              <text class="recipe-name">{{ getRecipeName(order) }}</text>
            </view>
            <view class="meal-info">
              <text class="meal-text">共{{ getTotalMeals(order) }}餐</text>
              <text class="meal-separator">·</text>
              <text class="meal-text">每餐{{ getMealWeight(order) }}g</text>
            </view>
          </view>
        </template>

        <!-- 金额 -->
        <view class="order-amount">
          <view class="amount-row-top">
            <view class="amount-info">
              <text class="amount-label">订单金额:</text>
              <!-- 可编辑状态 -->
              <input
                v-if="editingOrderId === order.id"
                v-model="editingAmount"
                class="amount-input"
                type="digit"
                @tap.stop
                @confirm="confirmAmountChange(order)"
              />
              <text v-else class="amount-value">¥{{ formatAmount(order.totalAmount || order.amountTotal) }}</text>
            </view>
            <!-- 按钮组 -->
            <view class="button-group">
              <!-- 修改金额/确认修改按钮（待支付状态不显示） -->
              <button
                v-if="editingOrderId === order.id && order.status !== 'PENDING_PAYMENT'"
                class="edit-amount-btn confirm-btn"
                @tap.stop="confirmAmountChange(order)"
              >
                确认修改
              </button>
              <button
                v-if="editingOrderId !== order.id && order.status !== 'PENDING_PAYMENT'"
                class="edit-amount-btn"
                @tap.stop="startEditingAmount(order)"
              >
                修改金额
              </button>
              <!-- 确认付款按钮（仅待支付状态显示） -->
              <button
                v-if="order.status === 'PENDING_PAYMENT'"
                class="confirm-payment-btn"
                @tap.stop="confirmOrderPayment(order)"
              >
                确认付款
              </button>
            </view>
          </view>
          <!-- 商品金额和运费 -->
          <view class="amount-breakdown">
            <text class="breakdown-item">商品: ¥{{ formatAmount(order.amountProduct) }}</text>
            <text class="breakdown-item">运费: ¥{{ formatAmount(order.amountShipping) }}</text>
          </view>
        </view>

        <!-- 操作按钮 -->
        <view class="order-actions">
          <button
            v-if="canShip(order)"
            class="action-btn cyan"
            @tap.stop="shipOrder(order)"
          >
            发货
          </button>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-if="orders.length === 0 && !loading" class="empty-state">
        <text class="empty-icon">📦</text>
        <text class="empty-text">暂无订单</text>
        <text class="empty-hint" v-if="hasActiveFilters">尝试清除筛选条件</text>
      </view>

      <!-- 加载状态 -->
      <view v-if="loading" class="loading-state">
        <text class="loading-text">加载中...</text>
      </view>
    </view>

    <!-- 状态筛选弹窗 -->
    <view class="popup" v-if="statusFilterVisible" @tap="hideStatusFilter">
      <view class="popup-content" @tap.stop>
        <view class="popup-title">选择状态</view>
        <view class="popup-options">
          <view
            v-for="status in statusOptions"
            :key="status.value"
            class="popup-option"
            :class="{ active: selectedStatus === status.value }"
            @tap="selectStatus(status.value)"
          >
            <text class="option-text">{{ status.label }}</text>
            <text v-if="status.count > 0" class="option-count">({{ status.count }})</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 日期筛选弹窗 -->
    <view class="popup" v-if="dateFilterVisible" @tap="hideDateFilter">
      <view class="popup-content" @tap.stop>
        <view class="popup-title">选择日期</view>
        <view class="popup-options">
          <view
            v-for="date in dateOptions"
            :key="date.value"
            class="popup-option"
            :class="{ active: selectedDate === date.value }"
            @tap="selectDate(date.value)"
          >
            <text class="option-text">{{ date.label }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 订单编号筛选弹窗 -->
    <view class="popup" v-if="orderIdFilterVisible" @tap="hideOrderIdFilter">
      <view class="popup-content" @tap.stop>
        <view class="popup-title">筛选订单编号</view>
        <view class="search-input-wrapper">
          <input
            class="search-input"
            v-model="orderIdKeyword"
            placeholder="输入完整或部分订单编号"
            @confirm="performOrderIdFilter"
          />
        </view>
        <view class="popup-actions">
          <button class="popup-btn cancel" @tap="hideOrderIdFilter">取消</button>
          <button class="popup-btn confirm" @tap="performOrderIdFilter">筛选</button>
        </view>
      </view>
    </view>

    <!-- 搜索弹窗 -->
    <view class="popup" v-if="searchVisible" @tap="hideSearchModal">
      <view class="popup-content" @tap.stop>
        <view class="popup-title">搜索订单</view>
        <view class="search-input-wrapper">
          <input
            class="search-input"
            v-model="searchKeyword"
            placeholder="输入订单号/客户姓名/手机号"
            @confirm="performSearch"
          />
        </view>
        <view class="popup-actions">
          <button class="popup-btn cancel" @tap="hideSearchModal">取消</button>
          <button class="popup-btn confirm" @tap="performSearch">搜索</button>
        </view>
      </view>
    </view>

    <!-- 发货模态框 -->
    <view v-if="showShippingModal" class="shipping-modal-overlay" @tap="closeShippingModal">
      <view class="shipping-modal-content" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">填写发货信息</text>
          <text class="modal-close" @tap="closeShippingModal">×</text>
        </view>

        <view class="modal-body">
          <!-- 物流公司选择 -->
          <view class="form-item">
            <text class="form-label">物流公司</text>
            <picker
              mode="selector"
              :range="carriers"
              range-key="name"
              :value="selectedCarrierIndex"
              @change="onCarrierChange"
            >
              <view class="picker-display">
                <text>{{ carriers[selectedCarrierIndex].name }}</text>
                <text class="arrow">›</text>
              </view>
            </picker>
          </view>

          <!-- 物流单号输入 -->
          <view class="form-item">
            <text class="form-label">物流单号</text>
            <input
              v-model="trackingNumber"
              class="form-input"
              placeholder="请输入物流单号"
              :maxlength="50"
            />
          </view>
        </view>

        <view class="modal-footer">
          <button class="modal-btn cancel" @tap="closeShippingModal">取消</button>
          <button class="modal-btn confirm" @tap="confirmShipping" :disabled="isShipping">
            {{ isShipping ? '发货中...' : '确认发货' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShow, onLoad } from '@dcloudio/uni-app'
import { request, getToken } from '../../utils/api'
import { confirmOfflinePayment } from '../../api/orders'
import { formatShortDateTime } from '../../utils/date'

// DEBUG flag
const DEBUG = true

// 状态栏高度
const statusBarHeight = ref(0)

interface Order {
  id: string
  status: string
  totalAmount?: number | string
  amountTotal?: number | string
  amountProduct?: number | string
  amountShipping?: number | string
  itemCount?: number
  createdAt?: string
  paidAt?: string
  targetProductionDate?: string
  customerName?: string
  customerPhone?: string
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
    recipientName: string
    regionText: string
    detailAddress: string
  }
}

// 状态筛选选项
const statusOptions = ref([
  { label: '全部', value: 'ALL', count: 0 },
  { label: '待付款', value: 'PENDING_PAYMENT', count: 0 },
  { label: '已支付', value: 'PAID', count: 0 },
  { label: '采购中', value: 'PURCHASING', count: 0 },
  { label: '制作中', value: 'IN_PRODUCTION', count: 0 },
  { label: '急冻中', value: 'FREEZING', count: 0 },
  { label: '已发货', value: 'SHIPPED', count: 0 },
  { label: '已完成', value: 'COMPLETED', count: 0 },
  { label: '售后中', value: 'AFTERSALE', count: 0 }
])

// 日期筛选选项
const dateOptions = ref([
  { label: '全部时间', value: 'all' },
  { label: '今天', value: 'today' },
  { label: '最近7天', value: 'week' },
  { label: '最近30天', value: 'month' }
])

// 数据
const allOrders = ref<Order[]>([])
const orders = ref<Order[]>([])
const loading = ref(false)

// 筛选状态
const selectedStatus = ref<string>('ALL')
const selectedDate = ref<string>('all')
const searchKeyword = ref('')
const orderIdKeyword = ref('')  // 订单编号筛选

// 弹窗显示状态
const statusFilterVisible = ref(false)
const dateFilterVisible = ref(false)
const orderIdFilterVisible = ref(false)
const searchVisible = ref(false)

// 发货模态框状态
const showShippingModal = ref(false)
const currentShippingOrder = ref<Order | null>(null)
const carriers = [
  { name: '顺丰速运', code: 'SF' },
  { name: '京东物流', code: 'JD' }
]
const selectedCarrierIndex = ref(0)
const trackingNumber = ref('')
const isShipping = ref(false)

// 金额编辑状态
const editingOrderId = ref<string | null>(null)
const editingAmount = ref<string>('')

// 统计数据
const stats = ref({
  todayOrders: 0,
  pendingOrders: 0,
  todayRevenue: '0'
})

// 计算属性
const statusFilterText = computed(() => {
  const option = statusOptions.value.find(s => s.value === selectedStatus.value)
  return option ? option.label : '状态'
})

const dateFilterText = computed(() => {
  const option = dateOptions.value.find(d => d.value === selectedDate.value)
  return option ? option.label : '日期'
})

const orderIdFilterText = computed(() => {
  return orderIdKeyword.value ? '订单号' : '订单号'
})

const hasActiveFilters = computed(() => {
  return selectedStatus.value !== 'ALL' ||
         selectedDate.value !== 'all' ||
         searchKeyword.value !== '' ||
         orderIdKeyword.value !== ''
})

// 生命周期
onLoad(() => {
  // 获取状态栏高度
  const systemInfo = uni.getSystemInfoSync()
  statusBarHeight.value = systemInfo.statusBarHeight || 0
})

onMounted(() => {
  loadOrders()
  loadStats()
})

onShow(() => {
  loadOrders()
})

// 返回上一页
function goBack() {
  uni.navigateBack()
}

// 加载订单列表
async function loadOrders() {
  if (DEBUG) {
    const token = getToken()
    console.log('[StaffOrders] Loading orders', {
      token: token ? token.substring(0, 20) + '...' : 'none',
      status: selectedStatus.value,
      date: selectedDate.value,
      keyword: searchKeyword.value,
      orderId: orderIdKeyword.value
    })
  }

  loading.value = true
  uni.showLoading({ title: '加载中...' })

  try {
    // 构建查询参数
    const params: any = {}

    if (selectedStatus.value !== 'ALL') {
      params.status = selectedStatus.value
    }

    if (selectedDate.value !== 'all') {
      const now = new Date()
      if (selectedDate.value === 'today') {
        params.startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString()
        params.endDate = new Date(now.setHours(23, 59, 59, 999)).toISOString()
      } else if (selectedDate.value === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        params.startDate = weekAgo.toISOString()
      } else if (selectedDate.value === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        params.startDate = monthAgo.toISOString()
      }
    }

    if (searchKeyword.value) {
      params.keyword = searchKeyword.value
    }

    if (orderIdKeyword.value) {
      params.orderId = orderIdKeyword.value
    }

    if (DEBUG) {
      console.log('[StaffOrders] Request params:', params)
    }

    // 调用管理员API
    const response = await request({
      url: '/admin/orders',
      method: 'GET',
      data: params
    })

    if (DEBUG) {
      console.log('[StaffOrders] Response:', response)
      console.log('[StaffOrders] Response code:', response.code)
      console.log('[StaffOrders] Response data:', response.data)
    }

    if (response.code === 0 && response.data) {
      const orderList = Array.isArray(response.data) ? response.data : (response.data.list || [])
      if (DEBUG) {
        console.log('[StaffOrders] Parsed order list:', orderList)
        console.log('[StaffOrders] Order count:', orderList.length)
        if (orderList.length > 0) {
          console.log('[StaffOrders] First order:', orderList[0])
        }
      }

      // 转换数据类型
      const processedOrders = orderList.map((order: any) => ({
        ...order,
        totalAmount: parseFloat(order.totalAmount || order.amountTotal || 0),
        amountTotal: parseFloat(order.amountTotal || order.totalAmount || 0),
        amountProduct: parseFloat(order.amountProduct || 0),
        amountShipping: parseFloat(order.amountShipping || 0)
      }))

      allOrders.value = processedOrders
      updateStatusCounts()
      filterOrders()

      if (DEBUG) {
        console.log('[StaffOrders] Successfully loaded', processedOrders.length, 'orders')
      }
    } else {
      console.error('[StaffOrders] Invalid response:', response)
      uni.showToast({
        title: response.message || '加载失败',
        icon: 'none'
      })
    }
  } catch (error: any) {
    console.error('[StaffOrders] Load orders error:', error)
    console.error('[StaffOrders] Error details:', {
      message: error.message,
      stack: error.stack
    })
    uni.showToast({
      title: error.message || '加载失败',
      icon: 'none'
    })
  } finally {
    loading.value = false
    uni.hideLoading()
  }
}

// 加载统计数据
async function loadStats() {
  try {
    const now = new Date()
    const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString()
    const todayEnd = new Date(now.setHours(23, 59, 59, 999)).toISOString()

    const response = await request({
      url: '/admin/orders',
      method: 'GET',
      data: {
        startDate: todayStart,
        endDate: todayEnd
      }
    })

    if (DEBUG) {
      console.log('[StaffOrders] Stats response:', response)
    }

    if (response.code === 0 && response.data) {
      const orderList = Array.isArray(response.data) ? response.data : (response.data.list || [])

      stats.value.todayOrders = orderList.length
      stats.value.pendingOrders = orderList.filter((o: any) =>
        o.status === 'PENDING_PAYMENT' || o.status === 'PAID'
      ).length

      const revenue = orderList
        .filter((o: any) => o.status !== 'PENDING_PAYMENT')
        .reduce((sum: number, o: any) => sum + parseFloat(o.totalAmount || o.amountTotal || 0), 0)
      stats.value.todayRevenue = revenue.toFixed(0)
    }
  } catch (error) {
    console.error('[StaffOrders] Load stats error:', error)
  }
}

// 更新状态数量
function updateStatusCounts() {
  statusOptions.value[0].count = allOrders.value.length
  statusOptions.value[1].count = allOrders.value.filter(o => o.status === 'PENDING_PAYMENT').length
  statusOptions.value[2].count = allOrders.value.filter(o => o.status === 'PAID').length
  statusOptions.value[3].count = allOrders.value.filter(o => o.status === 'PURCHASING').length
  statusOptions.value[4].count = allOrders.value.filter(o => o.status === 'IN_PRODUCTION').length
  statusOptions.value[5].count = allOrders.value.filter(o => o.status === 'FREEZING').length
  statusOptions.value[6].count = allOrders.value.filter(o => o.status === 'SHIPPED').length
  statusOptions.value[7].count = allOrders.value.filter(o => o.status === 'COMPLETED').length
  statusOptions.value[8].count = allOrders.value.filter(o => o.status === 'AFTERSALE').length
}

// 筛选订单
function filterOrders() {
  if (selectedStatus.value === 'ALL') {
    orders.value = allOrders.value
  } else {
    orders.value = allOrders.value.filter(o => o.status === selectedStatus.value)
  }
}

// 筛选弹窗操作
function showStatusFilter() {
  statusFilterVisible.value = true
}

function hideStatusFilter() {
  statusFilterVisible.value = false
}

function selectStatus(status: string) {
  selectedStatus.value = status
  hideStatusFilter()
  filterOrders()
  loadOrders()
}

function showDateFilter() {
  dateFilterVisible.value = true
}

function hideDateFilter() {
  dateFilterVisible.value = false
}

function selectDate(date: string) {
  selectedDate.value = date
  hideDateFilter()
  loadOrders()
}

function showOrderIdFilter() {
  orderIdFilterVisible.value = true
}

function hideOrderIdFilter() {
  orderIdFilterVisible.value = false
}

function performOrderIdFilter() {
  hideOrderIdFilter()
  loadOrders()
}

function resetFilters() {
  selectedStatus.value = 'ALL'
  selectedDate.value = 'all'
  searchKeyword.value = ''
  orderIdKeyword.value = ''
  loadOrders()
}

// 搜索操作
function showSearchModal() {
  searchVisible.value = true
}

function hideSearchModal() {
  searchVisible.value = false
}

function performSearch() {
  hideSearchModal()
  loadOrders()
}

// 快捷筛选
function filterByType(type: string) {
  if (type === 'today') {
    selectedDate.value = 'today'
  } else if (type === 'pending') {
    selectedStatus.value = 'PENDING_PAYMENT'
  }
  loadOrders()
}

// 查看订单详情
function viewOrderDetail(orderId: string) {
  uni.navigateTo({
    url: `/pages/order-detail/index?id=${orderId}`
  })
}

// 格式化函数
function formatAmount(amount?: number | string): string {
  if (!amount) return '0.00'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '0.00'
  return num.toFixed(2)
}

function formatPhone(phone?: string): string {
  if (!phone) return '--'
  if (phone.length !== 11) return phone
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

function formatFullDateTime(dateStr?: string): string {
  if (!dateStr) return '--'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '--'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '--'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '--'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatDogInfo(order: Order): string {
  if (!order.firstItem || !order.firstItem.dog) {
    return ''
  }
  const dog = order.firstItem.dog
  const dogName = dog.name || ''
  const breedName = dog.breedName || ''
  const weightKg = dog.weightKg || 0
  const parts = [dogName]
  if (breedName) parts.push(breedName)
  if (weightKg > 0) parts.push(`${weightKg}kg`)
  return parts.join(' · ')
}

function getRecipeName(order: Order): string {
  if (!order.firstItem || !order.firstItem.recipeSnapshot) {
    return ''
  }
  return order.firstItem.recipeSnapshot.name || ''
}

function getRecipeCoverImage(order: Order): string {
  if (!order.firstItem || !order.firstItem.recipeSnapshot) {
    return ''
  }
  return order.firstItem.recipeSnapshot.coverImageUrl || ''
}

function getTotalMeals(order: Order): number {
  if (!order.firstItem) return 0
  return order.firstItem.packageCount || 0
}

function getMealWeight(order: Order): number {
  if (!order.firstItem) return 0
  return order.firstItem.packageSpecG || 0
}

function formatAddress(address?: { regionText?: string }): string {
  if (!address || !address.regionText) return ''
  const regions = address.regionText.split(/\s+/)
  return regions[0] || address.regionText
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
    AFTERSALE: '售后中'
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
    SHIPPED: '#52c41a',
    COMPLETED: '#52c41a',
    CANCELLED: '#999',
    AFTERSALE: '#f5222d'
  }
  return colorMap[status] || '#999'
}

// 操作权限判断
function canConfirmPayment(order: Order): boolean {
  return order.status === 'PENDING_PAYMENT'
}

function canShip(order: Order): boolean {
  return order.status === 'FREEZING'
}

// 操作函数
async function confirmPayment(order: Order) {
  uni.showModal({
    title: '确认收款',
    content: `确认收到订单 #${order.id.slice(-8)} 的款项？`,
    success: async (res) => {
      if (res.confirm) {
        try {
          await confirmOfflinePayment(order.id, order.totalAmount || order.amountTotal || 0)
          uni.showToast({
            title: '收款成功',
            icon: 'success'
          })
          loadOrders()
          loadStats()
        } catch (error) {
          console.error('[StaffOrders] Confirm payment error:', error)
        }
      }
    }
  })
}

// 开始编辑金额
function startEditingAmount(order: Order) {
  editingOrderId.value = order.id
  editingAmount.value = formatAmount(order.totalAmount || order.amountTotal)
}

// 确认订单付款
async function confirmOrderPayment(order: Order) {
  uni.showModal({
    title: '确认付款',
    content: `确认订单 #${order.id.slice(-8)} 已付款？\n订单金额: ¥${formatAmount(order.totalAmount || order.amountTotal)}`,
    confirmText: '确认',
    cancelText: '取消',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '处理中...' })

        try {
          await confirmOfflinePayment(order.id, parseFloat(order.totalAmount || order.amountTotal || 0))

          uni.hideLoading()

          uni.showToast({
            title: '付款确认成功',
            icon: 'success',
            duration: 2000
          })

          // 刷新订单列表
          setTimeout(() => {
            loadOrders()
            loadStats()
          }, 500)
        } catch (error: any) {
          uni.hideLoading()
          console.error('[StaffOrders] Confirm payment error:', error)
          uni.showToast({
            title: error.message || '确认失败',
            icon: 'none'
          })
        }
      }
    }
  })
}

// 取消编辑金额
function cancelEditingAmount() {
  editingOrderId.value = null
  editingAmount.value = ''
}

// 确认修改金额
async function confirmAmountChange(order: Order) {
  const newAmount = parseFloat(editingAmount.value)

  if (isNaN(newAmount) || newAmount <= 0) {
    uni.showToast({
      title: '请输入有效金额',
      icon: 'none'
    })
    return
  }

  const originalAmount = parseFloat(order.totalAmount || order.amountTotal || 0)

  // 如果金额有变化，显示确认提示
  if (Math.abs(newAmount - originalAmount) > 0.01) {
    const diff = newAmount - originalAmount
    const diffText = diff > 0 ? `增加 ¥${diff.toFixed(2)}` : `减少 ¥${Math.abs(diff).toFixed(2)}`

    uni.showModal({
      title: '确认修改金额',
      content: `订单: ${order.id}\n原金额: ¥${originalAmount.toFixed(2)}\n新金额: ¥${newAmount.toFixed(2)}\n\n${diffText}\n\n确认修改?`,
      success: async (res) => {
        if (res.confirm) {
          await submitAmountChange(order.id, newAmount)
        }
      }
    })
  } else {
    // 金额没有变化，直接关闭编辑状态
    cancelEditingAmount()
  }
}

// 提交金额修改
async function submitAmountChange(orderId: string, newAmount: number) {
  uni.showLoading({ title: '修改中...' })

  try {
    await request({
      url: `/admin/orders/${orderId}/amount`,
      method: 'PUT',
      data: { amount: newAmount }
    })

    uni.hideLoading()

    uni.showToast({
      title: '修改成功',
      icon: 'success',
      duration: 2000
    })

    // 关闭编辑状态
    cancelEditingAmount()

    // 刷新订单列表和统计数据
    setTimeout(() => {
      loadOrders()
      loadStats()
    }, 500)
  } catch (error: any) {
    uni.hideLoading()
    console.error('[StaffOrders] Update amount error:', error)
    uni.showToast({
      title: error.message || '修改失败',
      icon: 'none'
    })
  }
}

function shipOrder(order: Order) {
  openShippingModal(order)
}

// 发货相关函数
function openShippingModal(order: Order) {
  currentShippingOrder.value = order
  selectedCarrierIndex.value = 0
  trackingNumber.value = ''
  showShippingModal.value = true
}

function closeShippingModal() {
  showShippingModal.value = false
  currentShippingOrder.value = null
  trackingNumber.value = ''
  selectedCarrierIndex.value = 0
}

function onCarrierChange(e: any) {
  selectedCarrierIndex.value = e.detail.value
}

async function confirmShipping() {
  if (!trackingNumber.value || trackingNumber.value.trim().length < 5) {
    uni.showToast({
      title: '请输入有效的物流单号',
      icon: 'none'
    })
    return
  }

  if (!currentShippingOrder.value) return

  isShipping.value = true
  try {
    await request({
      url: `/admin/orders/${currentShippingOrder.value.id}/ship`,
      method: 'POST',
      data: {
        carrierCode: carriers[selectedCarrierIndex.value].code,
        trackingNumber: trackingNumber.value.trim()
      }
    })

    uni.showToast({
      title: '发货成功',
      icon: 'success'
    })

    closeShippingModal()
    loadOrders()
    loadStats()
  } catch (error: any) {
    uni.showToast({
      title: error.message || '发货失败',
      icon: 'none'
    })
  } finally {
    isShipping.value = false
  }
}
</script>

<style scoped lang="scss">
.staff-orders {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 40rpx;
}

// 顶部导航栏
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.3);
}

.status-bar {
  width: 100%;
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx 32rpx;
  height: 88rpx;
  position: relative;
}

.back-btn {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  left: 32rpx;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
}

.back-icon {
  font-size: 48rpx;
  color: #fff;
  font-weight: bold;
}

.header-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #fff;
  flex: 1;
  text-align: center;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.header-actions {
  position: absolute;
  right: 32rpx;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  display: flex;
  gap: 16rpx;
}

.header-placeholder {
  width: 100%;
}

.search-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 32rpx;
  background-color: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-icon {
  font-size: 32rpx;
}

// 统计卡片
.stats-card {
  display: flex;
  background-color: #fff;
  margin: 24rpx 32rpx;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.stat-value {
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
}

.stat-label {
  font-size: 24rpx;
  color: #999;
}

.stat-divider {
  width: 2rpx;
  background-color: #f0f0f0;
  margin: 0 16rpx;
}

// 筛选栏
.filter-bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 0 32rpx 24rpx;
}

.filter-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  background-color: #fff;
  padding: 20rpx 24rpx;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.filter-text {
  font-size: 28rpx;
  color: #333;
}

.filter-arrow {
  font-size: 20rpx;
  color: #999;
}

.filter-reset {
  padding: 20rpx 24rpx;
}

.reset-text {
  font-size: 28rpx;
  color: #667eea;
}

// 订单列表
.order-list {
  padding: 0 32rpx;
}

.order-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.order-times {
  margin-bottom: 16rpx;
  padding: 12rpx;
  background-color: #f8f9fa;
  border-radius: 8rpx;
}

.time-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.time-item:last-child {
  margin-bottom: 0;
}

.time-label {
  font-size: 24rpx;
  color: #666;
  flex-shrink: 0;
}

.time-value {
  font-size: 24rpx;
  color: #333;
  font-weight: 500;
  margin-left: 16rpx;
  text-align: right;
}

.order-info {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-wrap: wrap;
}

.order-label {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
}

.order-id {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400rpx;
}

.order-time {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
}

.order-status {
  font-size: 28rpx;
  font-weight: bold;
}

// 客户信息
.customer-info {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 16rpx;
  padding: 12rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
}

.customer-label {
  font-size: 24rpx;
  color: #666;
}

.customer-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
}

.customer-phone {
  font-size: 24rpx;
  color: #666;
  margin-left: auto;
}

// 订单摘要
.order-summary {
  margin-bottom: 16rpx;
  padding: 12rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
}

.summary-text {
  font-size: 26rpx;
  color: #666;
}

// 狗狗信息
.order-dogs {
  margin-bottom: 16rpx;
}

.dogs-text {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

// 商品信息
.order-items {
  margin-bottom: 16rpx;
  padding-left: 12rpx;
}

.recipe-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 8rpx;
}

.recipe-cover {
  width: 80rpx;
  height: 80rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}

.recipe-name {
  flex: 1;
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.meal-info {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.meal-text {
  font-size: 26rpx;
  color: #666;
}

.meal-separator {
  font-size: 26rpx;
  color: #ccc;
}

// 收货地址
.order-address {
  margin-bottom: 16rpx;
  padding-left: 12rpx;
}

.address-text {
  font-size: 26rpx;
  color: #666;
}

// 订单金额
.order-amount {
  padding-top: 8rpx;
}

.amount-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.amount-info {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.amount-label {
  font-size: 26rpx;
  color: #666;
  flex-shrink: 0;
}

.amount-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #ff4d4f;
  margin-left: 8rpx;
  flex-shrink: 0;
}

.amount-input {
  width: 200rpx;
  height: 56rpx;
  border: 2rpx solid #667eea;
  border-radius: 8rpx;
  padding: 0 16rpx;
  font-size: 32rpx;
  font-weight: bold;
  color: #ff4d4f;
  margin-left: 8rpx;
  flex-shrink: 0;
}

.button-group {
  display: flex;
  gap: 12rpx;
  flex-shrink: 0;
  margin-left: 16rpx;
}

.edit-amount-btn {
  padding: 8rpx 20rpx;
  height: 56rpx;
  line-height: 40rpx;
  background-color: #667eea;
  color: #fff;
  border-radius: 8rpx;
  font-size: 24rpx;
  border: none;
  display: inline-block;
  white-space: nowrap;
}

.edit-amount-btn.confirm-btn {
  background-color: #52c41a;
}

.edit-amount-btn::after {
  border: none;
}

.confirm-payment-btn {
  padding: 8rpx 20rpx;
  height: 56rpx;
  line-height: 40rpx;
  background-color: #ff4d4f;
  color: #fff;
  border-radius: 8rpx;
  font-size: 24rpx;
  border: none;
  display: inline-block;
  white-space: nowrap;
}

.confirm-payment-btn::after {
  border: none;
}

.amount-breakdown {
  display: flex;
  justify-content: space-between;
  padding-left: 8rpx;
  margin-top: 4rpx;
}

.breakdown-item {
  font-size: 24rpx;
  color: #999;
}

// 操作按钮
.order-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #f0f0f0;
}

.action-btn {
  flex: 1;
  height: 64rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
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

  &.secondary {
    background-color: #fff;
    color: #666;
    border: 2rpx solid #d9d9d9;
  }

  &::after {
    border: none;
  }
}

// 空状态
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}

.empty-icon {
  font-size: 120rpx;
  margin-bottom: 24rpx;
}

.empty-text {
  font-size: 28rpx;
  color: #999;
  margin-bottom: 16rpx;
}

.empty-hint {
  font-size: 24rpx;
  color: #ccc;
}

// 加载状态
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80rpx 0;
}

.loading-text {
  font-size: 28rpx;
  color: #999;
}

// 弹窗
.popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 1000;
}

.popup-content {
  width: 100%;
  background-color: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx;
  max-height: 70vh;
  overflow-y: auto;
}

.popup-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  text-align: center;
  margin-bottom: 32rpx;
}

.popup-options {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.popup-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  background-color: #f5f5f5;
  border-radius: 12rpx;

  &.active {
    background-color: #e6f7ff;
    border: 2rpx solid #1890ff;
  }
}

.option-text {
  font-size: 28rpx;
  color: #333;
}

.option-count {
  font-size: 24rpx;
  color: #999;
}

// 搜索框
.search-input-wrapper {
  margin-bottom: 32rpx;
}

.search-input {
  width: 100%;
  padding: 24rpx;
  background-color: #f5f5f5;
  border-radius: 12rpx;
  font-size: 28rpx;
}

.popup-actions {
  display: flex;
  gap: 16rpx;
}

.popup-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  border: none;

  &.cancel {
    background-color: #f5f5f5;
    color: #666;
  }

  &.confirm {
    background-color: #1890ff;
    color: #fff;
  }

  &::after {
    border: none;
  }
}

// 发货模态框样式
.shipping-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.shipping-modal-content {
  width: 640rpx;
  background-color: #fff;
  border-radius: 24rpx;
  overflow: hidden;
  animation: modalSlideUp 0.3s ease-out;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;

  .modal-title {
    font-size: 36rpx;
    font-weight: bold;
    color: #333;
  }

  .modal-close {
    font-size: 48rpx;
    color: #999;
    line-height: 1;
    padding: 0 16rpx;
  }
}

.modal-body {
  padding: 32rpx;
}

.form-item {
  margin-bottom: 32rpx;

  &:last-child {
    margin-bottom: 0;
  }

  .form-label {
    display: block;
    font-size: 28rpx;
    color: #333;
    margin-bottom: 16rpx;
    font-weight: 500;
  }
}

.picker-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  background-color: #f5f5f5;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #333;

  .arrow {
    font-size: 32rpx;
    color: #999;
  }
}

.form-input {
  width: 100%;
  height: 88rpx;
  padding: 24rpx;
  background-color: #f5f5f5;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #333;
  box-sizing: border-box;

  &:focus {
    background-color: #fff;
    border: 2rpx solid #667eea;
  }
}

.modal-footer {
  display: flex;
  border-top: 1rpx solid #f0f0f0;
}

.modal-btn {
  flex: 1;
  height: 100rpx;
  line-height: 100rpx;
  text-align: center;
  font-size: 32rpx;
  border: none;
  background: none;

  &.cancel {
    color: #666;
    border-right: 1rpx solid #f0f0f0;
  }

  &.confirm {
    color: #667eea;
    font-weight: 500;

    &:disabled {
      color: #ccc;
    }
  }

  &::after {
    border: none;
  }
}

@keyframes modalSlideUp {
  from {
    transform: translateY(100rpx);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
