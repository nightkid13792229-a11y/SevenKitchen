import api from './index'
import type {
  Order,
  OrderListItem,
  OrderListParams,
  OrderListResponse,
  OrderStats,
  OrderHistory,
  OrderFinancialSummary,
  ShipRequest,
  CancelRequest
} from '@/types/order'

/**
 * 订单API
 */
export const orderApi = {
  /**
   * 获取订单列表
   */
  list: (params?: OrderListParams): Promise<OrderListResponse> => {
    return api.get('/admin/orders', { params })
  },

  /**
   * 获取订单详情
   */
  getDetail: (id: string): Promise<Order> => {
    return api.get(`/admin/orders/${id}`)
  },

  /**
   * 获取订单财务结算摘要
   */
  getFinancialSummary: (id: string): Promise<OrderFinancialSummary> => {
    return api.get(`/admin/orders/${id}/financial-summary`)
  },

  /**
   * 更新管理员备注
   */
  updateRemark: (id: string, data: { adminRemark?: string | null }): Promise<Order> => {
    return api.put(`/admin/orders/${id}/admin-remark`, data)
  },

  /**
   * 取消订单
   */
  cancel: (id: string, data: CancelRequest): Promise<void> => {
    return api.post(`/admin/orders/${id}/cancel`, data)
  },

  /**
   * 发货
   */
  ship: (id: string, data: ShipRequest): Promise<void> => {
    return api.post(`/admin/orders/${id}/ship`, data)
  },

  /**
   * 确认支付
   */
  confirmPayment: (id: string): Promise<void> => {
    return api.post(`/admin/orders/${id}/confirm-payment`)
  },

  /**
   * 确认线下收款
   */
  confirmOfflinePayment: (id: string, data: { actualAmount?: number }): Promise<void> => {
    return api.post(`/admin/orders/${id}/confirm-offline-payment`, data)
  },

  /**
   * 开始生产
   */
  startProduction: (id: string): Promise<void> => {
    return api.post(`/admin/orders/${id}/start-production`)
  },

  /**
   * 完成生产
   */
  completeProduction: (id: string): Promise<void> => {
    return api.post(`/admin/orders/${id}/complete-production`)
  },

  /**
   * 完成订单
   */
  complete: (id: string): Promise<void> => {
    return api.post(`/admin/orders/${id}/complete`)
  },

  /**
   * 获取订单历史记录
   */
  getHistory: (id: string): Promise<OrderHistory[]> => {
    return api.get(`/admin/orders/${id}/history`)
  },

  /**
   * 获取订单统计数据
   */
  getStats: (): Promise<OrderStats> => {
    return api.get('/admin/orders/stats')
  },

  /**
   * 导出订单列表（Excel）
   */
  export: (params: OrderListParams): Promise<Blob> => {
    return api.get('/admin/orders/export', {
      params,
      responseType: 'blob'
    })
  }
}

export default orderApi
