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
          <text class="status-text">{{ getStatusText(order) }}</text>
          <text class="order-id-text">订单 #{{ orderId.slice(-8) }}</text>
        </view>
      </view>

      <!-- 订单信息 -->
      <view class="section">
        <view class="section-title">📦 订单信息</view>
        <view class="info-list">
          <view class="info-item">
            <text class="info-label">订单号</text>
            <view class="info-value-with-action">
              <text class="info-value">{{ order.id }}</text>
              <text class="action-link" @tap="copyOrderId">复制</text>
            </view>
          </view>
          <view class="info-item">
            <text class="info-label">订单状态</text>
            <text class="info-value" :style="{ color: getStatusColor(order) }">
              {{ getStatusText(order) }}
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
      <view class="section" v-if="orderCustomerName || orderCustomerPhone">
        <view class="section-title">👤 客户信息</view>
        <view class="info-list">
          <view class="info-item">
            <text class="info-label">姓名</text>
            <text class="info-value">{{ orderCustomerName || '未记录客户' }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">手机</text>
            <text class="info-value">{{ formatPhoneForStaffOrder(orderCustomerPhone) }}</text>
            <text class="action-link" @tap="copyPhone">复制</text>
          </view>
        </view>
      </view>

      <!-- 狗狗信息 -->
      <view class="section" v-if="firstOrderItem && firstOrderItem.dog">
        <view class="section-title">🐕 狗狗信息</view>
        <view class="info-list">
          <view class="info-item">
            <text class="info-label">名称</text>
            <text class="info-value">{{ firstOrderItem.dog.name }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">品种</text>
            <text class="info-value">{{ firstOrderItem.dog.breedName || '未知' }}</text>
          </view>
          <view class="info-item">
            <text class="info-label">体重</text>
            <text class="info-value">{{ firstOrderItem.dog.weightKg || '--' }}kg</text>
          </view>
          <view class="info-item">
            <text class="info-label">每日餐数</text>
            <text class="info-value">{{ firstOrderItem.dog.mealsPerDay || '--' }}餐</text>
          </view>
        </view>
        <view class="inline-actions">
          <button class="address-action-btn secondary" @tap="editDogProfile">编辑狗狗档案</button>
          <button class="address-action-btn secondary" @tap="openDogSwitcher">切换狗狗</button>
        </view>
      </view>

      <!-- 商品详情 -->
      <view class="section" v-if="firstOrderItem">
        <view class="section-title">🍽️ 商品详情</view>
        <view class="product-card">
          <image
            v-if="firstOrderItem.recipeSnapshot && firstOrderItem.recipeSnapshot.coverImageUrl"
            class="product-cover"
            :src="firstOrderItem.recipeSnapshot.coverImageUrl"
            mode="aspectFill"
          />
          <view class="product-info">
            <text class="product-name">{{ firstOrderItem.recipeSnapshot?.name || '自定义食谱' }}</text>
            <view class="product-specs">
              <text class="spec-item">分装明细: {{ formatPackagePlan(firstOrderItem) }}</text>
              <text class="spec-item">总净重: {{ formatGrams(firstOrderItem.quantityG) }}</text>
              <text class="spec-item" v-if="firstOrderItem.dailyIntakeG">
                每日摄入: {{ formatGrams(firstOrderItem.dailyIntakeG) }}
              </text>
            </view>
          </view>
        </view>
        <view class="inline-actions" v-if="canEditPackagePlan && firstOrderItem.id">
          <button class="address-action-btn secondary" @tap="openPackagePanel(firstOrderItem)">修改订单规格</button>
        </view>
      </view>

      <!-- 制作用量 -->
      <view class="section" v-if="orderItems.length">
        <view class="section-title">制作用量</view>
        <view class="usage-summary">
          <view class="usage-stat">
            <text class="usage-label">总净重</text>
            <text class="usage-value">{{ formatGrams(totalQuantityG) }}</text>
          </view>
          <view class="usage-stat">
            <text class="usage-label">总袋数</text>
            <text class="usage-value">{{ totalPackageCount }}袋</text>
          </view>
          <view class="usage-stat">
            <text class="usage-label">食材</text>
            <text class="usage-value">{{ foodUsageLabel }}</text>
          </view>
          <view class="usage-stat">
            <text class="usage-label">补剂</text>
            <text class="usage-value">{{ supplementUsageLabel }}</text>
          </view>
        </view>

        <view class="usage-item" v-for="item in orderItems" :key="item.id || item.recipeSnapshot?.id">
          <text class="usage-item-title">{{ item.recipeSnapshot?.name || '自定义食谱' }}</text>
          <text class="usage-item-meta">
            {{ item.dog?.name || '未绑定狗狗' }} · {{ formatGrams(item.quantityG) }} · {{ formatPackagePlan(item) }}
          </text>
          <text class="usage-item-meta" v-if="item.preparationMethod || item.cookingMethod || item.vacuumBagSpec">
            {{ formatPreparation(item) }}
          </text>
          <button
            v-if="canEditPackagePlan && item.id"
            class="mini-inline-btn"
            @tap="openPackagePanel(item)"
          >
            修改订单规格
          </button>
        </view>

        <view class="ingredient-summary" v-if="ingredientUsageRows.length">
          <text class="ingredient-title">原料汇总</text>
          <view class="ingredient-row" v-for="row in ingredientUsageRows" :key="row.key">
            <text class="ingredient-name">{{ row.name }}</text>
            <text class="ingredient-type">{{ row.typeLabel }}</text>
            <text class="ingredient-amount">{{ row.amountLabel }}</text>
          </view>
        </view>
      </view>

      <!-- 备餐图 -->
      <view class="section" v-if="hasProductionPhotos">
        <view class="section-title-row">
          <view>
            <view class="section-title compact">备餐图</view>
            <text class="section-subtitle" v-if="order.productionPhotos?.uploadedAt">
              上传时间：{{ formatDateTime(order.productionPhotos.uploadedAt) }}
            </text>
          </view>
          <button
            v-if="shareToken"
            class="address-action-btn secondary photo-share-btn"
            open-type="share"
            data-share-type="photos"
          >
            一键分享
          </button>
        </view>
        <view class="production-photo-grid">
          <image
            v-for="(photo, index) in order.productionPhotos?.photos || []"
            :key="`${photo}-${index}`"
            class="production-photo"
            :src="normalizeImageUrl(photo)"
            mode="aspectFill"
            @tap="previewProductionPhoto(index)"
          />
        </view>
      </view>

      <!-- 管理员备注 -->
      <view class="section remark-section">
        <view class="section-title">管理员备注</view>
        <textarea
          v-model="remarkDraft"
          class="remark-textarea"
          maxlength="200"
          auto-height
          placeholder="填写分装要求、制作顺序、特殊提醒"
        />
        <view class="remark-meta">
          <text class="remark-hint">仅员工/管理员可见，会同步到生产制作单和打印版</text>
          <text class="remark-count">{{ remarkDraft.length }}/200</text>
        </view>
        <view class="remark-actions">
          <button
            class="remark-btn secondary"
            :disabled="savingAdminRemark || !canClearAdminRemark"
            @tap="clearAdminRemark"
          >
            清空
          </button>
          <button
            class="remark-btn primary"
            :disabled="savingAdminRemark || !isAdminRemarkDirty"
            @tap="saveAdminRemark"
          >
            {{ savingAdminRemark ? '保存中...' : '保存备注' }}
          </button>
        </view>
      </view>

      <!-- 收货地址 -->
      <view class="section">
        <view class="section-title">📍 收货地址</view>
        <view class="address-card">
          <template v-if="order.address">
            <view class="address-header">
              <text class="recipient-name">{{ order.address.recipientName }}</text>
              <text class="recipient-phone">{{ formatPhoneForStaffOrder(getOrderAddressPhone(order.address)) }}</text>
            </view>
            <text class="address-text"
              >{{ getOrderAddressRegionText(order.address) }} {{ getOrderAddressDetail(order.address) }}</text
            >
          </template>
          <view v-else class="address-empty">
            <text class="address-empty-text">暂未录入收货地址</text>
          </view>
          <view v-if="canEditAddress" class="address-actions">
            <button v-if="order.address" class="address-action-btn secondary" @tap="copyFullAddress">复制地址</button>
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
            <text class="fee-value">¥{{ formatAmount(order.amountShipping) }}</text>
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
        <button v-if="canAdjustAmount" class="action-btn orange" @tap="openAmountPanel">修改价格</button>
        <button v-if="canAdminRefund" class="action-btn red" @tap="adminRefundOrder">管理员退款/退差价</button>
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
          <view v-if="dogMatchedAddresses.length" class="address-option-group">
            <text class="address-group-title">该狗狗常用地址</text>
            <view
              v-for="address in dogMatchedAddresses"
              :key="address.id"
              class="address-select-item"
              @tap="selectCustomerAddress(address)"
            >
              <view class="address-header">
                <text class="recipient-name">{{ address.recipientName }}</text>
                <text class="recipient-phone">{{ formatPhoneForStaffOrder(address.phone) }}</text>
                <text class="default-tag">用过{{ address.dogAddressUsageCount || 1 }}次</text>
                <text v-if="address.isDefault" class="default-tag">默认</text>
              </view>
              <text class="address-text">{{ formatRegionText(address.region) }} {{ address.detail }}</text>
              <text v-if="address.dogAddressLastUsedAt" class="address-meta">
                最近使用：{{ formatDateTime(address.dogAddressLastUsedAt) }}
              </text>
            </view>
          </view>
          <view v-if="otherCustomerAddresses.length" class="address-option-group">
            <text class="address-group-title">客户其他地址</text>
            <view
              v-for="address in otherCustomerAddresses"
              :key="address.id"
              class="address-select-item"
              @tap="selectCustomerAddress(address)"
            >
              <view class="address-header">
                <text class="recipient-name">{{ address.recipientName }}</text>
                <text class="recipient-phone">{{ formatPhoneForStaffOrder(address.phone) }}</text>
                <text v-if="address.isDefault" class="default-tag">默认</text>
              </view>
              <text class="address-text">{{ formatRegionText(address.region) }} {{ address.detail }}</text>
            </view>
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

    <view v-if="showShippingModal" class="modal-mask" @tap="closeShippingModal">
      <view class="modal-panel" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">填写发货信息</text>
          <text class="modal-close" @tap="closeShippingModal">×</text>
        </view>
        <view class="form-item">
          <text class="form-label">物流公司</text>
          <picker
            mode="selector"
            :range="carriers"
            range-key="name"
            :value="selectedCarrierIndex"
            @change="onCarrierChange"
          >
            <view class="form-picker">
              <text>{{ carriers[selectedCarrierIndex].name }}</text>
              <text class="picker-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="form-item">
          <text class="form-label">物流单号</text>
          <input v-model="trackingNumber" class="form-input" placeholder="请输入物流单号" :maxlength="50" />
        </view>
        <button class="address-save-btn" :disabled="isShipping" @tap="confirmShipping">
          {{ isShipping ? '发货中...' : '确认发货' }}
        </button>
      </view>
    </view>

    <view v-if="amountVisible" class="modal-mask" @tap="closeAmountPanel">
      <view class="modal-panel" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">修改订单价格</text>
          <text class="modal-close" @tap="closeAmountPanel">×</text>
        </view>
        <view class="form-item">
          <text class="form-label">新的订单金额</text>
          <input class="form-input" v-model="amountDraft" type="digit" placeholder="请输入新金额" />
        </view>
        <view class="form-item">
          <text class="form-label">改价原因</text>
          <textarea class="form-textarea" v-model="amountReason" placeholder="例如客服协商优惠、手工减免" />
        </view>
        <text class="address-lock-hint">待支付订单、线下已支付未发货订单允许直接改价；微信已支付订单请走退款或退差价。</text>
        <button class="address-save-btn" :disabled="savingAmount" @tap="saveAmountAdjustment">
          {{ savingAmount ? '保存中...' : '确认改价' }}
        </button>
      </view>
    </view>

    <view v-if="packageVisible" class="modal-mask" @tap="closePackagePanel">
      <view class="modal-panel" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">修改订单规格</text>
          <text class="modal-close" @tap="closePackagePanel">×</text>
        </view>
        <view class="package-total-row">
          <text class="address-lock-hint">原净重：{{ formatGrams(packageTargetQuantityG) }}</text>
          <text class="address-lock-hint">新规格合计：{{ formatGrams(packageDraftTotalG) }}</text>
        </view>
        <view class="package-row" v-for="(row, index) in packageRows" :key="index">
          <input class="package-input" v-model="row.packageSpecG" type="number" placeholder="克重" />
          <text class="package-separator">g ×</text>
          <input class="package-input" v-model="row.packageCount" type="number" placeholder="袋数" />
          <button class="package-remove-btn" :disabled="packageRows.length === 1" @tap="removePackageRow(index)">−</button>
        </view>
        <button class="address-action-btn secondary full" @tap="addPackageRow">新增分装规格</button>
        <text class="address-lock-hint">分装合计会作为新的订单总克重；未支付订单价格会同步更新，已支付订单只支持退差价，不向客户补收。</text>
        <button class="address-save-btn" :disabled="savingPackage" @tap="savePackagePlan">
          {{ savingPackage ? '保存中...' : '保存规格' }}
        </button>
      </view>
    </view>

    <view v-if="refundVisible" class="modal-mask" @tap="closeRefundPanel">
      <view class="modal-panel" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">退款/退差价</text>
          <text class="modal-close" @tap="closeRefundPanel">×</text>
        </view>
        <view class="form-item">
          <text class="form-label">退款金额</text>
          <input class="form-input" v-model="refundAmountDraft" type="digit" placeholder="请输入退款或差价金额" />
        </view>
        <view class="form-item">
          <text class="form-label">退款原因</text>
          <textarea class="form-textarea" v-model="refundReason" placeholder="例如退差价、退货退款、客服协商退款" />
        </view>
        <text class="address-lock-hint">确认后会调用微信原路退款；金额小于订单实付时即为退差价。</text>
        <button class="address-save-btn" :disabled="savingRefund" @tap="saveRefundAdjustment">
          {{ savingRefund ? '提交中...' : '确认退款' }}
        </button>
      </view>
    </view>

    <view v-if="dogSwitcherVisible" class="modal-mask" @tap="closeDogSwitcher">
      <view class="modal-panel" @tap.stop>
        <view class="modal-header">
          <text class="modal-title">切换订单狗狗</text>
          <text class="modal-close" @tap="closeDogSwitcher">×</text>
        </view>
        <view v-if="dogLoading" class="modal-loading">加载中...</view>
        <view v-else-if="customerDogs.length === 0" class="modal-empty">该客户暂无狗狗档案</view>
        <view v-else class="dog-option-list">
          <view
            v-for="dog in customerDogs"
            :key="dog.id"
            class="dog-option"
            :class="{ active: dog.id === currentDogId }"
            @tap="switchOrderDog(dog.id)"
          >
            <text class="dog-option-name">{{ dog.name }}</text>
            <text class="dog-option-meta">
              {{ dog.breedName || '未知品种' }} · {{ dog.currentWeightKg || dog.weightKg || '--' }}kg · {{ dog.mealsPerDay || '--' }}餐
            </text>
          </view>
        </view>
        <text class="address-lock-hint">切换后订单会绑定到新狗狗；如已支付，请同时确认规格和差价。</text>
      </view>
    </view>

    <view v-if="showShippingShareFallback" class="shipping-share-fallback">
      <text class="shipping-share-title">发货信息已保存</text>
      <text class="shipping-share-copy">如顾客未收到自动提醒，可手动转发物流与食用提醒。</text>
      <view class="shipping-share-actions">
        <button
          class="shipping-share-btn"
          open-type="share"
          data-share-type="shipping-notice"
        >
          转发给用户
        </button>
        <button class="shipping-share-cancel" @tap="showShippingShareFallback = false">稍后</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShareAppMessage } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import {
  bindOrderCustomerAddress as bindExistingOrderAddress,
  confirmOfflinePayment,
  createOrderCustomerAddress,
  listOrderCustomerDogs,
  listOrderCustomerAddresses,
  retryWechatRefund,
  switchOrderDog as switchExistingOrderDog,
  updateAdminOrderRemark,
  updateOrderCustomerAddress,
  updateOrderItemPackagePlan,
  updateStaffCustomerServiceAmount,
  type OrderPackagePlanItem,
  type StaffOrderAddress,
  type StaffOrderDog,
} from '../../api/orders'
import { formatShortDateTime } from '../../utils/date'
import { normalizeImageUrl } from '../../utils/config'

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
  cancellationReason?: string | null
  refundStatus?: {
    success: boolean
  } | null
  totalAmount?: number
  amountTotal?: number
  amountShipping?: number
  createdAt?: string
  paymentMethod?: string
  paymentStatus?: string | null
  paidAt?: string | null
  customerName?: string
  customerPhone?: string
  adminRemark?: string | null
  customer?: {
    nickname?: string | null
    phone?: string | null
  } | null
  dogId?: string | null
  addressId?: string | null
  firstItem?: OrderItemDetail
  items?: OrderItemDetail[]
  pricingBreakdownSnapshot?: {
    ingredientDetails?: IngredientUsageDetail[]
  } | null
  trackingNumber?: string | null
  carrierCode?: string | null
  shippedAt?: string | null
  productionPhotos?: {
    unitId: string
    photos: string[]
    uploadedAt: string | null
  } | null
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

interface OrderItemDetail {
  id?: string
  dogId?: string | null
  dog?: {
    id?: string
    name?: string
    breedName?: string
    weightKg?: number
    currentWeightKg?: number
    mealsPerDay?: number
    gender?: string
  }
  recipeSnapshot?: {
    id: string
    name: string
    version?: number
    coverImageUrl?: string | null
    items?: Array<{
      ingredient_id?: string
      name?: string
      ingredient_type?: string
    }>
  }
  quantityG?: number
  packageCount: number
  packageSpecG: number
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }> | null
  ingredientSourcePlan?: string | null
  dailyIntakeG?: number
  preparationMethod?: string | null
  cookingMethod?: string | null
  customRequirements?: string | null
  vacuumBagSpec?: string | null
}

