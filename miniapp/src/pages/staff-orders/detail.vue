<template>
  <view class="order-detail">
    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 订单详情内容 -->
    <view v-else-if="order" class="detail-content" :class="{ 'is-voided': isCancelled }">
      <!-- 顶部：状态 + 四段进度（2026-10-30 改版） -->
      <view class="hero" :class="heroTone">
        <view class="hero-row">
          <view class="hero-main">
            <text class="hero-status">{{ heroStatusLabel }}</text>
            <text class="hero-sub">{{ heroSubline }}</text>
            <view class="hero-no-row">
              <text class="hero-no">{{ displayOrderNo }}</text>
              <text class="hero-copy" @tap="copyOrderId">复制</text>
            </view>
          </view>
          <text v-if="heroTag" class="hero-tag">{{ heroTag }}</text>
        </view>

        <view class="steps">
          <view
            v-for="(step, index) in progressSteps"
            :key="index"
            class="step"
            :class="{ done: step.done, current: step.current }"
          >
            <view class="step-line"></view>
            <view class="step-dot"></view>
            <text class="step-name">{{ step.name }}</text>
            <text class="step-time">{{ step.time }}</text>
          </view>
        </view>
      </view>

      <!-- 主操作：贴着状态放，不用滑到最底下才够得着 -->
      <view v-if="primaryAction || canAdjustAmount" class="action-bar">
        <button
          v-if="primaryAction"
          class="action-btn primary"
          @tap="primaryAction.run"
        >
          {{ primaryAction.label }}
        </button>
        <button v-if="canAdjustAmount" class="action-btn ghost" @tap="openAmountPanel">改价</button>
      </view>
      <view v-else-if="stageHint" class="stage-hint">{{ stageHint }}</view>

      <!-- 售后信息：以前只有顶部变红，为什么退、到哪一步都看不到 -->
      <view v-if="isAftersale" class="aftersale-card">
        <view class="aftersale-head">
          <text class="aftersale-title">售后信息</text>
          <text class="aftersale-state" :class="{ settled: refundSucceeded }">
            {{ refundSucceeded ? '已退款' : '处理中' }}
          </text>
        </view>
        <view class="aftersale-row">
          <text class="aftersale-k">类型</text>
          <text class="aftersale-v">{{ aftersaleTypeLabel }}</text>
        </view>
        <view v-if="order.aftersaleReason" class="aftersale-row">
          <text class="aftersale-k">理由</text>
          <text class="aftersale-v">{{ order.aftersaleReason }}</text>
        </view>
        <view v-if="order.aftersaleSince" class="aftersale-row">
          <text class="aftersale-k">提交</text>
          <text class="aftersale-v">{{ formatDateTime(order.aftersaleSince) }}</text>
        </view>
        <view v-if="refundRecordSummary" class="aftersale-row">
          <text class="aftersale-k">退款</text>
          <text class="aftersale-v">{{ refundRecordSummary }}</text>
        </view>
      </view>

      <!-- 已取消：整单作废，别照着做 -->
      <view v-if="isCancelled" class="voided-bar">
        <text class="voided-title">本单已取消</text>
        <text class="voided-reason">{{ order.cancellationReason || '未填写取消原因' }}</text>
      </view>

      <!-- 物流：发了货才有，客服随时能念给顾客 -->
      <view v-if="shippingInfoVisible" class="card">
        <view class="card-title">物流</view>
        <view class="ship-row">
          <view class="ship-main">
            <text class="ship-carrier">{{ carrierLabel }}</text>
            <text class="ship-no">{{ order.trackingNumber }}</text>
          </view>
          <text class="ship-copy" @tap="copyTrackingNumber">复制单号</text>
        </view>
        <view class="ship-meta">
          <text v-if="order.shippedAt">{{ formatDateTime(order.shippedAt) }} 已交快递</text>
          <text v-else-if="estimatedShippingText">预计 {{ estimatedShippingText }} 发货</text>
        </view>
      </view>

      <!-- 商品与用量 -->
      <view v-if="firstOrderItem" class="card" :class="{ 'card-voided': isCancelled }">
        <view class="card-title">商品与用量</view>
        <view class="product">
          <view class="product-info">
            <text class="product-name">{{ firstOrderItem.recipeSnapshot?.name || '自定义食谱' }}</text>
            <view class="product-for">
              <text>{{ dogLine }}</text>
              <text v-if="!isCancelled" class="product-link" @tap="openDogSwitcher">换</text>
            </view>
            <view class="specs">
              <text class="spec">{{ formatPackagePlan(firstOrderItem) }}</text>
              <text v-if="firstOrderItem.dailyIntakeG" class="spec">
                每日 {{ formatGrams(firstOrderItem.dailyIntakeG) }}
              </text>
            </view>
          </view>
        </view>

        <view v-if="orderItems.length" class="usage">
          <view class="usage-stat">
            <text class="usage-value">{{ formatGrams(totalQuantityG) }}</text>
            <text class="usage-label">总净重</text>
          </view>
          <view class="usage-stat">
            <text class="usage-value">{{ totalPackageCount }} 袋</text>
            <text class="usage-label">总袋数</text>
          </view>
          <view v-if="hasFoodUsage" class="usage-stat">
            <text class="usage-value">{{ foodUsageLabel }}</text>
            <text class="usage-label">食材</text>
          </view>
          <view v-if="hasSupplementUsage" class="usage-stat">
            <text class="usage-value">{{ supplementUsageLabel }}</text>
            <text class="usage-label">补剂</text>
          </view>
        </view>

        <!-- 一单一道食谱时，上面那张商品卡已经写全了，不再重复一遍 -->
        <view
          v-if="orderItems.length === 1 && canEditPackagePlan && firstOrderItem.id"
          class="inline-actions"
        >
          <button class="mini-inline-btn" @tap="openPackagePanel(firstOrderItem)">修改订单规格</button>
        </view>

        <view v-if="orderItems.length > 1" class="usage-list">
        <view v-for="item in orderItems" :key="item.id || item.recipeSnapshot?.id" class="usage-item">
          <text class="usage-item-title">{{ item.recipeSnapshot?.name || '自定义食谱' }}</text>
          <text class="usage-item-meta">
            {{ item.dog?.name || '未绑定狗狗' }} · {{ formatGrams(item.quantityG) }} · {{ formatPackagePlan(item) }}
          </text>
          <text v-if="item.cookingMethod || item.vacuumBagSpec" class="usage-item-meta">
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
        </view>

        <view v-if="ingredientUsageRows.length" class="ingredient-summary">
          <text class="ingredient-title">原料汇总</text>
          <view v-for="row in ingredientUsageRows" :key="row.key" class="ingredient-row">
            <text class="ingredient-name">{{ row.name }}</text>
            <text class="ingredient-type">{{ row.typeLabel }}</text>
            <text class="ingredient-amount">{{ row.amountLabel }}</text>
          </view>
        </view>
      </view>

      <!-- 顾客与收货 -->
      <view class="card">
        <view class="card-title">顾客与收货</view>
        <view class="kv">
          <text class="kv-key">顾客</text>
          <text class="kv-value">
            {{ orderCustomerName || '未记录顾客' }}
            <text v-if="orderCustomerPhone" class="kv-sub">{{ formatPhoneForStaffOrder(orderCustomerPhone) }}</text>
          </text>
        </view>
        <view class="kv">
          <text class="kv-key">收货</text>
          <text v-if="order.address" class="kv-value">
            {{ order.address.recipientName }}
            <text class="kv-sub">{{ formatPhoneForStaffOrder(getOrderAddressPhone(order.address)) }}</text>
            {{ getOrderAddressRegionText(order.address) }} {{ getOrderAddressDetail(order.address) }}
          </text>
          <text v-else class="kv-value muted">暂未录入收货地址</text>
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
        <text v-else class="address-lock-hint">{{ addressLockHint }}</text>
      </view>

      <!-- 费用：商品 / 运费 / 实收，账要算得平 -->
      <view class="card">
        <view class="card-title">
          费用
          <text class="card-note">{{ paymentMethodLabel }}</text>
        </view>
        <view class="fee">
          <text class="fee-key">商品</text>
          <text class="fee-value">¥{{ formatAmount(productAmount) }}</text>
        </view>
        <view class="fee">
          <text class="fee-key">运费</text>
          <text class="fee-value">¥{{ formatAmount(order.amountShipping) }}</text>
        </view>
        <view class="fee total">
          <text class="fee-key">实收</text>
          <text class="fee-value">¥{{ formatAmount(order.totalAmount || order.amountTotal) }}</text>
        </view>
      </view>

      <!-- 管理员备注：只在开产前有用；开产后制作单已经带走了备注 -->
      <view v-if="remarkVisible" class="card">
        <view class="card-title">
          管理员备注
          <text class="card-note">仅员工可见</text>
        </view>
        <textarea
          v-model="remarkDraft"
          class="remark-textarea"
          maxlength="200"
          placeholder="填写分装要求、制作顺序、特殊提醒"
        />
        <view class="remark-meta">
          <text class="remark-hint">会同步到生产制作单和打印版</text>
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

      <!-- 备餐图 -->
      <view v-if="hasProductionPhotos" class="card">
        <view class="card-title-row">
          <view class="card-title compact">备餐图</view>
          <button
            v-if="shareToken"
            class="address-action-btn secondary photo-share-btn"
            open-type="share"
            data-share-type="photos"
          >
            一键分享
          </button>
        </view>
        <text v-if="order.productionPhotos?.uploadedAt" class="section-subtitle">
          上传时间：{{ formatDateTime(order.productionPhotos.uploadedAt) }}
        </text>
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

      <!-- 危险操作：退款不该跟日常动作并排 -->
      <view v-if="canAdminRefund && primaryAction?.key !== 'refund'" class="danger-zone">
        <text class="danger-btn" @tap="adminRefundOrder">退款 / 退差价</text>
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
  if (!orderId.value) return

  // 订单中心卡片上点了「发货」→ 直接落到这一单并把发货弹窗打开
  const autoShip = options.action === 'ship'
  loadOrderDetail().then(() => {
    if (autoShip && canShip.value) shipOrder()
  })
})

