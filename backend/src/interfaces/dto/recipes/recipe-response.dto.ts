/**
 * Recipe Response DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RecipeStatus,
  NutritionStandard,
  RecipeHealthTag,
  LifeStage,
} from '../../../domain';

export class RecipeSummaryDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ example: '牛肉鲜食套餐' })
  name!: string;

  @ApiProperty({ enum: RecipeStatus })
  status!: RecipeStatus;

  @ApiProperty({ example: 1450 })
  energyDensityKcalPerKg!: number;

  @ApiPropertyOptional({ example: 'https://example.com/cover.jpg' })
  coverImageUrl?: string;
}

export class RecipeDetailDto extends RecipeSummaryDto {
  @ApiProperty({ enum: NutritionStandard })
  nutritionStandard!: NutritionStandard;

  @ApiProperty({ type: [String], enum: RecipeHealthTag })
  targetHealthTags!: RecipeHealthTag[];

  @ApiProperty({ type: [String], enum: LifeStage })
  applicableLifeStages!: LifeStage[];

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ example: 1.07 })
  productionLossRate!: number;
}
