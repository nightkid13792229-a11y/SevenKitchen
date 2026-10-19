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

export interface OrderCenterQuery {
  type?: OrderCenterType
  status?: UnifiedStatusGroup
  dateFrom?: string
  dateTo?: string
  dateField?: 'created' | 'packing'
  keyword?: string
  aftersale?: boolean
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
  statusGroup: UnifiedStatusGroup
  rawStatus: string
  statusLabel: string
  subtypeLabel: string | null
  amountTotal: number | null
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
