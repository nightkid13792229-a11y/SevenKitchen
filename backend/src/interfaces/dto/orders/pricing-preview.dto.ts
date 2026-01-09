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
import { PreparationMethod, CookingMethod } from '../../../domain/order';

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

  @ApiProperty({ description: 'Order cycle days', example: 7 })
  @IsInt()
  @Min(1)
  cycleDays!: number;

  @ApiProperty({ description: 'Daily food intake in grams', example: 312 })
  @IsNumber()
  @Min(1)
  dailyIntakeG!: number;

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
 * Detailed Ingredient Cost Breakdown
 */
export class IngredientCostItemDto {
  @ApiProperty({ description: 'Ingredient name' })
  name!: string;

  @ApiProperty({ description: 'Ingredient type', enum: ['FOOD', 'SUPPLEMENT'] })
  type!: string;

  @ApiProperty({ description: 'Amount used (kg or g)' })
  amount!: number;

  @ApiProperty({ description: 'Unit' })
  unit!: string;

  @ApiProperty({ description: 'Unit cost (per g)' })
  unitCost!: number;

  @ApiProperty({ description: 'Total cost' })
  cost!: number;

  @ApiProperty({ description: 'Calculation explanation' })
  calculation!: string;

  @ApiPropertyOptional({ description: 'Purchase channel' })
  purchaseChannel?: string;

  @ApiPropertyOptional({ description: 'Brand name' })
  brand?: string;

  @ApiPropertyOptional({ description: 'Product model/specification' })
  productModel?: string;

  @ApiPropertyOptional({ description: 'Preparation method (for supplements)' })
  preparationMethod?: string;

  @ApiPropertyOptional({ description: 'Ingredient ID' })
  ingredientId?: string;

  @ApiPropertyOptional({ description: 'Nutrient target key (for supplements)' })
  nutrientTargetKey?: string;

  @ApiPropertyOptional({ description: 'Nutrient target value (for supplements)' })
  nutrientTargetValue?: number;
}

/**
 * Detailed Packaging Cost Breakdown
 */
export class PackagingPerPackConsumablesDto {
  @ApiProperty({ description: 'Vacuum bag name' })
  vacuumBagName!: string;

  @ApiProperty({ description: 'Vacuum bag spec' })
  vacuumBagSpec!: string;

  @ApiProperty({ description: 'Label name' })
  labelName!: string;

  @ApiProperty({ description: 'Label spec' })
  labelSpec!: string;

  @ApiProperty({ description: 'Vacuum bag cost per pack' })
  vacuumBagCostPerPack!: number;

  @ApiProperty({ description: 'Label cost per pack' })
  labelCostPerPack!: number;

  @ApiProperty({ description: 'Vacuum bag total cost' })
  vacuumBagTotalCost!: number;

  @ApiProperty({ description: 'Label total cost' })
  labelTotalCost!: number;

  @ApiProperty({ description: 'Total cost' })
  totalCost!: number;

  @ApiProperty({ description: 'Calculation explanation' })
  calculation!: string;

  @ApiProperty({ description: 'Vacuum bags count' })
  vacuumBagsCount!: number;

  @ApiProperty({ description: 'Labels count' })
  labelsCount!: number;
}

export class PackagingShippingContainerDto {
  @ApiProperty({ description: 'Box name' })
  boxName!: string;

  @ApiProperty({ description: 'Box spec' })
  boxSpec!: string;

  @ApiProperty({ description: 'Thermal bag name' })
  thermalBagName!: string;

  @ApiProperty({ description: 'Thermal bag spec' })
  thermalBagSpec!: string;

  @ApiProperty({ description: 'Number of ice packs' })
  icePacks!: number;

  @ApiProperty({ description: 'Box cost' })
  boxCost!: number;

  @ApiProperty({ description: 'Thermal bag cost' })
  thermalBagCost!: number;

  @ApiProperty({ description: 'Ice pack cost' })
  icePackCost!: number;

  @ApiProperty({ description: 'Total cost' })
  totalCost!: number;

  @ApiProperty({ description: 'Weight' })
  weight!: number;

  @ApiProperty({ description: 'Boxes count' })
  boxesCount!: number;

  @ApiProperty({ description: 'Thermal bags count' })
  thermalBagsCount!: number;

  @ApiProperty({ description: 'Calculation explanation' })
  calculation!: string;
}

export class PackagingCostDetailDto {
  @ApiProperty({ description: 'Per-pack consumables breakdown' })
  perPackConsumables!: PackagingPerPackConsumablesDto;

  @ApiProperty({ description: 'Shipping containers breakdown', type: [PackagingShippingContainerDto] })
  shippingContainers!: PackagingShippingContainerDto[];
}

/**
 * Detailed Labor Cost Breakdown
 */
export class LaborCostDetailDto {
  @ApiProperty({ description: 'Standard batch output (kg)' })
  standardBatchOutputKg!: number;

  @ApiProperty({ description: 'Standard labor cost per kg' })
  standardLaborCostPerKg!: number;

  @ApiProperty({ description: 'Raw input weight (kg)' })
  rawInputWeightKg!: number;

  @ApiProperty({ description: 'Total cost' })
  totalCost!: number;

  @ApiProperty({ description: 'Calculation explanation' })
  calculation!: string;
}

/**
 * Detailed Overhead Cost Breakdown
 */
export class OverheadCostDetailDto {
  @ApiProperty({ description: 'Overhead cost per kg' })
  overheadCostPerKg!: number;

  @ApiProperty({ description: 'Raw input weight (kg)' })
  rawInputWeightKg!: number;

  @ApiProperty({ description: 'Total cost' })
  totalCost!: number;

  @ApiProperty({ description: 'Calculation explanation' })
  calculation!: string;
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

  @ApiPropertyOptional({ description: 'Detailed ingredient cost breakdown' })
  ingredientDetails?: IngredientCostItemDto[];

  @ApiPropertyOptional({ description: 'Detailed packaging cost breakdown' })
  packagingDetails?: PackagingCostDetailDto;

  @ApiPropertyOptional({ description: 'Detailed labor cost breakdown' })
  laborDetails?: LaborCostDetailDto;

  @ApiPropertyOptional({ description: 'Detailed overhead cost breakdown' })
  overheadDetails?: OverheadCostDetailDto;
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


