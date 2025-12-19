/**
 * Order Response DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, OrderType } from '../../../domain';
import type { RecipeSnapshot } from '../../../domain/recipe/types';

export class OrderItemDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  orderId!: string;

  @ApiProperty({
    description: 'Recipe snapshot (immutable)',
  })
  recipeSnapshot!: RecipeSnapshot;

  @ApiProperty({ example: 1400 })
  quantityG!: number;

  @ApiProperty({ example: 14 })
  packageCount!: number;

  @ApiProperty({ example: 100 })
  packageSpecG!: number;

  @ApiPropertyOptional({ nullable: true })
  customRequirements?: string | null;

  @ApiProperty({
    example: 310.34,
    description: 'Daily intake in grams, calculated from DogCalc.finalFoodKcal ÷ Recipe.energyDensityKcalPerKg (immutable after order creation)',
  })
  dailyIntakeG!: number;
}

export class OrderDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  customerId!: string;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  dogId?: string | null;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  addressId?: string | null;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ enum: OrderType })
  type!: OrderType;

  @ApiPropertyOptional({ nullable: true })
  targetProductionDate?: string | null;

  @ApiProperty({ example: 299.99 })
  totalAmount!: number;

  @ApiProperty({ example: 250.99, description: 'Product amount (Phase 6)' })
  amountProduct!: number;

  @ApiProperty({ example: 15.0, description: 'Shipping amount (Phase 6)' })
  amountShipping!: number;

  @ApiProperty({ example: 265.99, description: 'Total amount (Phase 6)' })
  amountTotal!: number;

  @ApiProperty({ type: [OrderItemDto] })
  items!: OrderItemDto[];

  @ApiPropertyOptional({
    description: 'Pricing breakdown (Phase 5)',
    example: {
      costIngredients: 50.0,
      costPackaging: 2.0,
      costLabor: 10.0,
      costOverhead: 5.0,
      totalProductCost: 67.0,
      productPrice: 111.67,
      shippingFee: 0,
      totalPrice: 111.67,
    },
  })
  pricingBreakdown?: {
    costIngredients: number;
    costPackaging: number;
    costLabor: number;
    costOverhead: number;
    totalProductCost: number;
    productPrice: number;
    shippingFee: number;
    totalPrice: number;
  };

  @ApiPropertyOptional({
    description: 'Shipping tracking number (Phase 8.14)',
    example: 'SF1234567890',
    nullable: true,
  })
  trackingNumber?: string | null;

  @ApiPropertyOptional({
    description: 'Shipping carrier code (Phase 8.14)',
    example: 'SF',
    nullable: true,
  })
  carrierCode?: string | null;

  @ApiPropertyOptional({
    description: 'Shipping timestamp (Phase 8.14)',
    example: '2025-01-20T10:30:00.000Z',
    nullable: true,
  })
  shippedAt?: string | null;

  @ApiPropertyOptional({
    description: 'Completion timestamp (Phase 8.15)',
    example: '2025-01-21T10:30:00.000Z',
    nullable: true,
  })
  completedAt?: string | null;
}

export class OrderSummaryDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ enum: OrderType })
  type!: OrderType;

  @ApiProperty({ example: 299.99 })
  totalAmount!: number;

  @ApiProperty({ example: 2 })
  itemCount!: number;
}

