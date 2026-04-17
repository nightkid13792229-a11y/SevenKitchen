/**
 * Orders API
 * 订单管理相关API调用（管理员端）
 */

import { request } from '../utils/api';

export interface CustomerOrderFinancialSummary {
  orderId: string;
  settlementStatus: 'PENDING' | 'SETTLED';
  shortageAdjustmentAmount: number;
  requiresCustomerPayment: boolean;
  latestSettlement: {
    plannedOutputG: number;
    actualOutputG: number;
    shortageG: number;
    settledAt: string | null;
  } | null;
}

/**
 * 获取后台订单详情
 */
export function getAdminOrderDetail(orderId: string) {
  return request({
    url: `/admin/orders/${orderId}`,
    method: 'GET',
  });
}

/**
 * 获取顾客可见的订单生产结算摘要
 */
export function getOrderFinancialSummary(orderId: string) {
  return request<CustomerOrderFinancialSummary>({
    url: `/orders/${orderId}/financial-summary`,
    method: 'GET',
  });
}

/**
 * 确认线下收款
 * @param orderId 订单ID
 * @param actualAmount 实际收款金额（可选，用于记录优惠/折扣）
 */
export function confirmOfflinePayment(
  orderId: string,
  actualAmount?: number
) {
  return request({
    url: `/admin/orders/${orderId}/confirm-offline-payment`,
    method: 'POST',
    data: { actualAmount },
  });
}

/**
 * 更新订单管理员备注
 */
export function updateAdminOrderRemark(
  orderId: string,
  adminRemark?: string | null,
) {
  return request({
    url: `/admin/orders/${orderId}/admin-remark`,
    method: 'PUT',
    data: {
      adminRemark: adminRemark ?? null,
    },
  });
}
