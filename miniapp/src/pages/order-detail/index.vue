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
          <text class="value">{{ formatDateTime(order.createdAt) }}</text>
        </view>
        <view class="info-row" v-if="order.targetProductionDate">
          <text class="label">目标制作日期:</text>
          <text class="value">{{ formatDate(order.targetProductionDate) }}</text>
          <picker
            v-if="canEditDate"
            mode="date"
            :value="selectedDate"
            :start="minDateStr"
            @change="onDateSelected"
          >
            <view class="btn-edit">修改</view>
          </picker>
        </view>
        <view class="info-row" v-if="order.address">
          <text class="label">收货地址:</text>
          <view class="value-with-action">
            <text class="value address-value">
              {{ order.address.recipientName }} {{ order.address.phone }}
              {{ order.address.regionText }} {{ order.address.detailAddress }}
            </text>
            <button
              v-if="canEditAddress"
              class="btn-edit"
              @tap="changeAddress"
            >
              更换
            </button>
          </view>
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

      <!-- 待付款状态下的支付引导 -->
      <view
        class="section payment-guide-section"
        v-if="order.status === 'PENDING_PAYMENT'"
      >
        <view class="section-title">支付方式</view>

        <view class="payment-guide-card">
          <view class="guide-header">
            <text class="guide-title">支持微信及支付宝支付</text>
          </view>

          <view class="guide-steps">
            <view class="step-item">
              <text class="step-number">1</text>
              <text class="step-text">添加Seven爸爸的微信</text>
            </view>
            <view class="step-item">
              <text class="step-number">2</text>
              <text class="step-text">复制订单号发送给Seven爸爸, 以确认优惠及最终付款金额</text>
            </view>
            <view class="step-item">
              <text class="step-number">3</text>
              <text class="step-text">完成支付</text>
            </view>
          </view>

          <view class="wechat-contact">
            <text class="contact-label">Seven爸爸微信号:</text>
            <text class="contact-value">zhaochengccc</text>
            <button
              class="btn-copy-wechat"
              @tap="copyWechatId"
            >
              复制微信号
            </button>
          </view>

          <view class="order-id-copy">
            <text class="order-id-label">订单号:</text>
            <text class="order-id-value">{{ formatOrderId(order.id) }}</text>
            <button
              class="btn-copy-order-id"
              @tap="copyOrderId"
            >
              复制订单号
            </button>
          </view>

          <view class="payment-tip">
            <text class="tip-icon">⏰</text>
            <text class="tip-text">请尽快完成支付，订单长时间未付款可能会被取消</text>
          </view>
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
          <!-- 狗狗信息卡片 -->
          <view class="dog-info-card">
            <view class="dog-info">
              <text class="dog-name">{{ group.dogName }}</text>
              <text
                class="dog-gender"
                :class="group.dogGender === 'MALE' ? 'male' : 'female'"
              >
                {{ group.dogGender === 'MALE' ? '公' : '母' }}
              </text>
              <text class="dog-divider">|</text>
              <text class="dog-detail">{{ group.dogBreedName }}</text>
              <text class="dog-divider">|</text>
              <text class="dog-detail">{{ group.dogWeightKg }}kg</text>
            </view>
          </view>

          <!-- 订单商品列表 -->
          <view
            v-for="item in group.items"
            :key="item.id"
            class="order-item-card"
          >
            <!-- 第1层：食谱基本信息 -->
            <view class="item-header">
              <text class="recipe-name">{{ item.recipeSnapshot?.name }}</text>
              <text class="recipe-version">v{{ item.recipeSnapshot?.version }}</text>
              <text class="nutrition-standard">{{ item.recipeSnapshot?.nutrition_standard }}</text>
            </view>

            <!-- 第2层：订购信息 -->
            <view class="package-info-card">
              <view class="package-row">
                <text class="package-label">总净重:</text>
                <text class="package-value">{{ Math.round(item.quantityG) }}g</text>
              </view>
              <view class="package-row">
                <text class="package-label">总餐数:</text>
                <text class="package-value">{{ item.packageCount }}餐</text>
              </view>
              <view class="package-row">
                <text class="package-label">每餐重量:</text>
                <text class="package-value">{{ item.packageSpecG }}g/餐</text>
              </view>
              <view class="package-row" v-if="order.amountTotal && getTotalPackageCount()">
                <text class="package-label">单价:</text>
                <text class="package-value price">¥{{ calculatePricePerMeal() }}/餐</text>
              </view>
            </view>

            <!-- 第4层：原料清单（可展开/收起） -->
            <view
              class="ingredients-section"
              v-if="item.recipeSnapshot?.items && item.recipeSnapshot.items.length > 0"
            >
              <view
                class="ingredients-header"
                @tap="toggleIngredients(item.id)"
              >
                <view class="ingredients-title-row">
                  <text class="ingredients-title">原料清单</text>
                  <text class="ingredients-count">（共{{ item.recipeSnapshot.items.length }}种）</text>
                </view>
                <text class="expand-icon">{{ expandedIngredients[item.id] ? '收起' : '展开' }}</text>
              </view>

              <view
                class="ingredients-content"
                :class="{ expanded: expandedIngredients[item.id] }"
                v-if="expandedIngredients[item.id]"
              >
                <view
                  v-for="(category, idx) in getGroupedIngredients(item.recipeSnapshot.items)"
                  :key="idx"
                  class="ingredient-category"
                >
                  <view class="category-title">【{{ category.typeName }}】</view>
                  <view
                    v-for="(ingredient, iIdx) in category.items"
                    :key="iIdx"
                    class="ingredient-item"
                    @longpress="showIngredientDetail(ingredient, item)"
                  >
                    <text class="ingredient-text">{{ formatIngredientDisplay(ingredient, item) }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 原料照片（所有状态下都显示，如果有照片的话） -->
      <view
        class="section production-photos-section"
        v-if="order.productionPhotos && order.productionPhotos.photos.length > 0"
      >
        <view class="section-title">
          原料照片
          <text class="photos-time">{{ formatDateTime(order.productionPhotos.uploadedAt) }}</text>
        </view>

        <view class="production-photos">
          <view class="photos-grid">
            <image
              v-for="(photo, idx) in order.productionPhotos.photos"
              :key="idx"
              :src="photo"
              mode="aspectFill"
              class="production-photo-item"
              @tap="previewProductionPhotos(idx)"
            />
          </view>
          <view class="photos-hint">
            <text>员工在制作完成后上传的原料照片，供您验收</text>
          </view>
        </view>
      </view>

      <!-- 售后服务（FREEZING、SHIPPED或COMPLETED状态可申请） -->
      <!-- 已关闭售后入口 -->
      <!-- <view class="section aftersale-section" v-if="canApplyAftersale(order.status)">
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
      </view> -->

      <!-- 售后信息（AFTERSALE状态显示） -->
      <!-- 已关闭售后信息展示 -->
      <!-- <view class="section aftersale-info-section" v-if="order.status === 'AFTERSALE'">
        <view class="section-title">售后信息</view>
        <view class="aftersale-info">
          <view class="info-row">
            <text class="label">售后类型:</text>
            <text class="value">{{ getAftersaleTypeText(order.aftersaleType) }}</text>
          </view>
          <view class="info-row">
            <text class="label">申请时间:</text>
            <text class="value">{{ formatDateTime(order.aftersaleSince) }}</text>
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
      </view> -->

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
          <text class="value">{{ formatDateTime(order.shippedAt) }}</text>
        </view>
      </view>
    </view>

    <!-- 底部操作按钮 -->
    <!-- Phase 9: Simplified action buttons aligned with e-commerce standards -->
    <!-- Phase 9.1: Added FREEZING and AFTERSALE status actions -->
    <view class="bottom-actions" v-if="order">
      <!-- 生产中状态 (合并PAID和IN_PRODUCTION) -->
      <view v-if="order.status === 'PAID' || order.status === 'IN_PRODUCTION'" class="action-buttons">
        <!-- 移除联系客服按钮 -->
      </view>

      <!-- 急冻中状态 -->
      <view v-else-if="order.status === 'FREEZING'" class="action-buttons">
        <!-- 移除联系客服按钮 -->
      </view>

      <!-- 已发货状态 -->
      <view v-else-if="order.status === 'SHIPPED'" class="action-buttons">
        <button class="btn-action btn-secondary" @tap="viewLogistics">查看物流</button>
        <button class="btn-action btn-primary" @tap="confirmReceived">确认收货</button>
      </view>

      <!-- 售后中状态 -->
      <view v-else-if="order.status === 'AFTERSALE'" class="action-buttons">
        <!-- 移除联系客服按钮 -->
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
import { ref, computed, onMounted, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import OrderProgressBar from '../../components/OrderProgressBar.vue'
import { formatDateTime } from '../../utils/date'

interface RecipeSnapshotItem {
  ingredient_id: string
  name: string
  ratio: number
  ingredient_type?: string
  nutrient_target_key?: string
  nutrient_target_value?: number
  properties?: any
  preparation_methods?: string[]
  sort_order?: number
  unit_display_label?: string
}

interface OrderItem {
  id: string
  dogId?: string
  dogName?: string
  dogBreedName?: string
  dogWeightKg?: number
  dog?: {
    mealsPerDay?: number
    gender?: 'MALE' | 'FEMALE'
  }
  recipeSnapshot?: {
    id: string
    version: number
    name: string
    nutrition_standard: string
    energy_density_kcal_per_kg: number
    production_loss_rate: number
    items: RecipeSnapshotItem[]
  }
  dailyIntakeG?: number
  quantityG: number
  packageCount: number
  packageSpecG: number
  totalPrice?: number
}

interface Order {
  id: string
  customerId?: string // 添加customerId字段用于权限验证
  type: string
  status: string
  createdAt: string
  targetProductionDate?: string | null
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
  // 原料照片
  productionPhotos?: {
    unitId: string
    photos: string[]
    uploadedAt: string
  }
  // 定价快照（驼峰式，与后端保持一致）
  pricingBreakdownSnapshot?: {
    ingredientDetails?: Array<{
      ingredientId: string
      name: string
      amount: number
      unit: string
      type?: string
    }>
  }
}

const order = ref<Order | null>(null)
const orderId = ref('')

// 获取当前用户信息
const userInfo = ref({
  id: '',
  role: ''
})

// 评价相关
const reviewRating = ref(0)
const reviewText = ref('')
const reviewImages = ref<string[]>([])

// 原料清单展开状态
const expandedIngredients = ref<Record<string, boolean>>({})

// 原料类型映射
const ingredientTypeMap: Record<string, string> = {
  'FOOD': '食材',
  'VEGETABLE': '食材',
  'SUPPLEMENT': '补剂',
  'PACKAGING': '包装'
}

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
        dogGender: item.dog?.gender || 'MALE',
        items: []
      })
    }
    groups.get(dogId).items.push(item)
  })

  return Array.from(groups.values())
})

