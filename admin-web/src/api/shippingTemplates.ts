/**
 * 运费模板管理API
 */
import api from './index';

export interface ShippingTemplate {
  id: string;
  name: string;
  baseWeightKg: number;
  baseFee: number;
  stepWeightKg: number;
  stepFee: number;
  vasFeePerOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateShippingTemplateDto {
  name: string;
  baseWeightKg: number;
  baseFee: number;
  stepWeightKg: number;
  stepFee: number;
  vasFeePerOrder: number;
  isActive?: boolean;
}

export interface UpdateShippingTemplateDto {
  name?: string;
  baseWeightKg?: number;
  baseFee?: number;
  stepWeightKg?: number;
  stepFee?: number;
  vasFeePerOrder?: number;
  isActive?: boolean;
}

export interface ShippingFeePreview {
  templateId: string;
  totalWeightG: number;
}

export interface ShippingFeeResult {
  amountShipping: number;
  templateId: string;
  ruleAppliedDescription: string;
}

export const shippingTemplateApi = {
  /**
   * 列出所有运费模板
   */
  list: (): Promise<ShippingTemplate[]> =>
    api.get('/admin/shipping-templates'),

  /**
   * 获取单个运费模板
   */
  get: (id: string): Promise<ShippingTemplate> =>
    api.get(`/admin/shipping-templates/${id}`),

  /**
   * 创建运费模板
   */
  create: (data: CreateShippingTemplateDto): Promise<ShippingTemplate> =>
    api.post('/admin/shipping-templates', data),

  /**
   * 更新运费模板
   */
  update: (id: string, data: UpdateShippingTemplateDto): Promise<ShippingTemplate> =>
    api.put(`/admin/shipping-templates/${id}`, data),

  /**
   * 删除运费模板
   */
  delete: (id: string): Promise<void> =>
    api.delete(`/admin/shipping-templates/${id}`),

  /**
   * 激活运费模板（会自动停用其他模板）
   */
  activate: (id: string): Promise<ShippingTemplate> =>
    api.put(`/admin/shipping-templates/${id}/activate`),

  /**
   * 预览运费计算
   */
  preview: (data: ShippingFeePreview): Promise<ShippingFeeResult> =>
    api.post('/admin/shipping-templates/preview', data),
};
