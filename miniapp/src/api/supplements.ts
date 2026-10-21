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
  /** 分装日（预计发货日）；null = 待排期 */
  packingDate?: string | null
  hasOpenAftersale?: boolean
  openAftersaleLabel?: string | null
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
  /** 来源 DIY 制作单；首次下单补剂时后端用它冻结快照 */
  diySheetId?: string
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
/** 取消未分装补剂订单（PAID 会走全额退款 case） */
export function cancelSupplementOrder(orderId: string, reason?: string) {
  return request({
    url: `/supplement-orders/${orderId}/cancel`,
    method: 'POST',
    data: reason ? { reason } : {}
  })
}

/** 申请补剂售后 */
export function createSupplementAftersale(
  orderId: string,
  payload: {
    requestType: 'REFUND' | 'RESHIP' | 'OTHER'
    reason: string
    photos?: string[]
    amount?: number
  }
) {
  return request({
    url: `/supplement-orders/${orderId}/aftersales`,
    method: 'POST',
    data: payload
  })
}

export interface SupplementAftersale {
  id: string
  caseNo: string
  status: string
  requestType: string
  requestedReason: string
  requestedPhotos?: string[]
  refundAmount: number | null
  refundStatus: string | null
  reshipOrderNo: string | null
  handlingNote: string | null
  createdAt: string
}

/** 补剂订阅消息模板（后端按环境变量返回，未配置为 null） */
export function fetchSupplementSubscribeTemplates() {
  return request<{
    scheduled: string | null
    shipped: string | null
    delay: string | null
    aftersale: string | null
  }>({
    url: '/supplements/subscribe-templates',
    method: 'GET'
  })
}

type SupplementSubscribeKind = 'scheduled' | 'shipped' | 'delay' | 'aftersale'
type SupplementSubscribeTemplates = Record<SupplementSubscribeKind, string | null>

let cachedSubscribeTemplates: SupplementSubscribeTemplates | null = null

/** 页面加载时预取模板；提交时才能同步调用 wx.requestSubscribeMessage */
export async function prefetchSupplementSubscriptions(): Promise<void> {
  try {
    const res = await fetchSupplementSubscribeTemplates()
    if (res.code !== 0) return
    cachedSubscribeTemplates = {
      scheduled: res.data?.scheduled || null,
      shipped: res.data?.shipped || null,
      delay: res.data?.delay || null,
      aftersale: res.data?.aftersale || null
    }
  } catch {
    cachedSubscribeTemplates = null
  }
}

/**
 * 在用户点击提交时请求订阅授权。
 * 微信一次最多 3 个模板：下单要排期/发货/延迟，售后单独请求售后模板。
 */
export async function requestSupplementSubscriptions(
  kinds: SupplementSubscribeKind[] = ['scheduled', 'shipped', 'delay']
): Promise<void> {
  const ids = cachedSubscribeTemplates
    ? Array.from(
        new Set(
          kinds
            .map((kind) => cachedSubscribeTemplates?.[kind])
            .filter((item): item is string => Boolean(item))
        )
      ).slice(0, 3)
    : []
  if (ids.length === 0 || typeof wx === 'undefined' || !wx.requestSubscribeMessage) return
  await new Promise<void>((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: () => resolve(),
      fail: () => resolve()
    })
  })
}

/** 下单前预计分装/发货日 */
export function fetchSupplementPackingDate() {
  return request<{ packingDate: string | null; autoScheduleEnabled: boolean }>({
    url: '/supplements/packing-date',
    method: 'GET'
  })
}

/** 补剂售后政策 */
export function fetchSupplementPolicy() {
  return request<{ aftersalePolicy: string | null; aftersaleWindowDays: number }>({
    url: '/supplements/policy',
    method: 'GET'
  })
}

/** 补剂订单关联的制作单快照 */
export function fetchSupplementSnapshot(orderId: string) {
  return request<{
    orderNo: string
    snapshot: any
    snapshotAt: string | null
    legacy: boolean
  }>({
    url: `/supplement-orders/${orderId}/snapshot`,
    method: 'GET'
  })
}

/** 补剂订单的售后记录 */
export function fetchSupplementAftersales(orderId: string) {
  return request<SupplementAftersale[]>({
    url: `/supplement-orders/${orderId}/aftersales`,
    method: 'GET'
  })
}

/** 未发货改地址 */
export function updateSupplementAddress(
  orderId: string,
  payload: { addressId: string; setAsDefault?: boolean }
) {
  return request({
    url: `/supplement-orders/${orderId}/address`,
    method: 'PATCH',
    data: payload
  })
}

/** 再次购买报价（不直接建单） */
export function repurchaseSupplementOrder(orderId: string) {
  return request({
    url: `/supplement-orders/${orderId}/repurchase`,
    method: 'POST'
  })
}

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
  /** 来源 DIY 制作单；首次下单补剂时后端用它冻结快照 */
  diySheetId?: string
  /** 复购时沿用原单份数 */
  portionMultiplier?: number
  /** 复购来源订单号，用于后端审计 */
  reorderFromOrderNo?: string
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
