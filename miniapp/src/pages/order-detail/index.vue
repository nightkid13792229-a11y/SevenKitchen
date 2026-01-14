<template>
  <view class="order-detail-page">
    <view v-if="order" class="order-detail">
      <!-- 订单类型标签 -->
      <view class="order-type-tag">鲜食制作订单</view>

      <!-- 订单进度条 -->
      <view class="progress-section">
        <OrderProgressBar :status="order.status" />
      </view>

      <!-- 订单基本信息 -->
      <view class="section info-section">
        <view class="section-title">基本信息</view>
        <view class="info-row">
          <text class="label">订单编号:</text>
          <text class="value order-id">{{ formatOrderId(order.id) }}</text>
          <button class="btn-copy" @tap="copyOrderId">复制</button>
        </view>
        <view class="info-row">
          <text class="label">订单状态:</text>
          <text class="value status" :style="{ color: getStatusColor(order.status) }">
            {{ getStatusText(order.status) }}
          </text>
        </view>
        <view class="info-row">
          <text class="label">下单时间:</text>
          <text class="value">{{ formatTime(order.createdAt) }}</text>
        </view>
        <view class="info-row">
          <text class="label">订单金额:</text>
          <text class="value amount">¥{{ formatAmount(order.amountTotal || order.totalAmount) }}</text>
        </view>
      </view>

      <!-- 收货信息 -->
      <view class="section address-section" v-if="order.address">
        <view class="section-title">收货信息</view>
        <view class="address-card">
          <view class="address-info">
            <text class="recipient">{{ order.address.recipientName }} {{ order.address.phone }}</text>
            <text class="detail">{{ order.address.regionText }} {{ order.address.detailAddress }}</text>
          </view>
        </view>
      </view>

      <!-- 支付信息 -->
      <view class="section payment-section" v-if="order.paidAt">
        <view class="section-title">支付信息</view>
        <view class="info-row">
          <text class="label">支付方式:</text>
          <text class="value">{{ getPaymentMethodText(order.paymentMethod) }}</text>
        </view>
        <view class="info-row" v-if="order.transactionId">
          <text class="label">交易单号:</text>
          <text class="value transaction-id">{{ order.transactionId }}</text>
          <button class="btn-copy" @tap="copyTransactionId">复制</button>
        </view>
        <view class="info-row">
          <text class="label">支付时间:</text>
          <text class="value">{{ formatTime(order.paidAt) }}</text>
        </view>
      </view>

      <!-- 商品信息 -->
      <view class="section items-section">
        <view class="section-title">商品信息</view>

        <!-- 按狗狗分组 -->
        <view
          v-for="group in groupedItems"
          :key="group.dogId"
          class="dog-group"
        >
          <view class="dog-header">
            <text class="dog-name">{{ group.dogName }}</text>
            <text class="dog-detail">{{ group.dogBreedName }} | {{ group.dogWeightKg }}kg</text>
          </view>

          <view
            v-for="item in group.items"
            :key="item.id"
            class="order-item-card"
          >
            <view class="item-header">
              <text class="recipe-name">{{ item.recipeSnapshot?.name }}</text>
              <text class="recipe-version">v{{ item.recipeSnapshot?.version }}</text>
            </view>

            <!-- 订购信息 -->
            <view class="extended-info">
              <view class="info-row-small">
                <text class="info-label">总净重:</text>
                <text class="info-value-small">{{ Math.round(item.quantityG) }}g</text>
              </view>
              <view class="info-row-small">
                <text class="info-label">总餐数:</text>
                <text class="info-value-small">{{ item.packageCount }}餐</text>
              </view>
              <view class="info-row-small">
                <text class="info-label">每餐重量:</text>
                <text class="info-value-small">{{ item.packageSpecG }}g/餐</text>
              </view>
            </view>

          </view>
        </view>
      </view>

      <!-- 售后服务（FREEZING、SHIPPED或COMPLETED状态可申请） -->
      <view class="section aftersale-section" v-if="canApplyAftersale(order.status)">
        <view class="section-title">售后服务</view>
        <view class="aftersale-buttons">
          <button class="btn-aftersale" @tap="applyAftersaleType('REFUND')">
            <text class="btn-text">申请退款</text>
          </button>
          <button class="btn-aftersale" @tap="applyAftersaleType('REMAKE')">
            <text class="btn-text">申请重做</text>
          </button>
          <button class="btn-aftersale" @tap="applyAftersaleType('COMPLAINT')">
            <text class="btn-text">投诉建议</text>
          </button>
        </view>
      </view>

      <!-- 售后信息（AFTERSALE状态显示） -->
      <view class="section aftersale-info-section" v-if="order.status === 'AFTERSALE'">
        <view class="section-title">售后信息</view>
        <view class="aftersale-info">
          <view class="info-row">
            <text class="label">售后类型:</text>
            <text class="value">{{ getAftersaleTypeText(order.aftersaleType) }}</text>
          </view>
          <view class="info-row">
            <text class="label">申请时间:</text>
            <text class="value">{{ formatTime(order.aftersaleSince) }}</text>
          </view>
          <view class="info-row">
            <text class="label">售后原因:</text>
            <text class="value">{{ order.aftersaleReason }}</text>
          </view>
          <view class="aftersale-photos" v-if="order.aftersalePhotos && order.aftersalePhotos.length > 0">
            <text class="photos-label">凭证图片:</text>
            <view class="photos-grid">
              <image
                v-for="(img, idx) in order.aftersalePhotos"
                :key="idx"
                :src="img"
                mode="aspectFill"
                class="photo-item"
                @tap="previewAftersaleImage(idx)"
              />
            </view>
          </view>
        </view>
      </view>

      <!-- 评价及建议（仅在COMPLETED状态显示） -->
      <view class="section review-section" v-if="order.status === 'COMPLETED'">
        <view class="section-title">评价及建议</view>

        <view class="review-rating">
          <text class="rating-label">评分：</text>
          <view class="star-rating">
            <text
              v-for="star in 5"
              :key="star"
              class="star"
              :class="{ active: star <= reviewRating }"
              @tap="setRating(star)"
            >
              {{ star <= reviewRating ? '●' : '○' }}
            </text>
          </view>
        </view>

        <view class="review-content">
          <text class="content-label">评价内容：</text>
          <textarea
            class="review-textarea"
            v-model="reviewText"
            placeholder="请输入您的评价和建议..."
            maxlength="500"
          />
          <view class="char-count">{{ reviewText.length }}/500</view>
        </view>

        <view class="review-images">
          <text class="images-label">添加图片：</text>
          <view class="image-upload">
            <view
              v-for="(img, index) in reviewImages"
              :key="index"
              class="image-item"
            >
              <image :src="img" mode="aspectFill" class="uploaded-image" />
              <view class="btn-remove-image" @tap="removeImage(index)">×</view>
            </view>
            <view
              v-if="reviewImages.length < 9"
              class="btn-add-image"
              @tap="chooseImage"
            >
              <text class="add-icon">+</text>
              <text class="add-text">添加图片</text>
            </view>
          </view>
          <text class="image-hint">最多可上传9张图片</text>
        </view>

        <button class="btn-submit-review" @tap="submitReview">提交评价</button>
      </view>

      <!-- 物流信息（仅在SHIPPED状态显示）-->
      <view class="section shipping-section" v-if="order.status === 'SHIPPED' && order.trackingNumber">
        <view class="section-title">物流信息</view>
        <view class="info-row">
          <text class="label">快递公司:</text>
          <text class="value">{{ getCarrierName(order.carrierCode) }}</text>
        </view>
        <view class="info-row">
          <text class="label">运单号:</text>
          <text class="value tracking-number">{{ order.trackingNumber }}</text>
          <button class="btn-copy" @tap="copyTrackingNumber">复制</button>
        </view>
        <view class="info-row" v-if="order.shippedAt">
          <text class="label">发货时间:</text>
          <text class="value">{{ formatTime(order.shippedAt) }}</text>
        </view>
      </view>
    </view>

    <!-- 底部操作按钮 -->
    <!-- Phase 9: Simplified action buttons aligned with e-commerce standards -->
    <!-- Phase 9.1: Added FREEZING and AFTERSALE status actions -->
    <view class="bottom-actions" v-if="order">
      <!-- 生产中状态 (合并PAID和IN_PRODUCTION) -->
      <view v-if="order.status === 'PAID' || order.status === 'IN_PRODUCTION'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="contactService">联系客服</button>
      </view>

      <!-- 急冻中状态 -->
      <view v-else-if="order.status === 'FREEZING'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="contactService">联系客服</button>
      </view>

      <!-- 已发货状态 -->
      <view v-else-if="order.status === 'SHIPPED'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="viewLogistics">查看物流</button>
        <button class="btn-action btn-primary" @tap="confirmReceived">确认收货</button>
      </view>

      <!-- 售后中状态 -->
      <view v-else-if="order.status === 'AFTERSALE'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="contactService">联系客服</button>
      </view>

      <!-- 已完成状态 -->
      <view v-else-if="order.status === 'COMPLETED'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="buyAgain">再次购买</button>
        <button class="btn-action btn-primary" @tap="writeReview">评价</button>
      </view>

      <!-- 已取消状态 -->
      <view v-else-if="order.status === 'CANCELLED'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="buyAgain">再次购买</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request } from '../../utils/api'