// 判断是否有编辑权限（订单所有者或管理员，不包括员工）
const canEditOrder = computed(() => {
  if (!order.value || !userInfo.value.id) {
    console.log('[Order Detail] canEditOrder: false - missing data', {
      hasOrder: !!order.value,
      hasUserId: !!userInfo.value.id
    })
    return false
  }

  // 员工（STAFF）不能编辑
  if (userInfo.value.role === 'STAFF') {
    console.log('[Order Detail] canEditOrder: false - user is STAFF')
    return false
  }

  // 管理员可以编辑任何订单
  const isAdmin = userInfo.value.role === 'ADMIN'
  if (isAdmin) {
    console.log('[Order Detail] canEditOrder: true - user is ADMIN')
    return true
  }

  // 普通用户：检查是否是订单所有者
  const orderData = order.value as any
  const isOwner = orderData.customerId === userInfo.value.id

  console.log('[Order Detail] canEditOrder:', {
    isOwner,
    isAdmin,
    orderCustomerId: orderData.customerId,
    userId: userInfo.value.id
  })

  return isOwner
})

// 判断是否可以修改地址（状态 < SHIPPED）
const canEditAddress = computed(() => {
  if (!order.value || !canEditOrder.value) return false
  const editableStatuses = ['INIT', 'PENDING_PAYMENT', 'PAID', 'PURCHASING', 'IN_PRODUCTION', 'FREEZING']
  return editableStatuses.includes(order.value.status)
})

