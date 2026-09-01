import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

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

export class ListRecipeDesignerSeriesDto {
  @IsOptional()
  @IsIn(RECIPE_DESIGNER_SERIES_STATUS_FILTERS)
  status?: RecipeDesignerSeriesStatusFilter;

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
  nutrientTargetKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  nutrientTargetValue?: number;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  supplementTargets?: Array<Record<string, unknown>>;

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
  nutrientTargetKey?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  nutrientTargetValue?: number | null;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  supplementTargets?: Array<Record<string, unknown>> | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  includeInAssessment?: boolean;
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

export class PublishRecipeDesignDraftDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  reviewNote?: string;
}
