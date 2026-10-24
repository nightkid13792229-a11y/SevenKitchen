import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PRODUCTION_STEP_LIMITS } from '../../../domain/recipe-designer/production-steps';
import { ORDERED_RECIPE_SERIES_LIFE_STAGES } from '../../../domain/recipe/recipe-series';

/**
 * 产品线分阶段发布允许配置的生命阶段代码（2026-10-22）。
 * 与设计器阶段、`RecipeSeriesLifeStage` 完全一致，避免前端自造代码。
 */
export const RECIPE_SERIES_RELEASE_STAGE_CODES = [
  ...ORDERED_RECIPE_SERIES_LIFE_STAGES,
];

export const RECIPE_DESIGNER_SCENARIOS = [
  'EARLY_GROWTH_REPRODUCTION',
  'REPRODUCTION',
  'LATE_GROWTH',
  'ADULT_MER_110',
  'ADULT_MER_95',
] as const;

export const ASSESSMENT_EXPRESSION_BASES = [
  'PER_1000_KCAL_ME',
  'PER_MJ_ME',
  'PER_100G_DRY_MATTER',
  'RATIO',
] as const;

export type RecipeDesignerScenario = (typeof RECIPE_DESIGNER_SCENARIOS)[number];
export type AssessmentExpressionBasisDto =
  (typeof ASSESSMENT_EXPRESSION_BASES)[number];

export const RECIPE_DESIGNER_SERIES_STATUS_FILTERS = [
  'DRAFT',
  'PUBLIC',
  'PRIVATE_CUSTOM',
] as const;

export const RECIPE_DESIGNER_DESIGN_MODES = ['CATALOG', 'ORDER'] as const;

export type RecipeDesignerSeriesStatusFilter =
  (typeof RECIPE_DESIGNER_SERIES_STATUS_FILTERS)[number];

export const RECIPE_DESIGNER_SERIES_STAGE_STATUSES = [
  'NOT_DESIGNED',
  'MODIFIED',
  'SUBMITTED',
  'PUBLISHED',
  'PRIVATE_CUSTOM',
] as const;

export type RecipeDesignerSeriesStageStatus =
  (typeof RECIPE_DESIGNER_SERIES_STAGE_STATUSES)[number];

/** 订单设计模板来源：橱窗食谱 / 私密定制食谱 / 两者都要。 */
export const RECIPE_TEMPLATE_KINDS = ['ALL', 'CATALOG', 'CUSTOM'] as const;

export type RecipeTemplateKind = (typeof RECIPE_TEMPLATE_KINDS)[number];

export class ListRecipeTemplatesDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(RECIPE_TEMPLATE_KINDS)
  kind?: RecipeTemplateKind;
}

/**
 * 订单绑定食谱设计（2026-10-22 · Task 3）：从已有食谱模板创建订单草稿。
 */
export class CreateOrderDesignFromTemplateDto {
  /** 模板食谱版本行主键 `recipe.id` */
  @IsString()
  sourceRecipeId!: string;

  /** 可选自定义名称；不填则用「{狗名}定制 · {模板名}」 */
  @IsOptional()
  @IsString()
  name?: string;
}

export class ListRecipeDesignerSeriesDto {
  @IsOptional()
  @IsIn(RECIPE_DESIGNER_SERIES_STATUS_FILTERS)
  status?: RecipeDesignerSeriesStatusFilter;

  /** 列表上下文：默认产品线；ORDER = 订单定制食谱 */
  @IsOptional()
  @IsIn(RECIPE_DESIGNER_DESIGN_MODES)
  designMode?: (typeof RECIPE_DESIGNER_DESIGN_MODES)[number];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

export class CreateRecipeSeriesDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(RECIPE_DESIGNER_SCENARIOS)
  scenario?: RecipeDesignerScenario;

  @IsOptional()
  @IsString()
  dogId?: string;

  @IsOptional()
  @IsString()
  referenceDogId?: string;
}

export const PRIVATE_RECIPE_SNAPSHOT_TARGETS = ['ORDER', 'DIY'] as const;

export type PrivateRecipeSnapshotTarget =
  (typeof PRIVATE_RECIPE_SNAPSHOT_TARGETS)[number];

export class CreatePrivateRecipeSnapshotDto {
  @IsIn(PRIVATE_RECIPE_SNAPSHOT_TARGETS)
  target!: PrivateRecipeSnapshotTarget;
}

export class RenameRecipeSeriesDto {
  @IsString()
  name!: string;
}

export class DeleteRecipeSeriesDto {
  @IsString()
  confirmName!: string;

  @IsBoolean()
  confirmUserVisibleRemoval!: boolean;
}

export class SetRecipeSeriesReferenceDogDto {
  @IsOptional()
  @IsString()
  referenceDogId?: string | null;
}

export class UpdateDogDesignNotesDto {
  @IsOptional()
  @IsString()
  allergyFoods?: string | null;

  @IsOptional()
  @IsString()
  pickyFoods?: string | null;

