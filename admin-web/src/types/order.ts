/**
 * 订单状态枚举
 * Phase 9: E-commerce Standard Order Status
 * Aligned with backend OrderStatus enum
 */
export enum OrderStatus {
  INIT = 'INIT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  PURCHASING = 'PURCHASING',
  IN_PRODUCTION = 'IN_PRODUCTION',
  FREEZING = 'FREEZING',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  AFTERSALE = 'AFTERSALE'
}

/**
 * 订单类型枚举
 */
export enum OrderType {
  FRESH_FOOD = 'FRESH_FOOD',
  CUSTOM_SERVICE = 'CUSTOM_SERVICE'
}

/**
 * 支付状态枚举
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

/**
 * 取消操作者类型
 */
export type CancelledBy = 'customer' | 'admin' | 'system'

/**
 * 食谱快照
 */
export interface RecipeSnapshot {
  id: string
  version: number
  name: string
  description?: string
  baseRecipe?: string
  ingredients: {
    ingredientId: string
    ingredientName: string
    amountG: number
  }[]
  healthTags?: string[]
  preparationMethod?: string
}

/**
 * 订单项
 */
export interface OrderItem {
  id: string
  orderId: string
  dogId?: string
  recipeSnapshot: RecipeSnapshot
  quantityG: number
  packageCount: number
  packageSpecG: number
  customRequirements?: string
  dailyIntakeG: number
  productionBatchId?: string
  allocatedAt?: string
  dog?: {
    id: string
    name: string
    breedName?: string
    weightKg?: number
    gender?: string
  }
  totalPrice?: number
}

/**
 * 价格分解快照
 */
export interface PricingBreakdown {
  costIngredients: number
  costPackaging: number
  costLabor: number
  costOverhead: number
  totalProductCost: number
  productPrice: number
  shippingFee: number
  totalPrice: number
}

/**
 * 订单财务结算摘要
 */
export interface OrderFinancialSummary {
  orderId: string
  amountTotal: number
  revenue: number
  netRevenue: number
  estimatedCost: number
  estimatedMargin: number
  actualCost: number | null
  actualMargin: number | null
  shortageAdjustmentAmount: number
  requiresCustomerPayment: boolean
  adjustmentSummary: {
    totalIncreaseAmount: number
    totalDecreaseAmount: number
    pendingExtraPaymentAmount: number
    pendingRefundAmount: number
    settledExtraPaymentAmount: number
    settledRefundAmount: number
    netAdjustmentAmount: number
    netRevenue: number
  }
  adjustments: OrderSettlementAdjustment[]
  settlementStatus: 'PENDING' | 'SETTLED'
  latestSettlement: {
    id: string
    productionBatchId: string
    productionBatchSettlementId: string
    plannedOutputG: number
    actualOutputG: number
    shortageG: number
    settledAt: string | null
    createdAt: string | null
  } | null
}

export interface OrderSettlementAdjustment {
  id: string
  orderId: string
  sourceType: string
  sourceId: string | null
  adjustmentType: string
  amount: number
  reason: string
  status: 'PENDING' | 'SETTLED' | 'CANCELLED' | string
  requiresCustomerPayment: boolean
  visibleToCustomer: boolean
  createdBy: string
  createdById: string | null
  metadata: unknown
  settledAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

/**
 * 订单基础信息
 */
export interface Order {
  id: string
  customerId: string
  status: OrderStatus
  type: OrderType
  createdAt: string
  targetProductionDate: string | null
  amountProduct: number
  amountShipping: number
  amountTotal: number
  items: OrderItem[]
  pricingBreakdownSnapshot?: PricingBreakdown
  dogId?: string
  addressId?: string
  address?: {
    id: string
    recipientName: string
    phone: string
    region?: {
      province?: string
      city?: string
      district?: string
    }
    regionText?: string
    detailAddress?: string
  } | null
  trackingNumber?: string
  carrierCode?: string
  shippedAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
  cancellationReason?: string
  cancelledBy?: CancelledBy
  paymentMethod?: string
  transactionId?: string
  paidAt?: string | null
  paymentStatus?: PaymentStatus
  adminRemark?: string | null
  aftersaleType?: string
  aftersaleReason?: string
  aftersaleSince?: string | null
  aftersalePhotos?: string[]
}

/**
 * 订单列表项（用于列表展示，包含关联信息）
 */
export interface OrderListItem extends Order {
  customerName?: string
  customerPhone?: string
  dogName?: string
  dogBreed?: string
  dogWeight?: number
  addressCity?: string
  addressDetail?: string
  addressReceiver?: string
  addressPhone?: string
}

/**
 * 订单统计信息
 * Phase 9: Simplified statistics aligned with e-commerce standards
 */
export interface OrderStats {
  total: number
  pendingPayment: number
  paid: number
  purchasing: number
  inProduction: number
  freezing: number
  shipped: number
  completed: number
  cancelled: number
  aftersale: number
}

/**
 * 订单历史记录
 */
export interface OrderHistory {
  id: string
  orderId: string
  fromStatus?: OrderStatus
  toStatus: OrderStatus
  operatedBy?: string
  operatedAt: string
  remark?: string
}

/**
 * 订单列表查询参数
 */
export interface OrderListParams {
  status?: OrderStatus[]
  type?: OrderType
  startDate?: string
  endDate?: string
  customerId?: string
  minAmount?: number
  maxAmount?: number
  keyword?: string
  page?: number
  pageSize?: number
}

/**
 * 订单列表响应
 */
export interface OrderListResponse {
  list: OrderListItem[]
  total: number
  page: number
  pageSize: number
}

/**
 * 状态配置
 */
export interface StatusConfig {
  text: string
  type: 'success' | 'warning' | 'danger' | 'info' | 'primary'
}

/**
 * 快递公司配置
 */
export interface CarrierConfig {
  code: string
  name: string
}

/**
 * 发货请求数据
 */
export interface ShipRequest {
  carrierCode: string
  trackingNumber: string
}

/**
 * 取消订单请求数据
 */
export interface CancelRequest {
  reason: string
}
