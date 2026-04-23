/**
 * Production API
 * 生产管理相关API调用
 */

import { request } from '../utils/api';
import { getBaseUrl } from '../utils/config';

type PackagePlanItem = {
  packageSpecG: number;
  packageCount: number;
};

export type ProductionResultStatus = 'NORMAL' | 'SURPLUS' | 'SHORTAGE';

export type CompleteProductionTaskPayload = {
  resultStatus?: ProductionResultStatus;
  surplusG?: number;
  shortageG?: number;
  resultPhotoUrls?: string[];
};

// ==========================================
// 生产统计
// ==========================================

/**
 * 获取生产统计
 */
export function getTodayStatistics(params?: { targetDate?: string }) {
  return request<{
    todayOrders: number; // 今日订单数
    pendingScheduleOrders: number; // 今日待排单订单数
    inProgress: number; // 制作中数量
    completed: number; // 已完成数量
  }>({
    url: '/staff/production/statistics/today',
    method: 'GET',
    data: params,
  });
}

// ==========================================
// 生产批次管理
// ==========================================

/**
 * 自动排单（按07文档分锅算法）
 * 检查采购清单状态后创建生产批次
 */
export function autoSchedule(params: {
  startDate: string; // YYYY-MM-DD格式
}) {
  return request<{
    id: string;
    productionDate: string;
    status: string;
    packagingUnitsCount: number;
  }>({
    url: '/staff/production/auto-schedule',
    method: 'POST',
    data: params,
  });
}

/**
 * 删除生产批次
 * 只能删除 IN_PRODUCTION 状态的批次
 * 相关订单将回退到 PURCHASING 状态
 */
export function deleteProductionBatch(batchId: string) {
  return request<void>({
    url: `/staff/production/batches/${batchId}`,
    method: 'DELETE',
  });
}

/**
 * 获取分装单元列表（支持筛选和分页）
 */
export function getPackagingUnits(params: {
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  page?: number;
  pageSize?: number;
  targetDate?: string; // YYYY-MM-DD格式
  includeUnfinishedCarryover?: boolean;
}) {
  // 🔧 修复：过滤掉 undefined 值，避免序列化为 "undefined" 字符串
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([_, v]) => v !== undefined)
  );

  return request<{
    list: Array<{
      id: string;
      productionDate: string;
      recipeName: string;
      recipeVersion: number;
      totalProductionG: number;
      status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
      ingredientSourcePlan?: string | null;
      ingredientSourcePlanLabel?: string;
      orderItems: Array<{
        orderId: string;
        orderItemId: string;
        dogName: string;
        packageSpecG: number; // 单包规格（g）
        packageCount: number; // 总袋数
        packagePlan?: PackagePlanItem[] | null;
        ingredientSourcePlan?: string | null;
        recipientName?: string;
        recipientCity?: string;
        adminRemark?: string;
        completedAt?: string; // 本地时间格式
      }>;
      currentPotNumber: number; // 当前是第几锅
      totalPots: number; // 总共几锅
      createdAt: string; // 本地时间格式
      completedAt?: string; // 本地时间格式
      resultStatus?: ProductionResultStatus;
      actualOutputG?: number;
      surplusG?: number;
      shortageG?: number;
      resultPhotoUrls?: string[];
      photosRaw?: string[]; // 备料照片URL列表
      ingredientsUsageSnapshot?: any; // 原料用量快照
      recipeSnapshot?: {
        id: string;
        version: number;
        name: string;
        items: Array<{
          ingredient_id: string;
          name: string;
          ratio: number;
          ingredient_type?: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
          nutrient_target_key?: string;
          nutrient_target_value?: number;
          preparation_methods?: string[]; // 制备方法名称数组
        }>;
        production_loss_rate?: number;
      };
    }>;
    total: number;
  }>({
    url: '/staff/production/packaging-units',
    method: 'GET',
    data: cleanParams,
  });
}

// ==========================================
// 生产任务操作
// ==========================================

/**
 * 开始制作任务
 */
export function startProductionTask(unitId: string) {
  return request<{
    id: string;
    status: string;
  }>({
    url: `/staff/production/packaging-units/${unitId}/start`,
    method: 'POST',
  });
}

/**
 * 上传备料照片（2-3张）
 * 注意：只上传备料照片，不包含烹制和分装照片
 *
 * 技术说明：
 * - 微信小程序不支持 uni.uploadFile 的 files 参数
 * - 使用单文件上传 + Promise.all 实现多文件并发上传
 */
