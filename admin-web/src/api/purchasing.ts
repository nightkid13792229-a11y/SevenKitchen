import api from './index'

/**
 * 采购管理API（管理端）
 */
export const purchasingApi = {
  /**
   * 获取报销单列表
   */
  getReimbursements: (params?: {
    status?: string
    startDate?: string
    endDate?: string
    submittedById?: string
    page?: number
    pageSize?: number
  }): Promise<{
    list: any[]
    total: number
    page: number
    pageSize: number
  }> => {
    return api.get('/admin/purchasing/reimbursements', { params })
  },

  /**
   * 获取报销单详情
   */
  getReimbursementDetail: (id: string): Promise<any> => {
    return api.get(`/admin/purchasing/reimbursements/${id}`)
  },

  /**
   * 审核报销单
   */
  reviewReimbursement: (
    id: string,
    data: {
      decision: 'APPROVE' | 'REJECT' | 'REQUIRES_RESUBMIT'
      comment?: string
    }
  ): Promise<any> => {
    return api.post(`/admin/purchasing/reimbursements/${id}/review`, data)
  },

  /**
   * 获取采购历史记录
   */
  getPurchaseHistory: (params?: {
    startDate?: string
    endDate?: string
    ingredientId?: string
    page?: number
    pageSize?: number
  }): Promise<{
    list: any[]
    total: number
    page: number
    pageSize: number
  }> => {
    return api.get('/admin/purchasing/history', { params })
  },

  /**
   * 获取采购统计数据
   */
  getPurchaseStatistics: (params?: {
    startDate?: string
    endDate?: string
  }): Promise<{
    totalLists: number
    totalItems: number
    totalCost: number
    averageCostPerList: number
    totalReimbursements: number
    totalReimbursementAmount: number
    pendingReimbursements: number
  }> => {
    return api.get('/admin/purchasing/statistics', { params })
  },

  /**
   * 导出采购报表（Excel）
   */
  exportPurchaseReport: (params?: {
    startDate?: string
    endDate?: string
    format?: string
  }): Promise<Blob> => {
    return api.get('/admin/purchasing/export', {
      params,
      responseType: 'blob'
    })
  }
}

export default purchasingApi
