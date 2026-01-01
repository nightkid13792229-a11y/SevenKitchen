/**
 * Recipe Health Tag DTOs
 * DTOs for recipe health tag management
 */

import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

/**
 * Create Recipe Health Tag DTO
 */
export class CreateRecipeHealthTagDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsString()
  color?: string;
}

/**
 * Update Recipe Health Tag DTO
 */
export class UpdateRecipeHealthTagDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsString()
  color?: string;
}

/**
 * Recipe Health Tag Response DTO
 */
export interface RecipeHealthTagResponseDto {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sort: number;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}
