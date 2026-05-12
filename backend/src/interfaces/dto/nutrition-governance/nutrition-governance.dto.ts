import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NutritionCandidateStatus,
  NutritionMatchConfidence,
  SupplementNutritionDraftStatus,
} from '@prisma/client';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsEnum,
  IsIn,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

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

  @ApiPropertyOptional({ description: '审核队列分组' })
  @IsOptional()
  @IsString()
  reviewGroup?: string;
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

export class ReviewCandidateWithAgentDto {
  @ApiPropertyOptional({ description: '强制重新生成 Agent 审核结果' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ConfirmNutritionCandidateDto {
  @ApiPropertyOptional({
    description: '映射角色',
    enum: ['PRIMARY', 'SECONDARY'],
    default: 'PRIMARY',
  })
  @IsOptional()
  @IsIn(['PRIMARY', 'SECONDARY'])
  mappingRole?: 'PRIMARY' | 'SECONDARY';

  @ApiPropertyOptional({ description: '生熟/干鲜状态' })
  @IsOptional()
  @IsString()
  preparationState?: string | null;

  @ApiPropertyOptional({ description: '状态显示名' })
  @IsOptional()
  @IsString()
  preparationStateLabel?: string | null;

  @ApiPropertyOptional({ description: '可食部/规格显示名' })
  @IsOptional()
  @IsString()
  ediblePortionLabel?: string | null;

  @ApiPropertyOptional({ description: '加工标记显示名' })
  @IsOptional()
  @IsString()
  processingLabel?: string | null;

  @ApiPropertyOptional({ description: '审核备注' })
  @IsOptional()
  @IsString()
  reviewNote?: string | null;

  @ApiPropertyOptional({ description: '是否批量确认模式' })
  @IsOptional()
  @IsBoolean()
  batchMode?: boolean;
}

export class BatchConfirmNutritionCandidatesDto {
  @ApiProperty({ description: '候选ID列表', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  candidateIds!: string[];
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
