/**
 * 定制食谱（后台）API
 *
 * 为什么单独收一个文件：订单列表、订单详情、定制设置三个页面原来各自
 * 拼 `/admin/custom-recipe/...` 字符串，接口口径一变（例如交付改走
 * `deliver-recipe`）就得三个文件一起翻。统一收在这里后，
 * 页面只表达"做什么"，路径与载荷形状只在这一处维护。
 */

import api from './index'

/** 狗档案里的过敏原记录（来自检测报告 / 主人观察 / 员工录入 / 排查计划） */
export interface CustomRecipeDogAllergyRecord {
  allergen: string
  /** CONFIRMED 确诊 / SUSPECTED 可疑 / TO_VERIFY 待排查 / RULED_OUT 已排除 */
  certainty?: string
  /** REPORT / OWNER / STAFF / ORDER / PLAN */
  source?: string
}

export interface CustomRecipeDogProfile {
  id?: string
  name?: string
  birthday?: string
  currentWeightKg?: number
  bcsScore?: number
  activityLevel?: string
  /**
   * 档案里手填的过敏文本。
   * 与订单上的 `allergies` **不是一回事**：那份是顾客下单当时填的，
   * 顾客之后在健康档案里改过，档案这份才是最新的。
   */
  allergyFoods?: string | null
  allergyRecords?: CustomRecipeDogAllergyRecord[]
}

export interface CustomRecipeAttachment {
  id: string
  fileName: string
  fileUrl: string
  fileSize?: number
  fileType?: string
  uploadedAt?: string
}

export interface CustomRecipeOrderDetail {
  id?: string
  orderId: string
  status: string
  targetGoal?: string
  /** 下单当时顾客手填的过敏（快照，不会随档案更新） */
  allergies?: string[]
  medicalConditions?: string[]
  additionalNotes?: string | null
  preferredIngredients?: string[]
  dislikedIngredients?: string[]
  scheduledDate?: string
  estimatedDeliveryDate?: string | null
  amount?: number
  creditAmount?: number
  creditUsed?: number
  creditRemaining?: number
  createdAt?: string
  paymentConfirmedAt?: string | null
  /** 微信支付交易号，客服对账/排查用 */
  paymentTransactionId?: string | null
  inProgressAt?: string | null
  deliveredAt?: string | null
  cancelledAt?: string | null
  cancellationReason?: string | null
  /** PENDING / PROCESSING / SUCCESS / ABNORMAL / CLOSED / FAILED */
  refundStatus?: string | null
  refundAmount?: number | null
  refundedAt?: string | null
  recipeId?: string | null
  customer?: {
    id?: string
    nickname?: string
    phone?: string | null
    wechatOpenid?: string | null
  } | null
  dog?: CustomRecipeDogProfile | null
  recipe?: {
    id?: string
    recipeId?: string
    name?: string
    coverImageUrl?: string | null
    nutritionStandard?: string | null
    energyDensityKcalPerKg?: number | null
  } | null
  attachmentsRecords?: CustomRecipeAttachment[]
}

/** 可以交付到这张订单的候选食谱（只含"这位顾客 + 这只狗"的私密定制食谱） */
export interface CustomRecipeCandidate {
  /** 业务编号（CR 开头），交付接口收这个值 */
  recipeId: string
  name: string
  version: number
  updatedAt: string
  /** 是否正是订单当前挂着的那一份（界面上标"当前已挂"） */
  linkedToThisOrder: boolean
}

export interface DeliverRecipeResult {
  orderId: string
  recipeBizId: string
  recipeName: string
  /** true = 本次是「重新交付」，覆盖了原来挂的食谱 */
  redelivered: boolean
  status: string
  deliveredAt: string
}

export interface CustomRecipeOrderListResult {
  orders: CustomRecipeOrderDetail[]
  total: number
  page: number
  pageSize: number
  summary?: Record<string, any>
}

