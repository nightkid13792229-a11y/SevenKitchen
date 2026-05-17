import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export const FEDIAF_TARGET_LIFE_STAGES = [
  'EARLY_GROWTH_UNDER_14_WEEKS',
  'LATE_GROWTH_FROM_14_WEEKS',
  'REPRODUCTION',
  'ADULT_MER_95',
  'ADULT_MER_110',
] as const;

export const NUTRITION_CALCULATION_BASES = [
  'PER_100G_AS_FED',
  'PER_100G_DRY_MATTER',
  'PER_1000_KCAL_ME',
  'PER_MJ_ME',
] as const;

export type FediafTargetLifeStageDto =
  (typeof FEDIAF_TARGET_LIFE_STAGES)[number];

export type NutritionCalculationBasisDto =
  (typeof NUTRITION_CALCULATION_BASES)[number];

export class FediafTargetQueryDto {
  @ApiProperty({ enum: FEDIAF_TARGET_LIFE_STAGES })
  @IsIn(FEDIAF_TARGET_LIFE_STAGES)
  lifeStage!: FediafTargetLifeStageDto;
}

class RecipeTargetProfileDto {
  @ApiProperty({ enum: FEDIAF_TARGET_LIFE_STAGES })
  @IsIn(FEDIAF_TARGET_LIFE_STAGES)
  lifeStage!: FediafTargetLifeStageDto;
}

class RecipeCalculationItemDto {
  @ApiProperty({ example: 'ingredient-1' })
  @IsString()
  ingredientId!: string;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountG!: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  asFed!: boolean;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  processingYield!: number;
}

class RecipeCalculationOptionsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  includeIncompleteNutrients!: boolean;

  @ApiProperty({ enum: NUTRITION_CALCULATION_BASES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(NUTRITION_CALCULATION_BASES, { each: true })
  basis!: NutritionCalculationBasisDto[];
}

export class RecipeNutritionCalculationRequestDto {
  @ApiProperty({ enum: ['DOG'] })
  @IsIn(['DOG'])
  species!: 'DOG';

  @ApiProperty({ enum: ['FEDIAF_2025_DOG'] })
  @IsIn(['FEDIAF_2025_DOG'])
  standardVersionCode!: 'FEDIAF_2025_DOG';

  @ApiProperty({ type: RecipeTargetProfileDto })
  @ValidateNested()
  @Type(() => RecipeTargetProfileDto)
  targetProfile!: RecipeTargetProfileDto;

  @ApiProperty({ type: [RecipeCalculationItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeCalculationItemDto)
  items!: RecipeCalculationItemDto[];

  @ApiProperty({ type: RecipeCalculationOptionsDto })
  @ValidateNested()
  @Type(() => RecipeCalculationOptionsDto)
  options!: RecipeCalculationOptionsDto;
}

class SupplementStrategyDto {
  @ApiProperty({ example: ['calcium'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  allowedNutrientCodes!: string[];
}

export class AgentRecipeConstraintDto {
  @ApiProperty({ enum: ['FEDIAF_2025_DOG'] })
  @IsIn(['FEDIAF_2025_DOG'])
  standardVersionCode!: 'FEDIAF_2025_DOG';

  @ApiProperty({ enum: FEDIAF_TARGET_LIFE_STAGES })
  @IsIn(FEDIAF_TARGET_LIFE_STAGES)
  targetLifeStage!: FediafTargetLifeStageDto;

  @ApiProperty({ example: ['ingredient-1'], type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  allowedIngredientIds!: string[];

  @ApiProperty({ example: ['ingredient-2'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  excludedIngredientIds!: string[];

  @ApiProperty({ type: SupplementStrategyDto })
  @ValidateNested()
  @Type(() => SupplementStrategyDto)
  supplementStrategy!: SupplementStrategyDto;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDailyCostCny?: number;

  @ApiProperty({ example: true })
  @Equals(true)
  requireHumanReview!: true;
}