// 判断是否可以修改日期（状态 < PURCHASING）
const canEditDate = computed(() => {
  if (!order.value || !canEditOrder.value) return false
  const editableStatuses = ['INIT', 'PENDING_PAYMENT', 'PAID']
  return editableStatuses.includes(order.value.status)
})

// 日期选择器状态
const selectedDate = ref('')
const minDateStr = ref('')

// 监控计算属性的变化
watch([canEditOrder, canEditAddress, canEditDate], ([canEdit, canAddr, canDate]) => {
  console.log('[Order Detail] Edit permissions:', {
    canEditOrder: canEdit,
    canEditAddress: canAddr,
    canEditDate: canDate,
    orderStatus: order.value?.status,
    userInfo: userInfo.value
  })
})

// 切换原料清单展开/收起
function toggleIngredients(itemId: string) {
  expandedIngredients.value[itemId] = !expandedIngredients.value[itemId]
}

// 获取分组后的原料
function getGroupedIngredients(items: RecipeSnapshotItem[]) {
  const groups = new Map<string, RecipeSnapshotItem[]>()

  items.forEach(ingredient => {
    const type = ingredient.ingredient_type || 'FOOD'
    const typeName = ingredientTypeMap[type] || '其他'

    if (!groups.has(typeName)) {
      groups.set(typeName, [])
    }

    groups.get(typeName)!.push(ingredient)
  })

  // 转换为数组并排序
  return Array.from(groups.entries()).map(([typeName, items]) => ({
    typeName,
    items: items.sort((a, b) => {
      // 优先按sort_order排序
      if (a.sort_order !== undefined && b.sort_order !== undefined) {
        return a.sort_order - b.sort_order
      }
      // 然后按ratio降序排序
      return b.ratio - a.ratio
    })
  }))
}

