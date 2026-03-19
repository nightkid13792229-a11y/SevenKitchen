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

export interface CreateCustomRecipeOrderDTO {
  customerId: string;
  dogId: string;
  targetGoal: TargetGoal;
  allergies: string[];
  medicalConditions: string[];
  additionalNotes?: string;
  preferredIngredients: string[];
  dislikedIngredients: string[];
  attachmentUrls?: string[];
  scheduledDate: Date;
  syncToHealthProfile: boolean;
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
