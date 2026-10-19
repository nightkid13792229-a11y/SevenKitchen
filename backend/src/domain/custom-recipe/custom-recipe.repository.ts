/**
 * Custom Recipe Repository Interface
 * Defines the contract for custom recipe data access
 */

import { CustomRecipeStatus, TargetGoal } from '@prisma/client';

export interface CustomRecipeScheduleInfo {
  date: Date;
  capacity: number;
  bookedCount: number;
  isAvailable: boolean;
  isPublicHoliday: boolean;
}

/** 本单上传的过敏检测报告草稿（付款后才转正式报告） */
export interface AllergyReportDraftInput {
  attachments?: string[];
  attachmentKeys?: string[];
  testDate?: string | null;
  testMethod?: string | null;
  ocrText?: string | null;
  summary?: string | null;
  results?: Array<{
    allergen: string;
    level?: string | null;
    notes?: string | null;
  }>;
}

export interface CreateCustomRecipeOrderDTO {
  customerId: string;
  dogId: string;
  targetGoal: TargetGoal;
  allergies: string[];
  /** 过敏原自由文本（2026-10-19）：订单快照，设计器显示原文 */
  allergyText?: string | null;
  /** 本单上传的检测报告草稿；付款后才写狗狗档案 */
  allergyReportDrafts?: AllergyReportDraftInput[];
  medicalConditions: string[];
  additionalNotes?: string;
  preferredIngredients: string[];
  dislikedIngredients: string[];
  attachmentUrls?: string[];
  /**
   * 预约（开工）日期。
   *
   * 2026-10-04 起**由系统排**（老板口径 1）：顾客不再自己选日期，
   * 服务端从今天起找最近的可接单工作日并自动占位。
   * 字段保留只为兼容既有调用方，传入的值一律不采信。
   */
  scheduledDate?: Date;
  syncToHealthProfile: boolean;
  /** 顾客是否勾选了「需要健康管理」（与减重/维持/增重相互独立，2026-09-28） */
  needsHealthManagement?: boolean;

  // ===== 2026-10-18 新增：需求 2.3.4「第二段：补充」=====
  /** 顾客对有没有过敏的明确回答（2026-10-19 P0） */
  allergyStatus?: string | null;
  /** 客户端提交幂等键 */
  clientRequestId?: string | null;
  /** 目前在喂什么（code，必填）—— 决定过渡方案怎么写 */
  currentFoodMain?: string | null;
  /** 选「其他」时手填的当前食物 */
  currentFoodOther?: string | null;
  /** 为什么想换（code 数组，必填） */
  changeReasons?: string[];
  /** 选「其他」时手填的原因 */
  changeReasonOther?: string | null;
  /** 最近肠胃情况（code 数组，选填） */
  stomachConditions?: string[];
  /** 选「其他」时手填的肠胃情况 */
  stomachOther?: string | null;
}

export interface UpdateCustomRecipeOrderDTO {
  status?: CustomRecipeStatus;
  paymentConfirmedAt?: Date;
  inProgressAt?: Date;
  deliveredAt?: Date;
  recipeId?: string;
}

export interface CustomRecipeOrderQuery {
  customerId?: string;
  status?: CustomRecipeStatus;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomRecipeStatistics {
  pendingPayment: number;
  inProgress: number;
  delivered: number;
  totalRevenue: number;
}

export interface ICustomRecipeRepository {
  // Order operations
  createOrder(data: CreateCustomRecipeOrderDTO): Promise<any>;
  getOrderById(id: string): Promise<any | null>;
  getOrderByOrderId(orderId: string): Promise<any | null>;
  getOrders(
    query: CustomRecipeOrderQuery,
  ): Promise<{ orders: any[]; total: number }>;
  updateOrder(id: string, data: UpdateCustomRecipeOrderDTO): Promise<any>;
  updateOrderStatus(id: string, status: CustomRecipeStatus): Promise<void>;
  getStatistics(filters?: any): Promise<CustomRecipeStatistics>;

  // Schedule operations
  getSchedule(date: Date): Promise<CustomRecipeScheduleInfo | null>;
  getScheduleRange(
    dateFrom: Date,
    dateTo: Date,
  ): Promise<CustomRecipeScheduleInfo[]>;
  createSchedule(
    date: Date,
    capacity: number,
  ): Promise<CustomRecipeScheduleInfo>;
  updateSchedule(
    date: Date,
    data: Partial<CustomRecipeScheduleInfo>,
  ): Promise<void>;
  checkAvailability(date: Date): Promise<boolean>;
  bookSlot(date: Date): Promise<void>;
  releaseSlot(date: Date): Promise<void>;

  // Attachment operations
  addAttachment(orderId: string, data: any): Promise<any>;
  getAttachments(orderId: string): Promise<any[]>;
  deleteAttachment(id: string): Promise<void>;

  // Health sync operations
  syncToHealthProfile(
    dogId: string,
    allergies: string[],
    medicalConditions: string[],
  ): Promise<void>;
}
