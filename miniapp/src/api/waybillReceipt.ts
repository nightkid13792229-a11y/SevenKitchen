/**
 * 快递电子存根（2026-11-10）。
 *
 * 打包间拍一张顺丰存根 → 后端读出承运商 / 运单号 / 运费，并跟这单的收货人核一遍。
 *
 * 三条口径：
 *   · 图**只用来读**，后端不保存（只留一行结论）；
 *   · 「不是存根」「号被占用」「收件人对不上」是**给员工看的结论**，原样往上抛；
 *   · 模型超时 / 配额用完 → 后端返回 `degraded`，前端给「手动填写」出口，不卡住发货。
 */

import { request } from '../utils/api';
import { getBaseUrl } from '../utils/config';

export type ReceiptMatchStatus =
  | 'match'
  | 'unknown'
  | 'mismatch'
  | 'duplicate'
  | 'degraded'
  | 'not_waybill';

export interface ReceiptConflict {
  field: string;
  expected: string;
  actual: string;
}

export interface ReceiptPayload {
  documentType: 'waybill_receipt' | 'other';
  carrierCode: string | null;
  trackingNumber: string | null;
  shippingFee: number | null;
  recipientName: string | null;
  recipientPhoneMasked: string | null;
  recipientAddress: string | null;
}

export interface RecognizeResponse {
  checkId: string;
  receipt: ReceiptPayload | null;
  match: {
    status: ReceiptMatchStatus;
    conflicts: ReceiptConflict[];
    expected: {
      recipientName: string;
      phoneTail4: string | null;
      regionText: string;
      detail: string;
    } | null;
    duplicate?: { kind: string; label: string } | null;
  };
}

/** 上传存根图片，返回 COS 地址 */
export function uploadReceiptImage(
  filePath: string,
): Promise<{ url: string; key: string }> {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token');
    uni.uploadFile({
      url: `${getBaseUrl()}/staff/shipping/upload-receipt`,
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (res) => {
        try {
          const parsed =
            typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (parsed?.code !== 0) {
            reject(new Error(parsed?.message || '上传失败'));
            return;
          }
          const url = String(parsed?.data?.url || '').trim();
          if (!url) {
            reject(new Error('上传失败，请重试'));
            return;
          }
          resolve({ url, key: String(parsed?.data?.key || '') });
        } catch {
          reject(new Error('上传失败，请重试'));
        }
      },
      fail: () => reject(new Error('上传失败，请检查网络')),
    });
  });
}

/** 识别 + 比对（不落发货单；后端会落一行核对结论） */
export function recognizeReceipt(input: {
  imageUrl: string;
  orderIds: string[];
}): Promise<RecognizeResponse> {
  return request<RecognizeResponse>({
    url: '/staff/shipping/receipt-recognize',
    method: 'POST',
    data: { imageUrl: input.imageUrl, orderIds: input.orderIds },
  }).then((res) => {
    if (res.code !== 0) {
      throw new Error(res.message || '识别失败');
    }
    return res.data;
  });
}

/**
 * 手动填写运单号 —— AI 认不出来时的唯一出口。
 *
 * 不是后门：后端会检查有没有「对不上」的结论，有就拒绝。
 */
export function createManualWaybill(input: {
  orderIds: string[];
  trackingNumber: string;
  reason: string;
}): Promise<{ id: string }> {
  return request<{ id: string }>({
    url: '/staff/shipping/manual-waybill',
    method: 'POST',
    data: {
      orderIds: input.orderIds,
      trackingNumber: input.trackingNumber,
      reason: input.reason,
    },
  }).then((res) => {
    if (res.code !== 0) {
      throw new Error(res.message || '提交失败');
    }
    return res.data;
  });
}

/** 补剂单代改收货地址（原先只有后台网页能改） */
export function updateSupplementShippingAddress(
  orderId: string,
  payload: {
    recipientName: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    detail: string;
    reason: string;
  },
): Promise<any> {
  return request({
    url: `/staff/shipping/supplement-orders/${encodeURIComponent(orderId)}/address`,
    method: 'PATCH',
    data: payload,
  }).then((res) => {
    if (res.code !== 0) {
      throw new Error(res.message || '保存失败');
    }
    return res.data;
  });
}
