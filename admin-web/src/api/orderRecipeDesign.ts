/**
 * 订单绑定食谱设计 API（2026-10-22 · Task 5/6）。
 *
 * 统一收口 backend `/recipe-designer/orders/*` 与管理员最终提交路径：
 * 页面不拼字符串，接口口径一变只改这里。
 */
import api from './index'
import type {
  CreateBlankOrderDesignResult,
  CreateOrderDesignFromTemplatePayload,
  CreateOrderDesignFromTemplateResult,
  OrderDesignSubmitResult,
  OrderDesignWorkspace,
  OrderRecipeTemplateKind,
  OrderTemplateStageComparison,
  RecipeTemplateSummary,
  StageOrderDesignResult,
} from '@/types/orderRecipeDesign'

export interface RecipeTemplateListQuery {
  keyword?: string
  kind?: OrderRecipeTemplateKind
}

function segment(value: string | number): string {
  return encodeURIComponent(String(value))
}

export const orderRecipeDesignApi = {
  /** 可作为订单设计起点的模板（橱窗 + 私密定制，内部角色可见） */
  listTemplates: (
    query: RecipeTemplateListQuery = {},
  ): Promise<RecipeTemplateSummary[]> =>
    api.get('/recipe-designer/recipe-templates', { params: query }),

  /** 模板阶段与订单狗狗阶段比较；只提示，不阻断 */
  getTemplateStage: (
    orderId: string,
    sourceRecipeId: string,
  ): Promise<OrderTemplateStageComparison> =>
    api.get(
      `/recipe-designer/orders/${segment(orderId)}/design-template-stage`,
      { params: { sourceRecipeId } },
    ),

  /** 本单设计工作台：订单 / 狗狗 / 份数 / 已就绪 + 槽位 */
  getWorkspace: (orderId: string): Promise<OrderDesignWorkspace> =>
    api.get(`/recipe-designer/orders/${segment(orderId)}/workspace`),

  /** 从已有模板创建一份订单绑定草稿（同一模板可重复使用） */
  createFromTemplate: (
    orderId: string,
    payload: CreateOrderDesignFromTemplatePayload,
  ): Promise<CreateOrderDesignFromTemplateResult> =>
    api.post(
      `/recipe-designer/orders/${segment(orderId)}/designs/from-template`,
      payload,
    ),

  /** 创建空白订单绑定草稿 */
  createBlank: (orderId: string): Promise<CreateBlankOrderDesignResult> =>
    api.post(`/recipe-designer/orders/${segment(orderId)}/designs/blank`),

  /** 加入本单待提交（生成私密食谱，不交付、不通知；仅管理员） */
  markReady: (
    orderId: string,
    designId: string,
  ): Promise<StageOrderDesignResult> =>
    api.post(
      `/recipe-designer/orders/${segment(orderId)}/designs/${segment(designId)}/ready`,
    ),

  /** 移除尚未最终交付的槽位 */
  removeDesign: (orderId: string, designId: string): Promise<void> =>
    api.delete(
      `/recipe-designer/orders/${segment(orderId)}/designs/${segment(designId)}`,
    ),

  /** 管理员最终提交：把本单 N 份 READY 一次性交付给顾客 */
  submitDesigns: (orderId: string): Promise<OrderDesignSubmitResult> =>
    api.post(
      `/admin/custom-recipe/orders/${segment(orderId)}/submit-designs`,
    ),
}

export default orderRecipeDesignApi
