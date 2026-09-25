/**
 * Supplements API
 * 补剂商城：报价、下单、我的补剂订单
 */

import { request } from '../utils/api'

export interface SupplementQuoteLineInput {
  ingredientId: string
  amount: number
}

export interface SupplementQuoteLineResult {
  ingredientId: string
  name: string
  unit: string
  physicalForm: string
  requestedAmount: number
  packedAmount: number
  unitCost: number
  cost: number
  price: number
  bags: number
  shelfLifeMonths: number
}

export interface SupplementQuote {
  lines: SupplementQuoteLineResult[]
  bagCount: number
  supplementCost: number
  supplementPrice: number
  serviceFee: number
  packagingFee: number
  goodsSubtotal: number
  shippingFee: number
  shippingDescription: string
  freeShipping: boolean
  /** 包邮门槛；null = 没设门槛（一律收运费）。用于显示"再买 X 可包邮" */
  freeShippingThreshold: number | null
  total: number
  warnings: string[]
  /** 本次购买几份（1 = 不加量） */
  portionMultiplier: number
  /** 本次覆盖的总天数；服务端没拿到 cycleDays 时为 null */
  totalDays: number | null
  /** 总价 ÷ 总天数，界面用它讲"多买几份，每天更便宜" */
  perDayCost: number | null
  /** 当前这张制作单最多能选几份（受份数上限与效期天数上限双重约束） */
  maxPortionMultiplier: number
  /**
   * 每个可选份数的结果（含总价与是否包邮），服务端已算好。
   * 界面直接渲染成选项卡片，不做任何乘法。
   */
  portionOptions: SupplementPortionOption[]
}

export interface SupplementPortionOption {
  multiplier: number
  totalDays: number | null
  goodsSubtotal: number
  shippingFee: number
  total: number
  freeShipping: boolean
  perDayCost: number | null
}

export interface SupplementUnavailableLine {
  ingredientId: string
  name: string
  reason: string
}

export interface SupplementQuoteResponse {
  quote: SupplementQuote
  unavailable: SupplementUnavailableLine[]
  enabled: boolean
}

export interface SupplementOrderItem {
  id: string
  ingredientId: string
  name: string
  brand: string | null
  productModel: string | null
  physicalForm: string | null
  unit: string
  requestedAmount: number
  packedAmount: number
  unitCost: number
  cost: number
  price: number
  bags: number
  shelfLifeMonths: number
  batchNo: string | null
  sourceExpiryDate: string | null
  packedExpiryDate: string | null
  packedAt: string | null
}

export interface SupplementOrder {
  id: string
  orderNo: string
  status: string
  bagCount: number
  amountSupplement: number
  amountServiceFee: number
  amountPackaging: number
  amountGoods: number
  amountShipping: number
  amountTotal: number
  shippingDescription: string | null
  receiverName: string
  receiverPhone: string
  receiverRegion: string
  receiverDetail: string
  recipeId: string | null
  recipeName: string | null
  dogId: string | null
  dogName: string | null
  cycleDays: number | null
  /**
   * 本次购买几份（1 = 不加量）。
   * 合并订单列表要标出「加量 N 份」，所以这里跟着后端返回一起声明；
   * 老数据可能没有这个字段，读取时按 1 处理。
   */
  portionMultiplier?: number
  /** 本次覆盖的总天数；服务端没算出来时为 null */
  totalDays?: number | null
  remark: string | null
  paymentStatus: string | null
  paidAt: string | null
  aftersaleType: string | null
  aftersaleReason: string | null
  trackingNumber: string | null
  carrierCode: string | null
  shippedAt: string | null
  createdAt: string
  items: SupplementOrderItem[]
}

export interface CreateSupplementOrderPayload {
  addressId: string
  lines: SupplementQuoteLineInput[]
  recipeId?: string
  recipeName?: string
  dogId?: string
  dogName?: string
  cycleDays?: number
  /** 加量份数，1 = 不加量。服务端会按配置校验上限 */
  portionMultiplier?: number
  remark?: string
}

export const SUPPLEMENT_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: '待付款',
  PAID: '待分装',
  PACKING: '分装中',
  PACKED: '待发货',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  AFTERSALE: '售后处理中'
}