interface IngredientUsageDetail {
  ingredientId?: string
  name?: string
  type?: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING' | string
  amount?: number
  netAmount?: number
  purchaseAmount?: number
  unit?: string
  procurementSkuName?: string
}

interface PackagePlanDraftRow {
  packageSpecG: string
  packageCount: string
}

const order = ref<OrderDetail | null>(null)
const loading = ref(false)
const customerAddresses = ref<StaffOrderAddress[]>([])
const customerDogs = ref<StaffOrderDog[]>([])
const addressSelectVisible = ref(false)
const addressFormVisible = ref(false)
const dogSwitcherVisible = ref(false)
const addressLoading = ref(false)
const dogLoading = ref(false)
const savingAddress = ref(false)
const switchingDog = ref(false)
const showShippingModal = ref(false)
const selectedCarrierIndex = ref(0)
const trackingNumber = ref('')
const isShipping = ref(false)
const showShippingShareFallback = ref(false)
const shippedShareOrderId = ref('')
const shippedShareTitle = ref('SevenKitchen 已发货')
const shippedShareImage = ref('')
const shareToken = ref('')
const shareTokenOrderId = ref('')
const sharePhotoImageUrl = ref('')
const sharePhotoSourceUrl = ref('')
const isPreparingSharePhotoImage = ref(false)
const remarkDraft = ref('')
const savingAdminRemark = ref(false)
const amountVisible = ref(false)
const amountDraft = ref('')
const amountReason = ref('')
const savingAmount = ref(false)
const packageVisible = ref(false)
const packageRows = ref<PackagePlanDraftRow[]>([])
const packageEditingItemId = ref('')
const packageTargetQuantityG = ref(0)
const savingPackage = ref(false)
const refundVisible = ref(false)
const refundAmountDraft = ref('')
const refundReason = ref('')
const savingRefund = ref(false)
const addressFormMode = ref<'create' | 'edit'>('create')
const editingAddressId = ref('')
const addressRegionValue = ref<string[]>([])
const carriers = [
  { name: '顺丰速运', code: 'SF' },
  { name: '京东物流', code: 'JD' },
  { name: '圆通速递', code: 'YTO' },
  { name: '中通快递', code: 'ZTO' },
  { name: '韵达速递', code: 'YD' },
  { name: 'EMS', code: 'EMS' },
]
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

