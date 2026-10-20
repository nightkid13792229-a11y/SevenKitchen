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
  /**
   * 档案里的疾病史文本。
   * 与订单上的 `medicalConditions` **不是一回事**：那份是顾客下单当时填的，
   * 顾客之后在健康档案里改过，档案这份才是最新的（2026-10-04 后端补取）。
   */
  medicalHistory?: string | null
}

export interface CustomRecipeAttachment {
  id: string
  fileName: string
  fileUrl: string
  fileSize?: number
  fileType?: string
  uploadedAt?: string
}

/** 交付历史的一条（2026-10-18 · 需求 2.8.6） */
export interface CustomRecipeDeliveryHistoryItem {
  id: string
  version: number
  recipeId: string
  recipeVersion: number | null
  deliveredBy: string
  deliveredAt: string
  /** PENDING / SENT / SKIPPED / FAILED —— 通知是否发出去 */
  notifyStatus: string | null
  notifiedAt: string | null
  confirmedAt: string | null
  revokedAt: string | null
  /** 当前生效的那一版（后端算的，页面不自己判断） */
  isCurrent: boolean
}

export interface CustomRecipeOrderDetail {
  id?: string
  orderId: string
  status: string
  /** 本单购买/应交付的份数；老订单没有这个字段，后端按 1 份处理（2026-10-21） */
  recipeQuantity?: number
  targetGoal?: string
  /** 下单当时顾客手填的过敏（快照，不会随档案更新） */
  allergies?: string[]
  /** 过敏自由文本快照（2026-10-19） */
  allergyText?: string | null
  /** 本单上传的检测报告草稿（付款后转正式报告） */
  allergyReportDrafts?: Array<{
    attachments?: string[]
    attachmentKeys?: string[]
    testDate?: string | null
    testMethod?: string | null
    ocrText?: string | null
    summary?: string | null
    results?: Array<{ allergen: string; level?: string; notes?: string | null }>
  }>
  /** 付款后写狗狗档案的时间；null = 还没同步 */
  healthInfoSyncedAt?: string | null
  /** 顾客提交时是否要求写档案 */
  syncToHealthProfile?: boolean
  medicalConditions?: string[]
  /** 需求 2.3.4：饲喂历史（2026-10-19 补「其他」手填） */
  /** 顾客对有没有过敏的明确回答（2026-10-19 P0） */
  allergyStatus?: string | null
  currentFoodMain?: string | null
  currentFoodOther?: string | null
  changeReasons?: string[]
  changeReasonOther?: string | null
  stomachConditions?: string[]
  stomachOther?: string | null
  additionalNotes?: string | null
  preferredIngredients?: string[]
  dislikedIngredients?: string[]
  scheduledDate?: string
  estimatedDeliveryDate?: string | null
  amount?: number
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

/** 多份订单一次性交付的返回摘要 */
export interface DeliverBatchResult {
  orderId: string
  batchId: string
  version: number
  deliveredAt: string
  autoCompleteAt?: string | null
  recipeCount: number
  recipes: Array<{
    recipeId: string
    recipeName: string
    itemCodes: string[]
  }>
  legacyRecipeId?: string
  status: string
}

/**
 * 按选中份重新交付的返回摘要（2026-10-21 · 多份售后改稿）
 *
 * `recipeCount` 是新批次的总份数（含未选中的复制项）；
 * `selectedRecipes` 才是这次真正刷新过的份 —— 页面报数用它，
 * 不能用 `recipeCount` 说"重交了 N 份"，那会把没动的份也算进去。
 */
export interface RedeliverBatchResult {
  orderId: string
  batchId: string
  version: number
  deliveredAt: string
  autoCompleteAt?: string | null
  recipeCount: number
  /** 本次刷新了快照的交付明细 id（旧批次里的 id，按入参顺序） */
  selectedItemIds: string[]
  selectedRecipes: Array<{
    deliveryItemId: string
    /** 食谱业务编号（CR…），不是主键 */
    recipeId: string
    recipeName: string
    itemCodes: string[]
  }>
  legacyRecipeId?: string
  status: string
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
  /** 待售后（未处理完的售后单数）· 2026-10-18 · 两档待办之一 */
  pendingAftersale: number
}

/** 多份优惠的一档：quantity 份享 discountRate 的整单折扣 */
export interface MultiRecipeDiscountTier {
  /** 份数：2–5（1 份不折扣） */
  quantity: number
  /** 整单折扣率，**小数**形式：0.05 = 5% */
  discountRate: number
  /** 顾客端展示文案，如「2 份享 95 折」 */
  label: string
}

export interface CustomRecipeConfig {
  feeAmount: number
  deliveryWorkDays: number
  dailyCapacity: number
  paymentTimeoutMinutes: number

