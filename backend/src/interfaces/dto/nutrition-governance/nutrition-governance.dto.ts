import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NutritionCandidateStatus,
  NutritionMatchConfidence,
  SupplementNutritionDraftStatus,
} from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ListNutritionCandidatesQueryDto {
  @ApiPropertyOptional({
    description: '候选状态',
    enum: NutritionCandidateStatus,
  })
  @IsOptional()
  @IsEnum(NutritionCandidateStatus)
  status?: NutritionCandidateStatus;

  @ApiPropertyOptional({
    description: '匹配置信度',
    enum: NutritionMatchConfidence,
  })
  @IsOptional()
  @IsEnum(NutritionMatchConfidence)
  confidence?: NutritionMatchConfidence;
}

export class GenerateFoodCandidatesDto {
  @ApiProperty({ description: '采购原料ID' })
  @IsString()
  @IsNotEmpty()
  ingredientId!: string;
}

export class ImportUsdaSourceDto {
  @ApiProperty({ description: 'USDA FoodData Central FDC ID' })
  @IsString()
  @IsNotEmpty()
  fdcId!: string;

  @ApiPropertyOptional({
    description: '可选。选中后台食材后，导入同时为该食材生成高置信候选。',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ingredientId?: string;
}

export class ListSupplementDraftsQueryDto {
  @ApiPropertyOptional({
    description: '补剂草稿状态',
    enum: SupplementNutritionDraftStatus,
  })
  @IsOptional()
  @IsEnum(SupplementNutritionDraftStatus)
  status?: SupplementNutritionDraftStatus;

  @ApiPropertyOptional({ description: '补剂原料ID' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ingredientId?: string;
}
