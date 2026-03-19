/**
 * Shipping Template DTOs
 * Data transfer objects for shipping template operations
 */

import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateShippingTemplateDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0.1)
  baseWeightKg!: number;

  @IsNumber()
  @Min(0)
  baseFee!: number;

  @IsNumber()
  @Min(0.1)
  stepWeightKg!: number;

  @IsNumber()
  @Min(0)
  stepFee!: number;

  @IsNumber()
  @Min(0)
  vasFeePerOrder!: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateShippingTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0.1)
  @IsOptional()
  baseWeightKg?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  baseFee?: number;

  @IsNumber()
  @Min(0.1)
  @IsOptional()
  stepWeightKg?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stepFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  vasFeePerOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