  // ===== 2026-10-16（批次 1.4）：原先写死在代码里的参数，现在后台可调 =====
  /** 每日交付上限（份）—— 与接单上限分开：收钱与交货是两件事 */
  dailyDeliveryCapacity: number
  /** 售后受理窗口（天） */
  aftersaleWindowDays: number
  /** 售后单超多少小时没处理要标红 · 2026-10-18 */
  aftersaleOverdueHours: number
  /** 交付前是否允许无理由全额退款 · 2026-10-18 */
  allowRefundBeforeDelivery: boolean
  /** 站内消息中心开关 · 2026-10-18 */
  messageCenterEnabled: boolean
  /** 免费调整次数 */
  freeRevisionCount: number
  /** 免费调整时间窗（天），不能超过售后窗口 */
  freeRevisionWindowDays: number
  /** 交付后几天顾客未确认则自动完成 */
  autoCompleteDays: number
  /** 是否要求顾客点「确认收到」 */
  requireCustomerConfirm: boolean
  /** 交付物包含哪几样（取值来自「选项字典」里的交付物选项集） */
  deliveryItemCodes: string[]
  /** 附件张数上限 */
  attachmentMaxCount: number
  /** 附件大小上限（MB） */
  attachmentMaxSizeMb: number
  /** 后台手工建食谱的默认营养标准 */
  defaultNutritionStandard: string
  /** 默认能量密度 kcal/kg */
  defaultEnergyDensityKcalPerKg: number
  /** 生产损耗率（1.07 = 损耗 7%） */
  productionLossRate: number
  /** 默认工时（小时） */
  defaultLaborHours: number
  /** 排期往前找多少天 */
  scheduleLookaheadDays: number
  /** 占位冲突最多重试几天 */
  slotRetryTimes: number
  /** 业务编号前缀 */
  orderNoPrefix: string

  // ===== 2026-10-20 多份购买 · 第一阶段 =====
  /** 是否启用多份购买（默认关闭；关闭时只能下 1 份） */
  multiRecipeEnabled: boolean
  /** 单笔最多份数：1–5，5 是业务硬上限 */
  maxRecipeQuantity: number
  /** 多份优惠档位（2–5 份四档必须齐全；1 份不折扣） */
  multiRecipeDiscounts: MultiRecipeDiscountTier[]
  /** 每日设计工时（分钟），用于推算每日产能 */
  dailyDesignMinutes: number
  /** 每份食谱默认设计工时（分钟），用于推算交付日期 */
  minutesPerRecipe: number