  @IsOptional()
  @IsString()
  preferredFoods?: string | null;

  @IsOptional()
  @IsString()
  medicalHistory?: string | null;
}

export class BatchReorderDesignItemsDto {
  @IsArray()
  order!: Array<{ id: string; sortOrder: number }>;
}

export class AiDesignSuggestDto {
  @IsOptional()
  @IsString()
  draftId?: string;
}

export class AiNutritionPlanGenerateDto {
  @IsOptional()
  @IsString()
  draftId?: string;

  @IsOptional()
  @IsString()
  userNotes?: string;
}

export class AiNutritionPlanAcceptDto {
  @IsBoolean()
  accepted!: boolean;

  @IsOptional()
  @IsString()
  note?: string | null;

  /** 修改后的营养方案（与生成结果结构一致；不传则沿用当前方案） */
  @IsOptional()
  plan?: Record<string, unknown> | null;
}

export class CreateRecipeSeriesStageDraftDto {
  @IsIn(RECIPE_DESIGNER_SCENARIOS)
  scenario!: RecipeDesignerScenario;

  @IsOptional()
  @IsString()
  sourceDraftId?: string;
}

export class CopyRecipeSeriesStageIngredientsDto {
  @IsString()
  sourceLifeStage!: string;
}

export const SUPPLEMENT_NUTRITION_BASIS_TYPES = [
  'PER_1_G',
  'PER_100_G',
  'PER_1_ML',
  'PER_100_ML',
  'PER_SERVING',
] as const;

export type SupplementNutritionBasisType =
  (typeof SUPPLEMENT_NUTRITION_BASIS_TYPES)[number];

export const SUPPLEMENT_USAGE_UNITS = [
  'g',
  'ml',
  '粒',
  '片',
  '胶囊',
  '平勺',
  '份',
] as const;

export type SupplementUsageUnit = (typeof SUPPLEMENT_USAGE_UNITS)[number];

export class ListRecipeDesignerIngredientOptionsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['FOOD', 'SUPPLEMENT'])
  type?: 'FOOD' | 'SUPPLEMENT';

  @IsOptional()
  @IsString()
  nutrientKey?: string;

  @IsOptional()
  @IsIn(RECIPE_DESIGNER_SCENARIOS)
  scenario?: RecipeDesignerScenario;

  @IsOptional()
  @IsIn(ASSESSMENT_EXPRESSION_BASES)
  expressionBasis?: AssessmentExpressionBasisDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;
}

export class CreateRecipeDesignDraftDto {
  @IsString()
  name!: string;

  @IsIn(RECIPE_DESIGNER_SCENARIOS)
  scenario!: RecipeDesignerScenario;

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
  notes?: string;
}

export class CreateRecipeDesignerSupplementOptionDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  profileName?: string;

  @IsOptional()
  @IsIn(SUPPLEMENT_NUTRITION_BASIS_TYPES)
  basisType?: SupplementNutritionBasisType;

  @IsOptional()
  @IsIn(SUPPLEMENT_USAGE_UNITS)
  usageUnit?: SupplementUsageUnit;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  servingWeightG?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  densityGPerMl?: number;

  @IsObject()
  nutrients!: Record<string, number | string | null | undefined>;
}

export class UpdateRecipeDesignDraftDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(RECIPE_DESIGNER_SCENARIOS)
  scenario?: RecipeDesignerScenario;

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
  notes?: string | null;
}

/** 产品展示字段长度限制（与数据库 VarChar 定义保持一致）。 */
export const RECIPE_PRESENTATION_LIMITS = {
  coverTitle: 20,
  sellingPoint: 200,
  description: 4000,
} as const;

/**
 * 草稿产品展示（2026-10-22）。
 *
 * 全部字段可选，patch semantics：没传的字段保持原值，显式 null 表示清空。
 * 长度限制在这里拦住明显超限的请求，服务端保存时再统一 +1 contentRevision。
 */
export class UpdateRecipeDesignPresentationDto {
  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RECIPE_PRESENTATION_LIMITS.coverTitle)
  coverTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RECIPE_PRESENTATION_LIMITS.description)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RECIPE_PRESENTATION_LIMITS.sellingPoint)
  sellingPoint?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  detailImages?: string[] | null;

  @IsOptional()
  @IsString()
  videoUrl?: string | null;
}

/**
 * 产品线发布设置（2026-10-22 · 两阶段发布）。
 *
 * 阶段设计只以 `Recipe.status=DRAFT` 存入系列仓库；展示资料与必填阶段
 * 统一在系列上维护，保存后由 `release-readiness` 重新评估。
 *
 * 全部字段可选（patch semantics）：没传的字段保持原值，显式 null 表示清空。
 */
