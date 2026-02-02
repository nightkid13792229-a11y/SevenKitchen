/**
 * DTOs for production task printing
 */

import { IsString, IsNumber, IsArray, IsOptional, IsObject } from 'class-validator';

export class PrintTaskOrderItemDto {
  @IsNumber()
  packageSpecG: number;

  @IsNumber()
  packageCount: number;

  @IsString()
  dogName: string;

  @IsString()
  @IsOptional()
  recipientName?: string;

  @IsString()
  @IsOptional()
  recipientCity?: string;
}

export class PrintTaskIngredientDto {
  @IsString()
  name: string;

  @IsString()
  amount: string;

  @IsString()
  unit: string;

  @IsString()
  typeLabel: string;

  @IsString()
  typeClass: string;

  @IsString()
  @IsOptional()
  method?: string;

  @IsOptional()
  isTotalWeight?: boolean;
}

export class PrintTaskDto {
  @IsString()
  recipeName: string;

  @IsString()
  recipeVersion: string;

  @IsNumber()
  currentPotNumber: number;

  @IsNumber()
  totalPots: number;

  @IsString()
  status: string;

  @IsNumber()
  totalProductionG: number;

  @IsString()
  createdAt: string;

  @IsString()
  @IsOptional()
  completedAt?: string;

  @IsArray()
  orderItems: PrintTaskOrderItemDto[];

  @IsArray()
  parsedIngredients: PrintTaskIngredientDto[];

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class PrintTaskResponseDto {
  success: boolean;
  message: string;
  data?: {
    pdfUrl: string;
    estimatedTime: string;
  };
}