interface OrderDetail {
  id: string
  /** 新订单号（SK20261030-003）；老数据可能为空 */
  orderNo?: string | null
  status: string
  cancellationReason?: string | null
  refundStatus?: {
    success: boolean
  } | null
  totalAmount?: number
  amountTotal?: number
  amountShipping?: number
  /** 商品小计（不含运费）；费用明细要拆开算，不能拿总额冒充商品费 */
  amountProduct?: number
  aftersaleType?: string | null
  aftersaleReason?: string | null
  aftersaleSince?: string | null
  estimatedShippingDate?: string | null
  paymentRemainingSeconds?: number | null
  paymentDeadline?: string | null
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
/**
 * 页面上显示/复制用的订单号（2026-10-30）。
 *
 * 以前这里显示的是 `order.id`（一串 uuid），顶部又显示 `id.slice(-8)`，
 * 同一个页面两个"订单号"，而且都**不是**新订单号 SK20261030-003 那种格式，
 * 员工照着念 / 复制给顾客全对不上。
 * 老订单没有 orderNo（历史数据），只能退回 id，不能显示空白。
 */
const displayOrderNo = computed(
  () => order.value?.orderNo || order.value?.id || '',
)
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
/**
 * 顶部配色只在 heroTone 里定（正常绿 / 售后红 / 已取消灰）。
 * 这里原先那张"七色彩虹"映射已删除 —— 员工记不住，也和订单列表的
 * "绿=鲜食"打架（2026-10-30）。
 */

// 操作权限判断
const canConfirmPayment = computed(() => {
  return order.value && order.value.status === 'PENDING_PAYMENT'
})

/**
 * ⚠️ 2026-10-30 起本页不再用这两个：生产制作统一在工作台「生产管理」里开工。
 * 保留是为了后台以后要在这页加回来时不用重写接口调用。
 */
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

/* ===== 2026-10-30 改版：状态 → 颜色 / 四段进度 / 主操作 ===== */

const isCancelled = computed(() => order.value?.status === 'CANCELLED')
const isAftersale = computed(() => order.value?.status === 'AFTERSALE')
const refundSucceeded = computed(() => order.value?.refundStatus?.success === true)

/**
 * 正常流程一律品牌绿；**只有**售后（红）和已取消（灰）换色。
 * 以前七种颜色（橙黄蓝紫青…）员工记不住，而且绿色在订单列表里
 * 代表"鲜食"，到这页又代表"已支付"，同一个绿两个意思。
 */
const heroTone = computed(() => {
  if (isAftersale.value) return 'is-exception'
  if (isCancelled.value) return 'is-cancelled'
  return ''
})

/**
 * 顶部大字必须和「订单中心」列表用同一套说法。
 *
 * 之前这里用的是专业状态名：列表说「待发货」，详情说「急冻中」——
 * 同一张单两个叫法，员工对不上号（2026-10-30 自检发现）。
 */
const heroStatusLabel = computed(() => {
  const o = order.value
  if (!o) return ''
  if (refundSucceeded.value && o.status !== 'CANCELLED') return '已退款'
  switch (o.status) {
    case 'INIT':
      return '待确认'
    case 'PENDING_PAYMENT':
      return '待付款'
    case 'PAID':
    case 'PURCHASING':
    case 'IN_PRODUCTION':
      return '处理中'
    case 'FREEZING':
      return '待发货'
    case 'SHIPPED':
      return '已发货'
    case 'COMPLETED':
      return '已完成'
    case 'CANCELLED':
      return '已取消'
    case 'AFTERSALE':
      return '售后中'
    default:
      return getStatusText(o.status)
  }
})

const heroSubline = computed(() => {
  const o = order.value
  if (!o) return ''
  switch (o.status) {
    case 'INIT':
      return '等待确认，还没进入付款'
    case 'PENDING_PAYMENT':
      return '顾客还没付钱'
    case 'PAID':
      // 这页不再有「开始制作」，文案不能再引着人去点
      return '钱已到账，等生产管理里开工'
    case 'PURCHASING':
      return '原料采购中'
    case 'IN_PRODUCTION':
      return '正在制作'
    case 'FREEZING':
      return '已经冻好，可以直接发货'
    case 'SHIPPED':
      return '已交快递'
    case 'COMPLETED':
      return '这单已经结束'
    case 'CANCELLED':
      return '这单已作废，不要照着做'
    case 'AFTERSALE':
      return o.aftersaleReason ? `顾客反馈：${o.aftersaleReason}` : '顾客提出了售后'
    default:
      return ''
  }
})

const heroTag = computed(() => {
  const o = order.value
  if (!o) return ''
  if (o.status === 'PENDING_PAYMENT' && o.paymentRemainingSeconds) {
    const minutes = Math.ceil(Number(o.paymentRemainingSeconds) / 60)
    return minutes > 0 ? `${minutes} 分钟内需付款` : '即将关闭'
  }
  if (isCancelled.value && o.cancelledAt) return `${formatShortDate(o.cancelledAt)} 取消`
  if (isAftersale.value && o.aftersaleSince) return `${formatShortDate(o.aftersaleSince)} 提出`
  return ''
})

/**
 * 四段进度：下单 → 支付 → 制作 → 发货。
 *
 * 十个状态收敛成四格，员工不用记"采购中/急冻中/制作中"的差别，
 * 只关心"走到第几格、下一步该谁动"。
 */
const progressSteps = computed(() => {
  const o = order.value
  if (!o) return []
  const paidDone =
    Boolean(o.paidAt) ||
    ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'FREEZING', 'SHIPPED', 'COMPLETED'].includes(o.status)
  const madeDone = Boolean(o.shippedAt) || ['FREEZING', 'SHIPPED', 'COMPLETED'].includes(o.status)
  const shippedDone = Boolean(o.shippedAt) || ['SHIPPED', 'COMPLETED'].includes(o.status)

  const rows = [
    { name: '下单', done: true, time: formatShortDate(o.createdAt) },
    {
      name: '支付',
      done: paidDone,
      time: paidDone ? (o.paidAt ? formatShortDate(o.paidAt) : '已完成') : '待付款',
    },
    {
      name: '制作',
      done: madeDone,
      time: madeDone ? '已完成' : o.status === 'IN_PRODUCTION' ? '进行中' : paidDone ? '待开始' : '—',
    },
    {
      name: '发货',
      done: shippedDone,
      time: shippedDone ? formatShortDate(o.shippedAt) : o.status === 'FREEZING' ? '待发货' : '—',
    },
  ]

  const firstOpen = rows.findIndex((row) => !row.done)
  return rows.map((row, index) => ({
    ...row,
    current: !isCancelled.value && firstOpen === index,
  }))
})