export class UpdateRecipeSeriesReleaseSettingsDto {
  /** 必填生命阶段；按系统固定顺序保存，非法代码直接 400 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(RECIPE_SERIES_RELEASE_STAGE_CODES.length)
  @IsString({ each: true })
  requiredLifeStages?: string[];

  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RECIPE_PRESENTATION_LIMITS.coverTitle)
  coverTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RECIPE_PRESENTATION_LIMITS.sellingPoint)
  sellingPoint?: string | null;

  /** 目标健康标签（健康标签 id）；为空时只提醒，不阻断发布 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  targetHealthTags?: string[];
}

/**
 * 补剂目标营养素（2026-10-22 · Task 3）。
 *
 * 一个目标永远只对应一个 `fieldPath`；组合用派生字段（如 `derived.epaDha`）。
 * `targetValuePerKg` 是服务端算出的添加浓度缓存，客户端可回传但不会被信任，
 * 服务端始终按当前配方重新计算。
 */
export class RecipeDesignSupplementTargetDto {
  @IsOptional()
  @IsString()
  fieldPath?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  targetValuePerKg?: number;
}

/** 原料预处理来源：AUTO = 系统默认带出；MANUAL = 人工修改。 */
export const RECIPE_PREPARATION_SOURCES = ['AUTO', 'MANUAL'] as const;

export type RecipePreparationSource =
  (typeof RECIPE_PREPARATION_SOURCES)[number];

export const RECIPE_PREPARATION_NOTE_MAX_LENGTH = 500;

export class AddRecipeDesignItemDto {
  @IsOptional()
  @IsString()
  ingredientId?: string;

  @IsString()
  nutritionFoodId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightG!: number;

  @IsOptional()
  @IsString()
  preparationMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(RECIPE_PREPARATION_NOTE_MAX_LENGTH)
  preparationNote?: string;

  @IsOptional()
  @IsIn(RECIPE_PREPARATION_SOURCES)
  preparationSource?: RecipePreparationSource;

  @IsOptional()
  @IsString()
  nutrientTargetKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  nutrientTargetValue?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeDesignSupplementTargetDto)
  supplementTargets?: RecipeDesignSupplementTargetDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  includeInAssessment?: boolean;
}

export class UpdateRecipeDesignItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightG?: number;

  @IsOptional()
  @IsString()
  preparationMethod?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RECIPE_PREPARATION_NOTE_MAX_LENGTH)
  preparationNote?: string | null;

  @IsOptional()
  @IsIn(RECIPE_PREPARATION_SOURCES)
  preparationSource?: RecipePreparationSource | null;

  @IsOptional()
  @IsString()
  nutrientTargetKey?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  nutrientTargetValue?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeDesignSupplementTargetDto)
  supplementTargets?: RecipeDesignSupplementTargetDto[] | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  includeInAssessment?: boolean;
}

/**
 * 替换草稿原料（2026-10-24 · P0b-2b）。
 *
 * 换入新营养档案时保留旧项的排序、是否参与评估和预处理；
 * 只有显式传入的字段才覆盖旧值。
 */
export class ReplaceRecipeDesignItemDto {
  @IsString()
  nutritionFoodId!: string;

  @IsOptional()
  @IsString()
  ingredientId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightG?: number;

  @IsOptional()
  @IsString()
  preparationMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(RECIPE_PREPARATION_NOTE_MAX_LENGTH)
  preparationNote?: string | null;

  @IsOptional()
  @IsIn(RECIPE_PREPARATION_SOURCES)
  preparationSource?: RecipePreparationSource | null;
}

export class ReorderRecipeDesignItemDto {
  @IsString()
  id!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder!: number;
}

export class ReorderRecipeDesignItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderRecipeDesignItemDto)
  items!: ReorderRecipeDesignItemDto[];
}

export class UpdateRecipeDesignItemOrderDto {
  @IsArray()
  @IsString({ each: true })
  itemIds!: string[];
}

/**
 * 结构化制作步骤（2026-10-22 · Task 4）。
 *
 * `sortOrder` 从 1 开始、同一草稿内唯一，数组按升序提交；
 * 操作说明必填，时间/温度/设备可选。
 */
export class RecipeProductionStepDto {
  @Type(() => Number)
  @IsInt()
  @Min(PRODUCTION_STEP_LIMITS.minSortOrder)
  @Max(PRODUCTION_STEP_LIMITS.maxSortOrder)
  sortOrder!: number;

  @IsString()
  @MaxLength(PRODUCTION_STEP_LIMITS.maxInstructionLength)
  instruction!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(PRODUCTION_STEP_LIMITS.maxDurationMinutes)
  durationMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(PRODUCTION_STEP_LIMITS.minTemperatureC)
  @Max(PRODUCTION_STEP_LIMITS.maxTemperatureC)
  temperatureC?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCTION_STEP_LIMITS.maxEquipmentLength)
  equipment?: string | null;
}

export class UpdateRecipeProductionStepsDto {
  @IsArray()
  @ArrayMaxSize(PRODUCTION_STEP_LIMITS.maxSteps)
  @ValidateNested({ each: true })
  @Type(() => RecipeProductionStepDto)
  steps!: RecipeProductionStepDto[];
}

export class PublishRecipeDesignDraftDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  reviewNote?: string;
}
