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
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Inject,
  UseGuards,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { IngredientService } from '../../application/ingredient/ingredient.service';
import type { CreateIngredientDto, UpdateIngredientDto, UpdateIngredientPriceDto } from '../../application/ingredient/ingredient.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { ProductionService, type CreateProductionBatchDto, type ProductionBatchSummaryDto } from '../../application/production/production.service';
import { InventoryService } from '../../application/inventory/inventory.service';
import { OrderService } from '../../application/order/order.service';
import { DogService, DOG_BREED_REPOSITORY } from '../../application/dog/dog.service';
import { IngredientTagService, type CreateTagDto, type UpdateTagDto } from '../../application/ingredient-tag/ingredient-tag.service';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import { OrderStatus } from '../../domain';
import { CancelOrderDto } from '../dto/orders/cancel-order.dto';
import { OrderDto } from '../dto/orders/order-response.dto';
import { InvalidStateTransitionError } from '../../domain/common/errors';
import {
  CreateBreedDto,
  UpdateBreedDto,
  BreedResponseDto,
  CustomBreedStatsDto,
  BreedUsageCheckDto,
} from '../dto/breeds';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CreateStaffDto, UpdateStaffDto, StaffResponseDto } from '../dto/admin/staff.dto';
import { AdminGuard } from '../guards/role.guard';
import { AuthGuard } from '../auth/auth.guard';
import { RecipeService } from '../../application/recipe/recipe.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { NutritionStandard, RecipeStatus, RecipeHealthTag, LifeStage } from '../../domain/recipe/enums';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors } from '@nestjs/common';