const canEditPackagePlan = computed(() => {
  if (!order.value) return false
  return ['INIT', 'PENDING_PAYMENT', 'PAID'].includes(order.value.status)
})

const isOfflinePaidOrder = computed(() => {
  if (!order.value) return false
  const paid = order.value.paymentStatus === 'SUCCESS' || Boolean(order.value.paidAt)
  return paid && ['OFFLINE', 'OFFLINE_WECHAT'].includes(order.value.paymentMethod || '')
})

const canAdjustAmount = computed(() => {
  if (!order.value) return false
  const paid = order.value.paymentStatus === 'SUCCESS' || Boolean(order.value.paidAt)
  if (['SHIPPED', 'COMPLETED', 'CANCELLED'].includes(order.value.status)) return false
  if (isOfflinePaidOrder.value) return true
  return !paid && ['INIT', 'PENDING_PAYMENT'].includes(order.value.status)
})

const canAdminRefund = computed(() => {
  if (!order.value) return false
  const user = getStoredUser()
  const paid = order.value.paymentStatus === 'SUCCESS' || Boolean(order.value.paidAt)
  const refunded = order.value.refundStatus?.success === true
  return user?.role === 'ADMIN' && paid && order.value.paymentMethod === 'WECHAT_PAY' && !refunded
})

