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
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from '../../../domain';
import { PreparationMethod, CookingMethod } from '../../../domain/order';

const INGREDIENT_SOURCE_PLAN_CODES = [
  'ORGANIC',
  'MARKET_PREMIUM',
  'WHOLESALE',
] as const;

export class PackagePlanItemDto {
  @ApiProperty({ description: 'Package specification in grams', example: 100 })
  @IsInt()
  @Min(1)
  packageSpecG!: number;

  @ApiProperty({ description: 'Number of packages for this spec', example: 2 })
  @IsInt()
  @Min(1)
  packageCount!: number;
}

export class CreateOrderItemDto {
  @ApiProperty({ description: 'Recipe ID', example: 'uuid' })
  @IsUUID()
  recipeId!: string;

  @ApiPropertyOptional({
    description: 'Total quantity in grams',
    example: 1400,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantityG?: number;

  @ApiPropertyOptional({
    description:
      'Number of packages (optional - will be computed as ceil(quantityG/packageSpecG) if missing)',
    example: 14,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  packageCount?: number;

  @ApiPropertyOptional({
    description: 'Package specification in grams',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  packageSpecG?: number;

  @ApiPropertyOptional({
    type: [PackagePlanItemDto],
    description: 'Multi-row package plan; derives quantity/packageCount/spec',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackagePlanItemDto)
  packagePlan?: PackagePlanItemDto[];

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

  @ApiPropertyOptional({
    description: 'Customer-facing order note or special requirement',
    example: '请客服确认分装标签备注',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customRequirements?: string;
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
    description: 'Ingredient source plan',
    enum: INGREDIENT_SOURCE_PLAN_CODES,
    example: 'MARKET_PREMIUM',
  })
  @IsOptional()
  @IsEnum(INGREDIENT_SOURCE_PLAN_CODES)
  ingredientSourcePlan?: string;

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
