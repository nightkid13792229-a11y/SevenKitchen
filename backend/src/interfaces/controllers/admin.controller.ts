/**
 * Admin Controller
 * Handles admin endpoints for ingredient and inventory management
 * Phase 5: Ingredients + Recipe Costing
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { IngredientService } from '../../application/ingredient/ingredient.service';
import type { CreateIngredientDto, UpdateIngredientPriceDto } from '../../application/ingredient/ingredient.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { ProductionService, type CreateProductionBatchDto, type ProductionBatchSummaryDto } from '../../application/production/production.service';
import { InventoryService } from '../../application/inventory/inventory.service';
import { OrderService } from '../../application/order/order.service';
import { DogService, DOG_BREED_REPOSITORY } from '../../application/dog/dog.service';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import { OrderStatus } from '../../domain';
import { CancelOrderDto } from '../dto/orders/cancel-order.dto';
import { OrderDto } from '../dto/orders/order-response.dto';
import { InvalidStateTransitionError } from '../../domain/common/errors';
import { PrismaService } from '../../infrastructure/prisma.service';

@ApiTags('Admin')
@Controller('api/v1/admin')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AdminController {
  constructor(
    private readonly ingredientService: IngredientService,
    private readonly productionService: ProductionService,
    private readonly inventoryService: InventoryService,
    private readonly orderService: OrderService,
    private readonly dogService: DogService,
    @Inject(DOG_BREED_REPOSITORY)
    private readonly dogBreedRepository: DogBreedRepository,
    private readonly prisma: PrismaService,
  ) {}

  @Get('inventory')
  @ApiOperation({ summary: 'Get inventory list (ingredients with prices)' })
  @ApiResponse({
    status: 200,
    description: 'Inventory list',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['FOOD', 'SUPPLEMENT', 'PACKAGING'] },
          currentPricePerPurchaseUnit: { type: 'number' },
          purchaseUnit: { type: 'string' },
          stock: { type: 'number', description: 'Placeholder for MVP' },
        },
      },
    },
  })
  async getInventory(): Promise<ApiResponseDto<any[]>> {
    const ingredients = await this.ingredientService.getAllIngredients();
    
    // Map to inventory response format
    const inventory = ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      type: ing.type,
      brand: ing.brand,
      productModel: ing.productModel,
      purchaseChannel: ing.purchaseChannel,
      baseUnit: ing.baseUnit,
      unitDisplayLabel: ing.unitDisplayLabel,
      purchaseUnit: ing.purchaseUnit,
      purchaseToBaseRatio: ing.purchaseToBaseRatio,
      currentPricePerPurchaseUnit: Number(ing.currentPricePerPurchaseUnit),
      unitCost: ing.getUnitCost(),
      weightG: ing.weightG,
      maxCapacityG: ing.maxCapacityG,
      properties: ing.properties,
      stock: null, // Placeholder for MVP - stock management comes later
    }));

    return ApiResponseDto.success(inventory);
  }

  @Post('ingredients')
  @ApiOperation({ summary: 'Create ingredient' })
  @ApiBody({ schema: { type: 'object' } })
  @ApiResponse({
    status: 201,
    description: 'Ingredient created',
  })
  async createIngredient(
    @Body() dto: CreateIngredientDto,
  ): Promise<ApiResponseDto<any>> {
    const ingredient = await this.ingredientService.createIngredient(dto);
    return ApiResponseDto.success({
      id: ingredient.id,
      name: ingredient.name,
      type: ingredient.type,
      currentPricePerPurchaseUnit: Number(ingredient.currentPricePerPurchaseUnit),
    });
  }

  @Put('ingredients/:id/price')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update ingredient price' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiBody({ schema: { type: 'object', properties: { currentPricePerPurchaseUnit: { type: 'number' } }, required: ['currentPricePerPurchaseUnit'] } })
  @ApiResponse({
    status: 200,
    description: 'Ingredient price updated',
  })
  @ApiResponse({ status: 404, description: 'Ingredient not found' })
  async updateIngredientPrice(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientPriceDto,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const ingredient = await this.ingredientService.updateIngredientPrice(
        id,
        dto,
      );
      return ApiResponseDto.success({
        id: ingredient.id,
        name: ingredient.name,
        currentPricePerPurchaseUnit: Number(
          ingredient.currentPricePerPurchaseUnit,
        ),
        unitCost: ingredient.getUnitCost(),
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  // ==========================================
  // Phase 8.10: Production Batch Endpoints
  // ==========================================

  @Post('production-batches')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create production batch from PAID orders' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        productionDate: {
          type: 'string',
          format: 'date',
          example: '2025-01-20',
          description: 'Production date (YYYY-MM-DD)',
        },
        orderIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: specific order IDs to include. If not provided, includes all PAID unassigned orders.',
        },
      },
      required: ['productionDate'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Production batch created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        productionDate: { type: 'string', format: 'date' },
        status: { type: 'string', enum: ['PLANNED', 'IN_PRODUCTION', 'COMPLETED'] },
        packagingUnits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              recipeSnapshotId: { type: 'string' },
              totalProductionG: { type: 'number' },
              orderItemCount: { type: 'number' },
              sourceOrderItemIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Traceability: contributing OrderItem IDs',
              },
            },
          },
        },
        totalProductionG: { type: 'number' },
        uniqueRecipeCount: { type: 'number' },
        orderItemCount: { type: 'number', description: 'Total count across all packagingUnits' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input or no PAID orders found' })
  async createProductionBatch(
    @Body() dto: CreateProductionBatchDto,
  ): Promise<ApiResponseDto<ProductionBatchSummaryDto> | ApiResponseDto<null>> {
    try {
      const batch = await this.productionService.createProductionBatch(dto);

      // Map to summary DTO
      const packagingUnits = batch.packagingUnits.map((unit) => ({
        recipeSnapshotId: unit.recipeSnapshot.id,
        totalProductionG: unit.totalProductionG,
        orderItemCount: unit.sourceOrderItemIds.length,
        sourceOrderItemIds: Array.isArray(unit.sourceOrderItemIds)
          ? unit.sourceOrderItemIds
          : [],
      }));
      
      const summary: ProductionBatchSummaryDto = {
        id: batch.id,
        productionDate: batch.productionDate.toISOString().split('T')[0], // YYYY-MM-DD
        status: batch.status,
        packagingUnits,
        totalProductionG: batch.getTotalProductionG(),
        uniqueRecipeCount: batch.getUniqueRecipeCount(),
        orderItemCount: packagingUnits.reduce((sum, unit) => sum + unit.orderItemCount, 0),
      };

      return ApiResponseDto.success(summary);
    } catch (error) {
      console.error('[AdminController] createProductionBatch error:', error);
      if (error instanceof Error) {
        console.error('[AdminController] error stack:', error.stack);
        console.error('[AdminController] error message:', error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Get('production-batches/:id')
  @ApiOperation({ summary: 'Get production batch details with traceability' })
  @ApiParam({ name: 'id', description: 'Production Batch ID' })
  @ApiResponse({
    status: 200,
    description: 'Production batch details',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        productionDate: { type: 'string', format: 'date' },
        status: { type: 'string' },
        packagingUnits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              recipeSnapshotId: { type: 'string' },
              totalProductionG: { type: 'number' },
              orderItemCount: { type: 'number' },
              sourceOrderItemIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Traceability: contributing OrderItem IDs',
              },
            },
          },
        },
        totalProductionG: { type: 'number' },
        uniqueRecipeCount: { type: 'number' },
        orderItemCount: { type: 'number', description: 'Total count across all packagingUnits' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Production batch not found' })
  async getProductionBatch(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<ProductionBatchSummaryDto> | ApiResponseDto<null>> {
    const batch = await this.productionService.getProductionBatchById(id);
    if (!batch) {
      return ApiResponseDto.error(404, 'Production batch not found');
    }

    const packagingUnits = batch.packagingUnits.map((unit) => ({
      recipeSnapshotId: unit.recipeSnapshot.id,
      totalProductionG: unit.totalProductionG,
      orderItemCount: unit.sourceOrderItemIds.length,
      sourceOrderItemIds: Array.isArray(unit.sourceOrderItemIds)
        ? unit.sourceOrderItemIds
        : [],
    }));
    
    const summary: ProductionBatchSummaryDto = {
      id: batch.id,
      productionDate: batch.productionDate.toISOString().split('T')[0],
      status: batch.status,
      packagingUnits,
      totalProductionG: batch.getTotalProductionG(),
      uniqueRecipeCount: batch.getUniqueRecipeCount(),
      orderItemCount: packagingUnits.reduce((sum, unit) => sum + unit.orderItemCount, 0),
    };

    return ApiResponseDto.success(summary);
  }

  @Get('production-batches/:id/order-items')
  @ApiOperation({ summary: 'Get allocated order items for a production batch' })
  @ApiParam({ name: 'id', description: 'Production Batch ID' })
  @ApiResponse({
    status: 200,
    description: 'Allocated order items',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          orderId: { type: 'string' },
          recipeSnapshotId: { type: 'string' },
          dailyIntakeG: { type: 'number' },
          productionBatchId: { type: 'string' },
          allocatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Production batch not found' })
  async getBatchOrderItems(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any[]> | ApiResponseDto<null>> {
    const batch = await this.productionService.getProductionBatchById(id);
    if (!batch) {
      return ApiResponseDto.error(404, 'Production batch not found');
    }

    // Collect all order item IDs from packaging units
    const orderItemIds = new Set<string>();
    for (const unit of batch.packagingUnits) {
      for (const itemId of unit.sourceOrderItemIds) {
        orderItemIds.add(itemId);
      }
    }

    // Load order items (we need to query orders to get items)
    // For MVP, we'll return a simplified structure
    const orderItems: any[] = [];
    for (const unit of batch.packagingUnits) {
      for (const itemId of unit.sourceOrderItemIds) {
        orderItems.push({
          id: itemId,
          recipeSnapshotId: unit.recipeSnapshot.id,
          // Note: orderId and dailyIntakeG would require loading the actual OrderItem
          // For MVP, we return what we have from the batch
        });
      }
    }

    return ApiResponseDto.success(orderItems);
  }

  @Post('inventory/deductions/retry/:packagingUnitId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry inventory deduction for a PackagingUnit' })
  @ApiParam({
    name: 'packagingUnitId',
    description: 'PackagingUnit ID to retry deduction for',
  })
  @ApiResponse({
    status: 200,
    description: 'Deduction retry completed (idempotent)',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        entriesCreated: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'PackagingUnit not found' })
  async retryInventoryDeduction(
    @Param('packagingUnitId') packagingUnitId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      // Get existing entries to check if already deducted
      const existingEntries =
        await this.inventoryService.getEntriesByPackagingUnit(packagingUnitId);

      // Attempt deduction (idempotent - will skip if already exists)
      await this.inventoryService.deductFromKitchenTask(packagingUnitId);

      // Get entries after deduction
      const entriesAfter =
        await this.inventoryService.getEntriesByPackagingUnit(packagingUnitId);

      const entriesCreated = entriesAfter.length - existingEntries.length;

      return ApiResponseDto.success({
        message: 'Deduction retry completed',
        entriesCreated,
        totalEntries: entriesAfter.length,
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  // ==========================================
  // Phase 8.15: Order Completion Endpoint
  // ==========================================

  @Post('orders/:orderId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete order (Phase 8.15)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order completed successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: Object.values(OrderStatus) },
        completedAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async completeOrder(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<{ id: string; status: OrderStatus; completedAt: string | null }> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.completeOrder(
        orderId,
        'admin', // Phase 8.18: Actor attribution
        null, // Admin ID not available in current implementation
      );

      return ApiResponseDto.success({
        id: order.id,
        status: order.status,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  // ==========================================
  // Phase 8.16: Order Cancellation Endpoint
  // ==========================================

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel order (Phase 8.16)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({ type: CancelOrderDto })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async cancelOrder(
    @Param('orderId') orderId: string,
    @Body() cancelOrderDto: CancelOrderDto,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.cancelOrder(
        orderId,
        cancelOrderDto.reason,
        'admin',
        null, // Phase 8.18: Admin ID not available in current implementation
      );

      // Map to DTO (simplified - in production would use proper mapper)
      const orderDto: OrderDto = {
        id: order.id,
        customerId: order.customerId,
        dogId: order.dogId,
        addressId: order.addressId,
        status: order.status,
        type: order.type,
        targetProductionDate: order.targetProductionDate
          ? order.targetProductionDate.toISOString()
          : null,
        totalAmount: order.totalAmount ?? order.amountTotal,
        amountProduct: order.amountProduct,
        amountShipping: order.amountShipping,
        amountTotal: order.amountTotal,
        items: order.items.map((item) => ({
          id: item.id,
          orderId: item.orderId,
          recipeSnapshot: item.recipeSnapshot,
          quantityG: item.quantityG,
          packageCount: item.packageCount,
          packageSpecG: item.packageSpecG,
          customRequirements: item.customRequirements,
          dailyIntakeG: item.dailyIntakeG,
        })),
        pricingBreakdown: order.pricingBreakdownSnapshot
          ? {
              costIngredients: order.pricingBreakdownSnapshot.costIngredients,
              costPackaging: order.pricingBreakdownSnapshot.costPackaging,
              costLabor: order.pricingBreakdownSnapshot.costLabor,
              costOverhead: order.pricingBreakdownSnapshot.costOverhead,
              totalProductCost: order.pricingBreakdownSnapshot.totalProductCost,
              productPrice: order.pricingBreakdownSnapshot.productPrice,
              shippingFee: order.pricingBreakdownSnapshot.shippingFee,
              totalPrice: order.pricingBreakdownSnapshot.totalPrice,
            }
          : undefined,
        trackingNumber: order.trackingNumber ?? null,
        carrierCode: order.carrierCode ?? null,
        shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
        cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
        cancellationReason: order.cancellationReason ?? null,
        cancelledBy: order.cancelledBy ?? null,
      };

      return ApiResponseDto.success(orderDto);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      if (error instanceof InvalidStateTransitionError) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  // ==========================================
  // Dog Profile Management (Admin)
  // ==========================================

  @Get('dogs')
  @ApiOperation({ summary: 'Get all dog profiles (admin only - cross-customer)' })
  @ApiResponse({
    status: 200,
    description: 'List of all dog profiles with pagination',
  })
  async getAllDogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponseDto<{
    data: any[];
    total: number;
    page: number;
    pageSize: number;
  }>> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 20;

    // Get all dogs using Prisma (admin cross-customer access)
    const [allDogs, totalResult] = await Promise.all([
      this.prisma.dog.findMany({
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dog.count(),
    ]);

    // Get breeds for name mapping
    const breeds = await this.dogBreedRepository.findAll();
    const breedMap = new Map(breeds.map(b => [b.id, b.name]));

    // Map to response format
    const dogs = allDogs.map((dog: any) => ({
      id: dog.id,
      ownerId: dog.ownerId,
      name: dog.name,
      breedId: dog.breedId,
      customBreedName: dog.customBreedName,
      breedName: dog.customBreedName || breedMap.get(dog.breedId) || '未知品种',
      birthday: dog.birthday.toISOString(),
      gender: dog.gender,
      isNeutered: dog.isNeutered,
      currentWeightKg: dog.currentWeightKg,
      bcsScore: dog.bcsScore,
      activityLevel: dog.activityLevel,
      lifeStageOverride: dog.lifeStageOverride,
      sizeClassOverride: dog.sizeClassOverride,
      mealsPerDay: dog.mealsPerDay,
      treatInputMode: dog.treatInputMode,
      treatLevel: dog.treatLevel,
      manualTreatKcal: dog.manualTreatKcal,
      medicalHistory: dog.medicalHistory,
      cachedTargetFoodKcal: dog.cachedTargetFoodKcal,
      createdAt: dog.createdAt ? dog.createdAt.toISOString() : undefined,
    }));

    // Pagination
    const total = totalResult;
    const start = (pageNum - 1) * pageSizeNum;
    const end = start + pageSizeNum;
    const paginatedDogs = dogs.slice(start, end);

    return ApiResponseDto.success({
      data: paginatedDogs,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    });
  }

  @Get('dogs/:id')
  @ApiOperation({ summary: 'Get dog profile detail (admin only)' })
  @ApiParam({ name: 'id', description: 'Dog ID' })
  @ApiResponse({
    status: 200,
    description: 'Dog profile with calc result',
  })
  @ApiResponse({ status: 404, description: 'Dog not found' })
  async getDogDetail(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    // Get dog from Prisma to have createdAt
    const dogRecord = await this.prisma.dog.findUnique({
      where: { id },
    });

    if (!dogRecord) {
      return ApiResponseDto.error(404, 'Dog not found');
    }

    // Get breed info
    const breed = await this.dogBreedRepository.findById(dogRecord.breedId);

    // Get calc result
    const calcResult = await this.dogService.calcPreview(dogRecord.id);

    // Map profile
    const profile = {
      id: dogRecord.id,
      ownerId: dogRecord.ownerId,
      name: dogRecord.name,
      breedId: dogRecord.breedId,
      customBreedName: dogRecord.customBreedName,
      breedName: dogRecord.customBreedName || breed?.name || '未知品种',
      birthday: dogRecord.birthday.toISOString(),
      gender: dogRecord.gender,
      isNeutered: dogRecord.isNeutered,
      currentWeightKg: dogRecord.currentWeightKg,
      bcsScore: dogRecord.bcsScore,
      activityLevel: dogRecord.activityLevel,
      lifeStageOverride: dogRecord.lifeStageOverride,
      sizeClassOverride: dogRecord.sizeClassOverride,
      mealsPerDay: dogRecord.mealsPerDay,
      treatInputMode: dogRecord.treatInputMode,
      treatLevel: dogRecord.treatLevel,
      manualTreatKcal: dogRecord.manualTreatKcal,
      medicalHistory: dogRecord.medicalHistory,
      cachedTargetFoodKcal: dogRecord.cachedTargetFoodKcal,
      createdAt: dogRecord.createdAt ? dogRecord.createdAt.toISOString() : undefined,
    };

    return ApiResponseDto.success({
      profile,
      calcResult,
    });
  }
}

