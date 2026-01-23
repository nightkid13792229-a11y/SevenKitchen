/**
 * Orders API
 * 订单管理相关API调用（管理员端）
 */

import { request } from '../utils/api';

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
