/**
 * Production API
 * 生产管理相关API调用
 */

import { request } from '../utils/api';

// ==========================================
// 生产统计
// ==========================================

/**
 * 获取今日生产统计
 */
export function getTodayStatistics() {
  return request<{
    todayOrders: number; // 今日订单数
    inProgress: number; // 制作中数量
    completed: number; // 已完成数量
  }>({
    url: '/staff/production/statistics/today',
    method: 'GET',
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
 * 获取分装单元列表（支持筛选和分页）
 */
export function getPackagingUnits(params: {
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  page?: number;
  pageSize?: number;
  targetDate?: string; // YYYY-MM-DD格式
}) {
  // 🔧 修复：过滤掉 undefined 值，避免序列化为 "undefined" 字符串
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([_, v]) => v !== undefined)
  );

  return request<{
    list: Array<{
      id: string;
      recipeName: string;
      recipeVersion: number;
      totalProductionG: number;
      status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
      orderItems: Array<{
        orderId: string;
        orderItemId: string;
        dogName: string;
        packageSpecG: number; // 单包规格（g）
        packageCount: number; // 总袋数
        recipientName?: string;
        recipientCity?: string;
        completedAt?: string; // 本地时间格式
      }>;
      currentPotNumber: number; // 当前是第几锅
      totalPots: number; // 总共几锅
      createdAt: string; // 本地时间格式
      completedAt?: string; // 本地时间格式
      photosRaw?: string[]; // 备料照片URL列表
      ingredientsUsageSnapshot?: any; // 原料用量快照
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
 */
export function uploadProductionPhotos(
  unitId: string,
  files: Array<{ filePath: string; name: string }>
) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token');
    const baseUrl = uni.getStorageSync('baseUrl') || 'http://localhost:3000/api/v1';

    uni.uploadFile({
      url: `${baseUrl}/staff/production/packaging-units/${unitId}/photos`,
      files: files,
      header: {
        'Authorization': `Bearer ${token}`,
      },
      success: (uploadRes: any) => {
        if (uploadRes.statusCode === 200) {
          try {
            const response = JSON.parse(uploadRes.data);
            if (response.code === 0) {
              resolve(response.data);
            } else {
              reject(new Error(response.message || '上传失败'));
            }
          } catch (err) {
            reject(new Error('解析响应失败'));
          }
        } else {
          reject(new Error(`上传失败: ${uploadRes.statusCode}`));
        }
      },
      fail: (err) => {
        console.error('[Upload] Upload failed:', err);
        reject(err);
      },
    });
  });
}

/**
 * 完成制作任务
 */
export function completeProductionTask(unitId: string) {
  return request<{
    id: string;
    status: string;
  }>({
    url: `/staff/production/packaging-units/${unitId}/complete`,
    method: 'POST',
  });
}
