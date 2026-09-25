/**
 * 工作台 · 补剂订单 API
 *
 * 后端是 `/admin/supplement-shop/orders*`（与后台网页端同一套接口），
 * 工作台复用它们，不再另开后门。
 */

import { request } from '../utils/api';

export type SupplementOrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PACKING'
  | 'PACKED'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'AFTERSALE';

export interface StaffSupplementOrderItem {
  id: string;
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  physicalForm: string | null;
  unit: string;
  /** 制作单上给用户的用量 */
  requestedAmount: number;
  /** 实际分装量（**每袋**的量，加量乘的是成本不是量） */
  packedAmount: number;
  bags: number;
  shelfLifeMonths: number;
  storageCondition: string | null;
  batchNo: string | null;
  sourceExpiryDate: string | null;
  packedExpiryDate: string | null;
  packedAt: string | null;
}

export interface StaffSupplementOrder {
  id: string;
  orderNo: string;
  status: SupplementOrderStatus;
  bagCount: number;
  amountSupplement: number;
  amountServiceFee: number;
  amountPackaging: number;
  amountGoods: number;
  amountShipping: number;
  amountTotal: number;
  shippingDescription: string | null;
  receiverName: string;
  receiverPhone: string;
  receiverRegion: string;
  receiverDetail: string;
  recipeName: string | null;
  dogName: string | null;
  cycleDays: number | null;
  portionMultiplier: number;
  totalDays: number | null;
  remark: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  aftersaleType: string | null;
  aftersaleReason: string | null;
  refundStatus: string | null;
  refundAmount: number | null;
  trackingNumber: string | null;
  carrierCode: string | null;
  shippedAt: string | null;
  createdAt: string;
  items?: StaffSupplementOrderItem[];
}

export interface StaffSupplementOrderPage {
  items: StaffSupplementOrder[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StaffSupplementLabel {
  /** 标签唯一标识：同一补剂多袋时各不相同，列表 key 用它 */
  labelId: string;
  itemId: string;
  productName: string;
  amountText: string;
  /** 该补剂的第几袋（从 1 开始） */
  bagIndex: number;
  /** 该补剂一共几袋；加量后 > 1，此时每袋都要贴一张 */
  bagTotal: number;
  packedDate: string;
  expiryDate: string;
  batchNo: string | null;
  storageCondition: string;
  sourceProduct: string;
  sourceExpiryDate: string;
  disclaimer: string;
}

export interface StaffSupplementOrderLabels {
  orderNo: string;
  brandName: string;
  receiverName: string;
  labels: StaffSupplementLabel[];
}

/**
 * 后端渲染好的标签图片。
 *
 * 一个补剂有多少袋就有多少张（加量后同一补剂会做好几袋），
 * 每张内容只差「第几袋 / 共几袋」，所以**不能**合并成一张重复打印。
 */
export interface StaffSupplementLabelImage {
  /** 与 labels() 返回的 labelId 一一对应，列表 key 用它 */
  labelId: string;
  /** PNG 的 base64；**不含** `data:image/png;base64,` 前缀 */
  imageBase64: string;
}

export interface StaffSupplementOrderLabelImages {
  orderNo: string;
  brandName: string;
  receiverName: string;
  labels: StaffSupplementLabelImage[];
}

/** 一条分装记录：每个补剂填一条，同一补剂的多袋共用 */
export interface SupplementPackInput {
  itemId: string;
  batchNo?: string;
  /** 原瓶到期日（ISO 日期），标签效期 = min(原瓶到期日, 分装日 + 效期系数) */
  sourceExpiryDate: string;
}

export const staffSupplementOrderApi = {
  list(params: {
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    return request<StaffSupplementOrderPage>({
      url: '/admin/supplement-shop/orders',
      method: 'GET',
      data: params,
    });
  },

  summary() {
    return request<Record<string, number>>({
      url: '/admin/supplement-shop/orders/summary',
      method: 'GET',
    });
  },

  detail(orderId: string) {
    return request<StaffSupplementOrder>({
      url: `/admin/supplement-shop/orders/${orderId}`,
      method: 'GET',
    });
  },

  /** 分装标签数据；未分装时后端会拒绝（必须先填原瓶到期日） */
  labels(orderId: string) {
    return request<StaffSupplementOrderLabels>({
      url: `/admin/supplement-shop/orders/${orderId}/labels`,
      method: 'GET',
    });
  },

  /**
   * 标签图片：预览和打印都走它，保证"屏幕上看到的就是打出来的那张"。
   *
   * 未分装时后端会返回「请先完成分装，再打印标签」——这句话必须原样留在页面上
   * 给仓库同事看，所以关掉请求层自带的 toast，免得被一闪而过的提示顶掉。
   */
  labelImages(orderId: string) {
    return request<StaffSupplementOrderLabelImages>({
      url: `/admin/supplement-shop/orders/${orderId}/labels/images`,
      method: 'GET',
      suppressErrorToast: true,
    });
  },

  confirmPayment(orderId: string, transactionId?: string) {
    return request<StaffSupplementOrder>({
      url: `/admin/supplement-shop/orders/${orderId}/confirm-payment`,
      method: 'POST',
      data: transactionId ? { transactionId } : {},
    });
  },

  pack(orderId: string, items: SupplementPackInput[]) {
    return request<StaffSupplementOrder>({
      url: `/admin/supplement-shop/orders/${orderId}/pack`,
      method: 'POST',
      data: { items },
    });
  },

  ship(orderId: string, trackingNumber: string, carrierCode?: string) {
    return request<StaffSupplementOrder>({
      url: `/admin/supplement-shop/orders/${orderId}/ship`,
      method: 'POST',
      data: { trackingNumber, carrierCode },
    });
  },

  cancel(orderId: string, reason?: string) {
    return request<StaffSupplementOrder>({
      url: `/admin/supplement-shop/orders/${orderId}/cancel`,
      method: 'POST',
      data: reason ? { reason } : {},
    });
  },

  refund(orderId: string, reason?: string) {
    return request<StaffSupplementOrder>({
      url: `/admin/supplement-shop/orders/${orderId}/refund`,
      method: 'POST',
      data: reason ? { reason } : {},
    });
  },

  reship(orderId: string) {
    return request<StaffSupplementOrder>({
      url: `/admin/supplement-shop/orders/${orderId}/reship`,
      method: 'POST',
      data: {},
    });
  },

  aftersale(orderId: string, type: 'REFUND' | 'RESHIP', reason: string) {
    return request<StaffSupplementOrder>({
      url: `/admin/supplement-shop/orders/${orderId}/aftersale`,
      method: 'POST',
      data: { type, reason },
    });
  },
};
