/**
 * Update Task DTO
 * Phase 8.12: Kitchen Task Data Capture MVP
 */

import { IsOptional, IsArray, IsString, IsNumber, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PackagingUnitStatus } from '../../../domain/production';

export class IngredientActualDto {
  @IsString()
  ingredientId!: string;

  @IsNumber()
  actual_g!: number;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsNumber()
  actualWeightG?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngredientActualDto)
  ingredientsActual?: IngredientActualDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photosRaw?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photosCooked?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photosPortioned?: string[];

  @IsOptional()
  @IsEnum(PackagingUnitStatus)
  status?: PackagingUnitStatus;
}

