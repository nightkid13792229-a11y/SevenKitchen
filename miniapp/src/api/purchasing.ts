/**
 * Purchasing API
 * 采购管理相关API调用
 */

import { request } from '../utils/api';

// ==========================================
// 采购清单管理
// ==========================================

/**
 * 生成采购清单
 */
export function generatePurchaseList(params: {
  startDate: string;
  endDate?: string;
}) {
  return request({
    url: '/staff/purchasing/lists',
    method: 'POST',
    data: params,
  });
}

/**
 * 查看采购清单列表
 */
export function getPurchaseLists(params: {
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}) {
  return request({
    url: '/staff/purchasing/lists',
    method: 'GET',
    data: params,
  });
}

/**
 * 查看采购清单详情
 */
export function getPurchaseListDetail(id: string) {
  return request({
    url: `/staff/purchasing/lists/${id}`,
    method: 'GET',
  });
}

/**
 * 确认采购完成
 */
export function completePurchase(
  id: string,
  params?: {
    actualCosts?: Array<{ itemId: string; actualCost: number }>;
  }
) {
  return request({
    url: `/staff/purchasing/lists/${id}/complete`,
    method: 'POST',
    data: params,
  });
}

// ==========================================
// 采购记录管理
// ==========================================

/**
 * 开始采购
 */
export function startPurchase(id: string) {
  return request({
    url: `/staff/purchasing/lists/${id}/start`,
    method: 'POST',
  });
}

/**
 * 添加采购记录
 */
export function addPurchaseRecord(purchaseListId: string, data: {
  purchaseItemId: string;
  ingredientId: string;
  ingredientName: string;
  purchaseChannel: string;
  actualQuantity: number;
  actualCost: number;
  productModel?: string;
  notes?: string;
}) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/records`,
    method: 'POST',
    data,
  });
}

/**
 * 查询采购记录列表
 */
export function getPurchaseRecords(purchaseListId: string) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/records`,
    method: 'GET',
  });
}

/**
 * 更新采购记录
 */
export function updatePurchaseRecord(recordId: string, data: {
  purchaseChannel?: string;
  actualQuantity?: number;
  actualCost?: number;
  productModel?: string;
  notes?: string;
}) {
  return request({
    url: `/staff/purchasing/lists/${recordId}/records/${recordId}`,
    method: 'PUT',
    data,
  });
}

/**
 * 删除采购记录
 */
export function deletePurchaseRecord(recordId: string) {
  return request({
    url: `/staff/purchasing/lists/${recordId}/records/${recordId}`,
    method: 'DELETE',
  });
}

// ==========================================
// 报销单管理
// ==========================================

/**
 * 提交报销申请
 */
export function submitReimbursement(data: {
  purchaseListIds: string[];
  receiptUrls: string[];
  totalActualCost: number;
}) {
  return request({
    url: '/staff/purchasing/reimbursements',
    method: 'POST',
    data,
  });
}

/**
 * 查看我的报销申请列表
 */
export function getMyReimbursements(params: {
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}) {
  return request({
    url: '/staff/purchasing/reimbursements',
    method: 'GET',
    data: params,
  });
}

/**
 * 查看报销单详情
 */
export function getReimbursementDetail(id: string) {
  return request({
    url: `/staff/purchasing/reimbursements/${id}`,
    method: 'GET',
  });
}

/**
 * 重新提交被驳回的报销单
 */
export function resubmitReimbursement(
  id: string,
  data: {
    purchaseListIds: string[];
    receiptUrls: string[];
    totalActualCost: number;
  }
) {
  return request({
    url: `/staff/purchasing/reimbursements/${id}/resubmit`,
    method: 'POST',
    data,
  });
}
