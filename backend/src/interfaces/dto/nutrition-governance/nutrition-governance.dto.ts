import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const NUTRITION_PREPARATION_STATE_VALUES = [
  'RAW',
  'COOKED',
  'DRIED',
  'FREEZE_DRIED',
  'AIR_DRIED',
  'POWDER',
  'CANNED',
  'OIL',
  'CONCENTRATE',
  'UNKNOWN',
] as const;

const NUTRITION_EDIBLE_PORTION_LABELS = [
  '标准可食部',
  '整体',
  '肉',
  '胸肉',
  '腿肉',
  '肝脏',
  '去皮',
  '带皮',
  '去骨',
  '带骨',
  '去皮去骨',
  '去壳',
  '带壳',
  '沥干',
  '待确认',
] as const;

const NUTRITION_PROCESSING_LABELS = [
  '未加工',
  '无盐',
  '加盐',
  '未强化',
  '强化',
  '非紫外线照射',
  '紫外线照射',
  '烟熏',
  '冷冻',
  '待确认',
] as const;

const CFCT_LOCAL_LIBRARY_QUEUE_VALUES = [
  'full',
  'auto-ready',
  'needs-review',
] as const;

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

  @ApiPropertyOptional({ description: '按后台标准原料筛选候选' })
  @IsOptional()
  @IsString()
  ingredientId?: string;
}

export class GenerateFoodCandidatesDto {
  @ApiProperty({ description: '采购原料ID' })
  @IsString()
  @IsNotEmpty()
  ingredientId!: string;
}

export class RankFoodCandidatesWithAgentDto {
  @ApiProperty({ description: '后台标准原料ID' })
  @IsString()
  @IsNotEmpty()
  ingredientId!: string;

  @ApiPropertyOptional({
    description: '本次匹配的人工要求，例如状态、部位、排除项。',
  })
  @IsOptional()
  @IsString()
  reviewerRequirement?: string | null;

  @ApiPropertyOptional({
    description:
      '是否启用白名单联网搜索。第一版仅调用 USDA FoodData Central 官方 API。',
  })
  @IsOptional()
  @IsBoolean()
  onlineWhitelistSearch?: boolean;
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

export class ImportCfctReviewedRowDto {
  @ApiProperty({ description: 'CFCT 卷册，例如 第六版 第一册' })
  @IsString()
  @IsNotEmpty()
  volume!: string;

  @ApiProperty({ description: 'PDF 页码或来源页标识' })
  @IsNotEmpty()
  page!: string | number;

  @ApiProperty({ description: '页内行号或来源行标识' })
  @IsNotEmpty()
  row!: string | number;

  @ApiProperty({ description: '审核后的 CFCT 食物名称' })
  @IsString()
  @IsNotEmpty()
  foodName!: string;

  @ApiPropertyOptional({ description: 'CFCT 分类' })
  @IsOptional()
  @IsString()
  category?: string | null;

  @ApiPropertyOptional({ description: 'CFCT 食物编码' })
  @IsOptional()
  @IsString()
  foodCode?: string | null;

  @ApiPropertyOptional({ description: '可食部百分比' })
  @IsOptional()
  ediblePortionPercent?: number | null;

  @ApiPropertyOptional({ description: 'CFCT 原始 kJ 能量值' })
  @IsOptional()
  energyKj?: number | null;

  @ApiProperty({ description: '已审核营养素键值' })
  @IsObject()
  nutrients!: Record<string, number | null | undefined>;