/** 主操作只跟"这一步该干的活"有关；没有就给一句提示，不放点不动的按钮 */
const primaryAction = computed<{ key: string; label: string; run: () => void } | null>(() => {
  if (canConfirmPayment.value) return { key: 'confirm', label: '确认收款', run: confirmPayment }
  /**
   * 这里**不给**「开始制作」：生产制作统一在「工作台 → 生产管理」里开工
   * （2026-10-30 老板定）。这页只负责收款、发货、退款。
   */
  if (canShip.value) return { key: 'ship', label: '填写运单并发货', run: shipOrder }
  /**
   * 退款只有当它是"这一步该做的事"时才做主按钮（售后中）。
   * 已发货 / 已完成 / 已取消的单，退款应该待在底部危险区，
   * 否则一进页面就是一个巨大的"退款"，像在催人退钱。
   */
  if (canAdminRefund.value && isAftersale.value) {
    return { key: 'refund', label: '退款 / 退差价', run: adminRefundOrder }
  }
  return null
})

/**
 * 管理员备注只在**开产前**有意义：开产后制作单已经带走备注，
 * 这页继续摆一个输入框，只会让人以为改了能同步过去。
 */
const remarkVisible = computed(() =>
  ['INIT', 'PENDING_PAYMENT', 'PAID', 'PURCHASING'].includes(order.value?.status || ''),
)

