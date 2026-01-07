/**
 * 全局配置管理API
 */
import api from './index';

export interface GlobalConfig {
  id: string;
  laborHourlyRate: number;
  minOrderWeightG: number;
  defaultBatchCapacityG: number;
  targetMargin: number;
  overheadCostPerKg: number;
  targetBatchUtilization: number;
  supplementLossRate: number;
  defaultProductLabelId: string | null;
  defaultIcePackId: string | null;
  defaultShippingTemplateId: string | null;
  packageExampleImageUrl: string | null;
  shippingCompanyLogoUrl: string | null;
  paymentTimeoutMinutes: number;
}

export type GlobalConfigUpdate = Partial<GlobalConfig>;

export const globalConfigApi = {
  /**
   * 获取全局配置
   */
  get: (): Promise<GlobalConfig> =>
    api.get('/admin/global-config'),

  /**
   * 更新全局配置
   * @param data 更新数据
   */
  update: (data: GlobalConfigUpdate): Promise<GlobalConfig> =>
    api.put('/admin/global-config', data),

  /**
   * 上传食品真空袋示例图
   * @param file 图片文件
   */
  uploadPackageImage: async (file: File): Promise<{ url: string; key: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    return api.post<{
      url: string;
      key: string;
    }>('/admin/upload-package-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  /**
   * 上传快递公司logo
   * @param file 图片文件
   */
  uploadShippingLogo: async (file: File): Promise<{ url: string; key: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    return api.post<{
      url: string;
      key: string;
    }>('/admin/upload-shipping-logo', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};