// 格式化原料显示
function formatIngredientDisplay(ingredient: RecipeSnapshotItem, item: OrderItem): string {
  const isSupplement = ingredient.ingredient_type === 'SUPPLEMENT'

  if (isSupplement) {
    // 补剂类型：从pricing_breakdown中获取实际用量
    const actualAmount = getSupplementActualAmount(ingredient)
    const unit = ingredient.unit_display_label || 'g'

    if (actualAmount > 0) {
      return `${ingredient.name} ${actualAmount}${unit}`
    } else {
      return `${ingredient.name}`
    }
  } else {
    // 普通原料：计算实际用量（克数）
    // ratio在数据库中存储的是百分比（如42.83），需要除以100
    const actualAmountG = Math.round(item.quantityG * (ingredient.ratio / 100))
    return `${ingredient.name} ${actualAmountG}g`
  }
}

// 获取补剂的实际用量（从pricingBreakdownSnapshot）
// 使用netAmount（不含损耗）而不是amount（含损耗）
function getSupplementActualAmount(ingredient: RecipeSnapshotItem): number {
  if (!order.value?.pricingBreakdownSnapshot?.ingredientDetails) {
    return 0
  }

  const ingredientDetails = order.value.pricingBreakdownSnapshot.ingredientDetails
  const detail = ingredientDetails.find((d: any) => d.ingredientId === ingredient.ingredient_id)

  if (detail) {
    // 使用netAmount（净需求，不含制作损耗）
    const amount = detail.netAmount !== undefined ? detail.netAmount : detail.amount
    // 根据单位决定保留小数位数
    if (detail.unit === '片' || detail.unit === '粒') {
      return Math.round(amount * 100) / 100 // 保留两位小数
    } else if (detail.unit === 'kg') {
      // kg转换为g
      return Math.round(amount * 1000)
    } else {
      return Math.round(amount * 10) / 10 // 保留一位小数
    }
  }

  return 0
}