/** 补剂商城是否开放 */
export function fetchSupplementShopStatus() {
  return request<{ enabled: boolean }>({
    url: '/supplements/shop-status',
    method: 'GET',
    quiet: true
  } as any)
}

/**
 * 按制作单的补剂清单报价。
 *
 * @param lines 补剂清单（只给 id 与用量，价格由服务端现算）
 * @param options.portionMultiplier 加量份数，1 = 不加量
 * @param options.cycleDays 制作单天数，服务端用它算总天数与每天成本、
 *        并校验「总天数 ≤ 效期安全线」
 */
export function quoteSupplements(
  lines: SupplementQuoteLineInput[],
  options: { portionMultiplier?: number; cycleDays?: number } = {}
) {
  return request<SupplementQuoteResponse>({
    url: '/supplements/quote',
    method: 'POST',
    data: {
      lines,
      ...(options.portionMultiplier !== undefined
        ? { portionMultiplier: options.portionMultiplier }
        : {}),
      ...(options.cycleDays !== undefined ? { cycleDays: options.cycleDays } : {})
    }
  })
}

/** 创建补剂订单 */
export function createSupplementOrder(payload: CreateSupplementOrderPayload) {
  return request<SupplementOrder>({
    url: '/supplement-orders',
    method: 'POST',
    data: payload
  })
}

/** 我的补剂订单列表 */
export function fetchSupplementOrders(params: {
  page?: number
  pageSize?: number
  status?: string
} = {}) {
  return request<{
    items: SupplementOrder[]
    total: number
    page: number
    pageSize: number
  }>({
    url: '/supplement-orders',
    method: 'GET',
    data: params
  })
}

/** 补剂订单详情 */
export function fetchSupplementOrderDetail(id: string) {
  return request<SupplementOrder>({
    url: `/supplement-orders/${id}`,
    method: 'GET'
  })
}

export interface SupplementPayParams {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}

export interface SupplementPaymentResult {
  provider: string
  mode: string
  orderId: string
  status: string
  amountTotal: number
  paymentDeadline: string | null
  paymentRemainingSeconds: number | null
  paymentTimeoutMinutes: number
  autoCloseUnpaid: boolean
  payParams: SupplementPayParams | null
}

/** 发起微信支付，拿小程序调起支付所需参数 */
export function paySupplementOrder(orderId: string) {
  return request<SupplementPaymentResult>({
    url: `/supplement-orders/${orderId}/pay`,
    method: 'POST',
    quiet: true
  } as any)
}

/** 主动查询支付结果（回调丢失时兜底） */
export function syncSupplementPayment(orderId: string) {
  return request<{ status: string; paid: boolean; tradeState: string | null }>({
    url: `/supplement-orders/${orderId}/sync-payment`,
    method: 'POST',
    quiet: true
  } as any)
}

/**
 * 一键购买补剂的草稿：从 DIY 制作单页写入，下单页读取。
 * 补剂行带用量，不适合塞进 URL，因此走本地存储。
 */
export interface SupplementPurchaseDraftLine {
  ingredientId: string
  amount: number
  /** 仅用于首屏占位展示，价格与最终名称以服务端报价为准 */
  name?: string
  unit?: string
  /** 品牌 / 规格（如「Now Foods / 100粒」）。报价接口不返回，由制作单带过来 */
  specText?: string
}

export interface SupplementPurchaseDraft {
  lines: SupplementPurchaseDraftLine[]
  recipeId?: string
  recipeName?: string
  dogId?: string
  dogName?: string
  cycleDays?: number
}

const DRAFT_STORAGE_KEY = 'supplementPurchaseDraft'

export function saveSupplementPurchaseDraft(draft: SupplementPurchaseDraft) {
  uni.setStorageSync(DRAFT_STORAGE_KEY, draft)
}

export function readSupplementPurchaseDraft(): SupplementPurchaseDraft | null {
  try {
    const raw = uni.getStorageSync(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const draft = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!draft || !Array.isArray(draft.lines) || draft.lines.length === 0) {
      return null
    }
    return draft as SupplementPurchaseDraft
  } catch (error) {
    console.warn('[Supplement] 读取购买草稿失败:', error)
    return null
  }
}

export function clearSupplementPurchaseDraft() {
  uni.removeStorageSync(DRAFT_STORAGE_KEY)
}