  updatedAt?: string
}

// ===== 排期日历（2026-10-16 批次 4.2）=====

/** 按星期的排期规则 */
export interface WeekdayRule {
  /** 0 = 周日 … 6 = 周六 */
  weekday: number;
  isOpen: boolean;
  /** 留空表示用全局配置 */
  capacity?: number | null;
  deliveryCapacity?: number | null;
  note?: string | null;
  /** 是否是"还没配过、后端给的默认值" */
  isDefault?: boolean;
}

/** 某一天算好的状态（可约与否、为什么不能约，都由后端给） */
export interface ResolvedDay {
  date: string;
  isOpen: boolean;
  capacity: number;
  bookedCount: number;
  remaining: number;
  deliveryCapacity: number;
  deliveryCount: number;
  deliveryRemaining: number;
  isPublicHoliday: boolean;
  /** 这一天的设置是哪一层决定的：具体某天 / 按星期 / 全局 */
  source: 'override' | 'weekday' | 'default';
  /** 不能约的原因，人能看懂 */
  closedReason?: string | null;
  note?: string | null;
}

// ===== 售后处理（2026-10-16 批次 3.1）=====

/** 多份售后里被选中的一份交付明细（后端已把 id 翻成食谱名） */
export interface AdminAftersaleSelectedRecipe {
  deliveryItemId: string;
  recipeId: string | null;
  recipeName: string | null;
}

/** 多份售后里这一份自己的诉求说明 */
export interface AdminAftersaleRecipeRequest {
  deliveryItemId: string;
  description: string;
}

/** 后台待办里的一条售后 */
export interface AdminAftersaleItem {
  id: string;
  orderId: string;
  dogName: string;
  customerName: string;
  customerPhone: string;
  orderStatus: string;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  description: string;
  photos: string[];
  createdAt: string;
  acceptedAt?: string | null;
  resolvedAt?: string | null;
  /** 多份售后针对哪一批交付；老的单份售后为 null */
  deliveryBatchId: string | null;
  /** 多份售后选中了哪几份（顺序即展示顺序）；老订单为空数组 */
  deliveryItemIds: string[];
  /** 每份各自的诉求说明；只有共用说明时为空数组 */
  recipeRequests: AdminAftersaleRecipeRequest[];
  /** 选中的每一份对应的食谱；明细被删时可能缺项，以 deliveryItemIds 为准 */
  items: AdminAftersaleSelectedRecipe[];
  /** 等了多久 —— 客服一眼看出哪条催得急（后端算的） */
  hoursWaiting: number;
  /** 是不是"催得急"（标红）—— 阈值由后端定，前端不判断 */
  isUrgent: boolean;
  /** 现在能做什么（后端算的，前端照着渲染） */
  actions: Array<{
    code: string;
    label: string;
    enabled: boolean;
    style?: string;
  }>;
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

  /**
   * 交付历史（2026-10-18 · 需求 2.8.6）
   *
   * 订单详情里只有**最新那一版**；这里要的是**全部版本** ——
   * 顾客说"我收到的是旧版"时，得能查出交过几版、谁交的、通知发没发。
   */
  getOrderDeliveries: (orderId: string) =>
    api.get<{ items: CustomRecipeDeliveryHistoryItem[] }>(
      `${BASE}/orders/${orderId}/deliveries`,
    ),

  /** 确认收款（日常操作，客服/员工可用） */
  confirmPayment: (orderId: string) =>
    api.patch(`${BASE}/orders/${orderId}/confirm-payment`),

  /** 付款后档案同步失败时重试（2026-10-19） */
  syncHealth: (orderId: string) =>
    api.post(`${BASE}/orders/${orderId}/sync-health`),

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

  /**
   * 多份订单一次性交付（2026-10-21 · 多份履约第二阶段）。
   *
   * 只用于**首次交付**，且 recipeIds 必须恰好等于订单的 recipeQuantity：
   * 后端会在一个事务里写批次 + 每份快照，少交/多交/重复都会 400。
   * 单份订单仍走上面的 deliverRecipe，不要混用。
   */
  deliverBatch: (orderId: string, recipeIds: string[]) =>
    api.post<DeliverBatchResult>(
      `${BASE}/orders/${orderId}/deliver-batch`,
      { recipeIds },
    ),

  /**
   * 按选中份重新交付（2026-10-21 · 多份售后改稿）。
   *
   * 只服务**多份订单的售后改稿**：只刷新 `deliveryItemIds` 这几份的快照，
   * 其余份原样带进新批次。首次交付走 `deliverBatch`，单份订单仍走
   * `deliverRecipe`，三者不要混用。
   */
  redeliverBatch: (orderId: string, deliveryItemIds: string[]) =>
    api.post<RedeliverBatchResult>(
      `${BASE}/orders/${orderId}/redeliver-batch`,
      { deliveryItemIds },
    ),