const hasFoodUsage = computed(() =>
  rawIngredientDetails.value.some((detail: any) => detail?.type === 'FOOD'),
)
const hasSupplementUsage = computed(() =>
  rawIngredientDetails.value.some((detail: any) => detail?.type === 'SUPPLEMENT'),
)

const addressLockHint = computed(() => {
  const status = order.value?.status
  if (status === 'CANCELLED') return '本单已取消，地址不能再改'
  if (status === 'COMPLETED') return '这单已结束，地址不能再改'
  return '已发货后不可修改'
})

const stageHint = computed(() => {
  const o = order.value
  if (!o) return ''
  if (o.status === 'PAID' || o.status === 'PURCHASING') {
    return '原料齐了就等工作台「生产管理」里开工，这页不用点。'
  }
  if (o.status === 'IN_PRODUCTION') {
    return '制作进度在「生产任务」里推进，做完会自动进入「急冻中 / 待发货」。'
  }
  if (o.status === 'SHIPPED') return '已经交给快递，后续物流以快递为准。'
  if (o.status === 'COMPLETED') return '这单已经结束，不需要再操作。'
  return ''
})

const aftersaleTypeLabel = computed(() => {
  const type = order.value?.aftersaleType
  if (!type) return '未填写'
  const map: Record<string, string> = {
    REFUND: '退款',
    RESHIP: '免费补发',
    REMAKE: '重做',
    COMPLAINT: '投诉',
    RESOLVED: '已协商解决',
  }
  return map[type] || type
})

