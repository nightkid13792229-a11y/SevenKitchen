/**
 * Order Response DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, OrderType } from '../../../domain';
import { PreparationMethod, CookingMethod } from '../../../domain/order';
import type { RecipeSnapshot } from '../../../domain/recipe/types';

export class OrderPackagePlanItemDto {
  @ApiProperty({ example: 100 })
  packageSpecG!: number;

  @ApiProperty({ example: 2 })
  packageCount!: number;
}

export class OrderItemDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  orderId!: string;

  @ApiPropertyOptional({ example: 'uuid', nullable: true })
  dogId?: string | null;

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

  @ApiPropertyOptional({
    type: [OrderPackagePlanItemDto],
    nullable: true,
    description: 'Multi-row package plan when the order is split into multiple package specs',
  })
  packagePlan?: OrderPackagePlanItemDto[] | null;

  @ApiPropertyOptional({
    description: 'Ingredient source plan code',
    example: 'MARKET_PREMIUM',
    nullable: true,
  })
  ingredientSourcePlan?: string | null;

  @ApiPropertyOptional({
    description: 'Preparation method selected for this order item',
    enum: PreparationMethod,
    nullable: true,
  })
  preparationMethod?: PreparationMethod | null;

  @ApiPropertyOptional({
    description: 'Cooking method selected for this order item',
    enum: CookingMethod,
    nullable: true,
  })
  cookingMethod?: CookingMethod | null;

  @ApiPropertyOptional({ nullable: true })
  customRequirements?: string | null;

  @ApiProperty({
    example: 310.34,
    description:
      'Daily intake in grams, calculated from DogCalc.finalFoodKcal ÷ Recipe.energyDensityKcalPerKg (immutable after order creation)',
  })
  dailyIntakeG!: number;

  @ApiPropertyOptional({
    description: 'Vacuum bag specification (e.g., "12*17cm")',
    example: '12*17cm',
    nullable: true,
  })
  vacuumBagSpec?: string | null;

  @ApiPropertyOptional({
    description: 'Dog information (if available)',
  })
  dog?: {
    id: string;
    name: string;
    breedName?: string;
    weightKg?: number;
    gender?: string;
  };

  @ApiPropertyOptional({
    description:
      'Total price for this item (calculated from order pricing breakdown)',
    example: 111.67,
  })
  totalPrice?: number;
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

  @ApiPropertyOptional({
    description: 'Address details',
    nullable: true,
  })
  address?: {
    id: string;
    recipientName: string;
    phone: string;
    region: {
      province: string;
      city: string;
      district?: string;
    };
    regionText: string;
    detailAddress: string;
  } | null;

  @ApiPropertyOptional({
    description: 'Customer information for order center display',
    nullable: true,
  })
  customer?: {
    id: string;
    nickname: string | null;
    phone: string | null;
    avatarUrl: string | null;
  } | null;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ enum: OrderType })
  type!: OrderType;

  @ApiPropertyOptional({ nullable: true })
  targetProductionDate?: string | null;

  @ApiPropertyOptional({
    description: 'Original target production date before any modifications',
    example: '2025-01-16T00:00:00.000Z',
    nullable: true,
  })
  originalTargetProductionDate?: string | null;

  @ApiPropertyOptional({
    description: 'Estimated shipping date (production date + 1 day)',
    example: '2025-01-16T00:00:00.000Z',
    nullable: true,
  })
  estimatedShippingDate?: string | null;

  @ApiProperty({ example: 299.99 })
  totalAmount!: number;

  @ApiProperty({ example: 250.99, description: 'Product amount (Phase 6)' })
  amountProduct!: number;

  @ApiProperty({ example: 15.0, description: 'Shipping amount (Phase 6)' })
  amountShipping!: number;

  @ApiProperty({ example: 265.99, description: 'Total amount (Phase 6)' })
  amountTotal!: number;

  @ApiProperty({
    description: 'Order creation timestamp',
    example: '2025-01-20T10:30:00.000Z',
  })
  createdAt!: string;

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
    description:
      'Pricing breakdown snapshot (full details including ingredient amounts)',
  })
  pricingBreakdownSnapshot?: any;

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

  @ApiPropertyOptional({
    description: 'Cancellation timestamp (Phase 8.16)',
    example: '2025-01-20T10:30:00.000Z',
    nullable: true,
  })
  cancelledAt?: string | null;

  @ApiPropertyOptional({
    description: 'Cancellation reason (Phase 8.16)',
    example: 'Customer requested cancellation',
    nullable: true,
  })
  cancellationReason?: string | null;

  @ApiPropertyOptional({
    description: 'Who cancelled the order (Phase 8.16)',
    example: 'customer',
    enum: ['customer', 'admin', 'system'],
    nullable: true,
  })
  cancelledBy?: 'customer' | 'admin' | 'system' | null;

  @ApiPropertyOptional({
    description: 'Payment method (Phase 8.17)',
    example: 'WECHAT',
    nullable: true,
  })
  paymentMethod?: string | null;

  @ApiPropertyOptional({
    description: 'Transaction ID (Phase 8.17)',
    example: 'MOCK_1734638400000_abc123',
    nullable: true,
  })
  transactionId?: string | null;

  @ApiPropertyOptional({
    description: 'Payment timestamp (Phase 8.17)',
    example: '2025-01-20T10:30:00.000Z',
    nullable: true,
  })
  paidAt?: string | null;

  @ApiPropertyOptional({
    description: 'Payment status (Phase 8.17)',
    example: 'SUCCESS',
    enum: ['PENDING', 'SUCCESS', 'FAILED'],
    nullable: true,
  })
  paymentStatus?: 'PENDING' | 'SUCCESS' | 'FAILED' | null;

  @ApiPropertyOptional({
    description: 'Payment deadline for pending online payment orders',
    example: '2025-01-20T11:00:00.000Z',
    nullable: true,
  })
  paymentDeadline?: string | null;

  @ApiPropertyOptional({
    description: 'Remaining seconds before pending payment order is closed',
    example: 1800,
    nullable: true,
  })
  paymentRemainingSeconds?: number | null;

  @ApiPropertyOptional({
    description: 'Configured payment timeout in minutes',
    example: 30,
    nullable: true,
  })
  paymentTimeoutMinutes?: number | null;

  @ApiPropertyOptional({
    description: 'Whether unpaid orders are auto-closed by payment config',
    example: true,
    nullable: true,
  })
  paymentAutoCloseEnabled?: boolean | null;

  @ApiPropertyOptional({
    description: 'Aftersale type',
    example: 'REFUND',
    nullable: true,
  })
  aftersaleType?: string | null;

  @ApiPropertyOptional({
    description: 'Aftersale reason submitted by customer',
    nullable: true,
  })
  aftersaleReason?: string | null;

  @ApiPropertyOptional({
    description: 'Aftersale application timestamp',
    nullable: true,
  })
  aftersaleSince?: string | null;

  @ApiPropertyOptional({
    description: 'Aftersale evidence photo URLs',
    type: [String],
  })
  aftersalePhotos?: string[];

  @ApiPropertyOptional({
    description: 'Production photos (原料照片)',
    nullable: true,
  })
  productionPhotos?: {
    unitId: string;
    photos: string[];
    uploadedAt: string | null;
  } | null;
}

export class AdminOrderDto extends OrderDto {
  @ApiPropertyOptional({
    description: 'Internal admin remark for production staff',
    example: '客户要求本批次拆分打包，并优先安排上午制作',
    nullable: true,
  })
  adminRemark?: string | null;
}

export class OrderSummaryDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ enum: OrderType })
  type!: OrderType;

  cancellationReason?: string | null;
  aftersaleType?: string | null;

  @ApiProperty({ example: 299.99 })
  totalAmount!: number;

  @ApiProperty({ example: 2 })
  itemCount!: number;

  @ApiProperty({
    description: 'Order creation timestamp',
    example: '2025-01-20T10:30:00.000Z',
  })
  createdAt!: string;

  paymentDeadline?: string | null;
  paymentRemainingSeconds?: number | null;
  paymentTimeoutMinutes?: number | null;
  paymentAutoCloseEnabled?: boolean | null;

  firstItem?: {
    dog?: {
      id: string;
      name: string;
      breedName?: string;
      weightKg?: number;
      gender?: string;
      mealsPerDay?: number;
    };
    recipeSnapshot?: {
      id: string;
      name: string;
      coverImageUrl?: string | null;
    };
    packageCount: number;
    packageSpecG: number;
    packagePlan?: OrderPackagePlanItemDto[] | null;
    ingredientSourcePlan?: string | null;
    dailyIntakeG?: number;
  };

  address?: {
    recipientName: string;
    regionText: string;
    detailAddress: string;
  };
}
