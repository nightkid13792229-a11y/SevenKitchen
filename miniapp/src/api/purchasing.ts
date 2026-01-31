/**
 * Purchasing API
 * 采购管理相关API调用
 * 更新时间: 2026-01-26 20:47 - 新增清空报销凭证API
 */

import { request } from '../utils/api';
import { getBaseUrl } from '../utils/config';

// ==========================================
// 采购清单管理
// ==========================================

/**
 * 预览采购需求（不改变订单状态）
 */
export function previewPurchaseList(params: {
  startDate: string;
  endDate?: string;
}) {
  return request({
    url: '/staff/purchasing/preview',
    method: 'GET',
    data: params,
  });
}

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
 * 追加订单到采购清单
 */
export function addOrdersToList(purchaseListId: string, data: {
  orderIds: string[];
}) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/orders`,
    method: 'POST',
    data,
  });
}

/**
 * 从采购清单剔除订单
 */
export function removeOrdersFromList(purchaseListId: string, data: {
  orderIds: string[];
}) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/orders`,
    method: 'DELETE',
    data,
  });
}

/**
 * 手动添加原料到采购清单
 */
export function addManualItemToList(purchaseListId: string, data: {
  ingredientId: string;
  ingredientName: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  quantityNeeded: number;
  quantityUnit: string;
  estimatedCost: number;
  purchaseChannel?: string;
  productModel?: string;
}) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/items`,
    method: 'POST',
    data,
  });
}

/**
 * 删除采购清单中的原料
 */
export function removeItemFromList(purchaseListId: string, itemId: string) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/items/${itemId}`,
    method: 'DELETE',
  });
}

/**
 * 删除采购清单
 */
export function deletePurchaseList(purchaseListId: string) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}`,
    method: 'DELETE',
  });
}

/**
 * 检查订单制作日期变更
 */
export function checkOrderDateChanges(purchaseListId: string) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/check-date-changes`,
    method: 'GET',
  });
}

/**
 * 重新计算采购清单需求
 */
export function recalculatePurchaseList(purchaseListId: string) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/recalculate`,
    method: 'POST',
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

/**
 * 获取所有采购渠道列表
 */
export function getPurchaseChannels() {
  return request({
    url: '/staff/purchasing/purchase-channels',
    method: 'GET',
  });
}

// ==========================================
// 报销单管理
// ==========================================

/**
 * 提交报销申请参数
 */
export interface SubmitReimbursementParams {
  purchaseListIds: string[];
  receiptUrls: string[];
  totalActualCost: number;
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: Array<{ description: string; amount: number }>;
}

/**
 * 上传报销转账/支付记录照片
 */
export function uploadReceiptPhoto(filePath: string) {
  return new Promise((resolve, reject) => {
    const baseUrl = getBaseUrl();
    const token = uni.getStorageSync('token');

    console.log('[Upload] Base URL:', baseUrl);
    console.log('[Upload] Token exists:', !!token);
    console.log('[Upload] File path:', filePath);

    if (!token) {
      console.error('[Upload] No token found');
      reject(new Error('请先登录'));
      return;
    }

    uni.uploadFile({
      url: `${baseUrl}/staff/purchasing/upload-receipt-photo`,
      filePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${token}`,
      },
      success: (res) => {
        console.log('[Upload] Upload success:', res);
        console.log('[Upload] Response data:', res.data);
        console.log('[Upload] Status code:', res.statusCode);

        try {
          const data = JSON.parse(res.data);
          console.log('[Upload] Parsed data:', data);

          if (data.code === 0 || data.code === 200) {
            console.log('[Upload] Upload successful');
            resolve(data);
          } else {
            console.error('[Upload] Upload failed with code:', data.code, 'message:', data.message);
            reject(new Error(data.message || '上传失败'));
          }
        } catch (error) {
          console.error('[Upload] Failed to parse response:', error);
          reject(error);
        }
      },
      fail: (error) => {
        console.error('[Upload] Upload failed:', error);
        reject(error);
      },
    });
  });
}

/**
 * 删除报销转账/支付记录照片
 */
export function deleteReceiptPhoto(key: string) {
  return request({
    url: '/staff/purchasing/reimbursement-receipts',
    method: 'DELETE',
    data: { key },
  });
}

/**
 * 提交报销申请
 */