const refundRecordSummary = computed(() => (refundSucceeded.value ? '已原路退回' : ''))

const shippingInfoVisible = computed(() =>
  Boolean(order.value?.trackingNumber || order.value?.carrierCode),
)

const carrierLabel = computed(() => {
  const code = order.value?.carrierCode
  if (!code) return '快递'
  const hit = (carriers as Array<{ code: string; name: string }>).find((item) => item.code === code)
  return hit?.name || code
})

const estimatedShippingText = computed(() =>
  order.value?.estimatedShippingDate ? formatShortDate(order.value.estimatedShippingDate) : '',
)

const dogLine = computed(() => {
  const dog: any = firstOrderItem.value?.dog
  if (!dog) return '未绑定狗狗'
  const parts = [dog.name]
  if (dog.breedName) parts.push(dog.breedName)
  if (dog.weightKg) parts.push(`${dog.weightKg}kg`)
  return `给 ${parts.filter(Boolean).join(' · ')}`
})

/**
 * 费用明细要算得平：商品 + 运费 = 实收。
 * 以前"商品费用"和"总计"用的是同一个数，看着就像算错钱。
 */
const productAmount = computed(() => {
  const o = order.value
  if (!o) return 0
  if (typeof o.amountProduct === 'number') return o.amountProduct
  const total = Number(o.totalAmount ?? o.amountTotal ?? 0)
  const shipping = Number(o.amountShipping ?? 0)
  return Math.max(0, total - shipping)
})

