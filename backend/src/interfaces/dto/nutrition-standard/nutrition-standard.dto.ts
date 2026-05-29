import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NutritionStandardEntrySourceType,
  NutritionStandardReviewStatus,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class NutritionStandardEntryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sourceTable?: string;

  @ApiPropertyOptional({ enum: NutritionStandardEntrySourceType })
  @IsOptional()
  @IsEnum(NutritionStandardEntrySourceType)
  sourceType?: NutritionStandardEntrySourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lifeStage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({ enum: NutritionStandardReviewStatus })
  @IsOptional()
  @IsEnum(NutritionStandardReviewStatus)
  reviewStatus?: NutritionStandardReviewStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateNutritionStandardReviewDto {
  @ApiProperty({ enum: NutritionStandardReviewStatus })
  @IsEnum(NutritionStandardReviewStatus)
  status!: NutritionStandardReviewStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
