/**
 * Nutrition Food DTOs
 * Data Transfer Objects for nutrition food module
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsObject,
  IsBoolean,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { NutritionFoodCategory, NutritionFoodStatus } from '@prisma/client';

// === 创建请求 ===

export class CreateNutritionFoodDto {
  @ApiProperty({ description: '食材名称' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: '英文名称' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ description: '正式中文展示名' })
  @IsOptional()
  @IsString()
  displayNameZh?: string;

  @ApiProperty({ description: '分类', enum: NutritionFoodCategory })
  @IsEnum(NutritionFoodCategory)
  category!: NutritionFoodCategory;

  @ApiProperty({ description: '数据来源', example: 'USDA' })
  @IsString()
  dataSource!: string;

  @ApiPropertyOptional({ description: '制备/加工状态编码', example: 'COOKED' })
  @IsOptional()
  @IsString()
  preparationState?: string;

  @ApiPropertyOptional({ description: '制备/加工状态展示名', example: '熟重' })
  @IsOptional()
  @IsString()
  preparationStateLabel?: string;

  @ApiPropertyOptional({ description: '可食部/规格', example: '带皮' })
  @IsOptional()
  @IsString()
  ediblePortionLabel?: string;

  @ApiPropertyOptional({ description: '加工标记', example: '未加工' })
  @IsOptional()
  @IsString()
  processingLabel?: string;

  @ApiPropertyOptional({ description: '外部ID（如USDA FDC ID）' })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiProperty({ description: '营养数据（每100g）' })
  @IsObject()
  nutritionData!: Record<string, number>;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// === 更新请求 ===

export class UpdateNutritionFoodDto {
  @ApiPropertyOptional({ description: '英文名称' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ description: '正式中文展示名，空字符串表示清空' })
  @IsOptional()
  @IsString()
  displayNameZh?: string;

  @ApiPropertyOptional({ description: '分类', enum: NutritionFoodCategory })
  @IsOptional()
  @IsEnum(NutritionFoodCategory)
  category?: NutritionFoodCategory;

  @ApiPropertyOptional({ description: '制备/加工状态编码', example: 'COOKED' })
  @IsOptional()
  @IsString()
  preparationState?: string;

  @ApiPropertyOptional({ description: '制备/加工状态展示名', example: '熟重' })
  @IsOptional()
  @IsString()
  preparationStateLabel?: string;

  @ApiPropertyOptional({ description: '可食部/规格', example: '带皮' })
  @IsOptional()
  @IsString()
  ediblePortionLabel?: string;

  @ApiPropertyOptional({ description: '加工标记', example: '未加工' })
  @IsOptional()
  @IsString()
  processingLabel?: string;

  @ApiPropertyOptional({ description: '营养数据（每100g）' })
  @IsOptional()
  @IsObject()
  nutritionData?: Record<string, number>;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateNutritionFoodMappingDto {
  @ApiPropertyOptional({ description: '出肉率', default: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  yieldRate?: number;

  @ApiPropertyOptional({ description: '是否为主要映射' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// === 创建映射请求 ===

export class CreateNutritionFoodMappingDto {
  @ApiProperty({ description: '采购原料ID' })
  @IsString()
  ingredientId!: string;

  @ApiPropertyOptional({ description: '出肉率', default: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  yieldRate?: number;

  @ApiPropertyOptional({ description: '是否为主要映射', default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// === 响应 ===

export class NutritionFoodMappingResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  nutritionFoodId!: string;

  @ApiProperty()
  ingredientId!: string;

  @ApiProperty()
  yieldRate!: number;

  @ApiProperty()
  isPrimary!: boolean;

  @ApiPropertyOptional()
  notes?: string;

  @ApiPropertyOptional({ description: '关联的采购原料信息' })
  ingredient?: {
    id: string;
    name: string;
    type: string;
    purchaseUnit: string;
  };
}

export class NutritionFoodResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  nameEn?: string;

  @ApiPropertyOptional()
  displayNameZh?: string;

  @ApiPropertyOptional()
  displayNameZhSource?: string;

  @ApiPropertyOptional()
  displayNameZhReviewedAt?: Date;

  @ApiPropertyOptional()
  displayNameZhReviewedBy?: string;

  @ApiProperty({ enum: NutritionFoodCategory })
  category!: NutritionFoodCategory;

  @ApiProperty()
  dataSource!: string;

  @ApiPropertyOptional()
  preparationState?: string;

  @ApiPropertyOptional()
  preparationStateLabel?: string;

  @ApiPropertyOptional()
  ediblePortionLabel?: string;

  @ApiPropertyOptional()
  processingLabel?: string;

  @ApiPropertyOptional()
  externalId?: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ enum: NutritionFoodStatus })
  status!: NutritionFoodStatus;

  @ApiProperty()
  nutritionData!: Record<string, any>;

  @ApiPropertyOptional()
  notes?: string;

  @ApiPropertyOptional()
  createdBy?: string;

  @ApiPropertyOptional()
  verifiedBy?: string;

  @ApiPropertyOptional()
  verifiedAt?: Date;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ description: '关联的采购原料映射' })
  mappings?: NutritionFoodMappingResponseDto[];
}

export class USDAFoodSearchResultDto {
  @ApiProperty()
  fdcId!: string;

  @ApiProperty()
  description!: string;

  @ApiPropertyOptional()
  scientificName?: string;

  @ApiProperty()
  dataType!: string;

  @ApiPropertyOptional()
  foodCategory?: string;

  @ApiPropertyOptional()
  brandOwner?: string;
}

export class PaginatedNutritionFoodResponseDto {
  @ApiProperty({ type: [NutritionFoodResponseDto] })
  data!: NutritionFoodResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  hasMore!: boolean;
}