export function submitReimbursement(data: SubmitReimbursementParams) {
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
  data: SubmitReimbursementParams
) {
  return request({
    url: `/staff/purchasing/reimbursements/${id}/resubmit`,
    method: 'POST',
    data,
  });
}

/**
 * 删除报销单
 */
export function deleteReimbursement(id: string) {
  return request({
    url: `/staff/purchasing/reimbursements/${id}`,
    method: 'DELETE',
  });
}

/**
 * 追加支付凭证（发票照片）
 * 由于微信小程序限制，需要逐个上传文件
 */
export function appendReceiptUrls(reimbursementId: string, files: string[]) {
  // 逐个上传文件（因为uni.uploadFile每次只能上传一个文件）
  const uploadFile = (filePath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const token = uni.getStorageSync('token');

      if (!token) {
        reject(new Error('请先登录'));
        return;
      }

      uni.uploadFile({
        url: `${getBaseUrl()}/staff/purchasing/reimbursements/${reimbursementId}/receipts`,
        filePath,
        name: 'files',
        header: {
          'Authorization': `Bearer ${token}`,
        },
        success: (res) => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              const data = JSON.parse(res.data);
              if (data.code === 0) {
                resolve();
              } else {
                reject(new Error(data.message || '上传失败'));
              }
            } catch (e) {
              reject(new Error('解析响应失败'));
            }
          } else {
            reject(new Error(`上传失败，状态码: ${res.statusCode}`));
          }
        },
        fail: (err) => {
          reject(new Error(err.errMsg || '网络请求失败'));
        },
      });
    });
  };

  // 使用顺序上传，确保文件按顺序上传
  const uploadPromises = files.map((file, index) => {
    return uploadFile(file).catch(err => {
      console.error(`文件 ${index + 1} 上传失败:`, err);
      throw err;
    });
  });

  return Promise.all(uploadPromises);
}

/**
 * 删除支付凭证（发票照片）
 */
export function removeReceiptUrl(reimbursementId: string, urlIndex: number) {
  return request({
    url: `/staff/purchasing/reimbursements/${reimbursementId}/receipts`,
    method: 'DELETE',
    data: { urlIndex },
  });
}

/**
 * 清空报销凭证（管理员专用）
 */
export function clearPaymentProof(reimbursementId: string) {
  const token = uni.getStorageSync('token');

  if (!token) {
    return Promise.reject(new Error('请先登录'));
  }

  return new Promise<void>((resolve, reject) => {
    uni.request({
      url: `${getBaseUrl()}/admin/purchasing/reimbursements/${reimbursementId}/payment-proof`,
      method: 'DELETE',
      header: {
        'Authorization': `Bearer ${token}`,
      },
      success: (res) => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          const data = res.data as any;
          if (data.code === 0) {
            resolve();
          } else {
            reject(new Error(data.message || '清空失败'));
          }
        } else {
          reject(new Error(`清空失败，状态码: ${res.statusCode}`));
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '网络请求失败'));
      },
    });
  });
}

/**
 * 上传报销凭证文件（管理员专用）
 * 由于微信小程序限制，需要逐个上传文件
 */
export function uploadPaymentProofFiles(reimbursementId: string, files: string[]) {
  const token = uni.getStorageSync('token');

  if (!token) {
    return Promise.reject(new Error('请先登录'));
  }

  // 逐个上传文件（因为uni.uploadFile每次只能上传一个文件）
  const uploadFile = (filePath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      uni.uploadFile({
        url: `${getBaseUrl()}/admin/purchasing/reimbursements/${reimbursementId}/payment-proof`,
        filePath,
        name: 'files',
        header: {
          'Authorization': `Bearer ${token}`,
        },
        success: (res) => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              const data = JSON.parse(res.data);
              if (data.code === 0) {
                resolve();
              } else {
                reject(new Error(data.message || '上传失败'));
              }
            } catch (e) {
              reject(new Error('解析响应失败'));
            }
          } else {
            reject(new Error(`上传失败，状态码: ${res.statusCode}`));
          }
        },
        fail: (err) => {
          reject(new Error(err.errMsg || '网络请求失败'));
        },
      });
    });
  };

  // 使用顺序上传，确保文件按顺序上传
  const uploadPromises = files.map((file, index) => {
    return uploadFile(file).catch(err => {
      console.error(`文件 ${index + 1} 上传失败:`, err);
      throw err;
    });
  });

  return Promise.all(uploadPromises);
}

