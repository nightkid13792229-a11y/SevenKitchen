/**
 * 定制食谱（后台）API
 *
 * 为什么单独收一个文件：订单列表、订单详情、定制设置三个页面原来各自
 * 拼 `/admin/custom-recipe/...` 字符串，接口口径一变（例如交付改走
 * `deliver-recipe`）就得三个文件一起翻。统一收在这里后，
 * 页面只表达"做什么"，路径与载荷形状只在这一处维护。
 */

import api from './index'
import type {
  ActivityLevel,
  DogGender,
  DogProfile,
  DogSizeCategory,
  LifeStageOverride,
} from '@/types/dog'

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
  /**
   * 订单来源与线下收款（2026-10-21 · 代客定制食谱订单 Task 5）
   *
   * `paymentChannel` 非 WECHAT_ONLINE 或 `orderSource=ASSISTED` 且已确认收款时，
   * 取消/退款必须走「线下退款并取消」，**不能**调微信原路退款。
   */
  orderSource?: string | null
  paymentChannel?: string | null
  externalPaymentRef?: string | null
  actualPaidAmount?: number | null
  priceOverrideReason?: string | null
  /** 线下退款登记（手工退现金/转账，不调用微信退款） */
  refundChannel?: string | null
  offlineRefundedAt?: string | null
  offlineRefundAmount?: number | null
  offlineRefundMethod?: string | null
  offlineRefundNote?: string | null
  offlineRefundByStaffId?: string | null
  recipeId?: string | null
  customer?: {
    id?: string
    nickname?: string
    phone?: string | null
    /** CUSTOMER / STAFF / ADMIN；非 CUSTOMER 在后台标「内部测试」 */
    role?: string | null
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

/**
 * 手工补退款的结果（2026-10-21）
 *
 * `reused=true` 表示这张单**早就退过**（或微信还在处理），
 * 后端幂等复用了同一条退款记录，没有重复打款 —— 页面据此换措辞。
 */
export interface CustomRecipeRefundResult {
  orderId: string
  /** PENDING / PROCESSING / SUCCESS / ABNORMAL / CLOSED / FAILED */
  status: string
  amount: number | null
  outRefundNo: string | null
  refundId: string | null
  reused: boolean
}

/** 线下退款方式（与后端 `OFFLINE_REFUND_METHODS` 同一套取值） */
export type OfflineRefundMethod =
  | 'OFFLINE_WECHAT'
  | 'OFFLINE_ALIPAY'
  | 'OTHER'

/** POST /admin/custom-recipe/orders/:orderId/offline-refund 的请求体 */
export interface OfflineRefundPayload {
  /** 实际退给顾客的金额（元），不能超过实收金额 */
  amount: number
  method: OfflineRefundMethod
  /** 转账流水号/说明，可选 */
  note?: string
}

/**
 * 线下退款登记的结果（2026-10-21 · Task 5）。
 *
 * 这是**手工退款**的登记：钱由管理员在线下退回顾客，
 * 系统只记录金额/方式/操作人/时间，并取消订单、释放名额 —— 全程不调用微信退款。
 */
export interface OfflineRefundResult {
  orderId: string
  status: string
  refundChannel: string
  amount: number
  method: string
  note: string | null
  offlineRefundedAt: string
  cancelledAt: string
  cancellationReason: string
  releasedCapacity: number
  operatorId: string
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
  /**
   * @deprecated 已废弃（2026-10-21）：内部生产损耗系数改在
   * 「全局配置 → 生产配置」编辑，新建食谱读 GlobalConfig。
   * 后端仍会返回这一列（兼容旧数据/回滚），但页面不再展示或保存它。
   */
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
  /** 这一份自己的附件（2026-10-25）；旧记录没有时为空 */
  photos?: string[];
}

/** 后台待办里的一条售后 */
/** 员工代客发起的调整单（2026-10-27） */
export interface StaffAftersaleResult {
  id: string;
  status: string;
  statusLabel: string;
  source: string;
  deliveryBatchId: string | null;
  deliveryItemIds: string[];
  /** true = 复用了一条已经存在的进行中调整（重复点击不报错） */
  resumed?: boolean;
}

export interface AdminAftersaleItem {
  id: string;
  orderId: string;
  dogName: string;
  customerName: string;
  customerPhone: string;
  orderStatus: string;
  type: string;
  typeLabel: string;
  /** 谁发起的：CUSTOMER = 顾客在小程序提交；STAFF = 员工代客发起（2026-10-27） */
  source?: 'CUSTOMER' | 'STAFF';
  sourceLabel?: string;
  status: string;
  statusLabel: string;
  description: string;
  photos: string[];
  createdAt: string;
  acceptedAt?: string | null;
  resolvedAt?: string | null;
  /** 多份售后针对哪一批交付；老的单份售后为 null */
  deliveryBatchId: string | null;
  /** 老单份售后关联的交付记录 / 食谱 */
  deliveryId?: string | null;
  deliveryRecipeId?: string | null;
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

// ===== 代客下单（2026-10-21 · Task 4）=====

/** 服务端权威报价（与订单价格快照一一对应） */
export interface CustomRecipeQuote {
  quantity: number
  unitAmount: number
  originalAmount: number
  discountRate: number
  discountAmount: number
  payableAmount: number
}

/** 代客单可登记的线下收款渠道（不含微信在线支付） */
export type AssistedPaymentChannel =
  | 'OFFLINE_WECHAT'
  | 'OFFLINE_ALIPAY'
  | 'OTHER'

export type AssistedAllergyStatus = 'HAS_ALLERGY' | 'NO_ALLERGY'

export interface AssistedOrderPayment {
  collected: boolean
  channel: AssistedPaymentChannel
  amount: number
  externalRef?: string | null
  overrideReason?: string | null
}

/** POST /admin/custom-recipe/orders/assisted 的请求体 */
export interface CreateAssistedOrderPayload {
  customerId: string
  dogId: string
  targetGoal: string
  recipeQuantity: number
  requestedProteinCodes?: string[]
  allergies?: string[]
  allergyText?: string | null
  allergyStatus: AssistedAllergyStatus
  currentFoodMain?: string | null
  currentFoodOther?: string | null
  changeReasons?: string[]
  stomachConditions?: string[]
  additionalNotes?: string | null
  payment: AssistedOrderPayment
}

/** 代客下单成功后的摘要 */
export interface AssistedOrderResult {
  id: string
  /** 业务编号（CR 开头），成功页跳订单中心用这个 */
  orderId: string
  status: string
  amount: number
  actualPaidAmount: number | null
  paymentChannel: string | null
  recipeQuantity: number
  assistedForGuest: boolean
  healthSync?: { synced: boolean; reason?: string }
}

/** 员工端客户搜索返回的狗狗摘要 */
export interface StaffCustomerSearchDog {
  id: string
  name: string
  breedName?: string | null
  currentWeightKg?: number | null
  mealsPerDay?: number | null
}

/**
 * 员工端客户搜索（`/staff/customer-service/customers/search`）。
 *
 * 已有账号顾客走这个接口；结果里同时带狗狗，便于直接选狗。
 * 狗名可能重名，页面必须同时展示主人昵称/手机号，不能只凭名字识别。
 */
export interface StaffCustomerSearchItem {
  id: string
  nickname?: string | null
  phone?: string | null
  avatarUrl?: string | null
  dogs: StaffCustomerSearchDog[]
}

/**
 * 代客下单合并搜索（`/admin/custom-recipe/customer-dog-search`）的狗狗摘要。
 *
 * 后端一次返回顾客**全部**狗狗：关键词可能只命中其中一只，
 * 但页面要把这位顾客的狗都列出来给员工选。
 */
export interface AssistedCustomerDogSearchDog {
  id: string
  name: string
  breedName?: string | null
  birthday?: string | null
  /** 后端算好的年龄文案（没填生日为 null） */
  ageText?: string | null
  currentWeightKg?: number | null
}

/**
 * 代客下单合并搜索结果。
 *
 * 一张卡片同时代表「顾客 + 他的全部狗狗」，点狗即同时选中顾客与狗。
 * 默认只返回真实顾客；`includeInternal=true` 时才有 ADMIN / STAFF。
 */
export interface AssistedCustomerDogSearchItem {
  id: string
  name: string | null
  phone?: string | null
  /** CUSTOMER / STAFF / ADMIN */
  role: string
  /** 非 CUSTOMER 即内部账号（仅用于测试单，页面需二次确认） */
  isInternal: boolean
  dogs: AssistedCustomerDogSearchDog[]
}

/** 代客客户（无账号顾客）搜索项 */
export interface GuestCustomerSearchItem {
  id: string
  name: string
  phone?: string | null
  wechat?: string | null
  dogCount: number
}

export interface CreateGuestCustomerPayload {
  name: string
  phone?: string
  wechat?: string
  note?: string
}

/**
 * 给代客客户建狗。
 *
 * 字段与顾客端建档一致；`ownerId` 由后端按 `customerId` 强制指定，
 * 页面不要也不能传，避免把狗写到员工/老板账号下。
 */
export interface CreateGuestDogPayload {
  name: string
  breedId: string
  customBreedName?: string | null
  birthday: string
  gender: DogGender
  isNeutered: boolean
  currentWeightKg: number
  bcsScore: number
  activityLevel: ActivityLevel
  lifeStageOverride: LifeStageOverride
  sizeClassOverride?: DogSizeCategory | null
  mealsPerDay?: number
  medicalHistory?: string | null
  allergyFoods?: string | null
  pickyFoods?: string | null
}

/** `/admin/dogs` 按主人筛选的返回 */
export interface AdminDogListResult {
  data: DogProfile[]
  total: number
  page: number
  pageSize: number
}

/** 定制需求选项集（来自平台选项字典 `/options?sets=...`） */
export type CustomRecipeIntakeOptionSets = Record<
  string,
  Array<{ code: string; label: string; tone?: string | null }>
>

const BASE = '/admin/custom-recipe'

/** 后台退款申请（2026-10-25） */
export interface AdminRefundRequest {
  id: string;
  orderId: string;
  orderStatus: string | null;
  status: string;
  statusLabel: string;
  reasonCode: string;
  reasonLabel: string;
  description: string;
  photos: string[];
  amount: number;
  adminNote: string | null;
  refundStatus: string | null;
  refundOutNo: string | null;
  refundId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  dogName: string | null;
  customerName: string | null;
  customerPhone: string | null;
}

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

  // ---------- 代客下单（2026-10-21 · Task 4）----------

  /**
   * 搜索**已有账号**顾客（复用员工端客户搜索）。
   *
   * 返回结果带狗狗，但狗名不能作为唯一识别依据 —— 页面必须同时显示
   * 主人昵称/手机号，选狗用 dog.id。
   *
   * @deprecated 代客下单已改用 `searchAssistedCustomerDogs`（合并搜索）；
   * 员工端接口本身不变，仍供其它客服/补剂流程使用。
   */
  searchStaffCustomers: (keyword: string) =>
    api.get<StaffCustomerSearchItem[]>(
      '/staff/customer-service/customers/search',
      { params: { keyword } },
    ),

  /**
   * 代客下单：顾客 + 狗狗合并搜索（仅管理员）。
   *
   * 与员工端搜索的区别：
   *   · 默认只搜真实顾客，打开开关才带出 ADMIN / STAFF（内部测试单）；
   *   · 返回 `role` / `isInternal`，页面能明确标出内部账号；
   *   · 每个顾客返回全部狗狗，点一张卡片即可同时选中顾客和狗。
   */
  searchAssistedCustomerDogs: (keyword: string, includeInternal = false) =>
    api.get<{ items: AssistedCustomerDogSearchItem[] }>(
      `${BASE}/customer-dog-search`,
      {
        params: {
          keyword,
          includeInternal: includeInternal ? 'true' : 'false',
        },
      },
    ),

  /** 搜索代客客户（无账号；只返回 isGuest=true） */
  searchGuestCustomers: (keyword?: string) =>
    api.get<{ items: GuestCustomerSearchItem[] }>(`${BASE}/guest-customers`, {
      params: { keyword },
    }),

  /** 新建代客客户（仅管理员） */
  createGuestCustomer: (payload: CreateGuestCustomerPayload) =>
    api.post<{ customerId: string }>(`${BASE}/guest-customers`, payload),

  /** 给代客客户建狗（仅管理员；ownerId 由后端强制为代客客户） */
  createGuestDog: (customerId: string, payload: CreateGuestDogPayload) =>
    api.post<{ dogId: string }>(
      `${BASE}/guest-customers/${encodeURIComponent(customerId)}/dogs`,
      payload,
    ),

  /** 按主人列出狗狗档案（生日/品种/体重用于页面展示与消歧） */
  listCustomerDogs: (ownerId: string) =>
    api.get<AdminDogListResult>('/admin/dogs', {
      params: { ownerId, pageSize: 100 },
    }),

  /**
   * 服务端权威报价（按份数）。
   *
   * 金额只认这个接口；页面不得用 feeAmount × quantity 自行计算。
   */
  getQuote: (quantity: number) =>
    api.get<CustomRecipeQuote>('/custom-recipe/quote', {
      params: { quantity },
    }),

  /**
   * 定制需求选项集。
   *
   * 标签来自平台选项字典，页面不写死中文；目标/当前食物/定制原因/肠胃
   * 四个选项集一次取回。
   */
  getIntakeOptionSets: async (): Promise<CustomRecipeIntakeOptionSets> => {
    const data = (await api.get(
      '/options?sets=custom_recipe_goal,custom_recipe_current_food,custom_recipe_change_reason,custom_recipe_stomach',
    )) as { sets?: CustomRecipeIntakeOptionSets }
    return data?.sets ?? {}
  },

  /**
   * 后台代客下单（仅管理员）。
   *
   * 服务端会重新校验顾客/狗归属、份数、开关并重新报价；页面传的价格
   * 不作为依据。线下收款只登记，不调用微信支付。
   */
  createAssistedOrder: (payload: CreateAssistedOrderPayload) =>
    api.post<AssistedOrderResult>(`${BASE}/orders/assisted`, payload),

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
   * 手工补退款（2026-10-21 · 仅管理员，后端会再拦一次）
   *
   * 只给"已取消、钱已收、退款没成"的历史单用 —— 那时的「取消订单」
   * 按钮已经消失，没有别的入口能把钱退回去。生产单 CR202610201196 即此情况。
   *
   * 后端幂等：已成功/处理中会直接复用原退款记录（`reused=true`），
   * 不会重复打款；没收到钱的单返回 400。
   */
  refundOrder: (orderId: string, reason?: string) =>
    api.post<CustomRecipeRefundResult>(`${BASE}/orders/${orderId}/refund`, {
      reason,
    }),

  /**
   * 线下退款并取消（2026-10-21 · 代客定制食谱订单 Task 5）· 仅管理员。
   *
   * 代客单是**线下收款**，微信里没有这笔支付 —— 这个接口只登记
   * 「金额/方式/备注/操作人/时间」，取消订单并释放名额，**不调用微信退款**。
   *
   * 线上单不要用这里：后端会 400，页面也把线上单的入口保留为原来的
   * 「取消订单 / 补退款」。
   */
  registerOfflineRefund: (orderId: string, payload: OfflineRefundPayload) =>
    api.post<OfflineRefundResult>(
      `${BASE}/orders/${orderId}/offline-refund`,
      payload,
    ),

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

  /**
   * 代客发起调整（2026-10-27）。
   *
   * 顾客不满意但不会/不方便在小程序提单时，员工替顾客开一条调整单，
   * 创建即「已受理」；随后用 `recipeDesignerApi.reopenAftersaleDesign`
   * 打开设计器改稿，改完回售后页「重新交付并完成」。
   *
   * 不占顾客免费次数、不受售后窗口限制 —— 口径由后端保证。
   */
  createStaffAftersale: (
    orderId: string,
    payload: { description: string; deliveryItemIds?: string[] },
  ): Promise<StaffAftersaleResult> =>
    api.post(`${BASE}/orders/${orderId}/aftersales`, payload),

  // ---------- 退款申请（2026-10-25）----------

  listRefundRequests: (
    params?: { status?: string },
  ): Promise<{ items: AdminRefundRequest[] }> =>
    api.get('/admin/custom-recipe/refund-requests', { params }),

  approveRefundRequest: (id: string, payload: { note?: string }) =>
    api.post(`/admin/custom-recipe/refund-requests/${id}/approve`, payload),

  rejectRefundRequest: (id: string, payload: { reason: string }) =>
    api.post(`/admin/custom-recipe/refund-requests/${id}/reject`, payload),

  /** 保存食谱定制设置（仅管理员） */
  updateConfig: (payload: Partial<CustomRecipeConfig>) =>
    api.put<CustomRecipeConfig>(`${BASE}/config`, payload),

  /** 订单统计（列表页顶部卡片） */
  getStatistics: (params?: { dateFrom?: string; dateTo?: string }) =>
    api.get<CustomRecipeStatistics>(`${BASE}/statistics`, { params }),
}

export default customRecipeApi