  @ApiPropertyOptional({ description: 'OCR 结构化质量标记，存在标记时不可直接入库' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualityFlags?: string[];

  @ApiPropertyOptional({ description: 'OCR 结构化审核状态' })
  @IsOptional()
  @IsString()
  reviewStatus?: string | null;
}

export class ImportCfctReviewedSourceRowsDto {
  @ApiProperty({
    description: '已审核 CFCT OCR 结构化行',
    type: [ImportCfctReviewedRowDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportCfctReviewedRowDto)
  rows!: ImportCfctReviewedRowDto[];
}

export class GetLocalCfctStructuredLibraryQueryDto {
  @ApiPropertyOptional({
    description: '读取本地 CFCT 中间库队列',
    enum: CFCT_LOCAL_LIBRARY_QUEUE_VALUES,
    default: 'auto-ready',
  })
  @IsOptional()
  @IsIn(CFCT_LOCAL_LIBRARY_QUEUE_VALUES)
  queue?: (typeof CFCT_LOCAL_LIBRARY_QUEUE_VALUES)[number];
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

  @ApiPropertyOptional({
    description: '生熟/干鲜状态标准代码',
    enum: NUTRITION_PREPARATION_STATE_VALUES,
  })
  @IsOptional()
  @IsIn(NUTRITION_PREPARATION_STATE_VALUES)
  preparationState?: string | null;

  @ApiPropertyOptional({ description: '状态显示名' })
  @IsOptional()
  @IsString()
  preparationStateLabel?: string | null;

  @ApiPropertyOptional({
    description: '可食部/规格显示名',
    enum: NUTRITION_EDIBLE_PORTION_LABELS,
  })
  @IsOptional()
  @IsIn(NUTRITION_EDIBLE_PORTION_LABELS)
  ediblePortionLabel?: string | null;

  @ApiPropertyOptional({
    description: '加工标记显示名',
    enum: NUTRITION_PROCESSING_LABELS,
  })
  @IsOptional()
  @IsIn(NUTRITION_PROCESSING_LABELS)
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

export class IngredientCandidateConfigurationEntryDto {
  @ApiProperty({ description: '营养候选ID' })
  @IsString()
  @IsNotEmpty()
  candidateId!: string;

  @ApiProperty({
    description: '映射角色',
    enum: ['PRIMARY', 'SECONDARY'],
  })
  @IsIn(['PRIMARY', 'SECONDARY'])
  mappingRole!: 'PRIMARY' | 'SECONDARY';

  @ApiPropertyOptional({
    description: '生熟/干鲜状态标准代码',
    enum: NUTRITION_PREPARATION_STATE_VALUES,
  })
  @IsOptional()
  @IsIn(NUTRITION_PREPARATION_STATE_VALUES)
  preparationState?: string | null;

  @ApiPropertyOptional({ description: '状态显示名' })
  @IsOptional()
  @IsString()
  preparationStateLabel?: string | null;

  @ApiPropertyOptional({
    description: '可食部/规格显示名',
    enum: NUTRITION_EDIBLE_PORTION_LABELS,
  })
  @IsOptional()
  @IsIn(NUTRITION_EDIBLE_PORTION_LABELS)
  ediblePortionLabel?: string | null;

  @ApiPropertyOptional({
    description: '加工标记显示名',
    enum: NUTRITION_PROCESSING_LABELS,
  })
  @IsOptional()
  @IsIn(NUTRITION_PROCESSING_LABELS)
  processingLabel?: string | null;

  @ApiPropertyOptional({ description: '审核备注' })
  @IsOptional()
  @IsString()
  reviewNote?: string | null;
}

export class ApplyIngredientCandidateConfigurationDto {
  @ApiProperty({ description: '后台标准原料ID' })
  @IsString()
  @IsNotEmpty()
  ingredientId!: string;

  @ApiProperty({
    description: '本原料要保存的主档案和次级档案',
    type: [IngredientCandidateConfigurationEntryDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => IngredientCandidateConfigurationEntryDto)
  entries!: IngredientCandidateConfigurationEntryDto[];
}

export class BatchConfirmNutritionCandidatesDto {
  @ApiProperty({ description: '候选ID列表', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  candidateIds!: string[];
}

export class UpdateAgentSettingsDto {
  @ApiPropertyOptional({ description: '是否启用 DeepSeek Agent' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'DeepSeek API Base URL' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  baseUrl?: string;

  @ApiPropertyOptional({ description: 'DeepSeek 模型名' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @ApiPropertyOptional({
    description: 'DeepSeek 复核模型名，用于营养校验、复杂来源或人工升级复核',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reviewModel?: string;

  @ApiPropertyOptional({
    description: 'DeepSeek API Key。留空则保留现有密钥。',
  })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({ description: '是否清除现有 API Key' })
  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;

  @ApiPropertyOptional({ description: '最大并发数', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxConcurrency?: number;

  @ApiPropertyOptional({
    description: '请求超时时间，毫秒',
    minimum: 5000,
    maximum: 300000,
  })
  @IsOptional()
  @IsInt()
  @Min(5000)
  @Max(300000)
  requestTimeoutMs?: number;

  @ApiPropertyOptional({ description: '重试次数', minimum: 0, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  retryCount?: number;
}

export class BatchAgentReviewCandidatesDto {
  @ApiPropertyOptional({ description: '最大处理数量', minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ description: '是否覆盖已有 Agent 建议' })
  @IsOptional()
  @IsBoolean()
  forceRerun?: boolean;

  @ApiPropertyOptional({
    description: '匹配置信度过滤',
    enum: NutritionMatchConfidence,
  })
  @IsOptional()
  @IsEnum(NutritionMatchConfidence)
  confidence?: NutritionMatchConfidence;

  @ApiPropertyOptional({ description: '审核队列过滤' })
  @IsOptional()
  @IsString()
  reviewGroup?: string;
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