const orderItems = computed<OrderItemDetail[]>(() => {
  if (!order.value) return []
  if (Array.isArray(order.value.items) && order.value.items.length > 0) {
    return order.value.items
  }
  return order.value.firstItem ? [order.value.firstItem] : []
})

const firstOrderItem = computed(() => orderItems.value[0] || null)

const orderCustomerName = computed(() => {
  return order.value?.customerName || order.value?.customer?.nickname || order.value?.address?.recipientName || ''
})

const orderCustomerPhone = computed(() => {
  return order.value?.customerPhone || order.value?.customer?.phone || (order.value?.address ? getOrderAddressPhone(order.value.address) : '')
})

const currentDogId = computed(() => firstOrderItem.value?.dog?.id || firstOrderItem.value?.dogId || order.value?.dogId || '')

const hasProductionPhotos = computed(() => {
  return Boolean(order.value?.productionPhotos?.photos?.length)
})

const dogMatchedAddresses = computed(() => {
  return customerAddresses.value.filter((address) => address.usedByCurrentDog)
})

const otherCustomerAddresses = computed(() => {
  return customerAddresses.value.filter((address) => !address.usedByCurrentDog)
})

const totalQuantityG = computed(() => {
  return orderItems.value.reduce((sum, item) => sum + toNumber(item.quantityG), 0)
})

const totalPackageCount = computed(() => {
  return orderItems.value.reduce((sum, item) => {
    const planTotal = Array.isArray(item.packagePlan)
      ? item.packagePlan.reduce((planSum, row) => planSum + toNumber(row.packageCount), 0)
      : 0
    return sum + (planTotal || toNumber(item.packageCount))
  }, 0)
})

const rawIngredientDetails = computed(() => {
  return order.value?.pricingBreakdownSnapshot?.ingredientDetails || []
})

const ingredientUsageRows = computed(() => {
  return rawIngredientDetails.value.map((detail, index) => {
    const amount = getIngredientUsageAmount(detail)
    const unit = detail.unit || 'g'
    return {
      key: `${detail.ingredientId || detail.name || 'ingredient'}-${index}`,
      name: detail.procurementSkuName || detail.name || '未命名原料',
      type: detail.type || '',
      typeLabel: formatIngredientType(detail.type),
      amount,
      amountLabel: `${formatNumber(amount)}${unit}`,
    }
  })
})

const foodUsageLabel = computed(() => formatUsageTotalByType('FOOD'))
const supplementUsageLabel = computed(() => formatUsageTotalByType('SUPPLEMENT'))
const packageDraftTotalG = computed(() => {
  return packageRows.value.reduce((sum, row) => {
    return sum + readPositiveInteger(row.packageSpecG) * readPositiveInteger(row.packageCount)
  }, 0)
})
const normalizedRemarkDraft = computed(() => remarkDraft.value.trim())
const currentAdminRemark = computed(() => (order.value?.adminRemark ?? '').trim())
const isAdminRemarkDirty = computed(() => normalizedRemarkDraft.value !== currentAdminRemark.value)
const canClearAdminRemark = computed(() => Boolean(normalizedRemarkDraft.value || currentAdminRemark.value))

function getStoredUser() {
  try {
    return uni.getStorageSync('userInfo') || uni.getStorageSync('user') || null
  } catch (error) {
    return null
  }
}

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
      remarkDraft.value = response.data.adminRemark || ''
      void ensureProductionPhotoShareToken()
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
  const value = toNumber(amount)
  return value.toFixed(2)
}

