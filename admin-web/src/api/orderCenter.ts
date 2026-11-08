import api from './index'

export type OrderCenterType = 'FOOD' | 'CUSTOM_RECIPE' | 'SUPPLEMENT'
export type UnifiedStatusGroup =
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'IN_PROGRESS'
  | 'TO_SHIP'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'

/**
 * 按真实阶段筛选（2026-11-08）：已付款 / 采购中 / 生产中 / 分装中 / 制作中 / 已交付。
 * 统一组继续兼容旧客户端；'PENDING'（草稿单）已不再显示。
 */
export type OrderCenterStatusFilter =
  | UnifiedStatusGroup
  | 'PAID'
  | 'PURCHASING'
  | 'IN_PRODUCTION'
  | 'PACKING'
  | 'MAKING'
  | 'DELIVERED'

export interface OrderCenterQuery {
  type?: OrderCenterType
  status?: OrderCenterStatusFilter
  dateFrom?: string
  dateTo?: string
  dateField?: 'created' | 'packing'
  keyword?: string
  aftersale?: boolean
  /** 只看赠送单（2026-10-30）；只对食谱定制生效 */
  gift?: boolean
  page?: number
  pageSize?: number
}

export interface OrderCenterItem {
  type: OrderCenterType
  id: string
  orderNo: string
  customerId: string
  customerName: string | null
  customerPhone: string | null
  /** 顾客账号角色（CUSTOMER / STAFF / ADMIN）；非 CUSTOMER 显示「内部测试」 */
  customerRole: string | null
  statusGroup: UnifiedStatusGroup
  rawStatus: string
  /** 统一状态组的中文名（兼容旧接口，列表优先用 stageLabel） */
  statusLabel: string
  /** 真实阶段：已付款 / 采购中 / 生产中 / 分装中 / 制作中 / 已交付（2026-11-08） */
  stageLabel?: string
  subtypeLabel: string | null
  amountTotal: number | null
  /** 赠送单（2026-10-30）：金额 0，列表上要标出来 */
  isGift?: boolean
  createdAt: string
  paidAt: string | null
  scheduledDate: string | null
  shippedAt: string | null
  completedAt: string | null
  hasOpenAftersale: boolean
  aftersaleLabel: string | null
}

export interface OrderCenterResponse {
  items: OrderCenterItem[]
  total: number
  page: number
  pageSize: number
  counts: {
    FOOD: number
    CUSTOM_RECIPE: number
    SUPPLEMENT: number
  }
}

export interface SupplementAftersaleCase {
  id: string
  caseNo: string
  orderType: string
  orderId: string
  orderNo: string | null
  customerId: string
  status: string
  requestType: string
  requestedReason: string
  requestedPhotos: string[]
  resolutionType: string | null
  refundAmount: number | null
  refundStatus: string | null
  refundOutNo: string | null
  refundId: string | null
  refundedAt: string | null
  reshipOrderNo: string | null
  handlingNote: string | null
  createdAt: string
  updatedAt: string
}

export const orderCenterApi = {
  list: (params?: OrderCenterQuery): Promise<OrderCenterResponse> =>
    api.get('/admin/order-center', { params }),

  listSupplementAftersales: (params?: {
    status?: string
    keyword?: string
    page?: number
    pageSize?: number
  }): Promise<{
    items: SupplementAftersaleCase[]
    total: number
    page: number
    pageSize: number
  }> => api.get('/admin/supplement-shop/aftersales', { params }),

  resolveSupplementAftersale: (
    id: string,
    data: {
      resolutionType: 'REFUND' | 'RESHIP' | 'REGISTER_ONLY' | 'REJECT'
      refundAmount?: number
      note?: string
      rejectReason?: string
    }
  ): Promise<SupplementAftersaleCase> =>
    api.post(`/admin/supplement-shop/aftersales/${id}/resolve`, data),
}