export function uploadProductionPhotos(
  unitId: string,
  files: Array<{ uri: string; name: string }>
) {
  return new Promise(async (resolve, reject) => {
    const token = uni.getStorageSync('token');
    const baseUrl = getBaseUrl();

    console.log('[uploadProductionPhotos] Starting batch upload:', {
      unitId,
      fileCount: files.length,
      url: `${baseUrl}/staff/production/packaging-units/${unitId}/photos`
    });

    // 顺序上传每个文件，避免竞态条件
    const uploadFileSequentially = (file: any, index: number): Promise<any> => {
      return new Promise((uploadResolve, uploadReject) => {
        console.log(`[uploadProductionPhotos] Uploading file ${index + 1}/${files.length} (sequential)`);

        uni.uploadFile({
          url: `${baseUrl}/staff/production/packaging-units/${unitId}/photos`,
          filePath: file.uri, // 使用 filePath 而不是 uri
          name: 'files', // 表单字段名
          header: {
            'Authorization': `Bearer ${token}`,
          },
          success: (uploadRes: any) => {
            console.log(`[uploadProductionPhotos] File ${index + 1} response:`, {
              statusCode: uploadRes.statusCode,
              data: uploadRes.data
            });

            // 接受 200 OK 和 201 Created 状态码
            if (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) {
              try {
                const response = JSON.parse(uploadRes.data);
                if (response.code === 0) {
                  console.log(`[uploadProductionPhotos] File ${index + 1} success`);
                  uploadResolve(response.data);
                } else {
                  uploadReject(new Error(response.message || `文件${index + 1}上传失败`));
                }
              } catch (err) {
                uploadReject(new Error(`文件${index + 1}响应解析失败`));
              }
            } else {
              uploadReject(new Error(`文件${index + 1}上传失败: ${uploadRes.statusCode}`));
            }
          },
          fail: (err) => {
            console.error(`[uploadProductionPhotos] File ${index + 1} failed:`, err);
            uploadReject(err);
          },
        });
      });
    };

    // 顺序执行上传任务，避免竞态条件
    const results: any[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const result = await uploadFileSequentially(files[i], i);
        results.push(result);
        console.log(`[uploadProductionPhotos] Uploaded ${i + 1}/${files.length}`);
      } catch (error) {
        console.error(`[uploadProductionPhotos] Failed at file ${i + 1}/${files.length}:`, error);
        // 如果中间某个文件上传失败，抛出错误
        reject(error);
        return;
      }
    }

    console.log('[uploadProductionPhotos] All files uploaded successfully:', results);
    // 从最后一个结果中获取最新的照片列表（后端返回的是累加后的完整列表）
    const finalResult = results[results.length - 1];
    resolve({ photosRaw: finalResult.photosRaw || [] });
  });
}

/**
 * 完成制作任务
 */
export function completeProductionTask(
  unitId: string,
  payload: CompleteProductionTaskPayload = {}
) {
  return request<{
    id: string;
    status: string;
    resultStatus?: ProductionResultStatus;
    actualOutputG?: number;
    surplusG?: number;
    shortageG?: number;
    resultPhotoUrls?: string[];
  }>({
    url: `/staff/production/packaging-units/${unitId}/complete`,
    method: 'POST',
    data: payload,
  });
}

/**
 * 删除单张备料照片
 * 会同时从数据库和腾讯云 COS 存储桶中删除
 */
export function deleteProductionPhoto(unitId: string, photoUrl: string) {
  return request<{
    id: string;
    photosRaw: string[];
  }>({
    url: `/staff/production/packaging-units/${unitId}/photos`,
    method: 'DELETE',
    data: { photoUrl },
  });
}

/**
 * 获取食谱的所有批次及订单（用于批量打印标签）
 * 在第一个批次中可以打印该食谱所有批次的订单标签
 */
export function getRecipeBatchesWithOrders(params: {
  recipeId: string;
  recipeVersion?: number;
  targetDate?: string; // YYYY-MM-DD格式
}) {
  return request<{
    batches: Array<{
      batchId: string;
      batchCode?: string;
      productionDate: string;
      isCurrentBatch: boolean;
        orderItems: Array<{
          orderItemId: string;
          orderId: string;
          dogName: string;
          recipeName: string;
          packageSpecG: number;
          packageCount: number;
          packagePlan?: PackagePlanItem[] | null;
          ingredientSourcePlan?: string | null;
          recipeSnapshot: any;
          createdAt: string;
        }>;
    }>;
  }>({
    url: `/staff/production/recipe-batches/${params.recipeId}`,
    method: 'GET',
    data: {
      recipeVersion: params.recipeVersion,
      targetDate: params.targetDate,
    },
  });
}

/**
 * 替换原料照片（FREEZING状态下使用）
 * 删除COS中的旧照片并上传新照片
 */
export function replaceProductionPhotos(
  unitId: string,
  files: Array<{ uri: string; name: string }>
) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token');
    const baseUrl = getBaseUrl();

    console.log('[replaceProductionPhotos] Starting batch replace:', {
      unitId,
      fileCount: files.length,
    });

    // 为每个文件创建单独的上传任务
    const uploadTasks = files.map((file, index) => {
      return new Promise((uploadResolve, uploadReject) => {
        console.log(`[replaceProductionPhotos] Replacing file ${index + 1}/${files.length}`);

        uni.uploadFile({
          url: `${baseUrl}/staff/production/packaging-units/${unitId}/photos`,
          filePath: file.uri,
          name: 'files',
          header: {
            'Authorization': `Bearer ${token}`,
          },
          method: 'PUT',
          success: (uploadRes: any) => {
            console.log(`[replaceProductionPhotos] File ${index + 1} response:`, {
              statusCode: uploadRes.statusCode,
              data: uploadRes.data,
            });

            // 接受 200 OK 和 201 Created 状态码
            if (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) {
              try {
                const response = JSON.parse(uploadRes.data);
                if (response.code === 0) {
                  console.log(`[replaceProductionPhotos] File ${index + 1} success`);
                  uploadResolve(response.data);
                } else {
                  uploadReject(new Error(response.message || `文件${index + 1}替换失败`));
                }
              } catch (err) {
                uploadReject(new Error(`文件${index + 1}响应解析失败`));
              }
            } else {
              uploadReject(new Error(`文件${index + 1}替换失败: ${uploadRes.statusCode}`));
            }
          },
          fail: (err) => {
            console.error(`[replaceProductionPhotos] File ${index + 1} failed:`, err);
            uploadReject(err);
          },
        });
      });
    });

    // 并发执行所有替换任务
    Promise.all(uploadTasks)
      .then((results) => {
        console.log('[replaceProductionPhotos] All files replaced successfully');
        // 合并所有照片URL
        const allPhotos = results.flatMap((result: any) => result.photosRaw || []);
        resolve({ photosRaw: allPhotos });
      })
      .catch((error) => {
        console.error('[replaceProductionPhotos] Batch replace failed:', error);
        reject(error);
      });
  });
}
