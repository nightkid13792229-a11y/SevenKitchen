/**
 * 订单绑定食谱设计（2026-10-22 · Task 5/6）类型。
 *
 * 与 backend `/api/v1/recipe-designer/*` 的订单设计工作台接口对齐：
 * 一个槽位 = 一个独立的系列/草稿；本单 N 份就有 N 个槽位。
 */

/** 模板来源筛选：ALL 两种都查；CATALOG 只查橱窗；CUSTOM 只查私密定制。 */
export type OrderRecipeTemplateKind = 'ALL' | 'CATALOG' | 'CUSTOM'

/** 模板来源（返回给后台的展示口径，不含 ALL）。 */
export type RecipeTemplateSourceKind = 'CATALOG' | 'CUSTOM'

/** 槽位状态：编辑中 / 已就绪（加入待提交）/ 已交付 / 已移除。 */
export type OrderRecipeDesignStatus =
  | 'EDITING'
  | 'READY'
  | 'DELIVERED'
  | 'REMOVED'

export interface RecipeTemplateMacroRow {
  name: string
  dryMatterLabel: string
  energyPercentLabel: string
  weightPercentLabel: string
}

/** `GET /recipe-designer/recipe-templates` 的返回项。 */
export interface RecipeTemplateSummary {
  /** `recipe.id` — 具体版本行主键，创建订单草稿时用它定位精确版本 */
  recipeId: string
  recipeVersion: number
  name: string
  sourceKind: RecipeTemplateSourceKind
  /** 原始生命阶段代码（PUPPY_UNDER_14_WEEKS 等），展示时转中文 */
  lifeStage: string | null
  primaryProtein: string | null
  ingredientCount: number
  macroSummary: RecipeTemplateMacroRow[]
  updatedAt: string
}

export interface RecipeTemplateStageComparison {
  matches: boolean
  templateStage: string | null
  dogStage: string | null
  /** 中文提示；只提示不阻断，null = 阶段一致 */
  warning: string | null
}

export interface OrderTemplateStageComparison
  extends RecipeTemplateStageComparison {
  orderId: string
  recipeId: string
  recipeVersion: number
  templateName: string
}

export interface OrderDesignWorkspaceSlot {
  designId: string
  seriesId: string
  draftId: string
  name: string
  status: OrderRecipeDesignStatus
  /** 加入待提交后生成的私密食谱 `recipe.id`；未就绪为 null */
  recipeId: string | null
  sourceRecipeId: string | null
  /** 模板阶段与本单狗狗阶段不一致时的提示；只提示不阻断 */
  stageWarning: string | null
  updatedAt: string
}

export interface OrderDesignWorkspace {
  /** 对外订单号（不是 uuid） */
  orderId: string
  dogId: string
  dogName: string
  /** 本单份数（`recipe_quantity`） */
  quantity: number
  /** 已就绪份数（status = READY） */
  readyCount: number
  slots: OrderDesignWorkspaceSlot[]
}

export interface CreateOrderDesignFromTemplatePayload {
  /** 模板食谱版本行主键 `recipe.id` */
  sourceRecipeId: string
  /** 可选自定义名称；不填后端用「{狗名}定制 · {模板名}」 */
  name?: string
}

export interface CreateOrderDesignFromTemplateResult {
  seriesId: string
  draftId: string
  stageWarning: string | null
}

export interface CreateBlankOrderDesignResult {
  seriesId: string
  draftId: string
}

export interface StageOrderDesignResult {
  status: 'READY'
  recipeId: string
  readyCount: number
}

/** `PATCH /recipe-designer/orders/:orderId/designs/:designId/stage` 的返回。 */
export interface SwitchOrderDesignStageResult {
  designId: string
  draftId: string
  /** READY 的那份换阶段后会退回 EDITING，需要重新加入待提交 */
  status: OrderRecipeDesignStatus
  scenario: string
  /** 换阶段后草稿的系列生命阶段代码 */
  lifeStage: string
  /** 与新阶段比对后重算的提示；null = 与本单狗狗阶段一致 */
  stageWarning: string | null
}

export interface OrderDesignSubmitRecipe {
  recipeId: string
  name?: string
}

/** `POST /admin/custom-recipe/orders/:orderId/submit-designs` 的返回。 */
export interface OrderDesignSubmitResult {
  status: 'DELIVERED'
  orderId: string
  batchId: string
  version: number
  deliveredAt: string
  autoCompleteAt: string | null
  recipeCount: number
  recipes: OrderDesignSubmitRecipe[]
  legacyRecipeId: string
  /** true = 重复提交回放，本次没有新的交付、也没有新通知 */
  replayed: boolean
}