const paymentMethodLabel = computed(() => {
  const o = order.value
  if (!o) return ''
  const base = getPaymentMethod(o.paymentMethod)
  return refundSucceeded.value ? `${base} · 已退款` : base
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

/**
 * 弹窗里展示订单号也统一成新格式（2026-10-30）。
 * 老订单没有 orderNo 时退回短 id —— 聊胜于无，但至少新单不会显示 uuid。
 */
function orderNoText(currentOrder: OrderDetail): string {
  return currentOrder.orderNo || shortOrderId(currentOrder.id)
}

function getOrderConfirmContent(currentOrder: OrderDetail): string {
  return [
    '确认收到该订单款项？',
    `订单：${orderNoText(currentOrder)}`,
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
  const raw = address.regionText || formatRegionText(address.region)
  // 直辖市（上海市 上海市 浦东新区）会把省和市显示两遍，相邻重复段去掉
  const parts = String(raw || '').split(/\s+/).filter(Boolean)
  return parts.filter((part, index) => index === 0 || part !== parts[index - 1]).join(' ')
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

function isRefundedOrder(currentOrder: OrderDetail): boolean {
  return currentOrder.status === 'CANCELLED' && currentOrder.refundStatus?.success === true
}

function getPaymentMethod(method?: string): string {
  const methodMap: Record<string, string> = {
    // 真实枚举（后端存的）：WECHAT_PAY / OFFLINE / OFFLINE_WECHAT
    WECHAT_PAY: '微信支付',
    OFFLINE: '线下收款',
    OFFLINE_WECHAT: '线下收款（微信）',
    // 历史数据/其它渠道
    WECHAT: '微信支付',
    ALIPAY: '支付宝',
  }
  return method ? methodMap[method] || method : '未支付'
}

// 操作
function formatShortDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

function copyTrackingNumber() {
  const no = order.value?.trackingNumber
  if (!no) return
  uni.setClipboardData({
    data: no,
    success: () => {
      uni.showToast({ title: '单号已复制', icon: 'success' })
    },
  })
}

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
  const value = displayOrderNo.value
  if (!value) return
  uni.setClipboardData({
    data: value,
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
      `订单：${displayOrderNo.value}`,
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
  background-color: #fbfcf7;
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
  color: #6b6653;
  margin-top: 24rpx;
}

.error-icon {
  font-size: 120rpx;
}

.retry-btn {
  margin-top: 32rpx;
  padding: 16rpx 48rpx;
  background-color: #1e3a2f;
  color: #f3eddd;
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
  color: #f3eddd;
}

.order-id-text {
  font-size: 28rpx;
  color: #f3eddd;
}

// 通用区块
.section {
  background-color: #fbfcf7;
  margin: 24rpx 32rpx;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 2rpx 8rpx rgba(30, 46, 36, 0.06);
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;
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
  color: #6b6653;
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
  color: #26261f;
}

.info-value {
  font-size: 28rpx;
  color: #26261f;
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
  color: #b08d4f;
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
  color: #26261f;
}

.product-specs {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.spec-item {
  font-size: 26rpx;
  color: #26261f;
}

.usage-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.usage-stat {
  padding: 18rpx;
  border-radius: 10rpx;
  background-color: #eef2e4;
}

.usage-label,
.usage-item-meta,
.ingredient-type {
  display: block;
  font-size: 24rpx;
  color: #6b6653;
  line-height: 1.45;
}

.usage-value {
  display: block;
  margin-top: 6rpx;
  font-size: 28rpx;
  color: #26261f;
  font-weight: 700;
}

.usage-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #eef1e2;
}

.mini-inline-btn {
  width: 180rpx;
  height: 58rpx;
  margin: 16rpx 0 0;
  border-radius: 8rpx;
  border: 2rpx solid #e5e8d4;
  background-color: #fbfcf7;
  color: #b08d4f;
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
  color: #26261f;
  font-weight: 700;
  line-height: 1.45;
}

.ingredient-summary {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #eef1e2;
}

.ingredient-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88rpx 150rpx;
  gap: 12rpx;
  align-items: center;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #eef1e2;
}

.ingredient-row:last-child {
  border-bottom: none;
}

.ingredient-name {
  min-width: 0;
  font-size: 25rpx;
  color: #26261f;
  line-height: 1.45;
}

.ingredient-amount {
  font-size: 25rpx;
  color: #26261f;
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
  background-color: #eef2e4;
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
  height: 200rpx;
  min-height: 200rpx;
  padding: 24rpx;
  box-sizing: border-box;
  border: 2rpx solid #eef1e2;
  border-radius: 12rpx;
  background-color: #eef2e4;
  font-size: 28rpx;
  line-height: 1.6;
  color: #26261f;
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
  color: #6b6653;
  line-height: 1.5;
}

.remark-count {
  font-size: 24rpx;
  color: #6b6653;
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
  background-color: #1e3a2f;
  color: #f3eddd;
}

.remark-btn.secondary {
  background-color: #fbfcf7;
  color: #b08d4f;
  border: 2rpx solid #e5e8d4;
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
  color: #26261f;
}

.recipient-phone {
  font-size: 26rpx;
  color: #26261f;
}

.address-text {
  font-size: 26rpx;
  color: #26261f;
  line-height: 1.6;
}

.address-empty {
  padding: 8rpx 0;
}

.address-empty-text,
.address-lock-hint {
  font-size: 26rpx;
  color: #6b6653;
}

.address-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 20rpx;
}
.address-actions .address-action-btn {
  flex: 1 0 44%;
  margin: 0;
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
    background-color: #1e3a2f;
    color: #f3eddd;
  }

  &.secondary {
    background-color: #fbfcf7;
    color: #b08d4f;
    border: 2rpx solid #e5e8d4;
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
  background-color: #eef2e4;
  color: #b08d4f;
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
  background-color: #fbfcf7;
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
  color: #26261f;
}

.modal-close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  color: #6b6653;
}

.modal-loading,
.modal-empty {
  min-height: 180rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
  color: #6b6653;
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
  color: #6b6653;
  font-weight: 700;
}

.address-select-item {
  padding: 24rpx;
  border-radius: 12rpx;
  border: 2rpx solid #eef1e2;
}

.dog-option-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.dog-option {
  padding: 22rpx;
  border-radius: 12rpx;
  border: 2rpx solid #eef1e2;
  background-color: #fbfcf7;
}

.dog-option.active {
  border-color: #1e3a2f;
  background-color: #eef2e4;
}

.dog-option-meta {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #6b6653;
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
  border: 2rpx solid #eef1e2;
  border-radius: 10rpx;
  background-color: #fbfcf7;
  font-size: 26rpx;
  color: #26261f;
  box-sizing: border-box;
}

.package-separator {
  font-size: 24rpx;
  color: #6b6653;
}

.package-remove-btn {
  width: 58rpx;
  height: 58rpx;
  padding: 0;
  border-radius: 50%;
  background-color: #f8e8e2;
  color: #b4553f;
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
  color: #26261f;
  font-weight: 500;
}

.form-input,
.form-picker,
.form-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 2rpx solid #eef1e2;
  border-radius: 10rpx;
  background-color: #fbfcf7;
  font-size: 28rpx;
  color: #26261f;
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
  color: #6b6653;
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
  background-color: #1e3a2f;
  color: #f3eddd;
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
    border-top: 2rpx solid #eef1e2;
  }
}

