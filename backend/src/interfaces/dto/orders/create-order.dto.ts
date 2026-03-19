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
import { PreparationMethod, CookingMethod } from '../../../domain/order';

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

  @ApiPropertyOptional({
    description: 'Order cycle days',
    example: 7,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cycleDays?: number;

  @ApiPropertyOptional({
    description: 'Daily food intake in grams',
    example: 312,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  dailyIntakeG?: number;

  @ApiPropertyOptional({
    description: 'Preparation method',
    enum: PreparationMethod,
  })
  @IsOptional()
  @IsEnum(PreparationMethod)
  preparationMethod?: PreparationMethod;

  @ApiPropertyOptional({
    description: 'Cooking method',
    enum: CookingMethod,
  })
  @IsOptional()
  @IsEnum(CookingMethod)
  cookingMethod?: CookingMethod;
}

export class CreateOrderDto {
  @ApiPropertyOptional({
    description: 'Dog ID (required if not using cart)',
    example: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  dogId?: string;

  @ApiProperty({ enum: OrderType, example: OrderType.FRESH_FOOD })
  @IsEnum(OrderType)
  type!: OrderType;

  @ApiPropertyOptional({
    type: [CreateOrderItemDto],
    description: 'Order items (DEPRECATED - use snapshotId instead)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];

  @ApiPropertyOptional({
    description: 'Cart item IDs (if creating from cart)',
    example: ['uuid1', 'uuid2'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  cartItemIds?: string[];

  @ApiPropertyOptional({
    description:
      'Pricing snapshot ID (if creating from preview - IMMEDIATE BUY)',
    example: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  snapshotId?: string;

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
