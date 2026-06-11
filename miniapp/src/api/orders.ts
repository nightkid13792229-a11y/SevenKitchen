/**
 * Orders API
 * 订单管理相关API调用（管理员端）
 */

import { request } from '../utils/api';

export interface WechatPaymentResult {
  provider: 'WECHAT_PAY';
  mode: string;
  orderId: string;
  status: string;
  amountTotal: number;
  paymentDeadline: string | null;
  paymentRemainingSeconds: number | null;
  paymentTimeoutMinutes: number;
  autoCloseUnpaid: boolean;
  payParams: {
    appId: string;
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: 'RSA';
    paySign: string;
  } | null;
  orderInfo?: Record<string, any> | null;
}

export interface CustomerOrderFinancialSummary {
  orderId: string;
  settlementStatus: 'PENDING' | 'SETTLED';
  shortageAdjustmentAmount: number;
  requiresCustomerPayment: boolean;
  refundStatus: {
    exists: boolean;
    success: boolean;
    status: string;
    statusText: string;
    amount: number;
    outRefundNo: string | null;
    refundId: string | null;
    successTime: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
  adjustmentSummary: {
    totalIncreaseAmount: number;
    totalDecreaseAmount: number;
    pendingExtraPaymentAmount: number;
    pendingRefundAmount: number;
    settledExtraPaymentAmount: number;
    settledRefundAmount: number;
    netAdjustmentAmount: number;
    netRevenue: number;
  };
  adjustments: Array<{
    id: string;
    sourceType: string;
    adjustmentType: string;
    amount: number;
    reason: string;
    status: 'PENDING' | 'SETTLED' | 'CANCELLED' | string;
    requiresCustomerPayment: boolean;
    visibleToCustomer: boolean;
    settledAt: string | null;
    createdAt: string | null;
  }>;
  latestSettlement: {
    plannedOutputG: number;
    actualOutputG: number;
    shortageG: number;
    settledAt: string | null;
  } | null;
}

export interface StaffOrderAddress {
  id: string;
  userId?: string;
  recipientName: string;
  phone: string;
  region: {
    province: string;
    city: string;
    district: string;
  };
  detail: string;
  isDefault: boolean;
}

export interface StaffOrderAddressInput {
  recipientName: string;
  phone: string;
  region: {
    province: string;
    city: string;
    district: string;
  };
  detail: string;
  isDefault?: boolean;
}

export interface StaffOrderDog {
  id: string;
  name: string;
  breedName?: string | null;
  currentWeightKg?: number | null;
  weightKg?: number | null;
  gender?: string | null;
  mealsPerDay?: number | null;
}

export interface OrderPackagePlanItem {
  packageSpecG: number;
  packageCount: number;
}

export interface StaffOrderPackagePlanUpdateResult {
  id: string;
  orderId: string;
  quantityG: number;
  packageCount: number;
  packageSpecG: number;
  packagePlan: OrderPackagePlanItem[];
  pricingEffect: {
    amountUpdated: boolean;
    previousAmountTotal: number;
    recalculatedAmountTotal: number;
    chargedAmountTotal: number;
    suggestedRefundAmount: number;
    absorbedIncreaseAmount: number;
  };
}

export interface ShippingNotificationPreference {
  orderId: string;
  templateId: string;
  subscriptionStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  sendStatus: 'NOT_SENT' | 'SENT' | 'FAILED' | 'SKIPPED';
  canPrompt: boolean;
}

export interface CustomerShippingNotice {
  orderId: string;
  carrierCode: string;
  carrierName: string;
  trackingNumber: string;
  imageUrl: string;
  cookingTips: string;
  storageTips: string;
  damageReminder: string;
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
 * 获取后台订单生产结算摘要
 */
export function getAdminOrderFinancialSummary(orderId: string) {
  return request<CustomerOrderFinancialSummary>({
    url: `/admin/orders/${orderId}/financial-summary`,
    method: 'GET',
    quiet: true,
    suppressErrorToast: true,
  });
}

/**
 * 获取顾客可见的订单生产结算摘要
 */
export function getOrderFinancialSummary(orderId: string) {
  return request<CustomerOrderFinancialSummary>({
    url: `/orders/${orderId}/financial-summary`,
    method: 'GET',
    quiet: true,
    suppressErrorToast: true,
  });
}

/**
 * 创建微信小程序支付参数
 */
export function createWechatPayment(orderId: string) {
  return request<WechatPaymentResult>({
    url: `/orders/${orderId}/wechat-pay`,
    method: 'POST',
  });
}

export function getShippingNotificationPreference(orderId: string) {
  return request<ShippingNotificationPreference>({
    url: `/orders/${orderId}/shipping-notification/preference`,
    method: 'GET',
    quiet: true,
    suppressErrorToast: true,
  });
}

export function recordShippingNotificationSubscription(
  orderId: string,
  choice: 'ACCEPTED' | 'REJECTED',
) {
  return request({
    url: `/orders/${orderId}/shipping-notification/subscription`,
    method: 'POST',
    quiet: true,
    suppressErrorToast: true,
    data: { choice },
  });
}

export function getCustomerShippingNotice(orderId: string) {
  return request<CustomerShippingNotice>({
    url: `/orders/${orderId}/shipping-notice`,
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

export function listOrderCustomerAddresses(orderId: string) {
  return request<StaffOrderAddress[]>({
    url: `/admin/orders/${orderId}/addresses`,
    method: 'GET',
  });
}

export function createOrderCustomerAddress(
  orderId: string,
  data: StaffOrderAddressInput,
) {
  return request<{ address: StaffOrderAddress; order: unknown }>({
    url: `/admin/orders/${orderId}/addresses`,
    method: 'POST',
    data,
  });
}

export function bindOrderCustomerAddress(orderId: string, addressId: string) {
  return request({
    url: `/admin/orders/${orderId}/address`,
    method: 'PUT',
    data: { addressId },
  });
}

export function updateOrderCustomerAddress(
  orderId: string,
  addressId: string,
  data: StaffOrderAddressInput,
) {
  return request<{ address: StaffOrderAddress; order: unknown }>({
    url: `/admin/orders/${orderId}/addresses/${addressId}`,
    method: 'PUT',
    data,
  });
}

export function listOrderCustomerDogs(orderId: string) {
  return request<StaffOrderDog[]>({
    url: `/admin/orders/${orderId}/dogs`,
    method: 'GET',
  });
}

export function switchOrderDog(orderId: string, dogId: string) {
  return request({
    url: `/admin/orders/${orderId}/dog`,
    method: 'PUT',
    data: { dogId },
  });
}

export function updateOrderItemPackagePlan(
  orderId: string,
  itemId: string,
  packagePlan: OrderPackagePlanItem[],
) {
  return request<StaffOrderPackagePlanUpdateResult>({
    url: `/admin/orders/${orderId}/items/${itemId}/package-plan`,
    method: 'PUT',
    data: { packagePlan },
  });
}

export function getStaffCustomerServiceOrder(orderId: string) {
  return request({
    url: `/staff/customer-service/orders/${orderId}`,
    method: 'GET',
    quiet: true,
    suppressErrorToast: true,
  });
}

export function updateStaffCustomerServiceRemark(
  orderId: string,
  adminRemark?: string | null,
) {
  return request({
    url: `/staff/customer-service/orders/${orderId}/remark`,
    method: 'PUT',
    data: {
      adminRemark: adminRemark ?? null,
    },
  });
}

export function updateStaffCustomerServiceAmount(
  orderId: string,
  amount: number,
  reason?: string,
) {
  return request({
    url: `/staff/customer-service/orders/${orderId}/amount`,
    method: 'PUT',
    data: {
      amount,
      reason,
    },
  });
}

export function resolveOrderAftersale(
  orderId: string,
  resolutionType: 'refunded' | 'remade' | 'resolved',
  adminNote?: string,
) {
  return request({
    url: `/orders/${orderId}/aftersale/resolve`,
    method: 'POST',
    data: {
      resolutionType,
      adminNote,
    },
  });
}

export function retryWechatRefund(
  orderId: string,
  amount: number,
  reason: string,
) {
  return request({
    url: `/admin/orders/${orderId}/wechat-refund`,
    method: 'POST',
    data: {
      amount,
      reason,
    },
  });
}