.fee-label {
  font-size: 28rpx;
  color: #26261f;
}

.fee-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;

  .fee-item.total & {
    font-size: 36rpx;
    color: #b4553f;
  }
}

// 操作区块
.action-section {
  background-color: #fbfcf7;
  margin: 24rpx 32rpx;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 2rpx 8rpx rgba(30, 46, 36, 0.06);
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
    background-color: #1e3a2f;
    color: #f3eddd;
  }

  &.orange {
    background-color: #b08d4f;
    color: #f3eddd;
  }

  &.cyan {
    background-color: #1e3a2f;
    color: #f3eddd;
  }

  &.green {
    background-color: #1e3a2f;
    color: #f3eddd;
  }

  &.red {
    background-color: #b4553f;
    color: #f3eddd;
  }

  &::after {
    border: none;
  }
}

/* ===== 2026-10-30 改版：状态头 / 进度线 / 主操作 / 售后卡 ===== */

.hero {
  margin: 24rpx 32rpx 0;
  border-radius: 28rpx;
  padding: 28rpx 30rpx 24rpx;
  background: linear-gradient(135deg, #1e3a2f 0%, #2b5040 100%);
}
.hero.is-exception {
  background: linear-gradient(135deg, #8e2a20 0%, #c0392b 100%);
}
.hero.is-cancelled {
  background: linear-gradient(135deg, #6b7280 0%, #8b93a1 100%);
}
.hero-row { display: flex; align-items: flex-start; justify-content: space-between; }
.hero-main { flex: 1; min-width: 0; }
.hero-status { display: block; font-size: 44rpx; font-weight: 700; color: #fff; }
.hero-sub { display: block; margin-top: 8rpx; font-size: 22rpx; line-height: 1.5; color: rgba(255, 255, 255, 0.78); }
.hero-no-row { display: flex; align-items: center; gap: 12rpx; margin-top: 10rpx; }
.hero-no { font-size: 20rpx; color: rgba(255, 255, 255, 0.55); font-family: Menlo, Consolas, monospace; }
.hero-copy {
  padding: 2rpx 12rpx; border-radius: 16rpx; font-size: 18rpx;
  color: rgba(255, 255, 255, 0.85); background: rgba(255, 255, 255, 0.16);
}
.hero-tag {
  flex: none; margin-left: 16rpx; padding: 6rpx 16rpx; border-radius: 40rpx;
  background: rgba(255, 255, 255, 0.18); color: #fff; font-size: 20rpx; white-space: nowrap;
}

.steps { display: flex; margin-top: 28rpx; }
.step { flex: 1; position: relative; }
.step-line { position: absolute; left: 0; right: 0; top: 8rpx; height: 3rpx; background: rgba(255, 255, 255, 0.22); }
.step.done .step-line { background: rgba(255, 255, 255, 0.9); }
.step-dot {
  width: 18rpx; height: 18rpx; border-radius: 50%;
  background: rgba(255, 255, 255, 0.32); position: relative; z-index: 1; margin-bottom: 14rpx;
}
.step.done .step-dot { background: #fff; }
.step.current .step-dot { background: #fff; box-shadow: 0 0 0 8rpx rgba(255, 255, 255, 0.22); }
.step-name { display: block; font-size: 20rpx; color: rgba(255, 255, 255, 0.55); }
.step.done .step-name, .step.current .step-name { color: #fff; }
.step-time { display: block; margin-top: 2rpx; font-size: 18rpx; color: rgba(255, 255, 255, 0.5); }
.step.done .step-time { color: rgba(255, 255, 255, 0.72); }

.action-bar { display: flex; gap: 16rpx; margin: 20rpx 32rpx 0; }
.action-bar .action-btn { width: auto; flex: 1; height: 88rpx; border-radius: 22rpx; font-size: 30rpx; font-weight: 600; }
.action-bar .action-btn.primary { background: #1e3a2f; color: #fff; }
.action-bar .action-btn.ghost {
  flex: none; width: 150rpx; background: #fff; color: #2b5040;
  border: 1rpx solid #dfe4e1; font-size: 24rpx; font-weight: 400;
}
.stage-hint {
  margin: 20rpx 32rpx 0; padding: 20rpx 24rpx; border-radius: 20rpx;
  background: #eef2ef; color: #5d6a64; font-size: 22rpx; line-height: 1.6;
}

.aftersale-card {
  margin: 20rpx 32rpx 0; padding: 24rpx 26rpx;
  background: #fff; border: 1rpx solid #f3d9d4; border-radius: 24rpx;
}
.aftersale-head { display: flex; align-items: center; justify-content: space-between; }
.aftersale-title { font-size: 26rpx; font-weight: 600; color: #c0392b; }
.aftersale-state { padding: 4rpx 16rpx; border-radius: 20rpx; background: #fdecea; color: #c0392b; font-size: 20rpx; }
.aftersale-state.settled { background: #eef6f0; color: #2e7d4f; }
.aftersale-row { display: flex; margin-top: 14rpx; }
.aftersale-k { width: 72rpx; flex: none; font-size: 22rpx; color: #a08b88; }
.aftersale-v { flex: 1; font-size: 24rpx; color: #4a3b39; line-height: 1.5; }

.voided-bar { margin: 20rpx 32rpx 0; padding: 20rpx 24rpx; border-radius: 20rpx; background: #f1f2f4; }
.voided-title { display: block; font-size: 26rpx; font-weight: 600; color: #5b636e; }
.voided-reason { display: block; margin-top: 6rpx; font-size: 22rpx; color: #8b93a1; }
.is-voided .card-voided { opacity: 0.55; }

.card {
  margin: 20rpx 32rpx; padding: 26rpx 28rpx;
  background: #fff; border-radius: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(30, 46, 36, 0.06);
}
.card-title { display: flex; align-items: center; gap: 14rpx; font-size: 28rpx; font-weight: 600; color: #1e3a2f; }
.card-title::before { content: ""; width: 6rpx; height: 24rpx; border-radius: 4rpx; background: #1e3a2f; }
.card-note { margin-left: auto; font-size: 20rpx; font-weight: 400; color: #909399; }
.card-title-row { display: flex; align-items: center; justify-content: space-between; }

.product { display: flex; gap: 20rpx; margin-top: 20rpx; }
.product-cover { width: 120rpx; height: 120rpx; border-radius: 18rpx; flex: none; }
.product-cover.placeholder {
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #d8e6d9, #b7cfba); color: #1e3a2f; font-size: 32rpx;
}
.product-info { flex: 1; min-width: 0; }
.product-name { font-size: 30rpx; font-weight: 600; color: #1f2d27; }
.product-for { display: flex; align-items: center; gap: 12rpx; margin-top: 8rpx; font-size: 22rpx; color: #909399; }
.product-link { padding: 0 12rpx; border-radius: 16rpx; background: #eef2ef; color: #2b5040; font-size: 20rpx; }
.specs { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 12rpx; }
.spec { padding: 4rpx 14rpx; border-radius: 10rpx; background: #f4f6f5; color: #5a6560; font-size: 20rpx; }

.usage { display: flex; margin-top: 22rpx; padding-top: 20rpx; border-top: 1rpx solid #f2f3f5; }
.usage .usage-stat { flex: 1; text-align: center; }
.usage .usage-value { display: block; font-size: 28rpx; font-weight: 600; color: #1e3a2f; }
.usage .usage-label { display: block; margin-top: 6rpx; font-size: 20rpx; color: #909399; }

.kv { display: flex; align-items: flex-start; margin-top: 18rpx; }
.kv-key { width: 80rpx; flex: none; font-size: 22rpx; color: #909399; }
.kv-value { flex: 1; font-size: 24rpx; color: #303133; line-height: 1.6; }
.kv-sub { margin-left: 8rpx; color: #909399; font-size: 22rpx; }
.kv-value.muted { color: #b0b4bb; }
.kv-action { flex: none; margin-left: 12rpx; font-size: 20rpx; color: #2b5040; }

.fee { display: flex; justify-content: space-between; padding: 12rpx 0; font-size: 24rpx; }
.fee-key { color: #606266; }
.fee-value { color: #303133; }
.fee.total { margin-top: 6rpx; padding-top: 18rpx; border-top: 1rpx solid #f2f3f5; }
.fee.total .fee-key { font-weight: 600; color: #1e3a2f; }
.fee.total .fee-value { font-size: 30rpx; font-weight: 700; color: #1e3a2f; }

.ship-row { display: flex; align-items: center; margin-top: 18rpx; padding: 18rpx 20rpx; background: #f7f9f8; border-radius: 16rpx; }
.ship-main { flex: 1; min-width: 0; }
.ship-carrier { display: block; font-size: 22rpx; color: #5a6560; }
.ship-no { display: block; margin-top: 4rpx; font-size: 26rpx; font-weight: 600; color: #1f2d27; font-family: Menlo, Consolas, monospace; }
.ship-copy { flex: none; padding: 8rpx 20rpx; border: 1rpx solid #dfe4e1; border-radius: 30rpx; background: #fff; font-size: 20rpx; color: #2b5040; }
.ship-meta { display: flex; justify-content: space-between; margin-top: 12rpx; font-size: 20rpx; color: #909399; }

.danger-zone { margin: 32rpx 32rpx 0; padding-top: 24rpx; border-top: 1rpx solid #f0f1f2; text-align: center; }
.danger-btn { font-size: 24rpx; color: #c0392b; }

.section-subtitle { display: block; margin-top: 8rpx; font-size: 20rpx; color: #909399; }
</style>
