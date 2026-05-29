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
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({ description: 'Medical conditions' })
  @IsArray()
  @IsString({ each: true })
  medicalConditions?: string[];

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  additionalNotes?: string;

  @ApiPropertyOptional({ description: 'Preferred ingredients' })
  @IsArray()
  @IsString({ each: true })
  preferredIngredients?: string[];

  @ApiPropertyOptional({ description: 'Disliked ingredients' })
  @IsArray()
  @IsString({ each: true })
  dislikedIngredients?: string[];

  @ApiPropertyOptional({ description: 'Attachment URLs' })
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];

  @ApiProperty({ description: 'Scheduled date (YYYY-MM-DD)' })
  @IsDateString()
  scheduledDate!: string;

  @ApiProperty({ description: 'Sync to health profile' })
  @IsBoolean()
  syncToHealthProfile!: boolean;
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