@ApiTags('Admin')
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private readonly ingredientService: IngredientService,
    private readonly productionService: ProductionService,
    private readonly inventoryService: InventoryService,
    private readonly orderService: OrderService,
    private readonly dogService: DogService,
    private readonly ingredientTagService: IngredientTagService,
    private readonly prisma: PrismaService,
    @Inject(DOG_BREED_REPOSITORY)
    private readonly dogBreedRepository: DogBreedRepository,
    private readonly recipeService: RecipeService,
    private readonly cosService: TencentCosService,
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

  @Get('ingredients')
  @ApiOperation({ summary: 'Get all ingredients' })
  @ApiResponse({
    status: 200,
    description: 'List of all ingredients',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['FOOD', 'SUPPLEMENT', 'PACKAGING'] },
          brand: { type: 'string' },
          productModel: { type: 'string' },
          baseUnit: { type: 'string', enum: ['G', 'ML', 'PCS'] },
          purchaseUnit: { type: 'string' },
          currentPricePerPurchaseUnit: { type: 'number' },
          unitCost: { type: 'number' },
          properties: { type: 'object' },
        },
      },
    },
  })
  async getAllIngredients(): Promise<ApiResponseDto<any[]>> {
    const ingredients = await this.ingredientService.getAllIngredients();

    // Get createdAt and tags from Prisma directly
    const ingredientIds = ingredients.map(ing => ing.id);
    const prismaIngredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        tags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                color: true
              }
            }
          }
        }
      }
    });

    const createdAtMap = new Map(prismaIngredients.map(p => [p.id, p.createdAt.toISOString()]));
    const updatedAtMap = new Map(prismaIngredients.map(p => [p.id, p.updatedAt.toISOString()]));
    const tagsMap = new Map(prismaIngredients.map(p => [
      p.id,
      p.tags.map(t => t.tag)
    ]));
    const tagIdsMap = new Map(prismaIngredients.map(p => [
      p.id,
      p.tags.map(t => t.tag.id)
    ]));

    // Map to ingredient response format
    const ingredientList = ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      type: ing.type,
      brand: ing.brand,
      productModel: ing.productModel,
      purchaseChannel: ing.purchaseChannel,
      notes: ing.notes,
      baseUnit: ing.baseUnit,
      unitDisplayLabel: ing.unitDisplayLabel,
      purchaseUnit: ing.purchaseUnit,
      purchaseToBaseRatio: ing.purchaseToBaseRatio,
      currentPricePerPurchaseUnit: Number(ing.currentPricePerPurchaseUnit),
      unitCost: ing.getUnitCost(),
      weightG: ing.weightG,
      maxCapacityG: ing.maxCapacityG,
      properties: ing.properties,
      tagIds: tagIdsMap.get(ing.id) || [],
      tags: tagsMap.get(ing.id) || [],
      createdAt: createdAtMap.get(ing.id) || new Date().toISOString(),
      updatedAt: updatedAtMap.get(ing.id) || new Date().toISOString(),
    }));

    return ApiResponseDto.success(ingredientList);
  }

  @Get('ingredients/:id')
  @ApiOperation({ summary: 'Get ingredient by ID' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiResponse({
    status: 200,
    description: 'Ingredient details',
  })
  async getIngredientById(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    const ingredient = await this.ingredientService.getIngredientById(id);

    // Get tags from Prisma
    const prismaIngredient = await this.prisma.ingredient.findUnique({
      where: { id },
      select: {
        createdAt: true,
        updatedAt: true,
        tags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                color: true
              }
            }
          }
        }
      }
    });

    const tagIds = prismaIngredient?.tags.map(t => t.tag.id) || [];
    const tags = prismaIngredient?.tags.map(t => t.tag) || [];
    const createdAt = prismaIngredient?.createdAt.toISOString() || new Date().toISOString();
    const updatedAt = prismaIngredient?.updatedAt.toISOString() || new Date().toISOString();

    // Map to ingredient response format
    const ingredientData = {
      id: ingredient.id,
      name: ingredient.name,
      type: ingredient.type,
      brand: ingredient.brand,
      productModel: ingredient.productModel,
      purchaseChannel: ingredient.purchaseChannel,
      notes: ingredient.notes,
      baseUnit: ingredient.baseUnit,
      unitDisplayLabel: ingredient.unitDisplayLabel,
      purchaseUnit: ingredient.purchaseUnit,
      purchaseToBaseRatio: ingredient.purchaseToBaseRatio,
      currentPricePerPurchaseUnit: Number(ingredient.currentPricePerPurchaseUnit),
      unitCost: ingredient.getUnitCost(),
      weightG: ingredient.weightG,
      maxCapacityG: ingredient.maxCapacityG,
      properties: ingredient.properties,
      tagIds,
      tags,
      createdAt,
      updatedAt,
    };

    return ApiResponseDto.success(ingredientData);
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

  @Put('ingredients/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update ingredient' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiBody({ schema: { type: 'object' } })
  @ApiResponse({
    status: 200,
    description: 'Ingredient updated',
  })
  @ApiResponse({ status: 404, description: 'Ingredient not found' })
  async updateIngredient(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      const ingredient = await this.ingredientService.updateIngredient(id, dto);
      return ApiResponseDto.success({
        id: ingredient.id,
        name: ingredient.name,
        type: ingredient.type,
        currentPricePerPurchaseUnit: Number(ingredient.currentPricePerPurchaseUnit),
        unitCost: ingredient.getUnitCost(),
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Ingredient not found');
      }
      throw error;
    }
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

  @Delete('ingredients/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete ingredient' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiResponse({ status: 204, description: 'Ingredient deleted successfully' })
  @ApiResponse({ status: 404, description: 'Ingredient not found' })
  async deleteIngredient(@Param('id') id: string): Promise<void> {
    try {
      await this.ingredientService.deleteIngredient(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw error;
    }
  }

  @Get('ingredients/:id/usage')
  @ApiOperation({ summary: 'Get ingredient usage in recipes' })
  @ApiParam({ name: 'id', description: 'Ingredient ID' })
  @ApiResponse({
    status: 200,
    description: 'List of recipes using this ingredient',
  })
  @ApiResponse({ status: 404, description: 'Ingredient not found' })
  async getIngredientUsage(@Param('id') id: string): Promise<ApiResponseDto<any[]>> {
    try {
      // Check if ingredient exists
      await this.ingredientService.getIngredientById(id);

      // Query RecipeItem table for recipes using this ingredient
      const recipeItems = await this.prisma.recipeItem.findMany({
        where: { ingredientId: id },
        include: {
          recipe: {
            select: {
              recipeId: true,
              name: true,
            }
          }
        }
      });

      const usage = recipeItems.map((item: any) => ({
        recipeId: item.recipe.recipeId,
        recipeName: item.recipe.name,
        ratioPercent: item.ratioPercent,
        isPrimarySource: item.isPrimarySource,
      }));

      return ApiResponseDto.success(usage);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.success([]) as any;
      }
      throw error;
    }
  }

  // ==========================================
  // Phase 8.10: Production Batch Endpoints
  // ==========================================

  @Get('production-batches')
  @ApiOperation({ summary: 'Get all production batches' })
  @ApiResponse({
    status: 200,
    description: 'List of all production batches',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          productionDate: { type: 'string', format: 'date' },
          status: { type: 'string', enum: ['PLANNED', 'IN_PRODUCTION', 'COMPLETED'] },
          totalProductionG: { type: 'number' },
          uniqueRecipeCount: { type: 'number' },
          orderItemCount: { type: 'number' },
        },
      },
    },
  })
  async getAllProductionBatches(): Promise<ApiResponseDto<ProductionBatchSummaryDto[]>> {
    const batches = await this.productionService.getAllProductionBatches();

    // Map to summary DTOs
    const summaries = batches.map((batch) => {
      const packagingUnits = batch.packagingUnits.map((unit) => ({
        recipeSnapshotId: unit.recipeSnapshot.id,
        totalProductionG: unit.totalProductionG,
        orderItemCount: unit.sourceOrderItemIds.length,
        sourceOrderItemIds: Array.isArray(unit.sourceOrderItemIds)
          ? unit.sourceOrderItemIds
          : [],
      }));

      return {
        id: batch.id,
        productionDate: batch.productionDate.toISOString().split('T')[0],
        status: batch.status,
        packagingUnits,
        totalProductionG: batch.getTotalProductionG(),
        uniqueRecipeCount: batch.getUniqueRecipeCount(),
        orderItemCount: packagingUnits.reduce((sum, unit) => sum + unit.orderItemCount, 0),
      };
    });

    return ApiResponseDto.success(summaries);
  }

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
        createdAt: order.createdAt.toISOString(),
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
  // Admin Order Management Endpoints
  // ==========================================

  /**
   * GET /admin/orders - List all orders with filtering, pagination, and search
   */
  @Get('orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all orders (admin-only, cross-customer)' })
  @ApiResponse({
    status: 200,
    description: 'Order list with pagination',
    schema: {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: { $ref: '#/components/schemas/OrderDto' },
        },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  async listOrders(@Query() query: any): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      // Parse query parameters
      const params = {
        keyword: query.keyword,
        status: query.status,
        type: query.type,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        page: query.page ? parseInt(query.page, 10) : 1,
        pageSize: query.pageSize ? parseInt(query.pageSize, 10) : 20,
      };

      const result = await this.orderService.listAllOrders(params);

      // Map orders to DTOs (simplified - would use proper mapper in production)
      const list = result.list.map((order) => ({
        id: order.id,
        customerId: order.customerId,
        customerName: 'Customer', // TODO: Fetch from customer relation
        customerPhone: '---', // TODO: Fetch from customer relation
        dogId: order.dogId,
        dogName: '---', // TODO: Fetch from dog relation
        status: order.status,
        type: order.type,
        amountTotal: order.amountTotal,
        addressCity: '---', // TODO: Fetch from address relation
        addressDetail: '---', // TODO: Fetch from address relation
        createdAt: order.createdAt.toISOString(),
        targetProductionDate: order.targetProductionDate?.toISOString() ?? null,
      }));

      return ApiResponseDto.success({
        list,
        total: result.total,
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * GET /admin/orders/stats - Get order statistics
   */
  @Get('orders/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order statistics grouped by status' })
  @ApiResponse({
    status: 200,
    description: 'Order statistics',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        pendingPayment: { type: 'number' },
        paid: { type: 'number' },
        inProduction: { type: 'number' },
        readyForShipment: { type: 'number' },
        shipped: { type: 'number' },
        completed: { type: 'number' },
        cancelled: { type: 'number' },
      },
    },
  })
  async getOrderStats(): Promise<ApiResponseDto<any>> {
    try {
      const stats = await this.orderService.getOrderStats();
      return ApiResponseDto.success(stats);
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * GET /admin/orders/:orderId - Get order details
   */
  @Get('orders/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order details (admin-only)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order details',
    type: OrderDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderDetail(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.getOrderById(orderId);
      if (!order) {
        return ApiResponseDto.error(404, 'Order not found');
      }

      // Map to DTO (simplified - would use proper mapper in production)
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
        createdAt: order.createdAt.toISOString(),
      };

      return ApiResponseDto.success(orderDto);
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * POST /admin/orders/:orderId/ship - Ship order
   */
  @Post('orders/:orderId/ship')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ship order with tracking information' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        carrierCode: { type: 'string', example: 'SF' },
        trackingNumber: { type: 'string', example: 'SF1234567890' },
      },
      required: ['carrierCode', 'trackingNumber'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Order shipped successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async shipOrder(
    @Param('orderId') orderId: string,
    @Body() body: { carrierCode: string; trackingNumber: string },
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.shipOrder(
        orderId,
        body.trackingNumber,
        body.carrierCode,
        null, // Admin ID not available in current implementation
      );

      // Map to DTO (simplified)
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
        trackingNumber: order.trackingNumber ?? null,
        carrierCode: order.carrierCode ?? null,
        shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
        cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
        cancellationReason: order.cancellationReason ?? null,
        cancelledBy: order.cancelledBy ?? null,
        createdAt: order.createdAt.toISOString(),
      };

      return ApiResponseDto.success(orderDto);
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

  /**
   * POST /admin/orders/:orderId/confirm-payment - Confirm payment (admin)
   */
  @Post('orders/:orderId/confirm-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm payment manually (admin)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment confirmed successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async confirmPayment(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.confirmPaymentAdmin(
        orderId,
        null, // Admin ID not available in current implementation
      );

      // Map to DTO (simplified)
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
        trackingNumber: order.trackingNumber ?? null,
        carrierCode: order.carrierCode ?? null,
        shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
        cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
        cancellationReason: order.cancellationReason ?? null,
        cancelledBy: order.cancelledBy ?? null,
        createdAt: order.createdAt.toISOString(),
      };

      return ApiResponseDto.success(orderDto);
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

  /**
   * POST /admin/orders/:orderId/confirm-offline-payment - Confirm offline payment (admin)
   */
  @Post('orders/:orderId/confirm-offline-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm offline WeChat payment (管理员确认线下收款)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        actualAmount: {
          type: 'number',
          description: 'Actual payment amount received (optional, for recording discrepancies)',
          example: 100.5,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Payment confirmed successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async confirmOfflinePayment(
    @Param('orderId') orderId: string,
    @Body() body: { actualAmount?: number },
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.confirmOfflinePayment(
        orderId,
        'admin', // TODO: Implement proper admin authentication
        body.actualAmount,
      );

      // Map to DTO (simplified)
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
        trackingNumber: order.trackingNumber ?? null,
        carrierCode: order.carrierCode ?? null,
        paymentMethod: order.paymentMethod ?? null,
        transactionId: order.transactionId ?? null,
        paidAt: order.paidAt ? order.paidAt.toISOString() : null,
        paymentStatus: order.paymentStatus ?? null,
        createdAt: order.createdAt.toISOString(),
      };

      return ApiResponseDto.success(orderDto);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (
        error instanceof BadRequestException ||
        error instanceof InvalidStateTransitionError
      ) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  /**
   * POST /admin/orders/:orderId/start-production - Start production
   */
  @Post('orders/:orderId/start-production')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start production (PAID → WAITING_FOR_PRODUCTION)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Production started successfully',
    type: OrderDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async startProduction(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<OrderDto> | ApiResponseDto<null>> {
    try {
      const order = await this.orderService.startProduction(
        orderId,
        null, // Admin ID not available in current implementation
      );

      // Map to DTO (simplified)
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
        trackingNumber: order.trackingNumber ?? null,
        carrierCode: order.carrierCode ?? null,
        shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
        cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
        cancellationReason: order.cancellationReason ?? null,
        cancelledBy: order.cancelledBy ?? null,
        createdAt: order.createdAt.toISOString(),
      };

      return ApiResponseDto.success(orderDto);
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

  /**
   * GET /admin/orders/:orderId/history - Get order status history
   */
  @Get('orders/:orderId/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order status history' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order status history',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fromStatus: { type: 'string' },
          toStatus: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          actor: { type: 'string' },
          actorId: { type: 'string', nullable: true },
          metadata: { type: 'object', nullable: true },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderHistory(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<any[]> | ApiResponseDto<null>> {
    try {
      const history = await this.orderService.getOrderStatusHistory(orderId);

      const historyDto = history.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        timestamp: h.timestamp.toISOString(),
        actor: h.actor,
        actorId: h.actorId,
        metadata: h.metadata,
      }));

      return ApiResponseDto.success(historyDto);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
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

  @Delete('dogs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete dog profile (admin only)' })
  @ApiParam({ name: 'id', description: 'Dog ID' })
  @ApiResponse({ status: 204, description: 'Dog profile deleted successfully' })
  @ApiResponse({ status: 404, description: 'Dog not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete dog with active orders' })
  async deleteDog(
    @Param('id') id: string,
  ): Promise<void> {
    // Check if dog exists
    const dog = await this.prisma.dog.findUnique({
      where: { id },
    });

    if (!dog) {
      throw new NotFoundException(`Dog not found: ${id}`);
    }

    // Check for active orders
    const activeOrders = await this.prisma.order.findMany({
      where: {
        dogId: id,
        status: {
          notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
        },
      },
    });

    if (activeOrders.length > 0) {
      throw new BadRequestException(
        `Cannot delete dog profile: ${activeOrders.length} active order(s) found. ` +
        `Please cancel or complete the orders first.`
      );
    }

    // Delete the dog profile
    await this.prisma.dog.delete({
      where: { id },
    });
  }

  // ==================== Breed Management Endpoints ====================

  @Get('breeds')
  @ApiOperation({ summary: 'Get all system breeds' })
  @ApiResponse({
    status: 200,
    description: 'List of all breeds',
    schema: {
      type: 'array',
      items: { $ref: '#/components/schemas/BreedResponseDto' },
    },
  })
  async getBreeds(): Promise<ApiResponseDto<BreedResponseDto[]>> {
    const breeds = await this.dogBreedRepository.findAll();
    const data = breeds.map(b => this.mapToBreedResponseDto(b));

    return ApiResponseDto.success(data);
  }

  @Get('breeds/custom-stats')
  @ApiOperation({ summary: 'Get custom breed statistics' })
  @ApiResponse({
    status: 200,
    description: 'Custom breed usage statistics',
    schema: {
      type: 'array',
      items: { $ref: '#/components/schemas/CustomBreedStatsDto' },
    },
  })
  async getCustomBreedStats(): Promise<ApiResponseDto<CustomBreedStatsDto[]>> {
    const stats = await this.dogService.getCustomBreedStats();

    return ApiResponseDto.success(stats as any);
  }

  @Get('breeds/:id/usage')
  @ApiOperation({ summary: 'Check breed usage' })
  @ApiResponse({
    status: 200,
    description: 'Breed usage statistics',
    schema: { $ref: '#/components/schemas/BreedUsageCheckDto' },
  })
  async checkBreedUsage(@Param('id') id: string): Promise<ApiResponseDto<BreedUsageCheckDto>> {
    const breed = await this.dogBreedRepository.findById(id);
    if (!breed) {
      throw new NotFoundException(`Breed not found: ${id}`);
    }

    const usage = await this.dogService.checkBreedUsage(id);

    return ApiResponseDto.success(usage as any);
  }

  @Get('breeds/:id')
  @ApiOperation({ summary: 'Get breed by ID' })
  @ApiResponse({
    status: 200,
    description: 'Breed details',
    schema: { $ref: '#/components/schemas/BreedResponseDto' },
  })
  async getBreedById(@Param('id') id: string): Promise<ApiResponseDto<BreedResponseDto>> {
    const breed = await this.dogBreedRepository.findById(id);
    if (!breed) {
      throw new NotFoundException(`Breed not found: ${id}`);
    }

    return ApiResponseDto.success(this.mapToBreedResponseDto(breed));
  }

  @Post('breeds')
  @ApiOperation({ summary: 'Create new breed' })
  @ApiResponse({
    status: 201,
    description: 'Breed created successfully',
    schema: { $ref: '#/components/schemas/BreedResponseDto' },
  })
  async createBreed(@Body() dto: CreateBreedDto): Promise<ApiResponseDto<BreedResponseDto>> {
    try {
      const breed = await this.dogService.createBreed(dto as any);

      return ApiResponseDto.success(this.mapToBreedResponseDto(breed));
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Put('breeds/:id')
  @ApiOperation({ summary: 'Update breed' })
  @ApiResponse({
    status: 200,
    description: 'Breed updated successfully',
    schema: { $ref: '#/components/schemas/BreedResponseDto' },
  })
  async updateBreed(
    @Param('id') id: string,
    @Body() dto: UpdateBreedDto,
  ): Promise<ApiResponseDto<BreedResponseDto>> {
    try {
      const breed = await this.dogService.updateBreed(id, dto as any);

      return ApiResponseDto.success(this.mapToBreedResponseDto(breed));
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  @Delete('breeds/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete breed' })
  @ApiResponse({ status: 204, description: 'Breed deleted successfully' })
  async deleteBreed(@Param('id') id: string): Promise<void> {
    try {
      await this.dogService.deleteBreed(id);
    } catch (error: any) {
      throw new NotFoundException(error.message);
    }
  }

  /**
   * Map DogBreed entity to response DTO
   */
  private mapToBreedResponseDto(breed: any): BreedResponseDto {
    return {
      id: breed.id,
      name: breed.name,
      sizeCategory: breed.sizeCategory,
      growthCurveType: breed.growthCurveType,
      adultAgeMonths: breed.adultAgeMonths,
      seniorAgeYears: breed.seniorAgeYears,
      averageAdultWeightKg: breed.averageAdultWeightKg ?? undefined,
      createdAt: new Date(), // TODO: Get from actual record
      updatedAt: new Date(), // TODO: Get from actual record
    };
  }

  // ==================== Ingredient Tag Management Endpoints ====================

  @Get('ingredient-tags')
  @ApiOperation({ summary: 'Get all ingredient tags' })
  @ApiResponse({
    status: 200,
    description: 'List of all tags (flat structure)',
  })
  async getAllIngredientTags(): Promise<ApiResponseDto<any[]>> {
    const tags = await this.ingredientTagService.getAllTags();
    const data = tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    }));
    return ApiResponseDto.success(data);
  }

  @Get('ingredient-tags/hierarchy')
  @ApiOperation({ summary: 'Get ingredient tag hierarchy' })
  @ApiResponse({
    status: 200,
    description: 'All tags (frontend will build tree)',
  })
  async getIngredientTagHierarchy(): Promise<ApiResponseDto<any[]>> {
    const tags = await this.ingredientTagService.getTagHierarchy();
    const data = tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    }));
    return ApiResponseDto.success(data);
  }

  @Get('ingredient-tags/root')
  @ApiOperation({ summary: 'Get root tags (no parent)' })
  @ApiResponse({
    status: 200,
    description: 'Root tags only',
  })
  async getRootIngredientTags(): Promise<ApiResponseDto<any[]>> {
    const tags = await this.ingredientTagService.getRootTags();
    const data = tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      sort: tag.sort,
      color: tag.color,
    }));
    return ApiResponseDto.success(data);
  }

  @Get('ingredient-tags/:id')
  @ApiOperation({ summary: 'Get tag by ID' })
  @ApiResponse({ status: 200, description: 'Tag details' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async getIngredientTagById(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    const tag = await this.ingredientTagService.getTagById(id);
    return ApiResponseDto.success({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    });
  }

  @Get('ingredient-tags/:id/children')
  @ApiOperation({ summary: 'Get tag children' })
  @ApiResponse({ status: 200, description: 'List of child tags' })
  async getIngredientTagChildren(@Param('id') id: string): Promise<ApiResponseDto<any[]>> {
    const children = await this.ingredientTagService.getChildren(id);
    const data = children.map(tag => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      sort: tag.sort,
      color: tag.color,
    }));
    return ApiResponseDto.success(data);
  }

  @Post('ingredient-tags')
  @ApiOperation({ summary: 'Create new tag' })
  @ApiResponse({ status: 201, description: 'Tag created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createIngredientTag(@Body() dto: CreateTagDto): Promise<ApiResponseDto<any>> {
    const tag = await this.ingredientTagService.createTag(dto);
    return ApiResponseDto.success({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    });
  }

  @Put('ingredient-tags/:id')
  @ApiOperation({ summary: 'Update tag' })
  @ApiResponse({ status: 200, description: 'Tag updated' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async updateIngredientTag(
    @Param('id') id: string,
    @Body() dto: UpdateTagDto
  ): Promise<ApiResponseDto<any>> {
    const tag = await this.ingredientTagService.updateTag(id, dto);
    return ApiResponseDto.success({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    });
  }

  @Delete('ingredient-tags/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete tag' })
  @ApiResponse({ status: 200, description: 'Tag deleted' })
  @ApiResponse({ status: 400, description: 'Tag has children or is in use' })
  async deleteIngredientTag(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    await this.ingredientTagService.deleteTag(id);
    return ApiResponseDto.success(null);
  }

  @Get('ingredients/:id/tags')
  @ApiOperation({ summary: 'Get tags for an ingredient' })
  @ApiResponse({ status: 200, description: 'List of tags' })
  async getIngredientTags(@Param('id') id: string): Promise<ApiResponseDto<any[]>> {
    const tags = await this.ingredientTagService.getTagsByIngredient(id);
    const data = tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      color: tag.color,
    }));
    return ApiResponseDto.success(data);
  }

  // ==================== 用户管理接口（统一） ====================

  @Get('users')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '获取用户列表（支持角色筛选）' })
  @ApiResponse({ status: 200, description: '用户列表' })
  async getUsers(
    @Query('role') role?: string,
  ): Promise<ApiResponseDto<StaffResponseDto[]>> {
    // 构建查询条件
    const where: any = {};

    if (role && ['CUSTOMER', 'STAFF', 'ADMIN'].includes(role)) {
      where.role = role;
    }

    const userList = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const data = userList.map((user) => ({
      id: user.id,
      phone: user.phone || '',
      nickname: user.nickname || '',
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    }));

    return ApiResponseDto.success(data);
  }

  @Post('users')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '创建用户（员工）账号' })
  @ApiResponse({ status: 200, description: '用户创建成功' })
  async createUser(
    @Body() dto: CreateStaffDto,
  ): Promise<ApiResponseDto<StaffResponseDto | null>> {
    // 检查手机号是否已存在
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingUser) {
      return ApiResponseDto.error(400, '该手机号已被使用');
    }

    // 创建员工账号（角色固定为STAFF）
    const newUser = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        nickname: dto.nickname,
        role: 'STAFF',
        status: 'ACTIVE',
      },
    });

    const data: StaffResponseDto = {
      id: newUser.id,
      phone: newUser.phone!,
      nickname: newUser.nickname!,
      role: newUser.role,
      status: newUser.status,
      createdAt: newUser.createdAt,
    };

    return ApiResponseDto.success(data);
  }

  @Put('users/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '更新用户信息' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ): Promise<ApiResponseDto<StaffResponseDto>> {
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    const data: StaffResponseDto = {
      id: updatedUser.id,
      phone: updatedUser.phone!,
      nickname: updatedUser.nickname!,
      role: updatedUser.role,
      status: updatedUser.status,
      lastLoginAt: updatedUser.lastLoginAt,
      createdAt: updatedUser.createdAt,
    };

    return ApiResponseDto.success(data);
  }

  @Delete('users/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '删除用户账号' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteUser(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    await this.prisma.user.delete({
      where: { id },
    });

    return ApiResponseDto.success(null);
  }

  // ==================== 员工管理接口（向后兼容） ====================

  @Get('staff')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '获取员工列表' })
  @ApiResponse({ status: 200, description: '员工列表' })
  async getStaffList(): Promise<ApiResponseDto<StaffResponseDto[]>> {
    const staffList = await this.prisma.user.findMany({
      where: {
        role: { in: ['STAFF', 'ADMIN'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = staffList.map((user) => ({
      id: user.id,
      phone: user.phone!,
      nickname: user.nickname || '',
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    }));

    return ApiResponseDto.success(data);
  }

  @Post('staff')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '创建员工账号' })
  @ApiResponse({ status: 200, description: '员工创建成功' })
  async createStaff(
    @Body() dto: CreateStaffDto,
  ): Promise<ApiResponseDto<StaffResponseDto | null>> {
    // 检查手机号是否已存在
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingUser) {
      return ApiResponseDto.error(400, '该手机号已被使用');
    }

    // 创建员工账号
    const newStaff = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        nickname: dto.nickname,
        role: 'STAFF',
        status: 'ACTIVE',
      },
    });

    const data: StaffResponseDto = {
      id: newStaff.id,
      phone: newStaff.phone!,
      nickname: newStaff.nickname!,
      role: newStaff.role,
      status: newStaff.status,
      createdAt: newStaff.createdAt,
    };

    return ApiResponseDto.success(data);
  }

  @Put('staff/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '更新员工信息' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateStaff(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ): Promise<ApiResponseDto<StaffResponseDto>> {
    const updatedStaff = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    const data: StaffResponseDto = {
      id: updatedStaff.id,
      phone: updatedStaff.phone!,
      nickname: updatedStaff.nickname!,
      role: updatedStaff.role,
      status: updatedStaff.status,
      lastLoginAt: updatedStaff.lastLoginAt,
      createdAt: updatedStaff.createdAt,
    };

    return ApiResponseDto.success(data);
  }

  @Delete('staff/:id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: '删除员工账号' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteStaff(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    await this.prisma.user.delete({
      where: { id },
    });

    return ApiResponseDto.success(null);
  }

  // ==================== Image Upload Endpoint ====================

  @Post('recipes/upload-image')
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload recipe image to Tencent COS' })
  @ApiResponse({ status: 201, description: 'Image uploaded' })
  @ApiResponse({ status: 400, description: 'Upload failed' })
  async uploadRecipeImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.cosService.uploadImage(file, file.originalname, 'recipes');
      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('upload-package-image')
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload package example image to Tencent COS' })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Upload failed' })
  async uploadPackageImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      // 上传到独立的 package-images 目录
      const result = await this.cosService.uploadImage(file, file.originalname, 'package-images');
      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('upload-shipping-logo')
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload shipping company logo to Tencent COS' })
  @ApiResponse({ status: 201, description: 'Logo uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Upload failed' })
  async uploadShippingLogo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      // 上传到独立的 shipping-logos 目录
      const result = await this.cosService.uploadImage(file, file.originalname, 'shipping-logos');
      return ApiResponseDto.success(result);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Delete('recipes/delete-image')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Delete recipe image from Tencent COS' })
  @ApiResponse({ status: 200, description: 'Image deleted' })
  @ApiResponse({ status: 400, description: 'Delete failed' })
  async deleteRecipeImage(
    @Body() body: { key: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      await this.cosService.deleteImage(body.key);
      return ApiResponseDto.success({ message: 'Image deleted successfully' });
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  // ==================== Recipe Management Endpoints ====================

  @Get('recipes')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Get all recipes (admin - includes drafts)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of recipes',
  })
  async getAllRecipes(
    @Query() query: any,
  ): Promise<ApiResponseDto<any>> {
    // Parse pagination parameters manually since transform is disabled
    const parsedQuery = {
      ...query,
      page: query.page ? parseInt(query.page, 10) : 1,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : 20,
    };
    const result = await this.recipeService.getAllRecipes(parsedQuery);
    return ApiResponseDto.success(result);
  }

  /**
   * ============================================================
   * Recipe Metadata APIs (must come before :id routes)
   * ============================================================
   */

  @Get('recipes/metadata/life-stages')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Get life stage enum options' })
  @ApiResponse({ status: 200, description: 'Life stage options' })
  async getLifeStages(): Promise<ApiResponseDto<any>> {
    const { LifeStage } = await import('../../domain/recipe/enums.js');
    const data = [
      { value: LifeStage.PUPPY, label: '幼犬' },
      { value: LifeStage.ADULT, label: '成犬' },
      { value: LifeStage.SENIOR, label: '老年' },
      { value: LifeStage.PREGNANCY, label: '妊娠期' },
      { value: LifeStage.LACTATION, label: '哺乳期' },
    ];
    return ApiResponseDto.success(data);
  }

  @Get('recipes/metadata/health-tags')
  @ApiOperation({ summary: 'Get health tag enum options' })
  @ApiResponse({ status: 200, description: 'Health tag options' })
  async getHealthTagOptions(): Promise<ApiResponseDto<any>> {
    const healthTags = await this.prisma.recipeHealthTag.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });

    const data = healthTags.map((tag: any) => ({
      value: tag.id,
      label: tag.name,
    }));

    return ApiResponseDto.success(data);
  }

  // ==========================================
  // Design Source Management
  // ==========================================

  @Get('design-sources')
  @ApiOperation({ summary: 'Get all design sources' })
  @ApiResponse({ status: 200, description: 'List of design sources' })
  async getDesignSources(): Promise<ApiResponseDto<any>> {
    const designSources = await this.prisma.designSource.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    const data = designSources.map((ds: any) => ({
      id: ds.id,
      name: ds.name,
      isActive: ds.isActive,
      createdAt: ds.createdAt,
      updatedAt: ds.updatedAt,
    }));

    return ApiResponseDto.success(data);
  }

  @Post('design-sources')
  @ApiOperation({ summary: 'Create new design source' })
  @ApiResponse({ status: 201, description: 'Design source created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createDesignSource(
    @Body() dto: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const designSource = await this.prisma.designSource.create({
        data: {
          name: dto.name,
          isActive: dto.isActive !== undefined ? dto.isActive : true,
        },
      });

      return ApiResponseDto.success({
        id: designSource.id,
        name: designSource.name,
        isActive: designSource.isActive,
        createdAt: designSource.createdAt,
        updatedAt: designSource.updatedAt,
      });
    } catch (error: any) {
      return ApiResponseDto.error(400, error.message || 'Failed to create design source');
    }
  }

  @Patch('design-sources/:id')
  @ApiOperation({ summary: 'Update design source' })
  @ApiParam({ name: 'id', description: 'Design source ID' })
  @ApiResponse({ status: 200, description: 'Design source updated' })
  @ApiResponse({ status: 404, description: 'Design source not found' })
  async updateDesignSource(
    @Param('id') id: string,
    @Body() dto: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const designSource = await this.prisma.designSource.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });

      return ApiResponseDto.success({
        id: designSource.id,
        name: designSource.name,
        isActive: designSource.isActive,
        createdAt: designSource.createdAt,
        updatedAt: designSource.updatedAt,
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Design source not found');
      }
      return ApiResponseDto.error(400, error.message || 'Failed to update design source');
    }
  }

  @Delete('design-sources/:id')
  @ApiOperation({ summary: 'Delete design source (soft delete)' })
  @ApiParam({ name: 'id', description: 'Design source ID' })
  @ApiResponse({ status: 200, description: 'Design source deleted' })
  @ApiResponse({ status: 404, description: 'Design source not found' })
  async deleteDesignSource(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      await this.prisma.designSource.update({
        where: { id },
        data: { isActive: false },
      });

      return ApiResponseDto.success({ message: 'Design source deleted successfully' });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Design source not found');
      }
      return ApiResponseDto.error(400, error.message || 'Failed to delete design source');
    }
  }

  // ==========================================
  // Recipe Health Tag Management
  // ==========================================

  @Get('health-tags')
  @ApiOperation({ summary: 'Get all health tags (flat list)' })
  @ApiResponse({ status: 200, description: 'List of health tags' })
  async getHealthTags(): Promise<ApiResponseDto<any>> {
    const healthTags = await this.prisma.recipeHealthTag.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
    return ApiResponseDto.success(healthTags);
  }

  @Get('health-tags/hierarchy')
  @ApiOperation({ summary: 'Get health tags hierarchy' })
  @ApiResponse({ status: 200, description: 'Health tag hierarchy' })
  async getHealthTagHierarchy(): Promise<ApiResponseDto<any>> {
    const allTags = await this.prisma.recipeHealthTag.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });

    // Build hierarchy tree
    const tagMap = new Map();
    const rootTags: any[] = [];

    allTags.forEach(tag => {
      tagMap.set(tag.id, { ...tag, children: [] });
    });

    allTags.forEach(tag => {
      const tagWithChildren = tagMap.get(tag.id);
      if (tag.parentId && tagMap.has(tag.parentId)) {
        tagMap.get(tag.parentId).children.push(tagWithChildren);
      } else {
        rootTags.push(tagWithChildren);
      }
    });

    return ApiResponseDto.success(rootTags);
  }

  @Get('health-tags/root')
  @ApiOperation({ summary: 'Get root health tags (no parent)' })
  @ApiResponse({ status: 200, description: 'Root health tags' })
  async getRootHealthTags(): Promise<ApiResponseDto<any>> {
    const rootTags = await this.prisma.recipeHealthTag.findMany({
      where: { parentId: null },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
    return ApiResponseDto.success(rootTags);
  }

  @Get('health-tags/:id')
  @ApiOperation({ summary: 'Get health tag by ID' })
  @ApiParam({ name: 'id', description: 'Health tag ID' })
  @ApiResponse({ status: 200, description: 'Health tag detail' })
  @ApiResponse({ status: 404, description: 'Health tag not found' })
  async getHealthTag(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const tag = await this.prisma.recipeHealthTag.findUnique({
        where: { id },
      });
      if (!tag) {
        return ApiResponseDto.error(404, 'Health tag not found');
      }
      return ApiResponseDto.success(tag);
    } catch (error: any) {
      return ApiResponseDto.error(400, error.message || 'Failed to get health tag');
    }
  }

  @Get('health-tags/:id/children')
  @ApiOperation({ summary: 'Get children of a health tag' })
  @ApiParam({ name: 'id', description: 'Parent health tag ID' })
  @ApiResponse({ status: 200, description: 'Children health tags' })
  async getHealthTagChildren(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const children = await this.prisma.recipeHealthTag.findMany({
        where: { parentId: id },
        orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      });
      return ApiResponseDto.success(children);
    } catch (error: any) {
      return ApiResponseDto.error(400, error.message || 'Failed to get children');
    }
  }

  @Post('health-tags')
  @ApiOperation({ summary: 'Create new health tag' })
  @ApiResponse({ status: 201, description: 'Health tag created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createHealthTag(@Body() dto: any): Promise<ApiResponseDto<any>> {
    try {
      const healthTag = await this.prisma.recipeHealthTag.create({
        data: {
          name: dto.name,
          description: dto.description || null,
          parentId: dto.parentId || null,
          sort: dto.sort || 0,
          color: dto.color || null,
        },
      });
      return ApiResponseDto.success(healthTag);
    } catch (error: any) {
      return ApiResponseDto.error(400, error.message || 'Failed to create health tag');
    }
  }

  @Put('health-tags/:id')
  @ApiOperation({ summary: 'Update health tag' })
  @ApiParam({ name: 'id', description: 'Health tag ID' })
  @ApiResponse({ status: 200, description: 'Health tag updated' })
  @ApiResponse({ status: 404, description: 'Health tag not found' })
  async updateHealthTag(
    @Param('id') id: string,
    @Body() dto: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const healthTag = await this.prisma.recipeHealthTag.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.parentId !== undefined && { parentId: dto.parentId }),
          ...(dto.sort !== undefined && { sort: dto.sort }),
          ...(dto.color !== undefined && { color: dto.color }),
        },
      });
      return ApiResponseDto.success(healthTag);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Health tag not found');
      }
      return ApiResponseDto.error(400, error.message || 'Failed to update health tag');
    }
  }

  @Delete('health-tags/:id')
  @ApiOperation({ summary: 'Delete health tag' })
  @ApiParam({ name: 'id', description: 'Health tag ID' })
  @ApiResponse({ status: 200, description: 'Health tag deleted' })
  @ApiResponse({ status: 404, description: 'Health tag not found' })
  async deleteHealthTag(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      await this.prisma.recipeHealthTag.delete({
        where: { id },
      });
      return ApiResponseDto.success({ message: 'Health tag deleted successfully' });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Health tag not found');
      }
      return ApiResponseDto.error(400, error.message || 'Failed to delete health tag');
    }
  }

  // ==========================================
  // Preparation Methods Management
  // ==========================================

  @Get('preparation-methods')
  @ApiOperation({ summary: 'Get all preparation methods' })
  @ApiResponse({ status: 200, description: 'List of preparation methods' })
  async getPreparationMethods(): Promise<ApiResponseDto<any>> {
    const methods = await this.prisma.preparationMethod.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
    return ApiResponseDto.success(methods);
  }

  @Get('preparation-methods/:id')
  @ApiOperation({ summary: 'Get preparation method by ID' })
  @ApiParam({ name: 'id', description: 'Preparation method ID' })
  @ApiResponse({ status: 200, description: 'Preparation method detail' })
  @ApiResponse({ status: 404, description: 'Preparation method not found' })
  async getPreparationMethod(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const method = await this.prisma.preparationMethod.findUnique({
        where: { id },
      });
      if (!method) {
        return ApiResponseDto.error(404, 'Preparation method not found');
      }
      return ApiResponseDto.success(method);
    } catch (error: any) {
      return ApiResponseDto.error(400, error.message || 'Failed to get preparation method');
    }
  }

  @Post('preparation-methods')
  @ApiOperation({ summary: 'Create new preparation method' })
  @ApiResponse({ status: 201, description: 'Preparation method created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createPreparationMethod(@Body() dto: any): Promise<ApiResponseDto<any>> {
    try {
      const method = await this.prisma.preparationMethod.create({
        data: {
          name: dto.name,
          description: dto.description || null,
          sort: dto.sort || 0,
        },
      });
      return ApiResponseDto.success(method);
    } catch (error: any) {
      return ApiResponseDto.error(400, error.message || 'Failed to create preparation method');
    }
  }

  @Put('preparation-methods/:id')
  @ApiOperation({ summary: 'Update preparation method' })
  @ApiParam({ name: 'id', description: 'Preparation method ID' })
  @ApiResponse({ status: 200, description: 'Preparation method updated' })
  @ApiResponse({ status: 404, description: 'Preparation method not found' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async updatePreparationMethod(@Param('id') id: string, @Body() dto: any): Promise<ApiResponseDto<any>> {
    try {
      const method = await this.prisma.preparationMethod.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.sort !== undefined && { sort: dto.sort }),
        },
      });
      return ApiResponseDto.success(method);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Preparation method not found');
      }
      return ApiResponseDto.error(400, error.message || 'Failed to update preparation method');
    }
  }

  @Delete('preparation-methods/:id')
  @ApiOperation({ summary: 'Delete preparation method' })
  @ApiParam({ name: 'id', description: 'Preparation method ID' })
  @ApiResponse({ status: 200, description: 'Preparation method deleted' })
  @ApiResponse({ status: 404, description: 'Preparation method not found' })
  async deletePreparationMethod(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      await this.prisma.preparationMethod.delete({
        where: { id },
      });
      return ApiResponseDto.success({ message: 'Preparation method deleted successfully' });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return ApiResponseDto.error(404, 'Preparation method not found');
      }
      return ApiResponseDto.error(400, error.message || 'Failed to delete preparation method');
    }
  }

  @Get('recipes/:id')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Get recipe by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Recipe detail' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async getRecipe(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const recipe = await this.recipeService.getRecipeById(id);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Post('recipes')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Create new recipe' })
  @ApiResponse({ status: 201, description: 'Recipe created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createRecipe(
    @Body() dto: Record<string, any>,
  ): Promise<ApiResponseDto<any>> {
    try {
      // Debug: Check what we actually received
      if (!dto || typeof dto !== 'object') {
        throw new BadRequestException(`Invalid DTO: expected object, got ${typeof dto}`);
      }

      // Check if name exists
      if (!dto.name) {
        throw new BadRequestException(`DTO name is missing. DTO keys: ${JSON.stringify(Object.keys(dto))}`);
      }

      // Validate and transform enum values
      if (!dto.nutritionStandard) {
        throw new BadRequestException('nutritionStandard is required');
      }

      if (dto.status && !Object.values(RecipeStatus).includes(dto.status as any)) {
        throw new BadRequestException(`Invalid status: ${dto.status}`);
      }

      if (dto.applicableLifeStages) {
        for (const stage of dto.applicableLifeStages) {
          if (!Object.values(LifeStage).includes(stage as any)) {
            throw new BadRequestException(`Invalid applicableLifeStage: ${stage}`);
          }
        }
      }

      // Transform strings to enums
      const transformedDto = {
        ...dto,
        nutritionStandard: dto.nutritionStandard as any,
        status: dto.status as any,
        targetHealthTags: dto.targetHealthTags || [], // Keep as UUID array
        applicableLifeStages: dto.applicableLifeStages as any,
      };

      const recipe = await this.recipeService.createRecipe(transformedDto);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Put('recipes/:id')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Update recipe (creates new version)' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Recipe updated' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async updateRecipe(
    @Param('id') id: string,
    @Body() dto: Record<string, any>,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      // Validate and transform enum values
      if (dto.nutritionStandard && !Object.values(NutritionStandard).includes(dto.nutritionStandard as any)) {
        throw new BadRequestException(`Invalid nutritionStandard: ${dto.nutritionStandard}`);
      }

      if (dto.status && !Object.values(RecipeStatus).includes(dto.status as any)) {
        throw new BadRequestException(`Invalid status: ${dto.status}`);
      }

      if (dto.applicableLifeStages) {
        for (const stage of dto.applicableLifeStages) {
          if (!Object.values(LifeStage).includes(stage as any)) {
            throw new BadRequestException(`Invalid applicableLifeStage: ${stage}`);
          }
        }
      }

      // Transform strings to enums
      const transformedDto = {
        ...dto,
        nutritionStandard: dto.nutritionStandard as any,
        status: dto.status as any,
        targetHealthTags: dto.targetHealthTags || [], // Keep as UUID array
        applicableLifeStages: dto.applicableLifeStages as any,
      };

      const recipe = await this.recipeService.updateRecipe(id, transformedDto);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Delete('recipes/:id')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete recipe (DRAFT only)' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 204, description: 'Recipe deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete non-DRAFT recipe' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async deleteRecipe(@Param('id') id: string): Promise<void> {
    await this.recipeService.deleteRecipe(id);
  }

  @Post('recipes/:id/publish')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Publish recipe (DRAFT -> PUBLIC)' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Recipe published' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async publishRecipe(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const recipe = await this.recipeService.publishRecipe(id);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('recipes/:id/unpublish')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Unpublish recipe (PUBLIC -> DRAFT)' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Recipe unpublished' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async unpublishRecipe(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const recipe = await this.recipeService.unpublishRecipe(id);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }

  @Post('recipes/:id/duplicate')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Duplicate recipe (create new recipe with new ID)' })
  @ApiParam({ name: 'id', description: 'Recipe ID to duplicate' })
  @ApiResponse({ status: 201, description: 'Recipe duplicated' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async duplicateRecipe(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const recipe = await this.recipeService.duplicateRecipe(id);
      return ApiResponseDto.success(recipe);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }

  @Get('recipes/:id/versions')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Get recipe version history' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Recipe versions' })
  async getRecipeVersions(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any[]>> {
    const versions = await this.recipeService.getRecipeVersions(id);
    return ApiResponseDto.success(versions);
  }

  @Get('recipes/:id/sales-stats')
  // @UseGuards(AuthGuard, AdminGuard) // 暂时移除认证以便测试
  @ApiOperation({ summary: 'Get recipe sales statistics' })
  @ApiParam({ name: 'id', description: 'Recipe ID' })
  @ApiResponse({ status: 200, description: 'Sales statistics' })
  @ApiResponse({ status: 404, description: 'Recipe not found' })
  async getRecipeSalesStats(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any> | ApiResponseDto<null>> {
    try {
      const stats = await this.recipeService.getRecipeSalesStats(id);
      return ApiResponseDto.success(stats);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      throw error;
    }
  }
}

