import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const RECIPE_DESIGNER_SCENARIOS = [
  'EARLY_GROWTH_REPRODUCTION',
  'LATE_GROWTH',
  'ADULT_MER_110',
  'ADULT_MER_95',
] as const;

export type RecipeDesignerScenario = (typeof RECIPE_DESIGNER_SCENARIOS)[number];

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
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
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
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}

export class PublishRecipeDesignDraftDto {
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