import OrderProgressBar from '../../components/OrderProgressBar.vue'

interface OrderItem {
  id: string
  dogId?: string
  dogName?: string
  dogBreedName?: string
  dogWeightKg?: number
  dog?: {
    mealsPerDay?: number
  }
  recipeSnapshot?: {
    id: string
    version: number
    name: string
    nutrition_standard: string
    energy_density_kcal_per_kg: number
    production_loss_rate: number
    items: Array<{
      ingredient_id: string
      name: string
      ratio: number
      ingredient_type?: string
      nutrient_target_key?: string
      nutrient_target_value?: number
      properties?: any
    }>
  }
  dailyIntakeG?: number
  quantityG: number
  packageCount: number
  packageSpecG: number
  totalPrice?: number
}

interface Order {
  id: string
  type: string
  status: string
  createdAt: string
  amountTotal?: number
  totalAmount?: number
  amountProduct?: number
  amountShipping?: number
  items?: OrderItem[]
  address?: {
    recipientName: string
    phone: string
    regionText: string
    detailAddress: string
  }
  trackingNumber?: string
  carrierCode?: string
  shippedAt?: string
  paymentMethod?: string
  transactionId?: string
  paidAt?: string
  // Phase 9.1: Aftersale fields
  aftersaleType?: string
  aftersaleSince?: string
  aftersaleReason?: string
  aftersalePhotos?: string[]
}

