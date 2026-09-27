/**
 * Custom Recipe DTOs
 * Data Transfer Objects for custom recipe API
 */

import {
  IsString,
  IsArray,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TargetGoal, CustomAttachmentType } from '@prisma/client';

export class SubmitCustomRecipeOrderDTO {
  @ApiProperty({ description: 'Dog ID' })
  @IsString()
  dogId!: string;

  @ApiProperty({ description: 'Target goal', enum: TargetGoal })
  @IsEnum(TargetGoal)
  targetGoal!: TargetGoal;

  @ApiPropertyOptional({ description: 'Allergies' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({ description: 'Medical conditions' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicalConditions?: string[];

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  additionalNotes?: string;

  @ApiPropertyOptional({ description: 'Preferred ingredients' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredIngredients?: string[];

  @ApiPropertyOptional({ description: 'Disliked ingredients' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dislikedIngredients?: string[];

  @ApiPropertyOptional({ description: 'Attachment URLs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];

  @ApiProperty({ description: 'Scheduled date (YYYY-MM-DD)' })
  @IsDateString()
  scheduledDate!: string;

  @ApiProperty({ description: 'Sync to health profile' })
  @IsBoolean()
  syncToHealthProfile!: boolean;

  /**
   * 顾客是否勾选了「需要健康管理」。
   *
   * 2026-09-28 新增：此前小程序把这个勾选折进 targetGoal（改写成 HEALTH_SUPPORT），
   * 于是「减重 + 需要健康管理」会把减重目标**丢掉**。老板口径是
   * 「减重/维持/增重以顾客选的为准」，所以必须分开传。
   */
  @ApiPropertyOptional({ description: 'Needs health management' })
  @IsOptional()
  @IsBoolean()
  needsHealthManagement?: boolean;
}

export class UpdateOrderStatusDTO {
  @ApiProperty({ description: 'New status' })
  @IsString()
  status!: string;
}

export class CreateRecipeDTO {
  @ApiProperty({ description: 'Recipe name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Cover image URL' })
  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'Nutrition target' })
  nutritionTarget?: any;

  @ApiPropertyOptional({ description: 'Recipe items' })
  items?: any[];

  @ApiPropertyOptional({ description: 'Production steps' })
  @IsString()
  @IsOptional()
  productionSteps?: string;

  @ApiPropertyOptional({ description: 'Detail images' })
  @IsArray()
  @IsOptional()
  detailImages?: string[];

  @ApiPropertyOptional({ description: 'Video URL' })
  @IsString()
  @IsOptional()
  videoUrl?: string;

  /**
   * 营养标准。
   *
   * 2026-09-28 修复：后台表单里一直有这个下拉框（FEDIAF_2021 / AAFCO_2019 /
   * GB_T_31216），但它既没进这个 DTO、也没进前端提交的载荷 —— 选了等于没选，
   * 后端永远写死。这里补上，默认取当前在用的 FEDIAF_2025。
   */
  @ApiPropertyOptional({ description: 'Nutrition standard' })
  @IsString()
  @IsOptional()
  nutritionStandard?: string;

}

export class UpdateScheduleDTO {
  @ApiProperty({ description: 'Date from (YYYY-MM-DD)' })
  @IsDateString()
  dateFrom!: string;

  @ApiProperty({ description: 'Date to (YYYY-MM-DD)' })
  @IsDateString()
  dateTo!: string;

  @ApiProperty({ description: 'Capacity per day' })
  capacity!: number;

  @ApiPropertyOptional({ description: 'Skip public holidays' })
  @IsBoolean()
  @IsOptional()
  skipPublicHolidays?: boolean;

  @ApiPropertyOptional({ description: 'Include weekends' })
  @IsBoolean()
  @IsOptional()
  includeWeekends?: boolean;
}

export class ScheduleInfo {
  date!: string;
  isAvailable!: boolean;
  isPublicHoliday!: boolean;
  remainingCapacity!: number;
  bookedCount!: number;
}

export class CustomRecipeOrderResponseDTO {
  orderId!: string;
  dogId!: string;
  dogName!: string;
  targetGoal!: TargetGoal;
  scheduledDate!: string;
  estimatedDeliveryDate?: string;
  status!: string;
  amount!: number;
  recipeId?: string;
  createdAt!: string;
}

export class CustomRecipeOrderDetailResponseDTO extends CustomRecipeOrderResponseDTO {
  customer!: {
    id: string;
    nickname: string;
    phone?: string;
    wechatOpenid?: string;
  };
  dog!: {
    id: string;
    name: string;
    breedName: string;
    age: number;
    currentWeightKg: number;
    bcsScore: number;
    activityLevel: string;
  };
  allergies!: string[];
  medicalConditions!: string[];
  preferredIngredients!: string[];
  dislikedIngredients!: string[];
  additionalNotes?: string;
  attachments!: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    fileType: CustomAttachmentType;
    uploadedAt: string;
  }>;
  paymentConfirmedAt?: string;
  inProgressAt?: string;
  deliveredAt?: string;
}
