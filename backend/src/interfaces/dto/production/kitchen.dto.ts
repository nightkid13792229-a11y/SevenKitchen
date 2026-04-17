/**
 * Kitchen/Production DTOs
 * DTOs for staff production management operations
 */

import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PackagingUnitStatus } from '../../../domain/production/enums';
import type { OrderPackagePlanItemDto } from '../orders/order-response.dto';

/**
 * Auto Schedule Request DTO
 */
export class AutoScheduleDto {
  @IsString()
  startDate!: string; // YYYY-MM-DD format
}

/**
 * Order Packaging Info DTO
 * Per-order packaging information
 */
export class OrderPackagingInfoDto {
  orderId!: string;
  orderItemId!: string;

  dogName!: string;

  @IsNumber()
  packageSpecG!: number; // 单包规格（g）

  @IsNumber()
  packageCount!: number; // 总袋数

  @IsOptional()
  packagePlan?: OrderPackagePlanItemDto[] | null;

  @IsOptional()
  ingredientSourcePlan?: string | null;

  recipientName?: string;
  recipientCity?: string;
  adminRemark?: string;

  @IsOptional()
  completedAt?: string; // 本地时间格式
}

/**
 * Packaging Unit Detail DTO
 */
export class PackagingUnitDetailDto {
  id!: string;

  @IsOptional()
  productionBatchId?: string; // 生产批次ID，用于删除操作

  recipeName!: string;
  recipeVersion!: number;

  @IsNumber()
  totalProductionG!: number;

  @IsEnum(PackagingUnitStatus)
  status!: PackagingUnitStatus;

  @IsArray()
  orderItems!: OrderPackagingInfoDto[];

  // 锅号信息
  @IsNumber()
  currentPotNumber!: number; // 当前是第几锅

  @IsNumber()
  totalPots!: number; // 总共几锅

  // 时间字段（已转换为本地时间）
  createdAt!: string; // 本地时间格式
  completedAt?: string; // 本地时间格式

  @IsOptional()
  photosRaw?: string[]; // 备料照片URL列表

  @IsOptional()
  ingredientsUsageSnapshot?: any; // 原料用量快照

  @IsOptional()
  recipeSnapshot?: any; // 食谱快照（包含原料列表）
}

/**
 * Get Packaging Units Query DTO
 */
export class GetPackagingUnitsDto {
  @IsOptional()
  @IsEnum(PackagingUnitStatus)
  status?: PackagingUnitStatus;

  @IsOptional()
  @Type(() => Number) // 🔧 自动将查询字符串转换为数字类型
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number) // 🔧 自动将查询字符串转换为数字类型
  @IsNumber()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  targetDate?: string; // YYYY-MM-DD format
}

/**
 * Start Production Task DTO
 */
export class StartProductionDto {
  // 预留扩展字段
}

/**
 * Upload Photos Response DTO
 */
export class UploadPhotosResponseDto {
  photosRaw!: string[];
}

/**
 * Complete Production Task DTO
 */
export class CompleteProductionDto {
  @IsOptional()
  @IsString()
  resultStatus?: 'NORMAL' | 'SURPLUS' | 'SHORTAGE';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  surplusG?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shortageG?: number;

  @IsOptional()
  @IsArray()
  resultPhotoUrls?: string[];
}

/**
 * Today's Statistics DTO
 */
export class TodayStatisticsDto {
  @IsNumber()
  todayOrders!: number; // 今日订单数

  @IsNumber()
  inProgress!: number; // 制作中数量

  @IsNumber()
  completed!: number; // 已完成数量
}