const order = ref<Order | null>(null)
const orderId = ref('')

// 评价相关
const reviewRating = ref(0)
const reviewText = ref('')
const reviewImages = ref<string[]>([])

// 按狗狗分组
const groupedItems = computed(() => {
  if (!order.value?.items) return []

  const groups = new Map()

  order.value.items.forEach((item: any) => {
    const dogId = item.dogId || 'unknown'
    if (!groups.has(dogId)) {
      groups.set(dogId, {
        dogId,
        dogName: item.dog?.name || item.dogName || '未知狗狗',
        dogBreedName: item.dog?.breedName || item.dogBreedName || '',
        dogWeightKg: item.dog?.weightKg || item.dogWeightKg || 0,
        items: []
      })
    }
    groups.get(dogId).items.push(item)
  })

  return Array.from(groups.values())
})

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  orderId.value = currentPage.options?.id || currentPage.options?.orderId || ''

  if (orderId.value) {
    loadOrderDetail()
  }
})

async function loadOrderDetail() {
  try {
    uni.showLoading({ title: '加载中...' })

    const res = await request({
      url: `/orders/${orderId.value}`,
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      order.value = res.data
      // Debug logging
      console.log('[Order Detail] API Response:', res.data)
      console.log('[Order Detail] Order amountProduct:', res.data.amountProduct)
      console.log('[Order Detail] Order amountTotal:', res.data.amountTotal)
      console.log('[Order Detail] Order items:', res.data.items)
      if (res.data.items && res.data.items.length > 0) {
        console.log('[Order Detail] First item totalPrice:', res.data.items[0].totalPrice)
        console.log('[Order Detail] First item packageCount:', res.data.items[0].packageCount)
      }
    }
  } catch (error) {
    console.error('Load order detail error:', error)
  } finally {
    uni.hideLoading()
  }
}

function formatOrderId(id: string): string {
  return id.substring(0, 8) + '...'
}

function formatTime(timeStr?: string): string {
  if (!timeStr) return '-'
  const date = new Date(timeStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hour}:${minute}`
}

function formatAmount(amount?: number): string {
  if (!amount) return '0.00'
  return amount.toFixed(2)
}

function calculateUnitPrice(item: OrderItem): number {
  if (!item.packageCount || item.packageCount === 0) return 0
  return (item.totalPrice || 0) / item.packageCount
}

function getStatusText(status: string): string {
  // Phase 9: Simplified status text aligned with e-commerce standards
  const statusMap: Record<string, string> = {
    INIT: '待确认',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    IN_PRODUCTION: '制作中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消'
  }
  return statusMap[status] || status
}

function getStatusIcon(status: string): string {
  // Phase 9: Simplified status icons aligned with e-commerce standards
  const iconMap: Record<string, string> = {
    INIT: '📝',
    PENDING_PAYMENT: '💳',
    PAID: '✓',
    IN_PRODUCTION: '👨‍🍳',
    SHIPPED: '🚚',
    COMPLETED: '✅',
    CANCELLED: '✕'
  }
  return iconMap[status] || ''
}

function getStatusColor(status: string): string {
  // Phase 9: Simplified status colors aligned with e-commerce standards
  const colorMap: Record<string, string> = {
    INIT: '#999',
    PENDING_PAYMENT: '#ff9800',
    PAID: '#1890ff',
    IN_PRODUCTION: '#1890ff',
    SHIPPED: '#52c41a',
    COMPLETED: '#52c41a',
    CANCELLED: '#999'
  }
  return colorMap[status] || '#999'
}

function getPaymentMethodText(method?: string): string {
  const methodMap: Record<string, string> = {
    WECHAT: '微信支付',
    ALIPAY: '支付宝'
  }
  return methodMap[method || ''] || method || '-'
}

function getCarrierName(code?: string): string {
  const carrierMap: Record<string, string> = {
    SF: '顺丰速运',
    STO: '申通快递',
    YTO: '圆通速递',
    ZTO: '中通快递',
    EMS: 'EMS'
  }
  return carrierMap[code || ''] || code || '-'
}

function copyOrderId() {
  uni.setClipboardData({
    data: order.value?.id || '',
    success: () => {
      uni.showToast({ title: '订单号已复制', icon: 'success' })
    }
  })
}

function copyTransactionId() {
  uni.setClipboardData({
    data: order.value?.transactionId || '',
    success: () => {
      uni.showToast({ title: '交易单号已复制', icon: 'success' })
    }
  })
}

function copyTrackingNumber() {
  uni.setClipboardData({
    data: order.value?.trackingNumber || '',
    success: () => {
      uni.showToast({ title: '运单号已复制', icon: 'success' })
    }
  })
}

// 取消订单
async function cancelOrder() {
  uni.showModal({
    title: '确认取消',
    content: '确定要取消这个订单吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          uni.showLoading({ title: '取消中...' })
          const result = await request({
            url: `/orders/${orderId.value}/cancel`,
            method: 'POST'
          })
          if (result.code === 0) {
            uni.showToast({
              title: '订单已取消',
              icon: 'success'
            })
            // 重新加载订单详情
            loadOrderDetail()
          }
        } catch (error) {
          uni.showToast({
            title: '取消失败',
            icon: 'none'
          })
        } finally {
          uni.hideLoading()
        }
      }
    }
  })
}

// 立即付款
async function payOrder() {
  try {
    // 开发环境：显示模拟支付确认
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '模拟支付',
        content: '测试环境下使用模拟支付，确定继续吗？',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false)
      })
    })

    if (!confirmed) {
      return
    }

    uni.showLoading({ title: '正在处理支付...' })

    // 调用后端支付API
    const res = await request({
      url: `/orders/${orderId.value}/pay`,
      method: 'POST'
    })

    if (res.code === 0 && res.data) {
      uni.showToast({
        title: '支付成功',
        icon: 'success'
      })

      // 刷新订单详情
      await loadOrderDetail()
    } else {
      throw new Error(res.message || '支付失败')
    }

  } catch (error) {
    console.error('Payment error:', error)
    const errorMessage = error instanceof Error ? error.message : '支付失败，请重试'
    uni.showToast({
      title: errorMessage,
      icon: 'none'
    })
  } finally {
    uni.hideLoading()
  }
}

// 联系客服
function contactService() {
  uni.showModal({
    title: '联系客服',
    content: '客服电话：400-123-4567\n工作时间：9:00-18:00',
    showCancel: false
  })
}

// 查看物流
function viewLogistics() {
  uni.showToast({
    title: '查看物流...',
    icon: 'none'
  })
  // TODO: 跳转到物流详情页
}

// 确认收货
async function confirmReceived() {
  uni.showModal({
    title: '确认收货',
    content: '确认已收到商品吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          uni.showLoading({ title: '确认中...' })
          const result = await request({
            url: `/orders/${orderId.value}/confirm`,
            method: 'POST'
          })
          if (result.code === 0) {
            uni.showToast({
              title: '已确认收货',
              icon: 'success'
            })
            loadOrderDetail()
          }
        } catch (error) {
          uni.showToast({
            title: '确认失败',
            icon: 'none'
          })
        } finally {
          uni.hideLoading()
        }
      }
    }
  })
}

// 再次购买
async function buyAgain() {
  if (!order.value?.items || order.value.items.length === 0) {
    uni.showToast({
      title: '订单中没有商品',
      icon: 'none'
    })
    return
  }

  const firstItem = order.value.items[0]
  const recipeId = firstItem.recipeSnapshot?.id

  if (!recipeId) {
    uni.showToast({
      title: '食谱信息不完整',
      icon: 'none'
    })
    return
  }

  try {
    // 检查食谱状态
    uni.showLoading({ title: '检查中...' })

    const res = await request({
      url: `/recipes/${recipeId}`,
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      const recipe = res.data

      // 检查食谱是否已下架
      if (recipe.status !== 'ACTIVE') {
        uni.showModal({
          title: '提示',
          content: '该食谱已下架，无法再次购买',
          showCancel: false
        })
        return
      }

      // 构建完整参数用于自动配置
      const dogId = firstItem.dogId || ''
      const packageCount = firstItem.packageCount || 7
      const packageSpecG = firstItem.packageSpecG || 100

      // ✅ 修复：直接使用用户配置的 packageSpecG 作为每餐饭量
      // 而不是使用系统推荐值 (dailyIntakeG / mealsPerDay)
      const perMealG = packageSpecG

      // 构建URL参数
      const params = new URLSearchParams({
        recipeId,
        ...(dogId && { dogId }),
        autoConfig: 'true',
        packageCount: String(packageCount),
        packageSpecG: String(packageSpecG),
        perMealG: String(Math.round(perMealG))
      })

      // 跳转到订购成品页
      uni.hideLoading()
      uni.navigateTo({
        url: `/pages/recipe-order/index?${params.toString()}`
      })
    } else {
      throw new Error('获取食谱信息失败')
    }
  } catch (error) {
    console.error('Check recipe error:', error)
    uni.showToast({
      title: '检查食谱失败',
      icon: 'none'
    })
  } finally {
    uni.hideLoading()
  }
}

// 判断是否可以申请售后
// Phase 9.1: FREEZING, SHIPPED, COMPLETED status can apply for aftersale
function canApplyAftersale(status: string): boolean {
  return ['FREEZING', 'SHIPPED', 'COMPLETED'].includes(status)
}

// 获取售后类型文本
function getAftersaleTypeText(type?: string): string {
  const typeMap: Record<string, string> = {
    'REFUND': '申请退款',
    'REMAKE': '申请重做',
    'COMPLAINT': '投诉建议',
    'RESOLVED': '已解决',
  }
  return typeMap[type || ''] || ''
}

// 申请售后（统一入口）
function applyAftersaleType(type: 'REFUND' | 'REMAKE' | 'COMPLAINT') {
  uni.navigateTo({
    url: `/pages/aftersale-apply/index?orderId=${orderId.value}&type=${type}`
  })
}

// 预览售后图片
function previewAftersaleImage(index: number) {
  if (!order.value?.aftersalePhotos || order.value.aftersalePhotos.length === 0) {
    return
  }

  uni.previewImage({
    current: index,
    urls: order.value.aftersalePhotos
  })
}

// 申请售后（旧函数，保留向后兼容）
function applyAftersale() {
  uni.navigateTo({
    url: `/pages/aftersale-apply/index?orderId=${orderId.value}&type=COMPLAINT`
  })
}

// 申请退款（旧函数，保留向后兼容）
async function applyRefund() {
  uni.navigateTo({
    url: `/pages/aftersale-apply/index?orderId=${orderId.value}&type=REFUND`
  })
}

// 联系Seven爸
function contactSevenDad() {
  uni.showModal({
    title: '联系Seven爸',
    content: '客服微信：SevenDad\n客服电话：400-123-4567\n工作时间：9:00-18:00',
    confirmText: '复制微信号',
    cancelText: '关闭',
    success: (res) => {
      if (res.confirm) {
        uni.setClipboardData({
          data: 'SevenDad',
          success: () => {
            uni.showToast({ title: '微信号已复制', icon: 'success' })
          }
        })
      }
    }
  })
}

// 设置评分
function setRating(star: number) {
  reviewRating.value = star
}

// 选择图片
function chooseImage() {
  const remainingCount = 9 - reviewImages.value.length
  uni.chooseImage({
    count: remainingCount,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      reviewImages.value.push(...res.tempFilePaths)
    }
  })
}

// 删除图片
function removeImage(index: number) {
  reviewImages.value.splice(index, 1)
}

// 提交评价
async function submitReview() {
  if (reviewRating.value === 0) {
    uni.showToast({
      title: '请先评分',
      icon: 'none'
    })
    return
  }

  if (!reviewText.value.trim()) {
    uni.showToast({
      title: '请输入评价内容',
      icon: 'none'
    })
    return
  }

  try {
    uni.showLoading({ title: '提交中...' })

    // TODO: 实现图片上传到服务器
    // const uploadedImages = await uploadImages(reviewImages.value)

    const result = await request({
      url: `/orders/${orderId.value}/review`,
      method: 'POST',
      data: {
        rating: reviewRating.value,
        content: reviewText.value,
        images: reviewImages.value // 暂时使用本地路径，实际应该上传后的URL
      }
    })

    if (result.code === 0) {
      uni.showToast({
        title: '评价提交成功',
        icon: 'success'
      })
      // 清空评价表单
      reviewRating.value = 0
      reviewText.value = ''
      reviewImages.value = []
    } else {
      throw new Error(result.message || '提交失败')
    }
  } catch (error) {
    console.error('Submit review error:', error)
    uni.showToast({
      title: '提交失败',
      icon: 'none'
    })
  } finally {
    uni.hideLoading()
  }
}
</script>

<style scoped>
.order-detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
}

.order-detail {
  padding: 20rpx;
}

/* 底部操作按钮 */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 16rpx 20rpx;
  border-top: 1rpx solid #e5e5e5;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.06);
  z-index: 100;
}

.action-buttons {
  display: flex;
  gap: 16rpx;
}

.btn-action {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
  text-align: center;
}

.btn-cancel {
  background-color: #fff;
  color: #999;
  border: 1rpx solid #ddd;
}

.btn-primary {
  background-color: #1890ff;
  color: #fff;
}

.btn-secondary {
  background-color: #fff;
  color: #1890ff;
  border: 1rpx solid #1890ff;
}

.order-type-tag {
  font-size: 26rpx;
  color: #1890ff;
  margin-bottom: 20rpx;
  padding: 10rpx 20rpx;
  background-color: #fff;
  border-radius: 8rpx;
  display: inline-block;
  text-align: center;
}

.progress-section {
  background-color: #fff;
  border-radius: 16rpx;
  margin-bottom: 20rpx;
  overflow: hidden;
}

.section {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.info-section {
  margin-bottom: 20rpx;
}

.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
  font-size: 28rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  color: #666;
  margin-right: 20rpx;
  min-width: 150rpx;
}

.value {
  color: #333;
  flex: 1;
}

.order-id {
  font-family: monospace;
  font-size: 26rpx;
}

.status {
  font-weight: 500;
}

.amount {
  font-size: 32rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.btn-copy {
  padding: 8rpx 20rpx;
  background-color: #f0f0f0;
  color: #333;
  border-radius: 6rpx;
  font-size: 24rpx;
  border: none;
}

/* 收货信息 */
.address-card {
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.address-info {
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

.dog-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.dog-detail {
  font-size: 24rpx;
  color: #999;
}

.order-item-card {
  background-color: #f9f9f9;
  border-radius: 12rpx;
  padding: 20rpx;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid #e8e8e8;
}

.recipe-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
}

.recipe-version {
  font-size: 22rpx;
  color: #999;
  padding: 4rpx 10rpx;
  background-color: #fff;
  border-radius: 4rpx;
}

.package-info {
  padding: 16rpx;
  background-color: #fff7e6;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
  border-left: 3rpx solid #ff9800;
}

.package-info.highlight {
  border-left-color: #ff9800;
}

.package-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.package-row:last-child {
  margin-bottom: 0;
}

.package-label {
  font-size: 26rpx;
  color: #666;
}

.package-value {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
}

.package-price {
  font-size: 30rpx;
  color: #ff9800;
  font-weight: bold;
}

/* 扩展信息 */
.extended-info {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #e8e8e8;
}

.info-row-small {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
  font-size: 26rpx;
}

.info-row-small:last-child {
  margin-bottom: 0;
}

.info-label {
  color: #666;
  margin-right: 12rpx;
}

.info-value-small {
  color: #333;
  font-weight: 500;
}

.info-value-small.price {
  color: #ff4d4f;
  font-weight: bold;
}

/* 售后服务 */
.aftersale-section {
  margin-bottom: 20rpx;
}

.aftersale-buttons {
  display: flex;
  gap: 16rpx;
}

.btn-aftersale {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24rpx 16rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  border: none;
}

.btn-aftersale .btn-text {
  font-size: 26rpx;
  color: #333;
}

/* 评价及建议 */
.review-section {
  margin-bottom: 20rpx;
}

.review-rating {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.rating-label {
  font-size: 28rpx;
  color: #333;
  margin-right: 16rpx;
}

.star-rating {
  display: flex;
  gap: 8rpx;
}

.star {
  font-size: 48rpx;
  color: #ddd;
}

.star.active {
  color: #FFD700;
}

.review-content {
  margin-bottom: 24rpx;
}

.content-label {
  font-size: 28rpx;
  color: #333;
  display: block;
  margin-bottom: 12rpx;
}

.review-textarea {
  width: 100%;
  min-height: 200rpx;
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
  border: 1rpx solid #e5e5e5;
}

.char-count {
  text-align: right;
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
}

.review-images {
  margin-bottom: 24rpx;
}

.images-label {
  font-size: 28rpx;
  color: #333;
  display: block;
  margin-bottom: 12rpx;
}

.image-upload {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.image-item {
  position: relative;
  width: 160rpx;
  height: 160rpx;
}

.uploaded-image {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}

.btn-remove-image {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  width: 40rpx;
  height: 40rpx;
  background-color: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 32rpx;
  line-height: 1;
}

.btn-add-image {
  width: 160rpx;
  height: 160rpx;
  background-color: #f9f9f9;
  border: 2rpx dashed #ddd;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.add-icon {
  font-size: 60rpx;
  color: #999;
  line-height: 1;
}

.add-text {
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
}

.image-hint {
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
  display: block;
}

.btn-submit-review {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
}

/* 物流信息 */
.transaction-id,
.tracking-number {
  font-family: monospace;
  font-size: 24rpx;
  word-break: break-all;
}
</style>
