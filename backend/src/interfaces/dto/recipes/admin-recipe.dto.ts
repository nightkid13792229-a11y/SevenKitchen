/**
 * Admin Recipe DTOs
 * DTOs for recipe management operations in admin panel
 */

import { IsString, IsNumber, IsEnum, IsOptional, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RecipeStatus, RecipeHealthTag, LifeStage, NutritionStandard } from '../../../domain/recipe/enums';
import type { NutritionDetailedData } from '../../../domain/recipe/types';

/**
 * Recipe Item DTO (for create/update)
 */
export class RecipeItemDto {
  @IsString()
  ingredientId!: string;

  @IsOptional()
  @IsString()
  preparationMethod?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  exampleWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ratioPercent?: number;

  @IsOptional()
  @IsString()
  nutrientTargetKey?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  nutrientTargetValue?: number;
}

/**
 * Create Recipe DTO
 */
export class CreateRecipeDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  detailImages?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  designSource?: string;

  @IsString()
  nutritionStandard!: string;

  @IsNumber()
  @Min(0)
  energyDensityKcalPerKg!: number;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  items?: RecipeItemDto[];

  @IsOptional()
  nutritionDetailedData?: NutritionDetailedData;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetHealthTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableLifeStages?: string[];

  @IsOptional()
  @IsString()
  productionSteps?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  productionLossRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  batchLaborHours?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

/**
 * Update Recipe DTO
 */
export class UpdateRecipeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  detailImages?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  designSource?: string;

  @IsOptional()
  @IsString()
  nutritionStandard?: any;

  @IsOptional()
  @IsNumber()
  @Min(0)
  energyDensityKcalPerKg?: number;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  items?: RecipeItemDto[];

  @IsOptional()
  nutritionDetailedData?: NutritionDetailedData;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetHealthTags?: any[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableLifeStages?: any[];

  @IsOptional()
  @IsString()
  productionSteps?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  productionLossRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  batchLaborHours?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

/**
 * Recipe Query DTO
 */
export class RecipeQueryDto {
  @IsOptional()
  @IsString()
  status?: any;

  @IsOptional()
  @IsEnum(LifeStage)
  lifeStage?: LifeStage;

  @IsOptional()
  @IsEnum(RecipeHealthTag)
  healthTag?: RecipeHealthTag;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  pageSize?: number;
}

/**
 * Recipe Summary Response DTO
 */
export interface RecipeSummaryResponseDto {
  id: string;
  name: string;
  version: number;
  status: RecipeStatus;
  coverImageUrl?: string;
  energyDensityKcalPerKg: number;
  applicableLifeStages: LifeStage[];
  targetHealthTags: RecipeHealthTag[];
  salesCount: number;
  diyGenCount: number;
  likeCount: number;
  favoriteCount: number;
  designSource?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Recipe Detail Response DTO
 */
export interface RecipeDetailResponseDto extends RecipeSummaryResponseDto {
  detailImages?: string[];
  videoUrl?: string;
  description?: string;
  designSource?: string;
  nutritionStandard: NutritionStandard;
  nutritionDetailedData?: NutritionDetailedData;
  productionSteps?: string;
  productionLossRate: number;
  batchLaborHours?: number;
  items: RecipeItemResponseDto[];
}

/**
 * Recipe Item Response DTO
 */
export interface RecipeItemResponseDto {
  id: string;
  ingredientId: string;
  ingredientName?: string;
  ingredientType?: string;
  preparationMethod?: string;
  exampleWeight?: number;
  ratioPercent?: number;
  nutrientTargetKey?: string;
  nutrientTargetValue?: number;
}

/**
 * Paginated Recipe List Response
 */
export interface RecipeListResponseDto {
  data: RecipeSummaryResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Upload Image Response DTO
 */
export interface UploadImageResponseDto {
  url: string;
  key: string;
}