// 长按查看原料详情
function showIngredientDetail(ingredient: RecipeSnapshotItem, item: OrderItem) {
  const isSupplement = ingredient.ingredient_type === 'SUPPLEMENT'
  const typeName = ingredientTypeMap[ingredient.ingredient_type || ''] || '其他'

  let content = `类型：${typeName}\n`

  if (isSupplement) {
    const actualAmount = getSupplementActualAmount(ingredient)
    const unit = ingredient.unit_display_label || 'g'
    content += `实际用量：${actualAmount}${unit}\n`
  } else {
    const ratio = Math.round(ingredient.ratio)
    const actualAmountG = Math.round(item.quantityG * (ingredient.ratio / 100))
    content += `比例：${ratio}%\n`
    content += `实际用量：${actualAmountG}g\n`
  }

  uni.showModal({
    title: ingredient.name,
    content: content.trim(),
    showCancel: false,
    confirmText: '关闭'
  })
}

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  orderId.value = currentPage.options?.id || currentPage.options?.orderId || ''

  // 获取用户信息 - 使用正确的存储key 'user'（与TabBar一致）
  try {
    // 尝试从 'user' key 读取（TabBar使用的key）
    let user = uni.getStorageSync('user') || '{}'
    console.log('[Order Detail] Raw user from storage:', user)

    // 如果 'user' key 为空，尝试 'userInfo' key
    if (user === '{}' || user === '' || !user) {
      user = uni.getStorageSync('userInfo') || '{}'
      console.log('[Order Detail] Trying userInfo key:', user)
    }

    // 处理存储的数据：可能是对象或JSON字符串
    let userData
    if (typeof user === 'string') {
      userData = JSON.parse(user)
    } else {
      userData = user
    }
    console.log('[Order Detail] Parsed userData:', userData)

    // 尝试多个可能的字段名
    const userId = userData.id || userData.userId || userData.customerId || userData.user?.id || ''
    const userRole = userData.role || userData.user?.role || 'CUSTOMER'

    userInfo.value = {
      id: userId,
      role: userRole
    }
    console.log('[Order Detail] User info loaded:', userInfo.value)

    // 如果还是没有用户ID，尝试从 API 获取
    if (!userId) {
      console.log('[Order Detail] No user ID in storage, fetching from API')
      loadUserInfoFromApi()
    }
  } catch (err) {
    console.error('Failed to load userInfo:', err)
    // 如果解析失败，尝试从 API 获取
    loadUserInfoFromApi()
  }

  if (orderId.value) {
    loadOrderDetail()
  }
})

