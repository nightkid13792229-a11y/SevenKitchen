/**
 * Pricing Preview DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsEnum,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from '../../../domain';

/**
 * Pricing Preview Item DTO
 * Allows packageCount to be optional - will be computed if missing
 */
export class PricingPreviewItemDto {
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
  customRequirements?: string | null;
}

export class PricingPreviewRequestDto {
  @ApiProperty({ description: 'Dog ID', example: 'uuid' })
  @IsUUID()
  dogId!: string;

  @ApiPropertyOptional({ description: 'Address ID', example: 'uuid' })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiProperty({
    type: [PricingPreviewItemDto],
    description: 'Order items',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingPreviewItemDto)
  items!: PricingPreviewItemDto[];

  @ApiProperty({ enum: OrderType, example: OrderType.FRESH_FOOD })
  @IsEnum(OrderType)
  type!: OrderType;
}

export class PricingBreakdownDto {
  @ApiProperty({ description: 'Cost of ingredients', example: 50.0 })
  costIngredients!: number;

  @ApiProperty({ description: 'Cost of packaging', example: 2.0 })
  costPackaging!: number;

  @ApiProperty({ description: 'Cost of labor', example: 10.0 })
  costLabor!: number;

  @ApiProperty({ description: 'Cost of overhead', example: 5.0 })
  costOverhead!: number;

  @ApiProperty({ description: 'Total product cost', example: 67.0 })
  totalProductCost!: number;

  @ApiProperty({ description: 'Product price (with margin)', example: 111.67 })
  productPrice!: number;
}

/**
 * Price Explanation DTO (Phase 7.2)
 * Read-only presentation DTO for customer-facing price explanation
 * All values come directly from PricingBreakdownSnapshot - no recalculation
 */
export class PriceExplanationDto {
  @ApiProperty({ description: 'Product price (CNY)', example: 111.67 })
  productPrice!: number;

  @ApiProperty({ description: 'Shipping fee (CNY)', example: 12.0 })
  shippingFee!: number;

  @ApiProperty({ description: 'Total price (CNY)', example: 123.67 })
  totalPrice!: number;

  @ApiProperty({ description: 'Cost of ingredients (CNY)', example: 50.0 })
  costIngredients!: number;

  @ApiProperty({ description: 'Cost of packaging (CNY)', example: 2.0 })
  costPackaging!: number;

  @ApiProperty({ description: 'Cost of labor (CNY)', example: 10.0 })
  costLabor!: number;

  @ApiProperty({ description: 'Cost of overhead (CNY)', example: 5.0 })
  costOverhead!: number;

  @ApiProperty({
    description: 'Platform service margin amount (CNY) - computed as productPrice - totalProductCost',
    example: 44.67,
  })
  marginAmount!: number;

  @ApiProperty({
    description: 'Human-readable explanation lines',
    type: [String],
    example: [
      'Ingredient cost covers fresh meat and vegetables',
      'Packaging includes vacuum bags and labels',
      'Labor covers preparation and cooking',
      'Platform service supports food safety, R&D, and operations',
    ],
  })
  explanationLines!: string[];
}

/**
 * Pricing Breakdown Response DTO (Phase 7.1)
 * Complete pricing breakdown snapshot with metadata
 */
export class PricingBreakdownResponseDto {
  @ApiProperty({ description: 'Cost of ingredients (CNY)', example: 50.0 })
  costIngredients!: number;

  @ApiProperty({ description: 'Cost of packaging (CNY)', example: 2.0 })
  costPackaging!: number;

  @ApiProperty({ description: 'Cost of labor (CNY)', example: 10.0 })
  costLabor!: number;

  @ApiProperty({ description: 'Cost of overhead (CNY)', example: 5.0 })
  costOverhead!: number;

  @ApiProperty({ description: 'Total product cost (CNY)', example: 67.0 })
  totalProductCost!: number;

  @ApiProperty({ description: 'Product price (CNY)', example: 111.67 })
  productPrice!: number;

  @ApiProperty({ description: 'Shipping fee (CNY)', example: 12.0 })
  shippingFee!: number;

  @ApiProperty({ description: 'Total price (CNY)', example: 123.67 })
  totalPrice!: number;

  @ApiPropertyOptional({
    description: 'Shipping template ID used',
    example: '8fa85f64-5717-4562-b3fc-2c963f66afa6',
    nullable: true,
  })
  shippingTemplateId?: string | null;

  @ApiProperty({
    description: 'Margin strategy name',
    example: 'targetMargin_40%',
  })
  marginStrategyName!: string;

  @ApiProperty({
    description: 'Timestamp when breakdown was created',
    example: '2024-01-01T00:00:00Z',
  })
  createdAt!: string;

  @ApiPropertyOptional({
    description: 'Ingredient price version hash (for in-memory repos)',
    nullable: true,
  })
  ingredientPriceVersionHash?: string | null;

  @ApiPropertyOptional({
    description: 'Price explanation for customer transparency (Phase 7.2)',
    type: PriceExplanationDto,
    nullable: true,
  })
  priceExplanation?: PriceExplanationDto | null;
}

export class PricingPreviewResponseDto {
  @ApiProperty({ description: 'Product amount', example: 111.67 })
  amountProduct!: number;

  @ApiProperty({ description: 'Shipping amount', example: 12.0 })
  amountShipping!: number;

  @ApiProperty({ description: 'Total amount', example: 123.67 })
  amountTotal!: number;

  @ApiPropertyOptional({
    description: 'Pricing breakdown (optional)',
    type: PricingBreakdownDto,
  })
  pricingBreakdown?: PricingBreakdownDto | null;
}