  /** 手工创建食谱并交付（兜底通道，正常动线应走设计器 + 一键交付） */
  createRecipe: (orderId: string, payload: CreateCustomRecipePayload) =>
    api.post(`${BASE}/orders/${orderId}/create-recipe`, payload),

  /** 删除订单附件 */
  deleteAttachment: (attachmentId: string) =>
    api.delete(`${BASE}/attachments/${attachmentId}`),

  /** 读取食谱定制设置 */
  getConfig: () => api.get<CustomRecipeConfig>(`${BASE}/config`),

  /**
   * 交付物候选项 —— 从**选项字典**读，不在这里写死清单。
   *
   * 这一页本身就是在拆"前端各写一份清单"的毛病，
   * 自己再写一份「专属食谱 / 采购与制作单 / 营养报告」就说不过去了。
   */
  getDeliveryItemOptions: async (): Promise<
    Array<{ code: string; label: string }>
  > => {
    const data = (await api.get(
      '/options?sets=custom_recipe_delivery_item',
    )) as {
      sets?: Record<string, Array<{ code: string; label: string }>>
    };
    return data?.sets?.custom_recipe_delivery_item ?? [];
  },

  // ---------- 排期日历（批次 4.2）----------

  /** 按星期的规则（没配过时后端回默认值并标 isDefault） */
  getWeekdayRules: (): Promise<{ items: WeekdayRule[]; isDefault: boolean }> =>
    api.get('/admin/custom-recipe/weekday-rules'),

  saveWeekdayRules: (
    items: Array<{
      weekday: number;
      isOpen: boolean;
      capacity?: number | null;
      deliveryCapacity?: number | null;
      note?: string | null;
    }>,
  ) => api.put('/admin/custom-recipe/weekday-rules', { items }),

  /**
   * 某段日子里每一天的真实状态。
   * **可约与否与原因都由后端算**（三层优先级 + 接单/交付两套容量）。
   */
  getCalendar: (from: string, to: string): Promise<{ days: ResolvedDay[] }> =>
    api.get('/admin/custom-recipe/calendar', { params: { from, to } }),

  /** 批量设置某段日子的排期（沿用既有接口） */
  batchSetSchedule: (payload: {
    dateFrom: string;
    dateTo: string;
    capacity?: number;
    isAvailable?: boolean;
    includeWeekends?: boolean;
    skipPublicHolidays?: boolean;
  }) => api.post('/admin/custom-recipe/schedule/batch-set', payload),

  // ---------- 售后（批次 3.1）----------

  /**
   * 售后待办列表。
   *
   * 默认只列未处理完的；排序由后端算（等太久的排前面），
   * 前端不再自己排 —— 与顾客侧渲染契约同一套思路。
   */
  listAftersales: (
    params?: { status?: string; includeClosed?: boolean },
  ): Promise<{ items: AdminAftersaleItem[] }> =>
    api.get('/admin/custom-recipe/aftersales', { params }),

  acceptAftersale: (id: string) =>
    api.post(`/admin/custom-recipe/aftersales/${id}/accept`),

  markAftersaleProcessing: (id: string) =>
    api.post(`/admin/custom-recipe/aftersales/${id}/processing`),

  resolveAftersale: (
    id: string,
    payload: { handleNote: string; linkedDeliveryId?: string },
  ) => api.post(`/admin/custom-recipe/aftersales/${id}/resolve`, payload),

  rejectAftersale: (id: string, payload: { reason: string }) =>
    api.post(`/admin/custom-recipe/aftersales/${id}/reject`, payload),

  /** 保存食谱定制设置（仅管理员） */
  updateConfig: (payload: Partial<CustomRecipeConfig>) =>
    api.put<CustomRecipeConfig>(`${BASE}/config`, payload),

  /** 订单统计（列表页顶部卡片） */
  getStatistics: (params?: { dateFrom?: string; dateTo?: string }) =>
    api.get<CustomRecipeStatistics>(`${BASE}/statistics`, { params }),
}

export default customRecipeApi