async function loadUserInfoFromApi() {
  try {
    const res = await request({
      url: '/users/me',
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      userInfo.value = {
        id: res.data.id || res.data.userId || res.data.customerId || '',
        role: res.data.role || 'CUSTOMER'
      }
      console.log('[Order Detail] User info loaded from API:', userInfo.value)

      // 保存到两个key，确保兼容性
      uni.setStorageSync('user', JSON.stringify(res.data))
      uni.setStorageSync('userInfo', JSON.stringify(res.data))
    }
  } catch (error) {
    console.error('[Order Detail] Failed to load user info from API:', error)
  }
}

async function loadOrderDetail() {
  try {
    uni.showLoading({ title: '加载中...' })

    const res = await request({
      url: `/orders/${orderId.value}`,
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      order.value = res.data
      console.log('[Order Detail] Order loaded:', {
        id: order.value.id,
        status: order.value.status,
        customerId: order.value.customerId,
        targetProductionDate: order.value.targetProductionDate
      })
      console.log('[Order Detail] Can edit address:', canEditAddress.value)
      console.log('[Order Detail] Can edit date:', canEditDate.value)
    }
  } catch (error) {
    console.error('Load order detail error:', error)
  } finally {
    uni.hideLoading()
  }
}

// 更换收货地址
function changeAddress() {
  uni.navigateTo({
    url: `/pages/address-list/index?mode=select&orderId=${orderId.value}&from=order-detail`
  })
}

// 处理地址选择（从地址列表返回）
async function handleAddressSelected(data: string | { addressId: string; from?: string }) {
  // Handle both string and object formats for compatibility
  const addressId = typeof data === 'string' ? data : data?.addressId

  if (!addressId) return

  await updateOrderAddress(addressId)
}

async function updateOrderAddress(addressId: string) {
  try {
    uni.showLoading({ title: '更新中...' })

    const res = await request({
      url: `/orders/${orderId.value}/address`,
      method: 'PUT',
      data: { addressId }
    })

    if (res.code === 0) {
      uni.showToast({
        title: '地址已更新',
        icon: 'success'
      })
      // 重新加载订单详情
      await loadOrderDetail()
    } else {
      throw new Error(res.message || '更新失败')
    }
  } catch (error) {
    console.error('Update address error:', error)
    uni.showToast({
      title: error?.message || '更新失败',
      icon: 'none'
    })
  } finally {
    uni.hideLoading()
  }
}

// 初始化日期选择器的值
watch(() => order.value?.targetProductionDate, (newDate) => {
  // 使用原始目标制作日期作为最小可选日期，而不是当前日期
  // 这样允许用户修正误操作（例如从1月29日改回1月28日）
  const baseDate = order.value?.originalTargetProductionDate || newDate
  if (baseDate) {
    const date = new Date(baseDate)
    date.setHours(0, 0, 0, 0)
    minDateStr.value = formatDateToYYYYMMDD(date)
    selectedDate.value = formatDateToYYYYMMDD(newDate ? new Date(newDate) : date)
  }
}, { immediate: true })

function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 日期选择确认
function onDateSelected(e: any) {
  const newDateStr = e.detail.value

  // 调用API更新日期
  updateOrderDate(newDateStr)
}

async function updateOrderDate(newDateStr: string) {
  try {
    uni.showLoading({ title: '更新中...' })

    const res = await request({
      url: `/orders/${orderId.value}/production-date`,
      method: 'PUT',
      data: {
        targetProductionDate: newDateStr
      }
    })

    if (res.code === 0) {
      uni.showToast({
        title: '修改成功',
        icon: 'success'
      })
      // 重新加载订单详情
      await loadOrderDetail()
    } else {
      throw new Error(res.message || '修改失败')
    }
  } catch (error) {
    console.error('Update production date error:', error)
    uni.showToast({
      title: error?.message || '修改失败',
      icon: 'none'
    })
  } finally {
    uni.hideLoading()
  }
}

// 监听地址选择事件（从地址列表返回）
onShow(() => {
  // 监听地址选择事件
  uni.$on('address-selected', handleAddressSelected)
})

function formatOrderId(id: string): string {
  return id.substring(0, 8) + '...'
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function copyWechatId() {
  uni.setClipboardData({
    data: 'zhaochengccc',
    success: () => {
      uni.showToast({ title: '微信号已复制', icon: 'success' })
    }
  })
}

function copyOrderId() {
  uni.setClipboardData({
    data: order.value?.id || '',
    success: () => {
      uni.showToast({ title: '订单号已复制', icon: 'success' })
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
      // Note: WeChat miniprogram doesn't support URLSearchParams
      const queryPairs = [
        `recipeId=${encodeURIComponent(recipeId)}`,
        `autoConfig=true`,
        `packageCount=${packageCount}`,
        `packageSpecG=${packageSpecG}`,
        `perMealG=${Math.round(perMealG)}`
      ]
      if (dogId) {
        queryPairs.push(`dogId=${encodeURIComponent(dogId)}`)
      }
      const queryString = queryPairs.join('&')

      // 跳转到订购成品页
      uni.hideLoading()
      uni.navigateTo({
        url: `/pages/recipe-order/index?${queryString}`
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

// 计算总餐数
function getTotalPackageCount(): number {
  if (!order.value?.items) return 0
  return order.value.items.reduce((sum, item) => sum + (item.packageCount || 0), 0)
}

// 计算每餐单价（包含运费）
function calculatePricePerMeal(): string {
  if (!order.value?.amountTotal || !getTotalPackageCount()) return '0.00'
  const pricePerMeal = order.value.amountTotal / getTotalPackageCount()
  return pricePerMeal.toFixed(2)
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

// 预览原料照片
function previewProductionPhotos(index: number) {
  if (!order.value?.productionPhotos || !order.value.productionPhotos.photos || order.value.productionPhotos.photos.length === 0) {
    return
  }

  uni.previewImage({
    current: index,
    urls: order.value.productionPhotos.photos
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
    content: '客服微信：zhaochengccc\n客服电话：400-123-4567\n工作时间：9:00-18:00',
    confirmText: '复制微信号',
    cancelText: '关闭',
    success: (res) => {
      if (res.confirm) {
        uni.setClipboardData({
          data: 'zhaochengccc',
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
  word-break: break-all;
}

.address-value {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  line-height: 1.5;
  flex: 1;
}

.value-with-action {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
}

.btn-edit {
  padding: 6rpx 16rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 6rpx;
  font-size: 24rpx;
  border: none;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-edit::after {
  border: none;
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

/* 狗狗信息卡片 */
.dog-info-card {
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}

.dog-info {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-wrap: wrap;
}

.dog-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.dog-gender {
  font-size: 22rpx;
  font-weight: normal;
  padding: 2rpx 8rpx;
  border-radius: 4rpx;
  color: #666;
  background-color: #f0f0f0;
}

.dog-divider {
  font-size: 22rpx;
  color: #ccc;
  margin: 0 4rpx;
}

.dog-detail {
  font-size: 24rpx;
  color: #666;
}

.order-item-card {
  background-color: #f9f9f9;
  border-radius: 12rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
}

.order-item-card:last-child {
  margin-bottom: 0;
}

/* 第1层：食谱基本信息 */
.item-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #e8e8e8;
  flex-wrap: wrap;
}

.recipe-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
  flex-shrink: 0;
}

.recipe-version,
.nutrition-standard {
  font-size: 22rpx;
  padding: 4rpx 10rpx;
  border-radius: 4rpx;
  flex-shrink: 0;
}

.recipe-version {
  color: #666;
  background-color: #f0f0f0;
}

.nutrition-standard {
  color: #1890ff;
  background-color: #e6f7ff;
}

/* 第2层：订购信息 */
.package-info-card {
  padding: 16rpx;
  background-color: #fff7e6;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
  border-left: 3rpx solid #ff9800;
}

.package-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.package-value.price {
  color: #ff4d4f;
  font-weight: bold;
  font-size: 28rpx;
}

/* 原料清单 */
.ingredients-section {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #e8e8e8;
}

.ingredients-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
}

.ingredients-title-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 1;
}

.ingredients-title {
  font-size: 26rpx;
  font-weight: 500;
  color: #333;
}

.ingredients-count {
  font-size: 22rpx;
  color: #999;
}

.expand-icon {
  font-size: 22rpx;
  color: #1890ff;
  padding: 4rpx 8rpx;
}

.ingredients-content {
  padding: 16rpx;
  background-color: #fafafa;
  border-radius: 8rpx;
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
}

.ingredients-content.expanded {
  max-height: 2000rpx;
}

.expand-hint {
  padding: 12rpx 16rpx;
  text-align: center;
  background-color: #fafafa;
  border-radius: 8rpx;
}

.hint-text {
  font-size: 22rpx;
  color: #999;
}

.ingredient-category {
  margin-bottom: 16rpx;
}

.ingredient-category:last-child {
  margin-bottom: 0;
}

.category-title {
  font-size: 24rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
  padding-left: 4rpx;
}

.ingredient-item {
  font-size: 24rpx;
  color: #666;
  line-height: 36rpx;
  padding: 4rpx 12rpx;
  border-radius: 4rpx;
  transition: background-color 0.2s;
}

.ingredient-item:active {
  background-color: #e8e8e8;
}

.ingredient-text {
  word-break: break-all;
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

/* 支付方式提示 */
.payment-guide-section {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.payment-guide-card {
  padding: 24rpx;
  background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%);
  border-radius: 12rpx;
  border-left: 4rpx solid #1890ff;
}

.guide-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.guide-icon {
  font-size: 32rpx;
}

.guide-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #1890ff;
}

.order-amount-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx;
  background-color: #fff;
  border-radius: 8rpx;
  margin-bottom: 20rpx;
}

.amount-label {
  font-size: 26rpx;
  color: #666;
}

.amount-value {
  font-size: 36rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.guide-steps {
  margin-bottom: 24rpx;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.step-item:last-child {
  margin-bottom: 0;
}

.step-number {
  width: 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  background-color: #1890ff;
  color: #fff;
  border-radius: 50%;
  font-size: 22rpx;
  font-weight: bold;
  flex-shrink: 0;
}

.step-text {
  flex: 1;
  font-size: 26rpx;
  color: #333;
  line-height: 36rpx;
}

.wechat-contact,
.order-id-copy {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx;
  background-color: #fff;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
}

.contact-label,
.order-id-label {
  font-size: 26rpx;
  color: #666;
}

.contact-value,
.order-id-value {
  flex: 1;
  font-size: 26rpx;
  color: #1890ff;
  font-weight: bold;
  font-family: monospace;
}

.btn-copy-wechat,
.btn-copy-order-id {
  padding: 8rpx 20rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 6rpx;
  font-size: 24rpx;
  border: none;
}

.payment-tip {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx;
  background-color: #fff7e6;
  border-radius: 8rpx;
}

.tip-icon {
  font-size: 28rpx;
}

.tip-text {
  flex: 1;
  font-size: 24rpx;
  color: #ff9800;
  line-height: 1.5;
}

/* 原料照片样式 */
.production-photos-section {
  margin-bottom: 20rpx;
}

.production-photos {
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.photos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.production-photo-item {
  width: 220rpx;
  height: 220rpx;
  border-radius: 8rpx;
}

.photos-hint {
  font-size: 24rpx;
  color: #999;
  text-align: center;
  padding-top: 8rpx;
}

.photos-time {
  font-size: 24rpx;
  color: #999;
  font-weight: normal;
  margin-left: auto;
}
</style>
