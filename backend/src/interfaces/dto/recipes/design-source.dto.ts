/**
 * Design Source DTOs
 * DTOs for design source management
 */

import { IsString, IsBoolean, IsOptional } from 'class-validator';

/**
 * Create Design Source DTO
 */
export class CreateDesignSourceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Update Design Source DTO
 */
export class UpdateDesignSourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Design Source Response DTO
 */
export interface DesignSourceResponseDto {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
