import api from './index'

/**
 * 采购管理API（管理端）
 */
export const purchasingApi = {
  /**
   * 预览采购需求
   */
  previewPurchaseList: (params: {
    startDate: string
    endDate?: string
  }): Promise<any> => {
    return api.get('/admin/purchasing/preview', { params })
  },

  /**
   * 生成订单采购清单
   */
  generatePurchaseList: (data: {
    startDate: string
    endDate?: string
  }): Promise<any> => {
    return api.post('/admin/purchasing/lists', data)
  },

  /**
   * 获取采购清单列表
   */
  getPurchaseLists: (params?: {
    kind?: string
    status?: string
    startDate?: string
    endDate?: string
    page?: number
    pageSize?: number
    excludeReimbursed?: boolean
  }): Promise<{
    list: any[]
    total: number
    page?: number
    pageSize?: number
  }> => {
    return api.get('/admin/purchasing/lists', { params })
  },

  /**
   * 获取采购清单详情
   */
  getPurchaseListDetail: (id: string): Promise<any> => {
    return api.get(`/admin/purchasing/lists/${id}`)
  },

  /**
   * 开始采购
   */
  startPurchase: (id: string): Promise<any> => {
    return api.post(`/admin/purchasing/lists/${id}/start`)
  },

  /**
   * 完成采购
   */
  completePurchase: (
    id: string,
    data?: { actualCosts?: Array<{ itemId: string; actualCost: number }> }
  ): Promise<any> => {
    return api.post(`/admin/purchasing/lists/${id}/complete`, data || {})
  },

  /**
   * 撤回采购完成
   */
  reopenPurchaseList: (id: string): Promise<any> => {
    return api.post(`/admin/purchasing/lists/${id}/reopen`)
  },

  /**
   * 删除采购清单
   */
  deletePurchaseList: (id: string): Promise<any> => {
    return api.delete(`/admin/purchasing/lists/${id}`)
  },

  /**
   * 检查订单制作日期变更
   */
  checkOrderDateChanges: (id: string): Promise<any> => {
    return api.get(`/admin/purchasing/lists/${id}/check-date-changes`)
  },

  /**
   * 重新计算采购清单
   */
  recalculatePurchaseList: (id: string): Promise<any> => {
    return api.post(`/admin/purchasing/lists/${id}/recalculate`)
  },

  /**
   * 追加订单到采购清单
   */
  addOrdersToList: (id: string, data: { orderIds: string[] }): Promise<any> => {
    return api.post(`/admin/purchasing/lists/${id}/orders`, data)
  },

  /**
   * 从采购清单剔除订单
   */
  removeOrdersFromList: (id: string, data: { orderIds: string[] }): Promise<any> => {
    return api.delete(`/admin/purchasing/lists/${id}/orders`, { data })
  },

  /**
   * 添加手工采购项
   */
  addManualItem: (id: string, data: {
    ingredientId: string
    ingredientName: string
    type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING'
    quantityNeeded: number
    quantityUnit: string
    estimatedCost: number
    purchaseChannel?: string
    productModel?: string
  }): Promise<any> => {
    return api.post(`/admin/purchasing/lists/${id}/items`, data)
  },

  /**
   * 删除采购项
   */
  removeItem: (id: string, itemId: string): Promise<any> => {
    return api.delete(`/admin/purchasing/lists/${id}/items/${itemId}`)
  },

  /**
   * 标记无需采购
   */
  markItemNoPurchase: (
    id: string,
    itemId: string,
    data?: { reason?: string }
  ): Promise<any> => {
    return api.post(`/admin/purchasing/lists/${id}/items/${itemId}/no-purchase`, data || {})
  },

  /**
   * 取消无需采购
   */
  clearItemNoPurchase: (id: string, itemId: string): Promise<any> => {
    return api.delete(`/admin/purchasing/lists/${id}/items/${itemId}/no-purchase`)
  },

  /**
   * 添加采购记录
   */
  addPurchaseRecord: (id: string, data: {
    purchaseItemId: string
    procurementSkuId?: string
    suggestedProductId?: string
    suggestedProductName?: string
    purchaseChannel: string
    actualQuantity?: number
    actualPackageCount?: number
    actualPackageSize?: number
    actualPackageUnit?: string
    actualCost: number
    productModel?: string
    notes?: string
  }): Promise<any> => {
    return api.post(`/admin/purchasing/lists/${id}/records`, data)
  },

  /**
   * 获取采购记录
   */
  getPurchaseRecords: (id: string): Promise<any[]> => {
    return api.get(`/admin/purchasing/lists/${id}/records`)
  },

  /**
   * 更新采购记录
   */
  updatePurchaseRecord: (id: string, recordId: string, data: any): Promise<any> => {
    return api.put(`/admin/purchasing/lists/${id}/records/${recordId}`, data)
  },

  /**
   * 删除采购记录
   */
  deletePurchaseRecord: (id: string, recordId: string): Promise<any> => {
    return api.delete(`/admin/purchasing/lists/${id}/records/${recordId}`)
  },

  /**
   * 获取可补货原料
   */
  getStockIngredients: (params?: {
    keyword?: string
    type?: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING'
    onlyNeedsReplenishment?: boolean
  }): Promise<any[]> => {
    return api.get('/admin/purchasing/stock-ingredients', { params })
  },

  /**
   * 创建库存补货采购单
   */
  createStockPurchaseList: (data: {
    targetDate: string
    items: Array<{
      ingredientId: string
      plannedQuantity: number
      purchaseChannel?: string
      productModel?: string
      notes?: string
    }>
  }): Promise<any> => {
    return api.post('/admin/purchasing/lists/stock', data)
  },

  /**
   * 获取采购渠道
   */
  getPurchaseChannels: (): Promise<string[]> => {
    return api.get('/admin/purchasing/purchase-channels')
  },

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
   * 处理报销单（兼容旧接口）
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