function toNumber(value: unknown): number {
  const numberValue = typeof value === 'string' ? Number(value) : Number(value || 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function readPositiveInteger(value: unknown): number {
  const parsed = Math.floor(toNumber(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
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
  const name = currentOrder.customerName || currentOrder.customer?.nickname || currentOrder.address?.recipientName || '未记录客户'
  const phone = currentOrder.customerPhone || currentOrder.customer?.phone || currentOrder.address?.phone || currentOrder.address?.recipientPhone || ''
  return phone ? `${name} ${formatPhoneForStaffOrder(phone)}` : name
}

function getOrderProductText(currentOrder: OrderDetail): string {
  const item = currentOrder.items?.[0] || currentOrder.firstItem
  const recipeName = item?.recipeSnapshot?.name || '未记录商品'
  const dogName = item?.dog?.name ? `（${item.dog.name}）` : ''
  const spec = item ? ` ${formatPackagePlan(item)}` : ''
  return `${recipeName}${dogName}${spec}`
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '--'
  return formatShortDateTime(dateStr)
}

function formatPhoneForStaffOrder(phone?: string): string {
  return phone || '--'
}

function formatGrams(value?: number): string {
  return `${formatNumber(toNumber(value))}g`
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatPackagePlan(item: OrderItemDetail): string {
  if (Array.isArray(item.packagePlan) && item.packagePlan.length > 0) {
    return item.packagePlan
      .map((row) => `${formatNumber(toNumber(row.packageSpecG))}g×${toNumber(row.packageCount)}袋`)
      .join('，')
  }
  return `${formatNumber(toNumber(item.packageSpecG))}g×${toNumber(item.packageCount)}袋`
}

function formatPreparation(item: OrderItemDetail): string {
  return [
    item.preparationMethod ? `制备: ${formatMethod(item.preparationMethod)}` : '',
    item.cookingMethod ? `熟制: ${formatMethod(item.cookingMethod)}` : '',
    item.vacuumBagSpec ? `真空袋: ${item.vacuumBagSpec}` : '',
    item.ingredientSourcePlan ? `原料方案: ${formatIngredientSourcePlan(item.ingredientSourcePlan)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function formatMethod(method: string): string {
  const map: Record<string, string> = {
    RAW: '生制',
    COOKED: '熟制',
    STEAMED: '蒸制',
    BOILED: '水煮',
    MIXED: '混合',
  }
  return map[method] || method
}

function formatIngredientSourcePlan(plan?: string | null): string {
  const map: Record<string, string> = {
    MARKET_PREMIUM: '优选原料',
    STANDARD: '标准原料',
    ORGANIC: '有机原料',
  }
  return plan ? map[plan] || plan : ''
}

function getIngredientUsageAmount(detail: IngredientUsageDetail): number {
  return toNumber(detail.purchaseAmount ?? detail.netAmount ?? detail.amount)
}

function formatIngredientType(type?: string): string {
  const map: Record<string, string> = {
    FOOD: '食材',
    SUPPLEMENT: '补剂',
    PACKAGING: '包装',
  }
  return type ? map[type] || type : '原料'
}

function formatUsageTotalByType(type: 'FOOD' | 'SUPPLEMENT'): string {
  const rows = rawIngredientDetails.value.filter((detail) => detail.type === type)
  if (rows.length === 0) return '未记录'
  const gramTotal = rows
    .filter((detail) => !detail.unit || detail.unit === 'g')
    .reduce((sum, detail) => sum + getIngredientUsageAmount(detail), 0)
  const nonGramRows = rows.filter((detail) => detail.unit && detail.unit !== 'g')
  const parts = []
  if (gramTotal > 0) parts.push(formatGrams(gramTotal))
  if (nonGramRows.length > 0) parts.push(`${nonGramRows.length}种非克重`)
  return parts.join(' + ') || `${rows.length}种`
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

function getStatusText(orderOrStatus: OrderDetail | string): string {
  const status = typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus.status
  if (typeof orderOrStatus !== 'string' && isRefundedOrder(orderOrStatus)) {
    return '已退款（钱款原路退回）'
  }
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

function getStatusColor(orderOrStatus: OrderDetail | string): string {
  const status = typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus.status
  if (typeof orderOrStatus !== 'string' && isRefundedOrder(orderOrStatus)) {
    return '#16a34a'
  }
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

function isRefundedOrder(currentOrder: OrderDetail): boolean {
  return currentOrder.status === 'CANCELLED' && currentOrder.refundStatus?.success === true
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
  if (!orderCustomerPhone.value) return
  uni.setClipboardData({
    data: orderCustomerPhone.value,
    success: () => {
      uni.showToast({
        title: '已复制',
        icon: 'success',
      })
    },
  })
}

function copyOrderId() {
  if (!order.value?.id) return
  uni.setClipboardData({
    data: order.value.id,
    success: () => {
      uni.showToast({
        title: '订单号已复制',
        icon: 'success',
      })
    },
  })
}

function copyFullAddress() {
  if (!order.value?.address) return
  const address = order.value.address
  const content = [
    address.recipientName,
    getOrderAddressPhone(address),
    getOrderAddressRegionText(address),
    getOrderAddressDetail(address),
  ]
    .filter(Boolean)
    .join(' ')
  uni.setClipboardData({
    data: content,
    success: () => {
      uni.showToast({
        title: '地址已复制',
        icon: 'success',
      })
    },
  })
}

function getFirstProductionPhotoUrl(): string {
  return order.value?.productionPhotos?.photos?.[0] || ''
}

function getProductionPhotosShareDogName(): string {
  const names = new Set<string>()
  orderItems.value.forEach((item) => {
    const dogName = (item.dog?.name || '').trim()
    if (dogName) {
      names.add(dogName)
    }
  })
  const dogNames = Array.from(names)
  if (dogNames.length === 0) return 'SevenKitchen'
  if (dogNames.length === 1) return dogNames[0]
  return `${dogNames[0]}等${dogNames.length}只狗狗`
}

function getProductionPhotosShareTitle(): string {
  return `${getProductionPhotosShareDogName()}备餐图`
}

function getProductionPhotosShareImageUrl(): string {
  return sharePhotoImageUrl.value || normalizeImageUrl(getFirstProductionPhotoUrl())
}

async function prepareProductionPhotoShareImage() {
  const firstPhoto = normalizeImageUrl(getFirstProductionPhotoUrl())
  if (!firstPhoto) {
    sharePhotoImageUrl.value = ''
    sharePhotoSourceUrl.value = ''
    isPreparingSharePhotoImage.value = false
    return
  }
  if (sharePhotoSourceUrl.value === firstPhoto && (sharePhotoImageUrl.value || isPreparingSharePhotoImage.value)) {
    return
  }

  sharePhotoSourceUrl.value = firstPhoto
  sharePhotoImageUrl.value = ''
  if (!/^https?:\/\//.test(firstPhoto)) {
    sharePhotoImageUrl.value = firstPhoto
    return
  }

  isPreparingSharePhotoImage.value = true
  try {
    const downloadRes = await uni.downloadFile({ url: firstPhoto })
    if (sharePhotoSourceUrl.value !== firstPhoto) return
    const statusCode = Number(downloadRes.statusCode || 0)
    sharePhotoImageUrl.value =
      statusCode >= 200 && statusCode < 300 && downloadRes.tempFilePath ? downloadRes.tempFilePath : firstPhoto
  } catch (error) {
    if (sharePhotoSourceUrl.value === firstPhoto) {
      sharePhotoImageUrl.value = firstPhoto
    }
  } finally {
    if (sharePhotoSourceUrl.value === firstPhoto) {
      isPreparingSharePhotoImage.value = false
    }
  }
}

async function ensureProductionPhotoShareToken() {
  if (!order.value) return
  if (!hasProductionPhotos.value) {
    shareToken.value = ''
    shareTokenOrderId.value = ''
    sharePhotoImageUrl.value = ''
    sharePhotoSourceUrl.value = ''
    return
  }
  void prepareProductionPhotoShareImage()
  if (shareToken.value && shareTokenOrderId.value === order.value.id) {
    return
  }

  try {
    const response = await request({
      url: `/orders/${order.value.id}/share-photos`,
      method: 'POST',
      quiet: true,
      suppressErrorToast: true,
    })
    if (response.code === 0 && response.data?.token) {
      shareToken.value = response.data.token
      shareTokenOrderId.value = order.value.id
    } else {
      shareToken.value = ''
      shareTokenOrderId.value = ''
    }
  } catch (error) {
    console.error('[OrderDetail] Prepare production photo share token error:', error)
    shareToken.value = ''
    shareTokenOrderId.value = ''
  }
}

function previewProductionPhoto(index: number) {
  const photos = order.value?.productionPhotos?.photos?.map((photo) => normalizeImageUrl(photo)).filter(Boolean) || []
  if (photos.length === 0) return
  uni.previewImage({
    current: index,
    urls: photos,
  })
}

async function saveAdminRemark() {
  if (!order.value || savingAdminRemark.value || !isAdminRemarkDirty.value) return

  savingAdminRemark.value = true
  uni.showLoading({ title: '保存中...' })
  try {
    const response = await updateAdminOrderRemark(order.value.id, normalizedRemarkDraft.value || null)
    if (response.code !== 0 || !response.data) {
      throw new Error(response.message || '保存失败')
    }

    order.value = {
      ...order.value,
      ...response.data,
      adminRemark: response.data.adminRemark ?? null,
    }
    remarkDraft.value = response.data.adminRemark || ''
    uni.showToast({
      title: '备注已保存',
      icon: 'success',
    })
  } catch (error: any) {
    console.error('[OrderDetail] Update admin remark error:', error)
    uni.showToast({
      title: error?.message || '保存失败',
      icon: 'none',
    })
  } finally {
    savingAdminRemark.value = false
    uni.hideLoading()
  }
}

function clearAdminRemark() {
  if (!canClearAdminRemark.value || savingAdminRemark.value) return

  uni.showModal({
    title: '清空备注',
    content: '确定要清空管理员备注吗？',
    success: async (res) => {
      if (!res.confirm) return
      remarkDraft.value = ''
      await saveAdminRemark()
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
  if (!order.value) return
  if (!order.value.address || !getOrderAddressPhone(order.value.address)) {
    uni.showToast({
      title: '请先补全收货地址和手机号',
      icon: 'none',
    })
    return
  }
  selectedCarrierIndex.value = 0
  trackingNumber.value = order.value.trackingNumber || ''
  showShippingModal.value = true
}

function closeShippingModal() {
  if (isShipping.value) return
  showShippingModal.value = false
}

function onCarrierChange(event: any) {
  selectedCarrierIndex.value = Number(event.detail.value || 0)
}

async function confirmShipping() {
  if (!order.value || isShipping.value) return
  const tracking = trackingNumber.value.trim()
  if (tracking.length < 5) {
    uni.showToast({
      title: '请输入有效物流单号',
      icon: 'none',
    })
    return
  }
  const orderId = order.value.id
  isShipping.value = true
  try {
    await request({
      url: `/admin/orders/${orderId}/ship`,
      method: 'POST',
      data: {
        carrierCode: carriers[selectedCarrierIndex.value].code,
        trackingNumber: tracking,
      },
    })
    shippedShareOrderId.value = orderId
    shippedShareTitle.value = `SevenKitchen 已发货｜${carriers[selectedCarrierIndex.value].name} ${tracking}`
    shippedShareImage.value = order.value.firstItem?.recipeSnapshot?.coverImageUrl || ''
    showShippingShareFallback.value = true
    try {
      await request({
        url: `/staff/shipping/orders/${orderId}/wechat-shipping-upload`,
        method: 'POST',
        suppressErrorToast: true,
      })

      uni.showToast({
        title: '发货成功，已同步微信',
        icon: 'success',
      })
    } catch (syncError) {
      console.error('[OrderDetail] WeChat shipping sync error:', syncError)
      uni.showToast({
        title: '发货成功，微信发货同步失败',
        icon: 'none',
      })
    }
    showShippingModal.value = false
    await loadOrderDetail()
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '发货失败',
      icon: 'none',
    })
  } finally {
    isShipping.value = false
  }
}

onShareAppMessage((event: any) => {
  const isSharePhotos = event?.target?.dataset?.shareType === 'photos'
  if (isSharePhotos && shareToken.value) {
    return {
      title: getProductionPhotosShareTitle(),
      path: `/pages/shared-photos/index?token=${shareToken.value}`,
      imageUrl: getProductionPhotosShareImageUrl(),
    }
  }

  const isShippingNotice = event?.target?.dataset?.shareType === 'shipping-notice'
  if (isShippingNotice && shippedShareOrderId.value) {
    return {
      title: shippedShareTitle.value,
      path: `/pages/order-shipping-notice/index?orderId=${shippedShareOrderId.value}`,
      imageUrl: shippedShareImage.value,
    }
  }

  return {
    title: 'SevenKitchen 后台订单',
    path: `/pages/staff-orders/detail?id=${orderId.value}`,
  }
})

function openAmountPanel() {
  if (!order.value || !canAdjustAmount.value) return
  amountDraft.value = formatAmount(order.value.amountTotal || order.value.totalAmount)
  amountReason.value = ''
  amountVisible.value = true
}

function closeAmountPanel() {
  if (savingAmount.value) return
  amountVisible.value = false
}

async function saveAmountAdjustment() {
  if (!order.value || savingAmount.value) return
  const amount = Math.round(Number(amountDraft.value) * 100) / 100
  if (!Number.isFinite(amount) || amount < 0) {
    uni.showToast({
      title: '请输入正确金额',
      icon: 'none',
    })
    return
  }
  savingAmount.value = true
  try {
    await updateStaffCustomerServiceAmount(order.value.id, amount, amountReason.value || '手机工作台改价')
    uni.showToast({
      title: '改价已保存',
      icon: 'success',
    })
    amountVisible.value = false
    await loadOrderDetail()
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '改价失败',
      icon: 'none',
    })
  } finally {
    savingAmount.value = false
  }
}

function getPackageRows(item: OrderItemDetail): OrderPackagePlanItem[] {
  if (Array.isArray(item.packagePlan) && item.packagePlan.length > 0) {
    return item.packagePlan.map((row) => ({
      packageSpecG: readPositiveInteger(row.packageSpecG),
      packageCount: readPositiveInteger(row.packageCount),
    }))
  }
  return [
    {
      packageSpecG: readPositiveInteger(item.packageSpecG),
      packageCount: readPositiveInteger(item.packageCount),
    },
  ]
}

function openPackagePanel(item: OrderItemDetail) {
  if (!order.value || !canEditPackagePlan.value || !item.id) return
  packageEditingItemId.value = item.id
  packageTargetQuantityG.value = toNumber(item.quantityG)
  packageRows.value = getPackageRows(item).map((row) => ({
    packageSpecG: String(row.packageSpecG || ''),
    packageCount: String(row.packageCount || ''),
  }))
  packageVisible.value = true
}

function closePackagePanel() {
  if (savingPackage.value) return
  packageVisible.value = false
}

function addPackageRow() {
  packageRows.value.push({ packageSpecG: '', packageCount: '' })
}

function removePackageRow(index: number) {
  if (packageRows.value.length <= 1) return
  packageRows.value.splice(index, 1)
}

function normalizePackageDraftRows(): OrderPackagePlanItem[] | null {
  const rows = packageRows.value.map((row) => ({
    packageSpecG: readPositiveInteger(row.packageSpecG),
    packageCount: readPositiveInteger(row.packageCount),
  }))
  if (rows.some((row) => row.packageSpecG <= 0 || row.packageCount <= 0)) {
    uni.showToast({
      title: '请填写正确的克重和袋数',
      icon: 'none',
    })
    return null
  }
  if (Math.round(packageDraftTotalG.value) <= 0) {
    uni.showToast({
      title: '请填写新的分装规格',
      icon: 'none',
    })
    return null
  }
  return rows
}

async function savePackagePlan() {
  if (!order.value || !packageEditingItemId.value || savingPackage.value) return
  const packagePlan = normalizePackageDraftRows()
  if (!packagePlan) return
  savingPackage.value = true
  try {
    const response = await updateOrderItemPackagePlan(order.value.id, packageEditingItemId.value, packagePlan)
    const pricingEffect = response?.data?.pricingEffect || {}
    packageVisible.value = false
    await loadOrderDetail()
    if (pricingEffect.suggestedRefundAmount > 0 && canAdminRefund.value) {
      refundAmountDraft.value = formatAmount(pricingEffect.suggestedRefundAmount)
      refundReason.value = '订单规格更正退差价'
      refundVisible.value = true
      uni.showToast({
        title: '规格已更新，可退差价',
        icon: 'none',
      })
    } else if (pricingEffect.amountUpdated) {
      uni.showToast({
        title: '规格和价格已更新',
        icon: 'success',
      })
    } else if (pricingEffect.absorbedIncreaseAmount > 0) {
      uni.showToast({
        title: '规格已更新，差额由商家承担',
        icon: 'none',
      })
    } else {
      uni.showToast({
        title: '规格已更新',
        icon: 'success',
      })
    }
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '规格保存失败',
      icon: 'none',
    })
  } finally {
    savingPackage.value = false
  }
}

function openRefundPanel() {
  if (!order.value || !canAdminRefund.value) return
  refundAmountDraft.value = formatAmount(order.value.amountTotal || order.value.totalAmount)
  refundReason.value = ''
  refundVisible.value = true
}

function closeRefundPanel() {
  if (savingRefund.value) return
  refundVisible.value = false
}

async function saveRefundAdjustment() {
  if (!order.value || savingRefund.value || !canAdminRefund.value) return
  const refundAmount = Math.round(Number(refundAmountDraft.value) * 100) / 100
  const orderAmount = toNumber(order.value.amountTotal || order.value.totalAmount)
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    uni.showToast({
      title: '请输入正确退款金额',
      icon: 'none',
    })
    return
  }
  if (refundAmount > orderAmount) {
    uni.showToast({
      title: '退款金额不能超过订单金额',
      icon: 'none',
    })
    return
  }
  const reason =
    refundReason.value ||
    (refundAmount < orderAmount ? '管理员手机工作台退差价' : '管理员手机工作台主动退款')

  uni.showModal({
    title: refundAmount < orderAmount ? '确认退差价' : '确认退款',
    content: [
      '该操作不可撤销。',
      '确认后会直接调用微信原路退款。',
      `订单：${order.value.id.slice(-8)}`,
      `金额：¥${formatAmount(refundAmount)}`,
    ].join('\n'),
    confirmText: '确认退款',
    confirmColor: '#d93026',
    success: async (res) => {
      if (!res.confirm || !order.value) return
      savingRefund.value = true
      try {
        await retryWechatRefund(order.value.id, refundAmount, reason)
        uni.showToast({
          title: '退款已发起',
          icon: 'none',
        })
        refundVisible.value = false
        await loadOrderDetail()
      } catch (error: any) {
        uni.showToast({
          title: error?.message || '退款失败',
          icon: 'none',
        })
      } finally {
        savingRefund.value = false
      }
    },
  })
}

function editDogProfile() {
  const dogId = currentDogId.value
  if (!dogId) {
    uni.showToast({
      title: '狗狗档案不存在',
      icon: 'none',
    })
    return
  }
  uni.navigateTo({
    url: `/pages/dog-create/index?dogId=${encodeURIComponent(dogId)}`,
  })
}

async function openDogSwitcher() {
  if (!orderId.value) return
  dogSwitcherVisible.value = true
  dogLoading.value = true
  try {
    const response = await listOrderCustomerDogs(orderId.value)
    customerDogs.value = Array.isArray(response.data) ? response.data : []
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '狗狗档案加载失败',
      icon: 'none',
    })
  } finally {
    dogLoading.value = false
  }
}

function closeDogSwitcher() {
  if (switchingDog.value) return
  dogSwitcherVisible.value = false
}

async function switchOrderDog(dogId: string) {
  if (!orderId.value || switchingDog.value || dogId === currentDogId.value) return
  switchingDog.value = true
  try {
    await switchExistingOrderDog(orderId.value, dogId)
    uni.showToast({
      title: '狗狗已切换',
      icon: 'success',
    })
    dogSwitcherVisible.value = false
    await loadOrderDetail()
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '切换失败',
      icon: 'none',
    })
  } finally {
    switchingDog.value = false
  }
}

async function adminRefundOrder() {
  openRefundPanel()
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

.section-title.compact {
  margin-bottom: 4rpx;
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

.section-subtitle,
.address-meta {
  display: block;
  font-size: 24rpx;
  color: #8a94a6;
  line-height: 1.5;
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

.info-value-with-action {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16rpx;
}

.info-value-with-action .info-value {
  min-width: 0;
  text-align: right;
  word-break: break-all;
}

.action-link {
  margin-left: 16rpx;
  font-size: 24rpx;
  color: #1890ff;
}

.inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 24rpx;
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

.usage-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.usage-stat {
  padding: 18rpx;
  border-radius: 10rpx;
  background-color: #f8fafc;
}

.usage-label,
.usage-item-meta,
.ingredient-type {
  display: block;
  font-size: 24rpx;
  color: #667085;
  line-height: 1.45;
}

.usage-value {
  display: block;
  margin-top: 6rpx;
  font-size: 28rpx;
  color: #111827;
  font-weight: 700;
}

.usage-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #edf0f2;
}

.mini-inline-btn {
  width: 180rpx;
  height: 58rpx;
  margin: 16rpx 0 0;
  border-radius: 8rpx;
  border: 2rpx solid #d6e8ff;
  background-color: #fff;
  color: #1890ff;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-inline-btn::after {
  border: none;
}

.usage-item:last-child {
  border-bottom: none;
}

.usage-item-title,
.ingredient-title,
.dog-option-name {
  display: block;
  font-size: 28rpx;
  color: #111827;
  font-weight: 700;
  line-height: 1.45;
}

.ingredient-summary {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #edf0f2;
}

.ingredient-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88rpx 150rpx;
  gap: 12rpx;
  align-items: center;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #f2f4f7;
}

.ingredient-row:last-child {
  border-bottom: none;
}

.ingredient-name {
  min-width: 0;
  font-size: 25rpx;
  color: #344054;
  line-height: 1.45;
}

.ingredient-amount {
  font-size: 25rpx;
  color: #111827;
  font-weight: 700;
  text-align: right;
}

.production-photo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.production-photo {
  width: 100%;
  height: 156rpx;
  border-radius: 10rpx;
  background-color: #f2f4f7;
}

.photo-share-btn {
  flex-shrink: 0;
  min-width: 150rpx;
}

.remark-section {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.remark-section .section-title {
  margin-bottom: 0;
}

.remark-textarea {
  width: 100%;
  min-height: 180rpx;
  padding: 24rpx;
  box-sizing: border-box;
  border: 2rpx solid #eef2f6;
  border-radius: 12rpx;
  background-color: #f8fafc;
  font-size: 28rpx;
  line-height: 1.6;
  color: #333;
}

.remark-meta {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24rpx;
}

.remark-hint {
  flex: 1;
  font-size: 24rpx;
  color: #8a94a6;
  line-height: 1.5;
}

.remark-count {
  font-size: 24rpx;
  color: #999;
  white-space: nowrap;
}

.remark-actions {
  display: flex;
  gap: 16rpx;
}

.remark-btn {
  flex: 1;
  height: 80rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 12rpx;
  font-size: 28rpx;
  border: none;
}

.remark-btn.primary {
  background-color: #1890ff;
  color: #fff;
}

.remark-btn.secondary {
  background-color: #fff;
  color: #1890ff;
  border: 2rpx solid #d6e8ff;
}

.remark-btn[disabled] {
  opacity: 0.5;
}

.remark-btn::after {
  border: none;
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

.address-option-group {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.address-group-title {
  font-size: 25rpx;
  color: #667085;
  font-weight: 700;
}

.address-select-item {
  padding: 24rpx;
  border-radius: 12rpx;
  border: 2rpx solid #f0f0f0;
}

.dog-option-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.dog-option {
  padding: 22rpx;
  border-radius: 12rpx;
  border: 2rpx solid #eef2f6;
  background-color: #fff;
}

.dog-option.active {
  border-color: #1890ff;
  background-color: #eef6ff;
}

.dog-option-meta {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #667085;
}

.package-total-row {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.package-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.package-input {
  flex: 1;
  min-width: 0;
  height: 70rpx;
  padding: 0 18rpx;
  border: 2rpx solid #eee;
  border-radius: 10rpx;
  background-color: #fafafa;
  font-size: 26rpx;
  color: #333;
  box-sizing: border-box;
}

.package-separator {
  font-size: 24rpx;
  color: #667085;
}

.package-remove-btn {
  width: 58rpx;
  height: 58rpx;
  padding: 0;
  border-radius: 50%;
  background-color: #fff1f0;
  color: #d93026;
  font-size: 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.package-remove-btn::after {
  border: none;
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

  &.red {
    background-color: #d93026;
    color: #fff;
  }

  &::after {
    border: none;
  }
}
</style>
