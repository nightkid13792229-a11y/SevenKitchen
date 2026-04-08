/**
 * Breed Response DTOs
 */

import { ApiProperty } from '@nestjs/swagger';
import { DogSizeCategory, GrowthCurveType } from '../../../domain';

export class BreedResponseDto {
  @ApiProperty({ description: 'Breed ID', example: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Breed name', example: '金毛' })
  name!: string;

  @ApiProperty({ description: 'Size category', enum: DogSizeCategory })
  sizeCategory!: DogSizeCategory;

  @ApiProperty({ description: 'Growth curve type', enum: GrowthCurveType })
  growthCurveType!: GrowthCurveType;

  @ApiProperty({ description: 'Adult age in months', example: 18 })
  adultAgeMonths!: number;

  @ApiProperty({ description: 'Senior age in years', example: 8 })
  seniorAgeYears!: number;

  @ApiProperty({
    description: 'Average adult weight in kg',
    example: 28.5,
    required: false,
  })
  averageAdultWeightKg?: number;

  @ApiProperty({ description: 'Whether this is a common breed', example: true })
  isCommon!: boolean;

  @ApiProperty({
    description: 'Breed aliases used for search',
    type: [String],
    example: ['泰迪', '泰迪犬'],
  })
  aliases!: string[];

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Update timestamp' })
  updatedAt!: Date;
}

export class CustomBreedStatsDto {
  @ApiProperty({ description: 'Custom breed name', example: '田园犬' })
  breedName!: string;

  @ApiProperty({ description: 'Number of dogs using this breed', example: 12 })
  usageCount!: number;

  @ApiProperty({
    description: 'First used date',
    example: '2024-12-01T00:00:00Z',
  })
  firstUsedAt!: Date;

  @ApiProperty({ description: 'Average weight in kg', example: 18.5 })
  avgWeight!: number;

  @ApiProperty({
    description: 'Estimated size category',
    enum: DogSizeCategory,
  })
  estimatedSizeCategory!: DogSizeCategory;
}

export class BreedUsageCheckDto {
  @ApiProperty({ description: 'Number of dogs using this breed', example: 15 })
  count!: number;

  @ApiProperty({
    description: 'List of dogs using this breed',
    type: [Object],
    example: [{ id: 'uuid', name: '旺财', ownerId: 'uuid' }],
  })
  dogs!: Array<{
    id: string;
    name: string;
    ownerId: string;
  }>;
}