export interface CustomRecipeStatistics {
  pendingPayment: number
  inProgress: number
  delivered: number
  totalRevenue: number
}

export interface CustomRecipeConfig {
  feeAmount: number
  creditAmount: number
  deliveryWorkDays: number
  dailyCapacity: number
  paymentTimeoutMinutes: number
  updatedAt?: string
}

/** 手工创建并交付的载荷（与设计器交付并存，用于特殊情况的兜底） */
export interface CreateCustomRecipePayload {
  name: string
  description?: string
  coverImageUrl?: string
  nutritionStandard?: string
  nutritionTarget?: {
    protein_percent?: number
    fat_percent?: number
    carbohydrate_percent?: number
    energy_density_kcal_per_kg?: number
  }
  items?: Array<{
    ingredientId: string
    preparationMethod?: string
    ratioPercent?: number
    sortOrder?: number
  }>
  productionSteps?: string
}

const BASE = '/admin/custom-recipe'

export const customRecipeApi = {
  /** 订单列表（分页 + 状态/日期/关键词筛选） */
  listOrders: (params: {
    page?: number
    pageSize?: number
    status?: string
    search?: string
    dateFrom?: string
    dateTo?: string
  }) => api.get<CustomRecipeOrderListResult>(`${BASE}/orders`, { params }),

  /** 订单详情（含狗档案最新过敏、退款、各节点时间） */
  getOrderDetail: (orderId: string) =>
    api.get<CustomRecipeOrderDetail>(`${BASE}/orders/${orderId}`),

  /** 确认收款（日常操作，客服/员工可用） */
  confirmPayment: (orderId: string) =>
    api.patch(`${BASE}/orders/${orderId}/confirm-payment`),

  /** 流转状态：开始制作 / 取消（取消仅管理员，后端会再拦一次） */
  updateStatus: (orderId: string, status: string, reason?: string) =>
    api.patch(`${BASE}/orders/${orderId}/status`, { status, reason }),

  /**
   * 可交付的食谱候选。
   * 只返回"这位顾客 + 这只狗"的已设计食谱，从设计器把订单号挂上来的那些。
   */
  listRecipeCandidates: (orderId: string) =>
    api.get<CustomRecipeCandidate[]>(
      `${BASE}/orders/${orderId}/recipe-candidates`,
    ),

  /**
   * 一键交付（已交付的单再调用即「重新交付」，会覆盖并再次通知顾客）。
   * recipeId 传业务编号（CR…）或主键都认。
   */
  deliverRecipe: (orderId: string, recipeId: string) =>
    api.post<DeliverRecipeResult>(`${BASE}/orders/${orderId}/deliver-recipe`, {
      recipeId,
    }),

  /** 手工创建食谱并交付（兜底通道，正常动线应走设计器 + 一键交付） */
  createRecipe: (orderId: string, payload: CreateCustomRecipePayload) =>
    api.post(`${BASE}/orders/${orderId}/create-recipe`, payload),

  /** 恢复定制抵扣额度（人工退款时使用，仅管理员） */
  restoreCredit: (orderId: string, amount?: number) =>
    api.post(`${BASE}/orders/${orderId}/restore-credit`, { amount }),

  /** 删除订单附件 */
  deleteAttachment: (attachmentId: string) =>
    api.delete(`${BASE}/attachments/${attachmentId}`),

  /** 读取食谱定制设置 */
  getConfig: () => api.get<CustomRecipeConfig>(`${BASE}/config`),

  /** 保存食谱定制设置（仅管理员） */
  updateConfig: (payload: Partial<CustomRecipeConfig>) =>
    api.put<CustomRecipeConfig>(`${BASE}/config`, payload),

  /** 订单统计（列表页顶部卡片） */
  getStatistics: (params?: { dateFrom?: string; dateTo?: string }) =>
    api.get<CustomRecipeStatistics>(`${BASE}/statistics`, { params }),
}

export default customRecipeApi
