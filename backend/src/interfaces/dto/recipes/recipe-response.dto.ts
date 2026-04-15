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

  @ApiProperty({ type: [String], enum: RecipeHealthTag })
  targetHealthTags!: RecipeHealthTag[];

  @ApiProperty({ type: [String], enum: LifeStage })
  applicableLifeStages!: LifeStage[];

  @ApiProperty({ type: [Object], description: 'Top 5 ingredients' })
  items!: Array<{
    ingredientId: string;
    name: string;
    ratio: number;
  }>;

  @ApiPropertyOptional({ example: 128 })
  viewCount?: number;

  @ApiPropertyOptional({ example: 56 })
  favoriteCount?: number;

  @ApiPropertyOptional({ example: 23 })
  diyGenCount?: number;
}

export class RecipeDetailDto extends RecipeSummaryDto {
  @ApiProperty({ enum: NutritionStandard })
  nutritionStandard!: NutritionStandard;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ example: 1.07 })
  productionLossRate!: number;

  @ApiPropertyOptional({ example: '七厨房' })
  designSource?: string;

  @ApiPropertyOptional({ description: 'Detailed nutrition data' })
  nutritionDetailedData?: {
    energyDensityKcalPerKg?: number;
    proteinPercent?: number;
    fatPercent?: number;
    ashPercent?: number;
    moisturePercent?: number;
    crudeFiberPercent?: number;
    carbohydratePercent?: number;
    calciumPhosphorusRatio?: string;
  };

  @ApiProperty({
    type: [Object],
    description: 'All ingredients with preparation',
  })
  declare items: Array<{
    id: string;
    ingredientId: string;
    name: string;
    preparationMethod?: string;
    ratio: number;
    sortOrder: number;
    nutrientTargetKey?: string;
    nutrientTargetValue?: number;
    ingredientType?: string;
    ingredient?: {
      id: string;
      name: string;
      type?: string;
      brand?: string;
      productModel?: string;
      purchaseChannel?: string;
      displayUnit?: string;
      imageUrl?: string;
      addTimingLabel?: string;
      purchaseLink?: { url?: string; platform?: string };
      activeNutrients?: Record<string, { value: number; unit: string }>;
      properties?: Record<string, any>;
    };
    supplementAlternativeIngredientIds?: string[];
    supplementAlternatives?: Array<{
      ingredientId: string;
      ingredientName: string;
      ingredient?: {
        id: string;
        name: string;
        type?: string;
        brand?: string;
        productModel?: string;
        purchaseChannel?: string;
        displayUnit?: string;
        imageUrl?: string;
        addTimingLabel?: string;
        purchaseLink?: { url?: string; platform?: string };
        activeNutrients?: Record<string, { value: number; unit: string }>;
        properties?: Record<string, any>;
      };
    }>;
  }>;
}
