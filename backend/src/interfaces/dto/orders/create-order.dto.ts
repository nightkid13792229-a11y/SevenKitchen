/**
 * Create Order Draft DTO
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsEnum,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
  IsInt,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from '../../../domain';

export class CreateOrderItemDto {
  @ApiProperty({ description: 'Recipe ID', example: 'uuid' })
  @IsUUID()
  recipeId!: string;

  @ApiProperty({ description: 'Total quantity in grams', example: 1400 })
  @IsNumber()
  @Min(1)
  quantityG!: number;

  @ApiPropertyOptional({
    description:
      'Number of packages (optional - will be computed as ceil(quantityG/packageSpecG) if missing)',
    example: 14,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  packageCount?: number;

  @ApiProperty({ description: 'Package specification in grams', example: 100 })
  @IsInt()
  @Min(1)
  packageSpecG!: number;

  @ApiPropertyOptional({ description: 'Custom requirements', nullable: true })
  @IsOptional()
  customRequirements?: any;
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Dog ID', example: 'uuid' })
  @IsUUID()
  dogId!: string;

  @ApiProperty({ enum: OrderType, example: OrderType.FRESH_FOOD })
  @IsEnum(OrderType)
  type!: OrderType;

  @ApiProperty({ type: [CreateOrderItemDto], description: 'Order items' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @ApiPropertyOptional({ description: 'Address ID', example: 'uuid' })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    description: 'Target production date',
    example: '2024-01-15T00:00:00Z',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  targetProductionDate?: string | null;
}
