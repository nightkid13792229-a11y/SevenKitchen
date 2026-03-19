/**
 * Create Breed DTO
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsOptional,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { DogSizeCategory, GrowthCurveType } from '../../../domain';

export class CreateBreedDto {
  @ApiProperty({ description: 'Breed name', example: '金毛' })
  @IsString()
  @MinLength(2, { message: 'Breed name must be at least 2 characters' })
  @MaxLength(20, { message: 'Breed name must not exceed 20 characters' })
  name!: string;

  @ApiProperty({
    description: 'Size category',
    enum: DogSizeCategory,
    example: DogSizeCategory.LARGE,
  })
  @IsEnum(DogSizeCategory, { message: 'Invalid size category' })
  sizeCategory!: DogSizeCategory;

  @ApiProperty({
    description: 'Growth curve type',
    enum: GrowthCurveType,
    default: GrowthCurveType.STANDARD,
    example: GrowthCurveType.STANDARD,
  })
  @IsEnum(GrowthCurveType, { message: 'Invalid growth curve type' })
  growthCurveType: GrowthCurveType = GrowthCurveType.STANDARD;

  @ApiProperty({ description: 'Adult age in months', example: 18 })
  @IsInt({ message: 'Adult age months must be an integer' })
  @Min(6, { message: 'Adult age must be at least 6 months' })
  @Max(48, { message: 'Adult age must not exceed 48 months' })
  adultAgeMonths!: number;

  @ApiProperty({ description: 'Senior age in years', example: 8 })
  @IsInt({ message: 'Senior age years must be an integer' })
  @Min(5, { message: 'Senior age must be at least 5 years' })
  @Max(15, { message: 'Senior age must not exceed 15 years' })
  seniorAgeYears!: number;

  @ApiPropertyOptional({
    description: 'Average adult weight in kg',
    example: 28.5,
    minimum: 0.5,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Average weight must be a number' })
  @Min(0.5, { message: 'Average weight must be at least 0.5 kg' })
  @Max(100, { message: 'Average weight must not exceed 100 kg' })
  averageAdultWeightKg?: number;

  @ApiPropertyOptional({
    description: 'Whether this is a common breed',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isCommon must be a boolean' })
  isCommon?: boolean;
}
