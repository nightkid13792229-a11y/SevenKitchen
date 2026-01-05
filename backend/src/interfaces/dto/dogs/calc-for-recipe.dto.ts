/**
 * Calc Dog For Recipe DTO
 * DTO for calculating dog's daily food intake for a specific recipe
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class CalcDogForRecipeDto {
  @ApiProperty({
    description: 'Recipe ID',
    example: '13f28dfe-42f3-4b73-a906-621096b84dfc'
  })
  @IsUUID()
  @IsNotEmpty()
  recipeId!: string;
}

export interface CalcDogForRecipeResponse {
  rer: number;
  totalDer: number;
  finalFoodKcal: number;
  treatDeduction: number;
  isTreatCapped: boolean;
  dailyIntakeG: number;
  perMealIntakeG: number;
  mealsPerDay: number;
  calcDetails: Record<string, any>;
}
