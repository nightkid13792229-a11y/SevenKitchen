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
  kind?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
  excludeReimbursed?: boolean;
}) {
  return request({
    url: '/staff/purchasing/lists',
    method: 'GET',
    data: params,
  });
}

export interface StockPurchaseIngredient {
  id: string;
  name: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  procurementStrategy: 'DAILY_PURCHASE' | 'STOCK_REPLENISHMENT' | 'HYBRID';
  baseUnit: 'G' | 'ML' | 'PCS';
  stockUnitLabel: string;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  unitDisplayLabel?: string | null;
  purchaseChannel?: string | null;
  productModel?: string | null;
  currentPricePerPurchaseUnit: number;
  effectivePricePerPurchaseUnit?: number | null;
  currentStock: number;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
  stockStatus: 'NO_POLICY' | 'SUFFICIENT' | 'LOW_STOCK' | 'NEEDS_REPLENISHMENT';
  suggestedBaseQuantity: number;
  suggestedPurchaseQuantity: number;
  suggestedEstimatedCost: number;
  suggestedProductId?: string;
  suggestedProductName?: string;
}

export interface ProcurementSkuOption {
  id: string;
  name: string;
  purchaseChannel?: string | null;
  productModel?: string | null;
}

export interface ProcurementSkuProfile {
  procurementSkuId?: string;
  procurementSkuName?: string;
  procurementSkuChoices: ProcurementSkuOption[];
  suggestedProductId?: string;
  suggestedProductName?: string;
  purchaseChannel?: string;
  productModel?: string;
}

const normalizeText = (value?: string | null) => {
  return (value || '').trim();
};

const normalizeProcurementSkuOption = (sku: any): ProcurementSkuOption | null => {
  if (!sku) {
    return null;
  }

  if (typeof sku === 'string') {
    const text = normalizeText(sku);
    if (!text) {
      return null;
    }
    return {
      id: text,
      name: text,
    };
  }

  const id = normalizeText(
    sku.id ||
      sku.procurementSkuId ||
      sku.skuId ||
      sku.value ||
      sku.code ||
      sku.key ||
      sku.name,
  );
  const name = normalizeText(
    sku.name ||
      sku.procurementSkuName ||
      sku.skuName ||
      sku.label ||
      sku.title ||
      id,
  );

  if (!id && !name) {
    return null;
  }

  return {
    id: id || name,
    name: name || id,
    purchaseChannel: normalizeText(sku.purchaseChannel) || undefined,
    productModel: normalizeText(sku.productModel) || undefined,
  };
};

const collectProcurementSkuOptions = (item: any): ProcurementSkuOption[] => {
  const seen = new Set<string>();
  const options: ProcurementSkuOption[] = [];

  const append = (sku: any) => {
    const option = normalizeProcurementSkuOption(sku);
    if (!option) {
      return;
    }

    const dedupeKey = option.id || option.name;
    if (!dedupeKey || seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    options.push(option);
  };

  const ingredientProcurementSkus = item?.ingredient?.procurementSkus;
  if (Array.isArray(ingredientProcurementSkus)) {
    ingredientProcurementSkus.forEach(append);
  }

  if (Array.isArray(item?.procurementSkus)) {
    item.procurementSkus.forEach(append);
  }

  return options;
};

export const resolveProcurementSkuProfile = (
  item: any,
  preferredSkuId?: string | null,
): ProcurementSkuProfile => {
  const procurementSkuChoices = collectProcurementSkuOptions(item);
  const normalizedPreferredSkuId = normalizeText(preferredSkuId);
  const itemProcurementSkuId = normalizeText(item?.procurementSkuId);
  const itemProcurementSkuName = normalizeText(item?.procurementSkuName);

  const selectedById = procurementSkuChoices.find((option) => {
    if (!normalizedPreferredSkuId) {
      return false;
    }
    return option.id === normalizedPreferredSkuId || option.name === normalizedPreferredSkuId;
  });

  const selectedByItem = procurementSkuChoices.find((option) => {
    if (itemProcurementSkuId && (option.id === itemProcurementSkuId || option.name === itemProcurementSkuId)) {
      return true;
    }

    if (itemProcurementSkuName && option.name === itemProcurementSkuName) {
      return true;
    }

    return false;
  });

  const selectedBySingleChoice = procurementSkuChoices.length === 1 ? procurementSkuChoices[0] : null;
  const selectedSku = selectedById || selectedByItem || selectedBySingleChoice || null;

  const suggestedProductId = normalizeText(item?.suggestedProductId);
  const suggestedProductName = normalizeText(item?.suggestedProductName);
  const purchaseChannel = normalizeText(
    selectedSku?.purchaseChannel || item?.purchaseChannel || item?.ingredient?.purchaseChannel,
  );
  const productModel = normalizeText(
    selectedSku?.productModel || item?.productModel || item?.ingredient?.productModel,
  );

  return {
    procurementSkuId: selectedSku?.id || itemProcurementSkuId || '',
    procurementSkuName: selectedSku?.name || itemProcurementSkuName || '',
    procurementSkuChoices,
    suggestedProductId,
    suggestedProductName,
    purchaseChannel,
    productModel,
  };
};

export function getStockPurchaseIngredients(params?: {
  keyword?: string;
  type?: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  onlyNeedsReplenishment?: boolean;
}) {
  return request({
    url: '/staff/purchasing/stock-ingredients',
    method: 'GET',
    data: params,
  });
}

export function createStockPurchaseList(data: {
  targetDate: string;
  items: Array<{
    ingredientId: string;
    plannedQuantity: number;
    purchaseChannel?: string;
    productModel?: string;
    notes?: string;
  }>;
}) {
  return request({
    url: '/staff/purchasing/lists/stock',
    method: 'POST',
    data,
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
  purchaseChannel: string;
  procurementSkuId?: string;
  procurementSkuName?: string;
  suggestedProductId?: string;
  suggestedProductName?: string;
  actualQuantity?: number;
  actualPackageCount?: number;
  actualPackageSize?: number;
  actualPackageUnit?: string;
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
export function updatePurchaseRecord(purchaseListId: string, recordId: string, data: {
  purchaseChannel?: string;
  procurementSkuId?: string;
  procurementSkuName?: string;
  suggestedProductId?: string;
  suggestedProductName?: string;
  actualQuantity?: number;
  actualPackageCount?: number;
  actualPackageSize?: number;
  actualPackageUnit?: string;
  actualCost?: number;
  productModel?: string;
  notes?: string;
}) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/records/${recordId}`,
    method: 'PUT',
    data,
  });
}

/**
 * 删除采购记录
 */
export function deletePurchaseRecord(purchaseListId: string, recordId: string) {
  return request({
    url: `/staff/purchasing/lists/${purchaseListId}/records/${recordId}`,
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
  purchaseListIds?: string[];
  receiptUrls: string[];
  totalActualCost: number;
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: Array<{
    category?: string;
    description?: string;
    amount: number;
  }>;
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
        console.error('[Upload] Error details:', JSON.stringify({
          errMsg: error.errMsg,
          statusCode: error.statusCode,
        }, null, 2));

        // 提供更详细的错误信息
        let errorMessage = '上传失败';
        if (error.errMsg) {
          if (error.errMsg.includes('network')) {
            errorMessage = '网络连接失败，请检查网络';
          } else if (error.errMsg.includes('timeout')) {
            errorMessage = '上传超时，请重试';
          } else if (error.errMsg.includes('permission')) {
            errorMessage = '没有文件访问权限';
          } else {
            errorMessage = error.errMsg;
          }
        }

        reject(new Error(errorMessage));
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
