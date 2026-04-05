/**
 * 订单相关类型定义
 */

export const OrderStatus = {
  INIT: 'INIT',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  PURCHASING: 'PURCHASING',
  IN_PRODUCTION: 'IN_PRODUCTION',
  FREEZING: 'FREEZING',
  SHIPPED: 'SHIPPED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  AFTERSALE: 'AFTERSALE'
} as const

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]

export const OrderType = {
  FRESH_FOOD: 'FRESH_FOOD',
  CUSTOM_SERVICE: 'CUSTOM_SERVICE'
} as const

export type OrderType = (typeof OrderType)[keyof typeof OrderType]

export const PaymentStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED'
} as const

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus]

export type CancelledBy = 'customer' | 'admin' | 'system'

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
}

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
}

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

export interface OrderHistory {
  id: string
  orderId: string
  fromStatus?: OrderStatus
  toStatus: OrderStatus
  operatedBy?: string
  operatedAt: string
  remark?: string
}

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

export interface OrderListResponse {
  list: OrderListItem[]
  total: number
  page: number
  pageSize: number
}

export interface StatusConfig {
  text: string
  type: 'success' | 'warning' | 'danger' | 'info' | 'primary'
}

export interface CarrierConfig {
  code: string
  name: string
}

export interface ShipRequest {
  carrierCode: string
  trackingNumber: string
}

export interface CancelRequest {
  reason: string
}
