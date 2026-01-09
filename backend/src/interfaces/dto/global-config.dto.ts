/**
 * Global Config DTOs
 * Data transfer objects for global configuration management
 */

import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class UpdateGlobalConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  laborHourlyRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  minOrderWeightG?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultBatchCapacityG?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  targetMargin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overheadCostPerKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  targetBatchUtilization?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  supplementLossRate?: number;

  @IsOptional()
  @IsString()
  defaultProductLabelId?: string | null;

  @IsOptional()
  @IsString()
  defaultIcePackId?: string | null;

  @IsOptional()
  @IsString()
  defaultShippingTemplateId?: string | null;

  @IsOptional()
  @IsString()
  packageExampleImageUrl?: string | null;

  @IsOptional()
  @IsString()
  shippingCompanyLogoUrl?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(180)
  paymentTimeoutMinutes?: number;

  @IsOptional()
  equipmentRecommendations?: any;
}
