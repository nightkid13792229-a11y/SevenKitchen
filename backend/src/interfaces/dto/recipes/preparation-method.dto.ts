/**
 * Preparation Method DTOs
 * DTOs for preparation method management
 */

import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

/**
 * Create Preparation Method DTO
 */
export class CreatePreparationMethodDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sort?: number;
}

/**
 * Update Preparation Method DTO
 */
export class UpdatePreparationMethodDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sort?: number;
}

/**
 * Preparation Method Response DTO
 */
export interface PreparationMethodResponseDto {
  id: string;
  name: string;
  description: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
}
